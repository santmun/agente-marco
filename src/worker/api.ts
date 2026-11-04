import { Hono } from 'hono'
import { cancelar, eventosDelDia, reindexar, soloDigitos } from './agenda'
import { listarCuentas } from './composio'
import { audioConversacion, eleven } from './elevenlabs'
import { estado, guardarConfig, leerConfig } from './estado'
import { actualizar, leer, modoVistaPrevia, type Fila } from './hoja'
import { instalar } from './instalar'
import { cerrarSesion, compararSecreto, iniciarSesion, requiereSesion, sesionValida } from './sesion'
import { sincronizarLlamadas } from './sincronizar'
import { aMs, local, sumarDias, ymd } from './tiempo'

export const api = new Hono<{ Bindings: Env }>()

api.post('/login', async (c) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'desconocida'
  if (!(await estado(c.env).limitar(`login:${ip}`, 10, 15 * 60e3))) return c.json({ error: 'demasiados_intentos' }, 429)
  const { password } = await c.req.json<{ password?: string }>().catch(() => ({ password: '' }))
  if (!c.env.OWNER_PASSWORD || !(await compararSecreto(password ?? '', c.env.OWNER_PASSWORD))) return c.json({ error: 'contrasena_incorrecta' }, 401)
  await iniciarSesion(c)
  return c.json({ ok: true })
})

api.get('/me', async (c) => c.json({ autenticado: await sesionValida(c), clinica: c.env.NOMBRE_CLINICA }))
api.post('/logout', (c) => { cerrarSesion(c); return c.json({ ok: true }) })

api.use('*', requiereSesion)

const num = (s: string | number | undefined) => Number(s) || 0
const percentil = (v: number[], p: number) => {
  if (!v.length) return 0
  const o = [...v].sort((a, b) => a - b)
  return o[Math.min(o.length - 1, Math.floor(o.length * p))]
}
const promedio = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0)
const CITA = new Set(['cita_agendada'])

async function llamadasDel(env: Env, dias: number, demo: boolean) {
  const hoy = ymd(Date.now())
  const filas = (await modoVistaPrevia(env))
    ? await leer(env, 'Llamadas')
    : ((await estado(env).llamadasDe(Array.from({ length: dias }, (_, i) => sumarDias(hoy, -i)))) as Fila[])
  const desde = aMs(sumarDias(hoy, -(dias - 1)))
  return filas.filter((f) => Date.parse(f.inicio) >= desde && (demo || f.es_demo !== '1'))
}

async function configuracion(env: Env) {
  const filas = await leer(env, 'Configuracion')
  return Object.fromEntries(filas.map((f) => [f.clave, num(f.valor)])) as Record<string, number>
}

function contar(filas: Fila[], campo: string) {
  const m = new Map<string, number>()
  for (const f of filas) m.set(f[campo], (m.get(f[campo]) ?? 0) + 1)
  return [...m.entries()].map(([nombre, n]) => ({ nombre, n })).sort((a, b) => b.n - a.n)
}

function porDia(filas: Fila[], dias: number) {
  const hoy = ymd(Date.now())
  const mapa = new Map<string, { fecha: string; llamadas: number; citas: number; minutos: number; costo: number; voz: number; llm: number }>()
  for (let i = 0; i < dias; i++) {
    const fecha = sumarDias(hoy, i - dias + 1)
    mapa.set(fecha, { fecha, llamadas: 0, citas: 0, minutos: 0, costo: 0, voz: 0, llm: 0 })
  }
  for (const f of filas) {
    const d = mapa.get(ymd(Date.parse(f.inicio)))
    if (!d) continue
    d.llamadas++
    if (CITA.has(f.resultado)) d.citas++
    d.minutos += num(f.duracion_s) / 60
    d.costo += num(f.costo_usd)
    d.voz += num(f.voz_usd)
    d.llm += num(f.llm_usd)
  }
  return [...mapa.values()]
}

