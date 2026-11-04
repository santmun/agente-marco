import { ejecutar, ejecutarVarios } from './composio'
import { estado, leerConfig, type Config } from './estado'
import { actualizar, agregar, leer, modoVistaPrevia, type Fila } from './hoja'
import { aMs, COLUMNA_DIA, diaSemana, hhmm, iso, isoLocal, sumarDias, textoFechaHora, ymd, ZONA } from './tiempo'
import { enviarConfirmacion, type EstadoWhatsapp } from './whatsapp'

const PASO_MIN = 30
const ANTICIPACION_MS = 60 * 60e3
const DIAS_BUSQUEDA = 14

export type Contexto = Pick<ExecutionContext, 'waitUntil'>

const cuentaCal = (c: Config) => ({ id: c.calendar_account, usuario: c.composio_user_id })
const quitarAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
export const soloDigitos = (s: string) => (s || '').replace(/\D/g, '').slice(-10)

export function idCorto(prefijo: string) {
  const b = crypto.getRandomValues(new Uint8Array(4))
  return `${prefijo}-${[...b].map((x) => x.toString(36).padStart(2, '0')).join('').toUpperCase().slice(0, 6)}`
}

export function encontrarServicio(servicios: Fila[], texto: string) {
  const t = quitarAcentos(texto)
  if (!t) return undefined
  const activos = servicios.filter((s) => s.activo !== '0')
  return (
    activos.find((s) => s.id === t || quitarAcentos(s.nombre) === t) ??
    activos.find((s) => quitarAcentos(s.nombre).includes(t) || t.includes(quitarAcentos(s.nombre))) ??
    activos.find((s) => s.palabras_clave.split(',').some((k) => k && (t.includes(quitarAcentos(k)) || quitarAcentos(k).includes(t))))
  )
}

type Intervalo = { inicio: number; fin: number }

/** Horarios ocupados por doctor, leídos en una sola llamada de los calendarios (o de Citas en vista previa). */
async function ocupados(env: Env, doctores: Fila[], desde: number, hasta: number): Promise<Record<string, Intervalo[]>> {
  const salida: Record<string, Intervalo[]> = Object.fromEntries(doctores.map((d) => [d.id, []]))
  const conCalendario = doctores.filter((d) => d.calendar_id)
  if (await modoVistaPrevia(env) || !conCalendario.length) {
    for (const c of await leer(env, 'Citas')) {
      if (c.estado === 'cancelada' || !salida[c.doctor_id]) continue
      const inicio = Date.parse(c.inicio)
      if (inicio < hasta && Date.parse(c.fin) > desde) salida[c.doctor_id].push({ inicio, fin: Date.parse(c.fin) })
    }
    return salida
  }
  const config = await leerConfig(env)
  const data = await ejecutar<any>(env, cuentaCal(config), 'GOOGLECALENDAR_FREE_BUSY_QUERY', {
    timeMin: new Date(desde).toISOString(),
    timeMax: new Date(hasta).toISOString(),
    timeZone: ZONA,
    items: conCalendario.map((d) => ({ id: d.calendar_id })),
  })
  const calendarios = data?.calendars ?? data?.response_data?.calendars ?? {}
  for (const d of conCalendario) {
    salida[d.id] = (calendarios[d.calendar_id]?.busy ?? []).map((b: any) => ({ inicio: Date.parse(b.start), fin: Date.parse(b.end) }))
  }
  return salida
}

const chocan = (a: Intervalo, b: Intervalo) => a.inicio < b.fin && b.inicio < a.fin
// Para que la voz diga "la doctora" y no lea la abreviatura.
export const hablado = (nombre: string) => nombre.replace(/^Dra\.\s*/, 'la doctora ').replace(/^Dr\.\s*/, 'el doctor ')

export type Horario = { slot_id: string; doctor: string; texto: string; inicio: string }

