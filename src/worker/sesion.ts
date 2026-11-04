import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { Context, Next } from 'hono'

const COOKIE = 'marco_sesion'
const DURACION_MS = 7 * 86400e3
const enc = new TextEncoder()

export async function compararSecreto(a: string, b: string) {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ])
  return (crypto.subtle as SubtleCrypto & { timingSafeEqual(a: ArrayBuffer, b: ArrayBuffer): boolean }).timingSafeEqual(ha, hb)
}

async function firmar(valor: string, secreto: string) {
  const llave = await crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const firma = await crypto.subtle.sign('HMAC', llave, enc.encode(valor))
  return btoa(String.fromCharCode(...new Uint8Array(firma))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export async function iniciarSesion(c: Context<{ Bindings: Env }>) {
  const vence = String(Date.now() + DURACION_MS)
  setCookie(c, COOKIE, `${vence}.${await firmar(vence, c.env.SESSION_SECRET)}`, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    maxAge: DURACION_MS / 1000,
  })
}

export function cerrarSesion(c: Context) {
  deleteCookie(c, COOKIE, { path: '/' })
}

export async function sesionValida(c: Context<{ Bindings: Env }>) {
  const [vence, firma] = (getCookie(c, COOKIE) ?? '').split('.')
  if (!vence || !firma || Number(vence) < Date.now() || !c.env.SESSION_SECRET) return false
  return compararSecreto(firma, await firmar(vence, c.env.SESSION_SECRET))
}

export async function requiereSesion(c: Context<{ Bindings: Env }>, next: Next) {
  if (!(await sesionValida(c))) return c.json({ error: 'no_autenticado' }, 401)
  // Las escrituras exigen JSON: junto con SameSite=Lax evita envíos desde formularios de otros sitios.
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(c.req.method) && !(c.req.header('content-type') ?? '').includes('application/json')) {
    return c.json({ error: 'se_requiere_json' }, 415)
  }
  await next()
}