api.get('/resumen', async (c) => {
  const dias = Math.min(Number(c.req.query('dias')) || 7, 90)
  const demo = c.req.query('demo') !== '0'
  const [filas, cfg, pendientes, preview] = await Promise.all([
    llamadasDel(c.env, dias, demo), configuracion(c.env), leer(c.env, 'Pendientes'), modoVistaPrevia(c.env),
  ])
  const n = filas.length
  const citas = filas.filter((f) => CITA.has(f.resultado)).length
  const costo = filas.reduce((s, f) => s + num(f.costo_usd), 0)
  const minutos = filas.reduce((s, f) => s + num(f.duracion_s), 0) / 60
  const fuera = filas.filter((f) => f.fuera_horario === '1')
  const exito = filas.filter((f) => f.exito === 'success').length
  const respuesta = filas.map((f) => num(f.respuesta_ms)).filter(Boolean)
  const horas = Array.from({ length: 24 }, (_, h) => ({ hora: h, n: 0 }))
  for (const f of filas) horas[local(Date.parse(f.inicio)).h].n++
  const tasa = n ? citas / n : 0
  const perdidas = n * (cfg.perdidas_pct_base / 100)
  const abiertos = pendientes.filter((p) => p.estado === 'abierto' && (demo || p.es_demo !== '1'))

  return c.json({
    preview,
    dias,
    kpis: {
      llamadas: n,
      contestadas_pct: n ? 100 : 0,
      citas,
      conversion_pct: tasa * 100,
      minutos,
      duracion_prom_s: n ? (minutos * 60) / n : 0,
      costo_usd: costo,
      costo_por_llamada: n ? costo / n : 0,
      costo_por_cita: citas ? costo / citas : 0,
      fuera_horario: fuera.length,
      citas_fuera_horario: fuera.filter((f) => CITA.has(f.resultado)).length,
      urgencias: filas.filter((f) => f.urgencia === '1').length,
      exito_pct: n ? (exito / n) * 100 : 0,
      respuesta_p50: percentil(respuesta, 0.5),
      respuesta_p95: percentil(respuesta, 0.95),
      pendientes_abiertos: abiertos.length,
    },
    impacto: {
      perdidas_antes: Math.round(perdidas),
      perdidas_pct_base: cfg.perdidas_pct_base,
      citas_rescatadas: Math.round(perdidas * tasa),
      ingreso_rescatado_mxn: Math.round(perdidas * tasa * cfg.valor_cita_mxn),
      horas_recepcion: (n * cfg.minutos_recepcion_por_llamada) / 60,
      costo_mxn: costo * cfg.tipo_cambio,
    },
    por_dia: porDia(filas, dias),
    por_hora: horas,
    motivos: contar(filas, 'motivo'),
    resultados: contar(filas, 'resultado'),
    pendientes: abiertos
      .sort((a, b) => (a.prioridad === 'alta' ? -1 : 0) - (b.prioridad === 'alta' ? -1 : 0))
      .slice(0, 5),
    recientes: [...filas].sort((a, b) => Date.parse(b.inicio) - Date.parse(a.inicio)).slice(0, 8),
  })
})

api.get('/llamadas', async (c) => {
  const dias = Math.min(Number(c.req.query('dias')) || 7, 90)
  const demo = c.req.query('demo') !== '0'
  const filas = await llamadasDel(c.env, dias, demo)
  return c.json({ llamadas: filas.sort((a, b) => Date.parse(b.inicio) - Date.parse(a.inicio)).slice(0, 600) })
})

