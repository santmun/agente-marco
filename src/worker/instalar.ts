import { COLUMNAS, CONFIGURACION, DOCTORES, NEGOCIO, SERVICIOS, type Pestana } from './catalogo'
import { reindexar } from './agenda'
import { ejecutar, ejecutarVarios, listarCuentas } from './composio'
import { construir } from './demo'
import { guardarConfig, leerConfig } from './estado'
import { actualizar, agregar, escribirPestana, leer, olvidarCache } from './hoja'
import { isoLocal, ymd, ZONA } from './tiempo'

const PESTANAS = Object.keys(COLUMNAS) as Pestana[]
const POR_LOTE = 12

const conFilas = (tab: Pestana, datos: Record<string, string>[]) =>
  datos.map((d) => COLUMNAS[tab].map((c) => d[c] ?? ''))

/** Instalación idempotente en pasos cortos: crea la hoja, los cuatro calendarios y carga los datos de ejemplo. */
export async function instalar(env: Env, paso: string, parte: number) {
  const config = await leerConfig(env)
  const hoja = { id: config.sheets_account, usuario: config.composio_user_id }
  const cal = { id: config.calendar_account, usuario: config.composio_user_id }

  // Reinstalar borraría los calendarios ligados y duplicaría los datos de ejemplo: una vez instalado, no hace nada.
  if (config.spreadsheet_id && (paso === 'cuentas' || paso === 'hoja')) {
    const doctores = await leer(env, 'Doctores', true).catch(() => [])
    if (doctores.length && doctores.every((d) => d.calendar_id)) return { ok: true, siguiente: null, progreso: 'Ya estaba instalado' }
  }

  if (paso === 'cuentas') {
    const cuentas = await listarCuentas(env, ['googlesheets', 'googlecalendar', 'whatsapp'])
    const reciente = (t: string) => cuentas.filter((c) => c.toolkit === t).sort((a, b) => Number(!!b.predeterminada) - Number(!!a.predeterminada) || (b.creada ?? '').localeCompare(a.creada ?? ''))[0]
    const s = reciente('googlesheets')
    const k = reciente('googlecalendar')
    if (!s || !k) return { ok: false, mensaje: 'Faltan cuentas activas de Google Sheets o Google Calendar en este proyecto de Composio.' }
    await guardarConfig(env, { sheets_account: config.sheets_account || s.id, calendar_account: config.calendar_account || k.id, composio_user_id: config.composio_user_id || s.user_id })
    return { ok: true, siguiente: 'hoja' }
  }

  if (paso === 'hoja') {
    let id = config.spreadsheet_id
    if (!id) {
      const r = await ejecutar<any>(env, hoja, 'GOOGLESHEETS_CREATE_GOOGLE_SHEET1', { title: `${env.NOMBRE_CLINICA} · Base de datos` }, 20000)
      id = r?.spreadsheetId ?? r?.spreadsheet_id ?? r?.response_data?.spreadsheetId ?? r?.id
      if (!id) throw new Error(`No recibí el ID de la hoja: ${JSON.stringify(r).slice(0, 200)}`)
      await guardarConfig(env, { spreadsheet_id: id })
    }
    for (const tab of PESTANAS) {
      await ejecutar(env, hoja, 'GOOGLESHEETS_ADD_SHEET', {
        spreadsheet_id: id, title: tab, force_unique: false,
        properties: { gridProperties: { columnCount: Math.max(COLUMNAS[tab].length, 26), rowCount: 3000 } },
      }).catch((e) => {
        if (!/already exists|ya existe/i.test(String(e))) throw e
      })
    }
    await escribirPestana(env, 'Negocio', NEGOCIO)
    await escribirPestana(env, 'Doctores', conFilas('Doctores', DOCTORES))
    await escribirPestana(env, 'Servicios', conFilas('Servicios', SERVICIOS))
    await escribirPestana(env, 'Configuracion', CONFIGURACION)
    for (const tab of ['Pacientes', 'Citas', 'Llamadas', 'Pendientes'] as Pestana[]) await escribirPestana(env, tab, [])
    return { ok: true, siguiente: 'calendarios', hoja: id }
  }

  if (paso === 'calendarios') {
    const doctores = await leer(env, 'Doctores', true)
    for (const d of doctores.filter((x) => !x.calendar_id)) {
      const r = await ejecutar<any>(env, cal, 'GOOGLECALENDAR_DUPLICATE_CALENDAR', { summary: `Alborada · ${d.nombre}` })
      const id = r?.id ?? r?.calendarId ?? r?.response_data?.id ?? r?.calendar?.id
      if (!id) throw new Error(`No recibí el ID del calendario: ${JSON.stringify(r).slice(0, 200)}`)
      await ejecutar(env, cal, 'GOOGLECALENDAR_PATCH_CALENDAR', { calendar_id: id, timezone: ZONA }).catch((e) =>
        console.error(JSON.stringify({ evento: 'zona_calendario', error: String(e) })),
      )
      await actualizar(env, 'Doctores', d, { calendar_id: id })
    }
    await olvidarCache(env, 'Doctores')
    return { ok: true, siguiente: 'demo' }
  }

  if (paso === 'demo') {
    const datos = construir()
    const llamadas = datos.Llamadas
    const lote = 220
    const inicio = parte * lote
    await agregar(env, 'Llamadas', llamadas.slice(inicio, inicio + lote))
    if (inicio + lote < llamadas.length) return { ok: true, siguiente: 'demo', parte: parte + 1, progreso: `${inicio + lote} de ${llamadas.length} llamadas` }
    await agregar(env, 'Pacientes', datos.Pacientes)
    await agregar(env, 'Pendientes', datos.Pendientes)
    return { ok: true, siguiente: 'citas', parte: 0 }
  }

  if (paso === 'citas') {
    const hoy = ymd(Date.now())
    const citas = construir().Citas
    const doctores = await leer(env, 'Doctores')
    const lote = citas.slice(parte * POR_LOTE, parte * POR_LOTE + POR_LOTE)
    const calendarioDe = (c: Record<string, string>) => doctores.find((x) => x.id === c.doctor_id)?.calendar_id ?? ''
    const conEvento = lote.filter((c) => calendarioDe(c) && c.inicio.slice(0, 10) >= hoy)
    const eventos = await ejecutarVarios(env, cal, conEvento.map((c) => ({
      slug: 'GOOGLECALENDAR_CREATE_EVENT',
      args: {
        calendar_id: calendarioDe(c),
        summary: `${c.paciente} · ${c.servicio}`,
        description: `Paciente: ${c.paciente}\nTeléfono: ${c.telefono}\nServicio: ${c.servicio}\nCita: ${c.id}\nDato de ejemplo.`,
        start_datetime: isoLocal(Date.parse(c.inicio)),
        end_datetime: isoLocal(Date.parse(c.fin)),
        timezone: ZONA,
        create_meeting_room: false,
        send_updates: 'none',
        extended_properties: { private: { cita_id: c.id, paciente_id: c.paciente_id, es_demo: '1' } },
      },
    })), 40000)
    const idEvento = new Map(conEvento.map((c, i) => [c.id, eventos[i]?.id ?? eventos[i]?.response_data?.id ?? eventos[i]?.event?.id ?? '']))
    await agregar(env, 'Citas', lote.map((c) => ({ ...c, event_id: idEvento.get(c.id) ?? '', calendar_id: calendarioDe(c) })))
    const hecho = parte * POR_LOTE + lote.length
    if (hecho < citas.length) return { ok: true, siguiente: 'citas', parte: parte + 1, progreso: `${hecho} de ${citas.length} citas` }
    await reindexar(env)
    return { ok: true, siguiente: null }
  }

  return { ok: false, mensaje: `Paso desconocido: ${paso}` }
}
