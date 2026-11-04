import { eleven } from './elevenlabs'
import { idCorto, soloDigitos } from './agenda'
import { estado } from './estado'
import { agregar } from './hoja'
import { asegurarUrgencia } from './herramientas'
import { fueraDeHorario, ymd } from './tiempo'

const mediana = (v: number[]) => {
  if (!v.length) return 0
  const o = [...v].sort((a, b) => a - b)
  return o[Math.floor(o.length / 2)]
}
const ms = (x?: { elapsed_time?: number }) => (x?.elapsed_time ? Math.round(x.elapsed_time * 1000) : 0)

/** Convierte el detalle de ElevenLabs en una fila de la pestaña Llamadas. */
export function filaDeConversacion(d: any) {
  const m = d.metadata ?? {}
  const carga = m.charging ?? {}
  const datos = d.analysis?.data_collection_results ?? {}
  const dato = (k: string) => datos[k]?.value ?? ''
  const transcript: any[] = d.transcript ?? []

  const llm: number[] = []
  const tts: number[] = []
  const respuesta: number[] = []
  const herramientas: number[] = []
  let errores = 0
  let tokensIn = 0
  let tokensOut = 0
  let modelo = ''
  let previaFueHerramienta = false

  for (const t of transcript) {
    const mt = t.conversation_turn_metrics?.metrics ?? {}
    if (mt.convai_llm_service_ttfb) llm.push(ms(mt.convai_llm_service_ttfb))
    if (mt.convai_tts_service_ttfb) tts.push(ms(mt.convai_tts_service_ttfb))
    // El tiempo de respuesta real excluye turnos que esperaron una herramienta.
    if (mt.convai_ttf_audio_since_silence && !previaFueHerramienta && t.time_in_call_secs > 0) respuesta.push(ms(mt.convai_ttf_audio_since_silence))
    for (const r of t.tool_results ?? []) {
      // end_call marca error si el paciente cuelga antes; solo cuentan las herramientas propias.
      if (r.type !== 'webhook') continue
      if (r.tool_latency_secs) herramientas.push(Math.round(r.tool_latency_secs * 1000))
      if (r.is_error) errores++
    }
    previaFueHerramienta = (t.tool_results ?? []).length > 0
    modelo = t.producing_llm ?? modelo
    for (const u of Object.values<any>(t.llm_usage?.model_usage ?? {})) {
      tokensIn += (u.input?.tokens ?? 0) + (u.input_cache_read?.tokens ?? 0) + (u.input_cache_write?.tokens ?? 0)
      tokensOut += u.output_total?.tokens ?? 0
    }
  }

  const inicio = (m.start_time_unix_secs ?? 0) * 1000
  const costoTotal = m.cost_fiat ?? 0
  return {
    conv_id: d.conversation_id,
    inicio: new Date(inicio).toISOString(),
    duracion_s: m.call_duration_secs ?? 0,
    telefono: soloDigitos(String(dato('paciente_telefono') || m.phone_call?.external_number || '')),
    paciente: dato('paciente_nombre'),
    motivo: dato('motivo') || 'otro',
    resultado: dato('resultado') || (d.analysis?.call_successful === 'failure' ? 'sin_resolver' : 'informacion_resuelta'),
    servicio: dato('servicio'),
    urgencia: String(dato('urgencia')) === 'true' ? '1' : '0',
    fuera_horario: fueraDeHorario(inicio) ? '1' : '0',
    sentimiento: d.analysis?.sentiment_analysis?.overall_label ?? '',
    frustracion: d.analysis?.sentiment_analysis?.overall_frustration_score ?? 0,
    exito: d.analysis?.call_successful ?? '',
    canal: m.phone_call ? 'telefono' : 'web',
    costo_usd: Number(costoTotal.toFixed(5)),
    voz_usd: Number((carga.platform_price ?? 0).toFixed(5)),
    llm_usd: Number((carga.llm_price ?? 0).toFixed(5)),
    creditos: m.cost ?? 0,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    llm_ttfb_ms: mediana(llm),
    tts_ttfb_ms: mediana(tts),
    respuesta_ms: mediana(respuesta),
    tool_ms: mediana(herramientas),
    tool_errores: errores,
    modelo,
    titulo: d.analysis?.call_summary_title ?? '',
    resumen: d.analysis?.transcript_summary ?? '',
    tiene_audio: d.has_audio ? '1' : '0',
    es_demo: '0',
  }
}

/** Trae las llamadas terminadas que aún no están en la hoja. Lo corre el cron y el botón Actualizar. */
export async function sincronizarLlamadas(env: Env, maximo = 10) {
  if (!env.ELEVENLABS_API_KEY || !env.AGENT_ID) return { nuevas: 0, motivo: 'sin_llave' }
  const stub = estado(env)
  const cursor = ((await stub.leer('sync_desde')) as number | null) ?? 0
  const q = new URLSearchParams({ agent_id: env.AGENT_ID, page_size: '30', sort_direction: 'asc' })
  if (cursor) q.set('call_start_after_unix', String(cursor))
  const lista = await eleven<any>(env, `/v1/convai/conversations?${q}`)

  // Solo avanza sobre llamadas ya cerradas: una que sigue procesándose no se puede saltar.
  const cerradas: any[] = []
  for (const x of lista.conversations ?? []) {
    if (x.status !== 'done' && x.status !== 'failed') break
    cerradas.push(x)
  }
  if (!cerradas.length) return { nuevas: 0 }

  const dias = [...new Set(cerradas.map((x) => ymd(x.start_time_unix_secs * 1000)))]
  const vistas = new Set(((await stub.llamadasDe(dias)) as Record<string, string>[]).map((f) => f.conv_id))
  const porAgregar = cerradas.filter((x) => !vistas.has(x.conversation_id)).slice(0, maximo)
  const filas = []
  for (const x of porAgregar) filas.push(filaDeConversacion(await eleven<any>(env, `/v1/convai/conversations/${x.conversation_id}`)))
  if (filas.length) {
    await agregar(env, 'Llamadas', filas)
    await stub.guardarLlamadas(filas)
  }

  // Las llamadas que no se resolvieron dejan un pendiente para que nadie se quede sin respuesta.
  const sinResolver = filas.filter((f) => f.resultado === 'sin_resolver' && f.duracion_s > 15)
  await agregar(env, 'Pendientes', sinResolver.map((f) => ({
    id: idCorto('T'), creado_en: f.inicio, tipo: 'devolver_llamada', prioridad: 'media', paciente: f.paciente, telefono: f.telefono,
    motivo: `Llamada sin resolver: ${f.resumen}`.slice(0, 300), conv_id: f.conv_id, estado: 'abierto', resuelto_en: '', notas: '', es_demo: '0',
  })))

  // Red de seguridad: toda urgencia detectada al terminar la llamada deja un pendiente, una sola vez.
  for (const f of filas.filter((x) => x.urgencia === '1')) {
    await asegurarUrgencia(env, { nombre: f.paciente, telefono: f.telefono, motivo: `Urgencia detectada en la llamada: ${f.resumen}`.slice(0, 300), conv_id: f.conv_id })
  }

  // Deja 1 s de traslape; las repetidas se descartan arriba.
  const procesadas = cerradas.slice(0, cerradas.findLastIndex((x) => vistas.has(x.conversation_id) || porAgregar.includes(x)) + 1)
  const ultima = procesadas[procesadas.length - 1]
  if (ultima && ultima.start_time_unix_secs - 1 > cursor) await stub.guardar('sync_desde', ultima.start_time_unix_secs - 1)
  return { nuevas: filas.length, fecha: ymd(Date.now()) }
}