api.get('/llamadas/:id', async (c) => {
  const id = c.req.param('id')
  const fila = (await llamadasDel(c.env, 90, true)).find((f) => f.conv_id === id)
  if (fila?.es_demo === '1') return c.json({ fila, transcripcion: null, demo: true })
  const d = await eleven<any>(c.env, `/v1/convai/conversations/${encodeURIComponent(id)}`)
  const m = d.metadata ?? {}
  return c.json({
    fila,
    demo: false,
    tiene_audio: !!d.has_audio,
    criterios: Object.values<any>(d.analysis?.evaluation_criteria_results ?? {}).map((e) => ({ id: e.criteria_id, resultado: e.result, razon: e.rationale })),
    datos: Object.fromEntries(Object.entries<any>(d.analysis?.data_collection_results ?? {}).map(([k, v]) => [k, v.value])),
    terminacion: m.termination_reason,
    cargo: { creditos: m.cost, costo_usd: m.cost_fiat, voz_usd: m.charging?.platform_price, llm_usd: m.charging?.llm_price, plan: m.charging?.tier },
    transcripcion: (d.transcript ?? [])
      .filter((t: any) => t.message || t.tool_calls?.length || t.tool_results?.length)
      .map((t: any) => ({
        rol: t.role,
        t: t.time_in_call_secs,
        texto: t.message,
        interrumpido: t.interrupted,
        llamadas_tool: (t.tool_calls ?? []).map((x: any) => ({ nombre: x.tool_name, params: x.params_as_json })),
        resultados_tool: (t.tool_results ?? []).map((x: any) => ({ nombre: x.tool_name, ms: Math.round((x.tool_latency_secs ?? 0) * 1000), error: x.is_error, resultado: String(x.result_value ?? '').slice(0, 600) })),
        llm_ms: Math.round((t.conversation_turn_metrics?.metrics?.convai_llm_service_ttfb?.elapsed_time ?? 0) * 1000),
        tts_ms: Math.round((t.conversation_turn_metrics?.metrics?.convai_tts_service_ttfb?.elapsed_time ?? 0) * 1000),
      })),
  })
})

api.get('/llamadas/:id/audio', async (c) => {
  const res = await audioConversacion(c.env, c.req.param('id'))
  if (!res.ok) return c.json({ error: 'audio_no_disponible' }, 404)
  return new Response(res.body, { headers: { 'content-type': res.headers.get('content-type') ?? 'audio/mpeg', 'cache-control': 'private, max-age=3600' } })
})

api.get('/agenda', async (c) => {
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(c.req.query('fecha') ?? '') ? c.req.query('fecha')! : ymd(Date.now())
  return c.json({ fecha, doctores: await eventosDelDia(c.env, fecha) })
})

api.post('/citas/:id/cancelar', async (c) => {
  const { motivo } = await c.req.json<{ motivo?: string }>()
  return c.json(await cancelar(c.env, c.executionCtx, c.req.param('id'), motivo || 'Cancelada desde el centro de control'))
})

api.get('/pacientes', async (c) => {
  const demo = c.req.query('demo') !== '0'
  const [pacientes, citas, llamadas] = await Promise.all([leer(c.env, 'Pacientes'), leer(c.env, 'Citas'), llamadasDel(c.env, 90, true)])
  const ahora = Date.now()
  const proxima = new Map<string, string>()
  const totalCitas = new Map<string, number>()
  for (const x of citas) {
    if (x.estado !== 'agendada') continue
    const tel = soloDigitos(x.telefono)
    totalCitas.set(tel, (totalCitas.get(tel) ?? 0) + 1)
    if (Date.parse(x.inicio) > ahora && (!proxima.has(tel) || x.inicio < proxima.get(tel)!)) proxima.set(tel, x.inicio)
  }
  const totalLlamadas = new Map<string, number>()
  for (const l of llamadas) {
    const tel = soloDigitos(l.telefono)
    if (tel) totalLlamadas.set(tel, (totalLlamadas.get(tel) ?? 0) + 1)
  }
  return c.json({
    pacientes: pacientes
      .filter((p) => demo || p.es_demo !== '1')
      .map((p) => {
        const tel = soloDigitos(p.telefono)
        return { ...p, proxima_cita: proxima.get(tel) ?? '', citas: totalCitas.get(tel) ?? 0, llamadas: totalLlamadas.get(tel) ?? 0 }
      }),
  })
})

api.get('/pacientes/:telefono', async (c) => {
  const tel = soloDigitos(c.req.param('telefono'))
  const [citas, llamadas] = await Promise.all([leer(c.env, 'Citas'), llamadasDel(c.env, 90, true)])
  return c.json({
    citas: citas.filter((x) => soloDigitos(x.telefono) === tel).sort((a, b) => Date.parse(b.inicio) - Date.parse(a.inicio)),
    llamadas: llamadas.filter((x) => soloDigitos(x.telefono) === tel).sort((a, b) => Date.parse(b.inicio) - Date.parse(a.inicio)).slice(0, 30),
  })
})