export async function buscarHorarios(
  env: Env,
  op: { servicio: string; fecha?: string; turno?: string; doctor?: string; limite?: number; excluir?: string },
): Promise<{ ok: true; servicio: Fila; horarios: Horario[]; nota?: string } | { ok: false; mensaje: string }> {
  const [servicios, doctores, negocio] = await Promise.all([leer(env, 'Servicios'), leer(env, 'Doctores'), leer(env, 'Negocio')])
  const servicio = encontrarServicio(servicios, op.servicio)
  if (!servicio) {
    return { ok: false, mensaje: `No reconozco ese servicio. Los disponibles son: ${servicios.filter((s) => s.activo !== '0').map((s) => s.nombre).join(', ')}.` }
  }
  const festivos = new Set((negocio.find((n) => n.campo === 'festivos')?.valor ?? '').split(','))
  const hoy = ymd(Date.now())
  const pedida = op.fecha && /^\d{4}-\d{2}-\d{2}$/.test(op.fecha) && op.fecha >= hoy ? op.fecha : hoy
  const duracion = Number(servicio.duracion_min) * 60e3
  const ids = servicio.doctores.split(',').map((s) => s.trim())
  let candidatos = doctores.filter((d) => ids.includes(d.id) && d.activo !== '0')
  let nota: string | undefined
  if (op.doctor) {
    const buscado = quitarAcentos(op.doctor)
    const elegidos = doctores.filter((d) => quitarAcentos(d.nombre).includes(buscado) && d.activo !== '0')
    const compatibles = elegidos.filter((d) => ids.includes(d.id))
    if (compatibles.length) candidatos = compatibles
    else if (elegidos.length) nota = `${elegidos[0].nombre} no atiende ${servicio.nombre}. Estos horarios son con quien sí lo atiende.`
  }

  const desde = aMs(pedida)
  const hasta = aMs(sumarDias(pedida, DIAS_BUSQUEDA))
  const agenda = await ocupados(env, candidatos, desde, hasta)
  const minimo = Date.now() + ANTICIPACION_MS
  const limite = op.limite ?? 3
  const elegidos: Horario[] = []

  for (let i = 0; i < DIAS_BUSQUEDA && elegidos.length < limite; i++) {
    const fecha = sumarDias(pedida, i)
    if (festivos.has(fecha)) continue
    const columnaDia = COLUMNA_DIA[diaSemana(fecha)]
    const delDia: { ms: number; doctor: Fila }[] = []
    for (const d of candidatos) {
      const rango = d[columnaDia]
      if (!rango) continue
      const [abre, cierra] = rango.split('-')
      for (let t = aMs(fecha, abre); t + duracion <= aMs(fecha, cierra); t += PASO_MIN * 60e3) {
        const hora = hhmm(t)
        if (t < minimo) continue
        if (op.turno === 'manana' && hora >= '13:00') continue
        if (op.turno === 'tarde' && hora < '13:00') continue
        if (agenda[d.id].some((o) => chocan(o, { inicio: t, fin: t + duracion }))) continue
        delDia.push({ ms: t, doctor: d })
      }
    }
    delDia.sort((a, b) => a.ms - b.ms)
    // Separa las opciones al menos 90 minutos para que el paciente elija de verdad.
    for (const s of delDia) {
      if (elegidos.length >= limite) break
      const cerca = elegidos.some((e) => Math.abs(Date.parse(e.inicio) - s.ms) < 90 * 60e3)
      const slot_id = `${s.doctor.id}|${ymd(s.ms)}T${hhmm(s.ms)}`
      if (cerca || slot_id === op.excluir) continue
      elegidos.push({ slot_id, doctor: s.doctor.nombre, texto: `${textoFechaHora(s.ms)} con ${hablado(s.doctor.nombre)}`, inicio: iso(s.ms) })
    }
  }
  if (elegidos.length && ymd(Date.parse(elegidos[0].inicio)) !== pedida && !nota) {
    nota = 'No hay espacio ese día con esa preferencia. Estos son los siguientes horarios disponibles.'
  }
  return { ok: true, servicio, horarios: elegidos, nota }
}

