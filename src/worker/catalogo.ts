// Datos ficticios de la clínica. Se cargan a Google Sheets al instalar; desde ahí los edita el dueño.

export const COLUMNAS = {
  Negocio: ['campo', 'valor'],
  Doctores: ['id', 'nombre', 'especialidad', 'horario_texto', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo', 'calendar_id', 'activo'],
  Servicios: ['id', 'nombre', 'categoria', 'duracion_min', 'precio_desde', 'precio_hasta', 'doctores', 'palabras_clave', 'activo'],
  Pacientes: ['id', 'nombre', 'telefono', 'email', 'fecha_alta', 'origen', 'ultima_cita', 'proxima_cita', 'total_citas', 'notas', 'es_demo'],
  Citas: ['id', 'event_id', 'calendar_id', 'doctor_id', 'doctor', 'paciente_id', 'paciente', 'telefono', 'servicio_id', 'servicio', 'inicio', 'fin', 'estado', 'whatsapp', 'canal', 'conv_id', 'creada_en', 'actualizada_en', 'notas', 'es_demo'],
  Llamadas: ['conv_id', 'inicio', 'duracion_s', 'telefono', 'paciente', 'motivo', 'resultado', 'servicio', 'urgencia', 'fuera_horario', 'sentimiento', 'frustracion', 'exito', 'canal', 'costo_usd', 'voz_usd', 'llm_usd', 'creditos', 'tokens_in', 'tokens_out', 'llm_ttfb_ms', 'tts_ttfb_ms', 'respuesta_ms', 'tool_ms', 'tool_errores', 'modelo', 'titulo', 'resumen', 'tiene_audio', 'es_demo'],
  Pendientes: ['id', 'creado_en', 'tipo', 'prioridad', 'paciente', 'telefono', 'motivo', 'conv_id', 'estado', 'resuelto_en', 'notas', 'es_demo'],
  Configuracion: ['clave', 'valor', 'descripcion'],
} as const

export type Pestana = keyof typeof COLUMNAS

export const NEGOCIO: [string, string][] = [
  ['nombre', 'Clínica Dental Alborada'],
  ['direccion', 'Av. Vasconcelos 1450, Col. Del Valle, San Pedro Garza García, N.L.'],
  ['telefono', '81 5550 0142'],
  ['whatsapp', '81 5550 0142'],
  ['correo', 'contacto@clinicaalborada.example'],
  ['horario', 'L-V 9:00-20:00, S 9:00-14:00'],
  ['zona_horaria', 'America/Monterrey'],
  ['festivos', '2026-11-16,2026-12-25,2027-01-01'],
  ['telefono_urgencias', ''],
]

export const DOCTORES: Record<string, string>[] = [
  { id: 'd1', nombre: 'Dra. Mariana Treviño', especialidad: 'Odontología general y estética', horario_texto: 'L-V mañana', lunes: '09:00-14:00', martes: '09:00-14:00', miercoles: '09:00-14:00', jueves: '09:00-14:00', viernes: '09:00-14:00', sabado: '', domingo: '', calendar_id: '', activo: '1' },
  { id: 'd2', nombre: 'Dr. Rodrigo Garza', especialidad: 'Endodoncia y general', horario_texto: 'L-V tarde', lunes: '14:00-20:00', martes: '14:00-20:00', miercoles: '14:00-20:00', jueves: '14:00-20:00', viernes: '14:00-20:00', sabado: '', domingo: '', calendar_id: '', activo: '1' },
  { id: 'd3', nombre: 'Dra. Lucía Cantú', especialidad: 'Ortodoncia y odontopediatría', horario_texto: 'L, Mi, J', lunes: '10:00-18:00', martes: '', miercoles: '10:00-18:00', jueves: '10:00-18:00', viernes: '', sabado: '', domingo: '', calendar_id: '', activo: '1' },
  { id: 'd4', nombre: 'Dr. Andrés Villarreal', especialidad: 'Cirugía oral e implantes', horario_texto: 'Ma, V, S', lunes: '', martes: '10:00-18:00', miercoles: '', jueves: '', viernes: '10:00-18:00', sabado: '09:00-14:00', domingo: '', calendar_id: '', activo: '1' },
]

const srv = (id: string, nombre: string, categoria: string, duracion: number, desde: number, hasta: number, doctores: string, claves: string) =>
  ({ id, nombre, categoria, duracion_min: String(duracion), precio_desde: String(desde), precio_hasta: String(hasta), doctores, palabras_clave: claves, activo: '1' })

export const SERVICIOS: Record<string, string>[] = [
  srv('valoracion', 'Valoración general', 'General', 30, 350, 350, 'd1,d2', 'revision,revisión,chequeo,consulta,primera vez,no se,dolor leve'),
  srv('limpieza', 'Limpieza dental', 'General', 45, 800, 800, 'd1,d2', 'profilaxis,sarro'),
  srv('resina', 'Resina o empaste', 'General', 45, 900, 1600, 'd1,d2', 'caries,empaste,tapadura,amalgama'),
  srv('blanqueamiento', 'Blanqueamiento', 'Estética', 90, 4500, 4500, 'd1', 'blanquear,aclarar dientes'),
  srv('extraccion', 'Extracción simple', 'Cirugía', 45, 900, 1500, 'd1,d2,d4', 'sacar muela,sacar diente,extraer'),
  srv('muela_juicio', 'Muela del juicio', 'Cirugía', 60, 3500, 6500, 'd4', 'cordal,juicio,tercer molar'),
  srv('endodoncia', 'Endodoncia', 'Especialidad', 90, 3800, 6000, 'd2', 'conducto,tratamiento de conductos,nervio'),
  srv('corona', 'Corona de porcelana', 'Rehabilitación', 60, 6500, 9500, 'd1,d2', 'funda,porcelana'),
  srv('implante', 'Valoración de implante', 'Cirugía', 30, 500, 500, 'd4', 'implantes,tornillo,diente faltante'),
  srv('ortodoncia', 'Valoración de ortodoncia', 'Ortodoncia', 45, 500, 500, 'd3', 'brackets,frenos,alineadores,invisible,enderezar'),
  srv('ajuste', 'Ajuste de brackets', 'Ortodoncia', 30, 0, 0, 'd3', 'ajuste,mensualidad,liga,alambre'),
  srv('pediatria', 'Consulta infantil', 'Odontopediatría', 30, 450, 450, 'd3', 'niño,niña,hijo,hija,infantil,pediatra,odontopediatria'),
  srv('urgencia', 'Urgencia dental', 'Urgencias', 30, 600, 600, 'd1,d2,d4', 'urgencia,dolor fuerte,diente roto,se me cayo,hinchado,emergencia'),
]

export const CONFIGURACION: [string, string, string][] = [
  ['llamadas_dia_base', '80', 'Llamadas al día antes de Marco (cifra de ejemplo)'],
  ['perdidas_pct_base', '30', 'Porcentaje de llamadas que se perdían antes de Marco (cifra de ejemplo)'],
  ['valor_cita_mxn', '1200', 'Ingreso promedio por cita en pesos (cifra de ejemplo)'],
  ['tipo_cambio', '18.5', 'Pesos por dólar, para mostrar costos en pesos'],
  ['minutos_recepcion_por_llamada', '4', 'Minutos que tarda recepción en atender una llamada'],
  ['costo_recepcion_mes_mxn', '14000', 'Costo mensual de una recepcionista (cifra de ejemplo)'],
]

export const VOCES_SUGERIDAS = ['htFfPSZGJwjBv1CL0aMD']