api.get('/pendientes', async (c) => {
  const demo = c.req.query('demo') !== '0'
  const filas = await leer(c.env, 'Pendientes')
  return c.json({ pendientes: filas.filter((p) => demo || p.es_demo !== '1').sort((a, b) => Date.parse(b.creado_en) - Date.parse(a.creado_en)) })
})

api.patch('/pendientes/:id', async (c) => {
  const b = await c.req.json<{ estado?: string; notas?: string }>()
  const filas = await leer(c.env, 'Pendientes', true)
  const fila = filas.find((p) => p.id === c.req.param('id'))
  if (!fila) return c.json({ error: 'no_encontrado' }, 404)
  const estadoNuevo = b.estado === 'resuelto' ? 'resuelto' : b.estado === 'abierto' ? 'abierto' : fila.estado
  await actualizar(c.env, 'Pendientes', fila, {
    estado: estadoNuevo,
    resuelto_en: estadoNuevo === 'resuelto' ? new Date().toISOString() : '',
    notas: b.notas ?? fila.notas,
  })
  return c.json({ ok: true })
})

/** Solo los ajustes que el dueño puede cambiar desde el panel. */
api.get('/agente', async (c) => {
  const a = await eleven<any>(c.env, `/v1/convai/agents/${c.env.AGENT_ID}`)
  const cc = a.conversation_config ?? {}
  const prompt = cc.agent?.prompt ?? {}
  const herramientas = await eleven<any>(c.env, '/v1/convai/tools').catch(() => ({ tools: [] }))
  const ids = new Set(prompt.tool_ids ?? [])
  return c.json({
    id: a.agent_id,
    nombre: a.name,
    version: a.version_id,
    prompt: prompt.prompt,
    primer_mensaje: cc.agent?.first_message,
    idioma: cc.agent?.language,
    llm: prompt.llm,
    temperatura: prompt.temperature,
    respaldo_llm: prompt.backup_llm_config,
    voz: cc.tts?.voice_id,
    tts_modelo: cc.tts?.model_id,
    velocidad: cc.tts?.speed,
    estabilidad: cc.tts?.stability,
    similitud: cc.tts?.similarity_boost,
    prisa_turno: cc.turn?.turn_eagerness,
    espera_turno: cc.turn?.turn_timeout,
    colgar_silencio: cc.turn?.silence_end_call_timeout,
    mensaje_espera: cc.turn?.soft_timeout_config?.message,
    duracion_max: cc.conversation?.max_duration_seconds,
    asr: cc.asr?.provider,
    palabras_clave: cc.asr?.keywords ?? [],
    voces_fondo: cc.vad?.background_voice_detection,
    retencion_dias: a.platform_settings?.privacy?.retention_days,
    grabar: a.platform_settings?.privacy?.record_voice,
    limite_diario: a.platform_settings?.call_limits?.daily_limit,
    llm_analisis: a.platform_settings?.analysis_llm,
    transferencia: prompt.built_in_tools?.transfer_to_number?.params?.transfers?.[0]?.transfer_destination?.phone_number ?? '',
    herramientas: (herramientas.tools ?? [])
      .filter((t: any) => ids.has(t.id))
      .map((t: any) => ({
        id: t.id,
        nombre: t.tool_config?.name,
        descripcion: t.tool_config?.description,
        timeout: t.tool_config?.response_timeout_secs,
        llamadas: t.usage_stats?.total_calls ?? 0,
        latencia_ms: Math.round((t.usage_stats?.avg_latency_secs ?? 0) * 1000),
      })),
    sistema: Object.keys(prompt.built_in_tools ?? {}).filter((k) => prompt.built_in_tools[k]),
  })
})

