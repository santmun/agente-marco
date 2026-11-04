import { Hono } from 'hono'
import { buscarHorarios, cancelar, citasDePaciente, hablado, idCorto, pacienteDe, reagendar, reservar, soloDigitos } from './agenda'
import { compararSecreto } from './sesion'
import { estado } from './estado'
import { agregar } from './hoja'
import { textoFechaHora } from './tiempo'

// Endpoints que llama Marco durante la llamada. Los errores de negocio responden 200 con ok:false
// para que el modelo pueda explicarle al paciente qué sigue.
export const herramientas = new Hono<{ Bindings: Env }>()

herramientas.use('*', async (c, next) => {
  const token = (c.req.header('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!c.env.TOOLS_SECRET || !(await compararSecreto(token, c.env.TOOLS_SECRET))) return c.json({ ok: false, mensaje: 'No autorizado' }, 401)
  await next()
})

function conBitacora(nombre: string, fn: (b: any, c: any) => Promise<any>) {
  return async (c: any) => {
    const t0 = Date.now()
    const body = await c.req.json().catch(() => ({}))
    try {
      const r = await fn(body, c)
      const detalle = r.ok === false ? (r.motivo ?? r.mensaje ?? 'rechazado') : (r.cita_id ?? r.id ?? (r.horarios ? `${r.horarios.length} horarios` : 'ok'))
      c.executionCtx.waitUntil(estado(c.env).registrar({ t: t0, tool: nombre, ms: Date.now() - t0, ok: r.ok !== false, detalle: String(detalle).slice(0, 120), conv_id: body.conv_id }))
      return c.json(r)
    } catch (err) {
      console.error(JSON.stringify({ evento: 'error_herramienta', tool: nombre, error: String(err) }))
      c.executionCtx.waitUntil(estado(c.env).registrar({ t: t0, tool: nombre, ms: Date.now() - t0, ok: false, detalle: String(err).slice(0, 120), conv_id: body.conv_id }))
      return c.json({ ok: false, motivo: 'falla_tecnica', mensaje: 'El sistema no respondió. Discúlpate, usa registrar_pendiente con prioridad alta y dile al paciente que recepción le llamará.' })
    }
  }
}

/** Crea el pendiente de urgencia una sola vez por llamada. */
export async function asegurarUrgencia(env: Env, d: { nombre?: string; telefono?: string; motivo?: string; conv_id?: string }) {
  const id = idCorto('T')
  const yaRegistrada = d.conv_id ? await estado(env).primeraVez(`urgencia:${d.conv_id}`, id) : null
  if (yaRegistrada) return yaRegistrada
  await agregar(env, 'Pendientes', [{
    id, creado_en: new Date().toISOString(), tipo: 'urgencia', prioridad: 'alta', paciente: d.nombre ?? '', telefono: soloDigitos(d.telefono ?? ''),
    motivo: d.motivo ?? 'Urgencia reportada durante la llamada.', conv_id: d.conv_id ?? '', estado: 'abierto', resuelto_en: '', notas: '', es_demo: '0',
  }])
  return id
}

herramientas.post('/disponibilidad', conBitacora('consultar_disponibilidad', async (b, c) => {
  const r = await buscarHorarios(c.env, { servicio: b.servicio, fecha: b.fecha, turno: b.turno, doctor: b.doctor })
  if (!r.ok) return r
  if (!r.horarios.length) return { ok: false, mensaje: 'No hay horarios en las próximas dos semanas con esa preferencia. Ofrece registrar un pendiente para que recepción le llame.' }
  return {
    ok: true,
    servicio: r.servicio.nombre,
    duracion_minutos: Number(r.servicio.duracion_min),
    nota: r.nota,
    horarios: r.horarios.map((h) => ({ slot_id: h.slot_id, texto: h.texto })),
  }
}))

herramientas.post('/paciente', conBitacora('buscar_paciente', async (b, c) => {
  const telefono = soloDigitos(b.telefono)
  if (telefono.length !== 10) return { ok: false, mensaje: 'El teléfono debe tener diez dígitos.' }
  const [p, citas] = await Promise.all([pacienteDe(c.env, telefono), citasDePaciente(c.env, telefono)])
  return {
    ok: true,
    encontrado: !!p,
    nombre: p?.nombre ?? '',
    proximas_citas: citas.slice(0, 3).map((x) => ({
      cita_id: x.id,
      texto: `${x.servicio} el ${textoFechaHora(Date.parse(x.inicio))} con ${hablado(x.doctor)}`,
      faltan_menos_de_24_horas: Date.parse(x.inicio) - Date.now() < 86400e3,
    })),
  }
}))

herramientas.post('/agendar', conBitacora('agendar_cita', async (b, c) => {
  const r = await reservar(c.env, c.executionCtx, b)
  // Red de seguridad: una cita de urgencia siempre avisa a una persona, aunque el modelo no lo haya hecho.
  if (r.ok && /urgencia|emergencia/i.test(String(b.servicio ?? ''))) {
    c.executionCtx.waitUntil(asegurarUrgencia(c.env, { nombre: b.nombre, telefono: b.telefono, motivo: b.notas || 'Paciente agendó una cita de urgencia.', conv_id: b.conv_id }))
  }
  return r
}))
herramientas.post('/reagendar', conBitacora('reagendar_cita', (b, c) => reagendar(c.env, c.executionCtx, b.cita_id, b.slot_id)))
herramientas.post('/cancelar', conBitacora('cancelar_cita', (b, c) => cancelar(c.env, c.executionCtx, b.cita_id, b.motivo)))

herramientas.post('/pendiente', conBitacora('registrar_pendiente', async (b, c) => {
  if (b.tipo === 'urgencia') {
    const id = await asegurarUrgencia(c.env, { nombre: b.nombre, telefono: b.telefono, motivo: b.motivo, conv_id: b.conv_id })
    return { ok: true, id, mensaje: 'Urgencia registrada. Ya le avisamos a la clínica.' }
  }
  const id = idCorto('T')
  await agregar(c.env, 'Pendientes', [{
    id, creado_en: new Date().toISOString(), tipo: b.tipo || 'otro', prioridad: b.prioridad || 'media', paciente: b.nombre ?? '',
    telefono: soloDigitos(b.telefono ?? ''), motivo: b.motivo ?? '', conv_id: b.conv_id ?? '', estado: 'abierto', resuelto_en: '', notas: '', es_demo: '0',
  }])
  return { ok: true, id, mensaje: 'Pendiente registrado. Ya le avisamos a la clínica.' }
}))