function leerSlot(slot: string) {
  const m = /^(d\d+)\|(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec((slot || '').trim())
  return m ? { doctorId: m[1], ms: aMs(m[2], m[3]) } : null
}

async function conCandado<T>(env: Env, doctorId: string, fn: () => Promise<T>): Promise<T | null> {
  const stub = estado(env)
  for (let i = 0; i < 6; i++) {
    if (await stub.tomarCandado(doctorId)) {
      try {
        return await fn()
      } finally {
        await stub.soltarCandado(doctorId)
      }
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  return null
}

async function libre(env: Env, doctor: Fila, inicio: number, fin: number) {
  const [agenda, recientes] = await Promise.all([
    ocupados(env, [doctor], inicio - 60e3, fin + 60e3),
    estado(env).reservasRecientes(doctor.id),
  ])
  return ![...agenda[doctor.id], ...recientes].some((o) => chocan(o, { inicio, fin }))
}

function descripcionEvento(d: { cita_id: string; paciente: string; telefono: string; servicio: string; notas?: string; conv_id?: string }) {
  return [
    `Paciente: ${d.paciente}`,
    `Teléfono: ${d.telefono}`,
    `Servicio: ${d.servicio}`,
    d.notas ? `Notas: ${d.notas}` : '',
    `Cita: ${d.cita_id}`,
    'Agendada por Marco, asistente de voz.',
  ].filter(Boolean).join('\n')
}

async function crearEvento(env: Env, doctor: Fila, d: { cita_id: string; paciente: string; paciente_id: string; telefono: string; servicio: string; notas?: string; conv_id?: string; inicio: number; fin: number; es_demo?: boolean }) {
  if (await modoVistaPrevia(env) || !doctor.calendar_id) return `preview-${d.cita_id}`
  const config = await leerConfig(env)
  const data = await ejecutar<any>(env, cuentaCal(config), 'GOOGLECALENDAR_CREATE_EVENT', {
    calendar_id: doctor.calendar_id,
    summary: `${d.paciente} · ${d.servicio}`,
    description: descripcionEvento(d),
    start_datetime: isoLocal(d.inicio),
    end_datetime: isoLocal(d.fin),
    timezone: ZONA,
    create_meeting_room: false,
    send_updates: 'none',
    extended_properties: { private: { cita_id: d.cita_id, paciente_id: d.paciente_id, conv_id: d.conv_id ?? '', es_demo: d.es_demo ? '1' : '0' } },
  })
  return data?.id ?? data?.response_data?.id ?? data?.event?.id ?? ''
}

export async function pacienteDe(env: Env, telefono: string) {
  if (await modoVistaPrevia(env)) return (await leer(env, 'Pacientes')).find((p) => soloDigitos(p.telefono) === telefono) ?? null
  return (await estado(env).leerPaciente(telefono)) as Fila | null
}

async function asegurarPaciente(env: Env, nombre: string, telefono: string, origen: string) {
  const existente = await pacienteDe(env, telefono)
  if (existente) return { id: existente.id, fila: existente }
  const id = idCorto('P')
  const fila = { id, nombre, telefono, email: '', fecha_alta: new Date().toISOString(), origen, ultima_cita: '', proxima_cita: '', total_citas: '0', notas: '', es_demo: '0' }
  const numero = await agregar(env, 'Pacientes', [fila])
  if (!(await modoVistaPrevia(env))) await estado(env).guardarPaciente(telefono, { ...fila, _fila: String(numero ?? '') })
  return { id, fila: null }
}

export type EntradaCita = { nombre: string; telefono: string; servicio: string; slot_id: string; acepta_whatsapp?: boolean; notas?: string; conv_id?: string; canal?: string }

export async function reservar(env: Env, ctx: Contexto, e: EntradaCita) {
  const slot = leerSlot(e.slot_id)
  const telefono = soloDigitos(e.telefono)
  if (!slot) return { ok: false, motivo: 'slot_invalido', mensaje: 'Ese horario no es válido. Vuelve a consultar disponibilidad.' }
  if (telefono.length !== 10) return { ok: false, motivo: 'telefono_invalido', mensaje: 'El teléfono debe tener diez dígitos. Pídelo de nuevo.' }
  if (!e.nombre?.trim()) return { ok: false, motivo: 'falta_nombre', mensaje: 'Falta el nombre del paciente.' }

  const [servicios, doctores] = await Promise.all([leer(env, 'Servicios'), leer(env, 'Doctores')])
  const servicio = encontrarServicio(servicios, e.servicio)
  const doctor = doctores.find((d) => d.id === slot.doctorId)
  if (!servicio || !doctor) return { ok: false, motivo: 'datos_invalidos', mensaje: 'No encontré ese servicio o doctor. Vuelve a consultar disponibilidad.' }
  if (slot.ms < Date.now()) return { ok: false, motivo: 'horario_pasado', mensaje: 'Ese horario ya pasó. Vuelve a consultar disponibilidad.' }

  const inicio = slot.ms
  const fin = inicio + Number(servicio.duracion_min) * 60e3
  const citaId = idCorto('C')

  const resultado = await conCandado(env, doctor.id, async () => {
    if (!(await libre(env, doctor, inicio, fin))) return null
    const eventId = await crearEvento(env, doctor, { cita_id: citaId, paciente: e.nombre.trim(), paciente_id: '', telefono, servicio: servicio.nombre, notas: e.notas, conv_id: e.conv_id, inicio, fin })
    await estado(env).recordarReserva(doctor.id, inicio, fin)
    return { eventId }
  })

  if (resultado === null) {
    const alt = await buscarHorarios(env, { servicio: e.servicio, fecha: ymd(inicio), limite: 3, excluir: e.slot_id })
    return {
      ok: false,
      motivo: 'horario_ocupado',
      mensaje: 'Ese horario se acaba de ocupar. Ofrece estas alternativas.',
      alternativas: alt.ok ? alt.horarios : [],
    }
  }

  const ahora = new Date().toISOString()
  const fila = {
    id: citaId, event_id: resultado.eventId, calendar_id: doctor.calendar_id, doctor_id: doctor.id, doctor: doctor.nombre,
    paciente_id: '', paciente: e.nombre.trim(), telefono, servicio_id: servicio.id, servicio: servicio.nombre,
    inicio: iso(inicio), fin: iso(fin), estado: 'agendada', whatsapp: '', canal: e.canal ?? 'llamada', conv_id: e.conv_id ?? '',
    creada_en: ahora, actualizada_en: ahora, notas: e.notas ?? '', es_demo: '0',
  }

  const whatsapp: EstadoWhatsapp = e.acepta_whatsapp === false
    ? 'no_acepto'
    : await enviarConfirmacion(env, { telefono, paciente: e.nombre.trim(), servicio: servicio.nombre, doctor: doctor.nombre, cuando: textoFechaHora(inicio) })
  fila.whatsapp = whatsapp

  // El evento ya es la verdad; la hoja se escribe sin hacer esperar al paciente.
  ctx.waitUntil(registrarCita(env, fila, e.canal ?? 'llamada'))

  return {
    ok: true,
    cita_id: citaId,
    confirmacion_texto: `Listo, su cita de ${servicio.nombre} quedó para el ${textoFechaHora(inicio)} con ${hablado(doctor.nombre)}.`,
    whatsapp,
  }
}

async function registrarCita(env: Env, fila: Record<string, string>, origen: string) {
  try {
    const paciente = await asegurarPaciente(env, fila.paciente, fila.telefono, origen)
    const conPaciente = { ...fila, paciente_id: paciente.id }
    const preview = await modoVistaPrevia(env)
    // Se indexa antes de escribir a la hoja: el paciente puede pedir cambiarla en esa misma llamada.
    if (!preview) await estado(env).guardarCita(fila.telefono, conPaciente)
    const numero = await agregar(env, 'Citas', [conPaciente])
    if (!preview) await estado(env).guardarCita(fila.telefono, { ...conPaciente, _fila: String(numero ?? '') })
    if (paciente.fila?._fila) {
      const cambios = { proxima_cita: fila.inicio, total_citas: String(Number(paciente.fila.total_citas || 0) + 1) }
      await actualizar(env, 'Pacientes', paciente.fila, cambios)
      if (!preview) await estado(env).guardarPaciente(fila.telefono, { ...paciente.fila, ...cambios })
    }
  } catch (err) {
    console.error(JSON.stringify({ evento: 'error_registrar_cita', cita: fila.id, error: String(err) }))
  }
}

export async function citasDePaciente(env: Env, telefono: string) {
  const ahora = Date.now()
  const citas = (await modoVistaPrevia(env))
    ? (await leer(env, 'Citas', true)).filter((c) => soloDigitos(c.telefono) === telefono)
    : ((await estado(env).citasDe(telefono)) as Fila[])
  return citas
    .filter((c) => c.estado === 'agendada' && Date.parse(c.fin) > ahora)
    .sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio))
}

async function buscarCita(env: Env, id: string) {
  const clave = (id || '').trim().toUpperCase()
  if (!(await modoVistaPrevia(env))) {
    const c = (await estado(env).leerCita(clave)) as Fila | null
    if (c) return c
  }
  return (await leer(env, 'Citas', true)).find((c) => c.id.toUpperCase() === clave)
}

/** Aplica un cambio a la cita: el índice queda al día de inmediato y la hoja en segundo plano. */
async function cambiarCita(env: Env, ctx: Contexto, cita: Fila, cambios: Record<string, string>) {
  if (!(await modoVistaPrevia(env))) await estado(env).guardarCita(soloDigitos(cita.telefono), { ...cita, ...cambios })
  ctx.waitUntil((async () => {
    try {
      // Una cita recién creada puede no tener todavía su número de fila.
      const fila = cita._fila ? cita : (await leer(env, 'Citas', true)).find((c) => c.id === cita.id)
      if (fila) await actualizar(env, 'Citas', fila, cambios)
    } catch (err) {
      console.error(JSON.stringify({ evento: 'error_actualizar_cita', cita: cita.id, error: String(err) }))
    }
  })())
}

export async function reindexar(env: Env) {
  if (await modoVistaPrevia(env)) return { pacientes: 0, citas: 0 }
  const [pacientes, citas, llamadas] = await Promise.all([leer(env, 'Pacientes', true), leer(env, 'Citas', true), leer(env, 'Llamadas', true)])
  await estado(env).guardarLlamadas(llamadas)
  return estado(env).indexar(
    pacientes.map((p) => [soloDigitos(p.telefono), p as Record<string, string>] as const),
    citas.map((c) => [soloDigitos(c.telefono), c as Record<string, string>] as const),
  )
}

export async function cancelar(env: Env, ctx: Contexto, citaId: string, motivo?: string) {
  const cita = await buscarCita(env, citaId)
  if (!cita) return { ok: false, mensaje: 'No encontré esa cita. Usa buscar_paciente.' }
  if (cita.estado === 'cancelada') return { ok: true, confirmacion_texto: 'Esa cita ya estaba cancelada.' }
  if (!(await modoVistaPrevia(env)) && cita.event_id && cita.calendar_id) {
    const config = await leerConfig(env)
    await ejecutar(env, cuentaCal(config), 'GOOGLECALENDAR_DELETE_EVENT', { calendar_id: cita.calendar_id, event_id: cita.event_id, send_updates: 'none' })
  }
  await cambiarCita(env, ctx, cita, { estado: 'cancelada', actualizada_en: new Date().toISOString(), notas: [cita.notas, motivo && `Cancelación: ${motivo}`].filter(Boolean).join(' · ') })
  return { ok: true, confirmacion_texto: `Listo, cancelé su cita del ${textoFechaHora(Date.parse(cita.inicio))}.` }
}

export async function reagendar(env: Env, ctx: Contexto, citaId: string, slotId: string) {
  const cita = await buscarCita(env, citaId)
  const slot = leerSlot(slotId)
  if (!cita) return { ok: false, mensaje: 'No encontré esa cita. Usa buscar_paciente.' }
  if (!slot) return { ok: false, mensaje: 'Ese horario no es válido. Vuelve a consultar disponibilidad.' }
  const doctores = await leer(env, 'Doctores')
  const doctor = doctores.find((d) => d.id === slot.doctorId)
  if (!doctor) return { ok: false, mensaje: 'No encontré a ese doctor.' }
  const duracion = Date.parse(cita.fin) - Date.parse(cita.inicio)
  const inicio = slot.ms
  const fin = inicio + duracion

  const eventoNuevo = await conCandado(env, doctor.id, async () => {
    if (!(await libre(env, doctor, inicio, fin))) return null
    await estado(env).recordarReserva(doctor.id, inicio, fin)
    return crearEvento(env, doctor, { cita_id: cita.id, paciente: cita.paciente, paciente_id: cita.paciente_id, telefono: cita.telefono, servicio: cita.servicio, notas: cita.notas, conv_id: cita.conv_id, inicio, fin })
  })
  if (eventoNuevo === null) {
    const alt = await buscarHorarios(env, { servicio: cita.servicio_id, fecha: ymd(inicio), excluir: slotId })
    return { ok: false, motivo: 'horario_ocupado', mensaje: 'Ese horario se acaba de ocupar. Ofrece estas alternativas.', alternativas: alt.ok ? alt.horarios : [] }
  }
  // Primero se crea el nuevo y después se borra el anterior: si algo falla, la cita no se pierde.
  if (!(await modoVistaPrevia(env)) && cita.event_id && cita.calendar_id) {
    const config = await leerConfig(env)
    ctx.waitUntil(
      ejecutar(env, cuentaCal(config), 'GOOGLECALENDAR_DELETE_EVENT', { calendar_id: cita.calendar_id, event_id: cita.event_id, send_updates: 'none' })
        .catch((err) => console.error(JSON.stringify({ evento: 'error_borrar_evento_anterior', cita: cita.id, evento_id: cita.event_id, error: String(err) }))),
    )
  }
  await cambiarCita(env, ctx, cita, {
    event_id: eventoNuevo, calendar_id: doctor.calendar_id, doctor_id: doctor.id, doctor: doctor.nombre,
    inicio: iso(inicio), fin: iso(fin), actualizada_en: new Date().toISOString(),
  })
  return { ok: true, confirmacion_texto: `Listo, cambié su cita para el ${textoFechaHora(inicio)} con ${hablado(doctor.nombre)}.` }
}

/** Eventos de los cuatro calendarios en una sola consulta; incluye bloqueos hechos a mano en Google Calendar. */
export async function eventosDelDia(env: Env, fecha: string) {
  const doctores = await leer(env, 'Doctores')
  const desde = aMs(fecha)
  const hasta = aMs(sumarDias(fecha, 1))
  const columnaDia = COLUMNA_DIA[diaSemana(fecha)]
  const base = (d: Fila, eventos: unknown[]) => ({ id: d.id, nombre: d.nombre, especialidad: d.especialidad, horario: d[columnaDia] || '', eventos })

  if (await modoVistaPrevia(env) || !doctores.some((d) => d.calendar_id)) {
    const citas = (await leer(env, 'Citas')).filter((c) => c.estado !== 'cancelada')
    return doctores.map((d) => base(d, citas
      .filter((c) => c.doctor_id === d.id && Date.parse(c.inicio) >= desde && Date.parse(c.inicio) < hasta)
      .map((c) => ({ id: c.id, cita_id: c.id, titulo: `${c.paciente} · ${c.servicio}`, paciente: c.paciente, telefono: c.telefono, servicio: c.servicio, inicio: c.inicio, fin: c.fin, canal: c.canal, es_demo: c.es_demo }))))
  }

  const config = await leerConfig(env)
  const respuestas = await ejecutarVarios(env, cuentaCal(config), doctores.map((d) => ({
    slug: 'GOOGLECALENDAR_EVENTS_LIST',
    args: { calendarId: d.calendar_id, timeMin: new Date(desde).toISOString(), timeMax: new Date(hasta).toISOString(), singleEvents: true, orderBy: 'startTime', maxResults: 60, timeZone: ZONA },
  })), 20000)
  const stub = estado(env)
  return Promise.all(doctores.map(async (d, i) => {
    const items: any[] = respuestas[i]?.items ?? respuestas[i]?.response_data?.items ?? []
    const eventos = await Promise.all(items.map(async (ev) => {
      const privado = ev.extendedProperties?.private ?? {}
      const cita = privado.cita_id ? ((await stub.leerCita(privado.cita_id)) as Fila | null) : null
      return {
        id: ev.id,
        cita_id: cita?.id ?? privado.cita_id ?? '',
        titulo: ev.summary ?? 'Bloqueado',
        paciente: cita?.paciente ?? '',
        telefono: cita?.telefono ?? '',
        servicio: cita?.servicio ?? '',
        inicio: ev.start?.dateTime ?? `${fecha}T00:00:00-06:00`,
        fin: ev.end?.dateTime ?? `${fecha}T23:59:00-06:00`,
        canal: cita?.canal ?? (privado.cita_id ? 'llamada' : 'manual'),
        enlace: ev.htmlLink,
        es_demo: privado.es_demo ?? cita?.es_demo ?? '0',
      }
    }))
    return base(d, eventos)
  }))
}