api.patch('/agente', async (c) => {
  const b = await c.req.json<Record<string, any>>()
  const prompt: Record<string, unknown> = {}
  const agente: Record<string, unknown> = {}
  const tts: Record<string, unknown> = {}
  const turn: Record<string, unknown> = {}
  const conversacion: Record<string, unknown> = {}
  if (typeof b.prompt === 'string') prompt.prompt = b.prompt
  if (typeof b.llm === 'string') prompt.llm = b.llm
  if (b.temperatura !== undefined) prompt.temperature = Number(b.temperatura)
  if (typeof b.primer_mensaje === 'string') agente.first_message = b.primer_mensaje
  if (Object.keys(prompt).length) agente.prompt = prompt
  if (typeof b.voz === 'string') tts.voice_id = b.voz
  if (typeof b.tts_modelo === 'string') tts.model_id = b.tts_modelo
  if (b.velocidad !== undefined) tts.speed = Number(b.velocidad)
  if (b.estabilidad !== undefined) tts.stability = Number(b.estabilidad)
  if (b.similitud !== undefined) tts.similarity_boost = Number(b.similitud)
  if (typeof b.prisa_turno === 'string') turn.turn_eagerness = b.prisa_turno
  if (b.espera_turno !== undefined) turn.turn_timeout = Number(b.espera_turno)
  if (b.colgar_silencio !== undefined) turn.silence_end_call_timeout = Number(b.colgar_silencio)
  if (b.duracion_max !== undefined) conversacion.max_duration_seconds = Number(b.duracion_max)
  const conversation_config: Record<string, unknown> = {}
  if (Object.keys(agente).length) conversation_config.agent = agente
  if (Object.keys(tts).length) conversation_config.tts = tts
  if (Object.keys(turn).length) conversation_config.turn = turn
  if (Object.keys(conversacion).length) conversation_config.conversation = conversacion
  const r = await eleven<any>(c.env, `/v1/convai/agents/${c.env.AGENT_ID}`, { method: 'PATCH', body: JSON.stringify({ conversation_config }) })
  c.executionCtx.waitUntil(estado(c.env).registrar({ t: Date.now(), tool: 'ajuste_de_marco', ms: 0, ok: true, detalle: Object.keys(b).join(', ').slice(0, 120) }))
  return c.json({ ok: true, version: r.version_id })
})

api.get('/agente/llamada-prueba', async (c) => {
  const r = await eleven<any>(c.env, `/v1/convai/conversation/get-signed-url?agent_id=${c.env.AGENT_ID}`)
  return c.json({ signed_url: r.signed_url })
})

api.get('/voces', async (c) => {
  const r = await eleven<any>(c.env, '/v1/voices')
  const voces = (r.voices ?? []).map((v: any) => ({
    id: v.voice_id, nombre: v.name, categoria: v.category, genero: v.labels?.gender, acento: v.labels?.accent, idioma: v.labels?.language, muestra: v.preview_url,
  }))
  return c.json({ voces })
})

async function documentosAgente(env: Env) {
  const a = await eleven<any>(env, `/v1/convai/agents/${env.AGENT_ID}`)
  return (a.conversation_config?.agent?.prompt?.knowledge_base ?? []) as { id: string; name: string; type: string; usage_mode: string }[]
}

async function guardarDocumentos(env: Env, knowledge_base: unknown[]) {
  await eleven(env, `/v1/convai/agents/${env.AGENT_ID}`, {
    method: 'PATCH',
    body: JSON.stringify({ conversation_config: { agent: { prompt: { knowledge_base } } } }),
  })
}

api.get('/conocimiento', async (c) => c.json({ documentos: await documentosAgente(c.env) }))

api.get('/conocimiento/:id', async (c) => {
  const d = await eleven<any>(c.env, `/v1/convai/knowledge-base/${c.req.param('id')}`)
  return c.json({ id: d.id, nombre: d.name, texto: d.extracted_inner_html ?? d.text ?? '', actualizado: d.metadata?.last_updated_at_unix_secs, tamano: d.metadata?.size_bytes })
})

api.post('/conocimiento', async (c) => {
  const b = await c.req.json<{ nombre: string; texto: string }>()
  if (!b.nombre?.trim() || !b.texto?.trim()) return c.json({ error: 'faltan_datos' }, 400)
  const nuevo = await eleven<any>(c.env, '/v1/convai/knowledge-base/text', { method: 'POST', body: JSON.stringify({ name: b.nombre.trim(), text: b.texto }) })
  const docs = await documentosAgente(c.env)
  await guardarDocumentos(c.env, [...docs, { id: nuevo.id, name: b.nombre.trim(), type: 'text', usage_mode: 'prompt' }])
  return c.json({ ok: true, id: nuevo.id })
})

