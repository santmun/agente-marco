// Monterrey no usa horario de verano desde 2022: UTC-6 fijo.
const OFFSET_H = -6
export const ZONA = 'America/Monterrey'
export const COLUMNA_DIA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const NUM = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve', 'treinta', 'treinta y uno']

const dd = (n: number) => String(n).padStart(2, '0')

export function local(ms: number) {
  const t = new Date(ms + OFFSET_H * 3600e3)
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), min: t.getUTCMinutes(), dow: t.getUTCDay() }
}

export function ymd(ms: number) {
  const l = local(ms)
  return `${l.y}-${dd(l.m)}-${dd(l.d)}`
}

export function hhmm(ms: number) {
  const l = local(ms)
  return `${dd(l.h)}:${dd(l.min)}`
}

/** Convierte fecha y hora local de la clínica a milisegundos UTC. */
export function aMs(fecha: string, hora = '00:00') {
  return Date.parse(`${fecha}T${hora}:00-06:00`)
}

export function sumarDias(fecha: string, n: number) {
  return ymd(aMs(fecha, '12:00') + n * 86400e3)
}

export function diaSemana(fecha: string) {
  return local(aMs(fecha, '12:00')).dow
}

/** ISO local sin zona, como lo pide Google Calendar junto con `timezone`. */
export function isoLocal(ms: number) {
  return `${ymd(ms)}T${hhmm(ms)}:00`
}

export function iso(ms: number) {
  return `${isoLocal(ms)}-06:00`
}

export function textoFecha(ms: number) {
  const l = local(ms)
  const dia = l.d === 1 ? 'primero' : NUM[l.d]
  return `${DIAS[l.dow]} ${dia} de ${MESES[l.m - 1]}`
}

export function textoHora(ms: number) {
  const l = local(ms)
  const h12 = l.h % 12 === 0 ? 12 : l.h % 12
  const hora = h12 === 1 ? 'una' : NUM[h12]
  const articulo = h12 === 1 ? 'a la' : 'a las'
  const min = l.min === 0 ? '' : l.min === 30 ? ' y media' : l.min === 15 ? ' y cuarto' : ` y ${NUM[l.min] ?? l.min}`
  const parte = l.h < 12 ? 'de la mañana' : l.h === 12 ? 'del día' : l.h < 20 ? 'de la tarde' : 'de la noche'
  return `${articulo} ${hora}${min} ${parte}`
}

export function textoFechaHora(ms: number) {
  return `${textoFecha(ms)} ${textoHora(ms)}`
}

/** La clínica abre lunes a viernes de 9 a 20 y sábado de 9 a 14. */
export function fueraDeHorario(ms: number) {
  const l = local(ms)
  if (l.dow === 0) return true
  if (l.dow === 6) return l.h < 9 || l.h >= 14
  return l.h < 9 || l.h >= 20
}
