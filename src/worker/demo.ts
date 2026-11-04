import { CONFIGURACION, DOCTORES, NEGOCIO, SERVICIOS } from './catalogo'
import { aMs, COLUMNA_DIA, diaSemana, fueraDeHorario, iso, sumarDias, ymd } from './tiempo'

// Generador determinista de datos de ejemplo. Todo lleva es_demo=1 para poder filtrarlo o borrarlo.
function prng(semilla: number) {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const NOMBRES = ['Ana', 'Luis', 'María', 'Jorge', 'Daniela', 'Carlos', 'Fernanda', 'Ricardo', 'Sofía', 'Alejandro', 'Paola', 'Miguel', 'Valeria', 'Héctor', 'Regina', 'Eduardo', 'Mónica', 'Andrés', 'Lorena', 'Óscar', 'Natalia', 'Roberto', 'Gabriela', 'Javier', 'Claudia', 'Raúl']
const APELLIDOS = ['Garza', 'Treviño', 'González', 'Martínez', 'Rodríguez', 'Cantú', 'Hernández', 'Villarreal', 'Salinas', 'Elizondo', 'Flores', 'Ramírez', 'Sada', 'Leal', 'Guerra', 'Morales', 'Zambrano', 'Chapa', 'Cavazos', 'Ortiz']

const MOTIVOS: [string, number, string[], number][] = [
  ['agendar', 46, ['cita_agendada', 'cita_agendada', 'cita_agendada', 'cita_agendada', 'cita_agendada', 'cita_agendada', 'cita_agendada', 'colgo_sin_terminar', 'sin_resolver'], 135],
  ['informacion', 14, ['informacion_resuelta', 'informacion_resuelta', 'informacion_resuelta', 'cita_agendada'], 62],
  ['precios', 12, ['informacion_resuelta', 'informacion_resuelta', 'cita_agendada'], 70],
  ['reagendar', 9, ['cita_reagendada', 'cita_reagendada', 'cita_reagendada', 'sin_resolver'], 95],
  ['cancelar', 5, ['cita_cancelada', 'cita_cancelada', 'cita_reagendada'], 58],
  ['urgencia', 5, ['escalada_a_humano', 'escalada_a_humano', 'cita_agendada'], 110],
  ['seguro', 4, ['pendiente_registrado', 'informacion_resuelta'], 80],
  ['queja', 1, ['pendiente_registrado'], 90],
  ['otro', 4, ['informacion_resuelta', 'pendiente_registrado'], 48],
]
const TOTAL_PESO = MOTIVOS.reduce((s, m) => s + m[1], 0)
const CURVA_HORA = [1, 0, 0, 0, 0, 0, 1, 3, 8, 12, 13, 12, 10, 8, 8, 9, 10, 10, 8, 6, 4, 3, 2, 1]
const TOTAL_CURVA = CURVA_HORA.reduce((a, b) => a + b, 0)
const VOZ_USD_MIN = 0.0873

const RESUMEN: Record<string, string> = {
  cita_agendada: 'El paciente pidió una cita. Marco revisó disponibilidad, propuso horarios y dejó la cita agendada.',
  cita_reagendada: 'El paciente pidió cambiar su cita y Marco la movió a un nuevo horario.',
  cita_cancelada: 'El paciente canceló su cita y Marco liberó el horario.',
  informacion_resuelta: 'El paciente pidió información de la clínica y Marco la resolvió.',
  escalada_a_humano: 'El paciente reportó una urgencia y Marco la pasó con una persona de la clínica.',
  pendiente_registrado: 'Marco registró un pendiente para que recepción devuelva la llamada.',
  sin_resolver: 'La llamada no se pudo resolver y quedó para seguimiento de recepción.',
  colgo_sin_terminar: 'El paciente colgó antes de terminar.',
}

let cache: ReturnType<typeof construir> | null = null

export function datosDemo() {
  cache ??= construir()
  return cache
}

export function construir() {
  const r = prng(2011)
  const entre = (a: number, b: number) => a + r() * (b - a)
  const elegir = <T,>(l: T[]) => l[Math.floor(r() * l.length)]
  const hoy = ymd(Date.now())
  const ahora = Date.now()

  const pacientes = Array.from({ length: 140 }, (_, i) => ({
    id: `P-D${String(i).padStart(4, '0')}`,
    nombre: `${elegir(NOMBRES)} ${elegir(APELLIDOS)}`,
    telefono: `81000${String(10000 + i).slice(-5)}`,
    email: '',
    fecha_alta: new Date(ahora - entre(1, 400) * 86400e3).toISOString(),
    origen: r() < 0.7 ? 'llamada' : 'recepcion',
    ultima_cita: '',
    proxima_cita: '',
    total_citas: String(Math.floor(entre(1, 9))),
    notas: '',
    es_demo: '1',
  }))

  const llamadas: Record<string, string | number>[] = []
  for (let dia = 6; dia >= 0; dia--) {
    const fecha = sumarDias(hoy, -dia)
    const dow = diaSemana(fecha)
    const objetivo = dow === 0 ? 14 : dow === 6 ? 38 : Math.round(entre(72, 92))
    for (let h = 0; h < 24; h++) {
      const n = Math.round((CURVA_HORA[h] / TOTAL_CURVA) * objetivo * entre(0.8, 1.2))
      for (let k = 0; k < n; k++) {
        const inicio = aMs(fecha, `${String(h).padStart(2, '0')}:${String(Math.floor(r() * 60)).padStart(2, '0')}`)
        if (inicio > ahora) continue
        let x = r() * TOTAL_PESO
        const motivo = MOTIVOS.find((m) => (x -= m[1]) <= 0) ?? MOTIVOS[0]
        const resultado = elegir(motivo[2])
        const duracion = Math.round(motivo[3] * entre(0.65, 1.45))
        const voz = (duracion / 60) * VOZ_USD_MIN
        const llm = duracion * entre(0.00002, 0.00005)
        const p = elegir(pacientes)
        const servicio = motivo[0] === 'urgencia' ? SERVICIOS[12] : elegir(SERVICIOS)
        const sinTools = ['informacion', 'precios', 'otro'].includes(motivo[0])
        llamadas.push({
          conv_id: `demo_${fecha.replaceAll('-', '')}_${llamadas.length}`,
          inicio: new Date(inicio).toISOString(),
          duracion_s: duracion,
          telefono: p.telefono,
          paciente: p.nombre,
          motivo: motivo[0],
          resultado,
          servicio: servicio.nombre,
          urgencia: motivo[0] === 'urgencia' ? '1' : '0',
          fuera_horario: fueraDeHorario(inicio) ? '1' : '0',
          sentimiento: r() < 0.72 ? 'positive' : r() < 0.85 ? 'neutral' : 'negative',
          frustracion: Number((r() * 0.25).toFixed(2)),
          exito: resultado === 'sin_resolver' || resultado === 'colgo_sin_terminar' ? 'failure' : 'success',
          canal: 'telefono',
          costo_usd: Number((voz + llm).toFixed(5)),
          voz_usd: Number(voz.toFixed(5)),
          llm_usd: Number(llm.toFixed(5)),
          creditos: Math.round((voz + llm) / 0.000218),
          tokens_in: Math.round(duracion * entre(280, 460)),
          tokens_out: Math.round(duracion * entre(6, 11)),
          llm_ttfb_ms: Math.round(entre(340, 780)),
          tts_ttfb_ms: Math.round(entre(78, 125)),
          respuesta_ms: Math.round(entre(820, 1480)),
          tool_ms: sinTools ? 0 : Math.round(entre(620, 1750)),
          tool_errores: r() < 0.012 ? 1 : 0,
          modelo: 'claude-haiku-5-5',
          titulo: `${motivo[0][0].toUpperCase()}${motivo[0].slice(1)}: ${servicio.nombre}`,
          resumen: RESUMEN[resultado],
          tiene_audio: '0',
          es_demo: '1',
        })
      }
    }
  }

  const citas: Record<string, string>[] = []
  for (let dia = -1; dia <= 7; dia++) {
    const fecha = sumarDias(hoy, dia)
    const columna = COLUMNA_DIA[diaSemana(fecha)]
    for (const d of DOCTORES) {
      const rango = d[columna]
      if (!rango) continue
      const [abre, cierra] = rango.split('-')
      const opciones = SERVICIOS.filter((s) => s.doctores.includes(d.id) && s.id !== 'urgencia')
      let t = aMs(fecha, abre)
      while (t < aMs(fecha, cierra)) {
        const servicio = elegir(opciones)
        const fin = t + Number(servicio.duracion_min) * 60e3
        if (fin > aMs(fecha, cierra)) break
        if (r() < 0.62 - dia * 0.05) {
          const p = elegir(pacientes)
          citas.push({
            id: `C-D${String(citas.length).padStart(4, '0')}`, event_id: '', calendar_id: '', doctor_id: d.id, doctor: d.nombre,
            paciente_id: p.id, paciente: p.nombre, telefono: p.telefono, servicio_id: servicio.id, servicio: servicio.nombre,
            inicio: iso(t), fin: iso(fin), estado: 'agendada', whatsapp: 'demo', canal: r() < 0.68 ? 'llamada' : 'recepcion', conv_id: '',
            creada_en: new Date(t - entre(1, 8) * 86400e3).toISOString(), actualizada_en: '', notas: '', es_demo: '1',
          })
        }
        t = fin + (r() < 0.3 ? 30 * 60e3 : 0)
      }
    }
  }

  const tipos = [
    ['urgencia', 'alta', 'Dolor fuerte en muela inferior desde la noche, pide que le atiendan hoy.'],
    ['urgencia', 'alta', 'Se le rompió un diente con un golpe. Sin sangrado.'],
    ['devolver_llamada', 'media', 'Pide hablar con recepción sobre su plan de pagos de ortodoncia.'],
    ['seguro', 'media', 'Duda sobre el reembolso de MetLife Dental para una corona.'],
    ['devolver_llamada', 'media', 'Quiere coordinar citas para sus dos hijos el mismo día.'],
    ['queja', 'alta', 'Esperó cuarenta minutos en su última cita y pide que le llamen.'],
    ['seguro', 'baja', 'Pregunta si Dentalia Plus cubre limpieza anual.'],
    ['otro', 'baja', 'Solicita su factura de la cita de octubre.'],
  ]
  const pendientes = tipos.map(([tipo, prioridad, motivo], i) => {
    const p = elegir(pacientes)
    return {
      id: `T-D${String(i).padStart(4, '0')}`, creado_en: new Date(ahora - entre(0.2, 40) * 3600e3).toISOString(), tipo, prioridad, paciente: p.nombre,
      telefono: p.telefono, motivo, conv_id: '', estado: i > 5 ? 'resuelto' : 'abierto', resuelto_en: i > 5 ? new Date(ahora - 3600e3).toISOString() : '', notas: '', es_demo: '1',
    }
  })

  return {
    Negocio: NEGOCIO.map(([campo, valor]) => ({ campo, valor })),
    Doctores: DOCTORES,
    Servicios: SERVICIOS,
    Pacientes: pacientes,
    Citas: citas,
    Llamadas: llamadas as Record<string, string>[],
    Pendientes: pendientes,
    Configuracion: CONFIGURACION.map(([clave, valor, descripcion]) => ({ clave, valor, descripcion })),
  } as Record<string, Record<string, string>[]>
}