// ElevenLabs no edita el texto de un documento: se crea uno nuevo, se liga y se borra el anterior.
api.put('/conocimiento/:id', async (c) => {
  const b = await c.req.json<{ nombre: string; texto: string }>()
  const nuevo = await eleven<any>(c.env, '/v1/convai/knowledge-base/text', { method: 'POST', body: JSON.stringify({ name: b.nombre.trim(), text: b.texto }) })
  const docs = await documentosAgente(c.env)
  await guardarDocumentos(c.env, docs.map((d) => (d.id === c.req.param('id') ? { id: nuevo.id, name: b.nombre.trim(), type: 'text', usage_mode: d.usage_mode } : d)))
  await eleven(c.env, `/v1/convai/knowledge-base/${c.req.param('id')}?force=true`, { method: 'DELETE' }).catch(() => null)
  return c.json({ ok: true, id: nuevo.id })
})

api.delete('/conocimiento/:id', async (c) => {
  const docs = await documentosAgente(c.env)
  await guardarDocumentos(c.env, docs.filter((d) => d.id !== c.req.param('id')))
  await eleven(c.env, `/v1/convai/knowledge-base/${c.req.param('id')}?force=true`, { method: 'DELETE' }).catch(() => null)
  return c.json({ ok: true })
})

const MODELOS_COMPARAR = ['claude-haiku-5-5', 'gemini-2.5-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gpt-5.4-mini', 'claude-sonnet-5-5', 'gpt-5.5', 'claude-opus-5-5']

api.get('/costos', async (c) => {
  const dias = Math.min(Number(c.req.query('dias')) || 7, 90)
  const demo = c.req.query('demo') !== '0'
  const [filas, cfg] = await Promise.all([llamadasDel(c.env, dias, demo), configuracion(c.env)])
  const costo = filas.reduce((s, f) => s + num(f.costo_usd), 0)
  const voz = filas.reduce((s, f) => s + num(f.voz_usd), 0)
  const llm = filas.reduce((s, f) => s + num(f.llm_usd), 0)
  const minutos = filas.reduce((s, f) => s + num(f.duracion_s), 0) / 60
  const diaConDatos = new Set(filas.map((f) => ymd(Date.parse(f.inicio)))).size || 1
  const proyeccion = (costo / diaConDatos) * 30
  const lat = (campo: string) => {
    const v = filas.map((f) => num(f[campo])).filter(Boolean)
    return { p50: percentil(v, 0.5), p95: percentil(v, 0.95), prom: Math.round(promedio(v)) }
  }
  const [precios, suscripcion] = await Promise.all([
    eleven<any>(c.env, `/v1/convai/agent/${c.env.AGENT_ID}/llm-usage/calculate`, { method: 'POST', body: JSON.stringify({ prompt_length: 3600, number_of_pages: 0, rag_enabled: false }) }).catch(() => null),
    eleven<any>(c.env, '/v1/user/subscription').catch(() => null),
  ])
  return c.json({
    dias,
    total: { costo, voz, llm, minutos, llamadas: filas.length, por_minuto: minutos ? costo / minutos : 0, por_llamada: filas.length ? costo / filas.length : 0 },
    proyeccion_mes_usd: proyeccion,
    proyeccion_mes_mxn: proyeccion * cfg.tipo_cambio,
    recepcion_mes_mxn: cfg.costo_recepcion_mes_mxn,
    tipo_cambio: cfg.tipo_cambio,
    por_dia: porDia(filas, dias),
    latencia: { respuesta: lat('respuesta_ms'), llm: lat('llm_ttfb_ms'), tts: lat('tts_ttfb_ms'), herramienta: lat('tool_ms') },
    tokens: { entrada: filas.reduce((s, f) => s + num(f.tokens_in), 0), salida: filas.reduce((s, f) => s + num(f.tokens_out), 0) },
    errores_herramienta: filas.reduce((s, f) => s + num(f.tool_errores), 0),
    modelos: (precios?.llm_prices ?? [])
      .filter((m: any) => MODELOS_COMPARAR.includes(m.llm))
      .sort((a: any, b: any) => a.price_per_minute - b.price_per_minute),
    plan: suscripcion ? { nombre: suscripcion.tier, usados: suscripcion.character_count, limite: suscripcion.character_limit, renueva: suscripcion.next_character_count_reset_unix } : null,
  })
})

api.get('/actividad', async (c) => c.json({ actividad: await estado(c.env).actividad() }))

api.post('/sincronizar', async (c) => c.json(await sincronizarLlamadas(c.env)))

api.post('/reindexar', async (c) => c.json(await reindexar(c.env)))

api.get('/conexiones', async (c) => {
  const config = await leerConfig(c.env)
  const preview = await modoVistaPrevia(c.env)
  const doctores = await leer(c.env, 'Doctores').catch(() => [] as Fila[])
  let cuentas: Awaited<ReturnType<typeof listarCuentas>> = []
  let errorComposio = ''
  try {
    cuentas = await listarCuentas(c.env, ['googlesheets', 'googlecalendar', 'whatsapp'])
  } catch (e) {
    errorComposio = String(e)
  }
  const telefonos = c.env.ELEVENLABS_API_KEY ? await eleven<any>(c.env, '/v1/convai/phone-numbers').catch(() => []) : []
  const asignados = (Array.isArray(telefonos) ? telefonos : []).filter((t: any) => t.assigned_agent?.agent_id === c.env.AGENT_ID)
  return c.json({
    preview,
    llaves: { composio: !!c.env.COMPOSIO_API_KEY, elevenlabs: !!c.env.ELEVENLABS_API_KEY },
    errorComposio,
    config: { ...config },
    cuentas,
    hoja_url: config.spreadsheet_id ? `https://docs.google.com/spreadsheets/d/${config.spreadsheet_id}` : '',
    calendarios: doctores.map((d) => ({ doctor: d.nombre, horario: d.horario_texto, conectado: !!d.calendar_id })),
    telefono: asignados.map((t: any) => t.phone_number),
    agente_id: c.env.AGENT_ID,
  })
})

api.patch('/conexiones', async (c) => {
  const b = await c.req.json<Record<string, string>>()
  const permitidos = ['spreadsheet_id', 'sheets_account', 'calendar_account', 'whatsapp_account', 'composio_user_id', 'whatsapp_phone_id', 'whatsapp_plantilla'] as const
  const cambios = Object.fromEntries(permitidos.filter((k) => typeof b[k] === 'string').map((k) => [k, b[k].trim()]))
  return c.json({ ok: true, config: await guardarConfig(c.env, cambios) })
})

api.post('/urgencias', async (c) => {
  const { telefono } = await c.req.json<{ telefono?: string }>()
  const numero = (telefono ?? '').replace(/[^\d+]/g, '')
  if (numero && !/^\+\d{10,15}$/.test(numero)) return c.json({ error: 'usa_formato_internacional' }, 400)
  await eleven(c.env, `/v1/convai/agents/${c.env.AGENT_ID}`, {
    method: 'PATCH',
    body: JSON.stringify({
      conversation_config: { agent: { prompt: { built_in_tools: { transfer_to_number: numero ? {
        type: 'system',
        name: 'transfer_to_number',
        description: '',
        params: {
          system_tool_type: 'transfer_to_number',
          transfers: [{ transfer_destination: { type: 'phone', phone_number: numero }, condition: 'El paciente reporta una urgencia dental o pide hablar con una persona por algo urgente.', transfer_type: 'conference' }],
        },
      } : null } } } },
    }),
  })
  await guardarConfig(c.env, { telefono_urgencias: numero })
  return c.json({ ok: true })
})

api.post('/instalar', async (c) => {
  const { paso, parte } = await c.req.json<{ paso: string; parte?: number }>()
  return c.json(await instalar(c.env, paso, parte ?? 0))
})

api.onError((err, c) => {
  console.error(JSON.stringify({ evento: 'error_api', ruta: c.req.path, error: String(err) }))
  const status = (err as any).status === 503 ? 503 : 500
  return c.json({ error: String((err as Error).message ?? err).slice(0, 300) }, status)
})
