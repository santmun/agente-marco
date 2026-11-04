import { DurableObject } from 'cloudflare:workers'
import { ymd } from './tiempo'

export type Actividad = { t: number; tool: string; ms: number; ok: boolean; detalle: string; conv_id?: string }

/**
 * Un solo Durable Object con tres trabajos: serializar reservas por doctor (así no
 * existen dobles citas), guardar la configuración de instalación y llevar la bitácora en vivo.
 */
export class EstadoClinica extends DurableObject<Env> {
  async tomarCandado(clave: string, ttlMs = 20000) {
    const ahora = Date.now()
    const vence = (await this.ctx.storage.get<number>(`lock:${clave}`)) ?? 0
    if (vence > ahora) return false
    await this.ctx.storage.put(`lock:${clave}`, ahora + ttlMs)
    return true
  }

  async soltarCandado(clave: string) {
    await this.ctx.storage.delete(`lock:${clave}`)
  }

  /** Recuerda lo recién reservado por 5 minutos, por si Google tarda en reflejarlo en free/busy. */
  async recordarReserva(doctor: string, inicio: number, fin: number) {
    const clave = `reciente:${doctor}`
    const ahora = Date.now()
    const lista = (await this.ctx.storage.get<{ inicio: number; fin: number; creada: number }[]>(clave)) ?? []
    await this.ctx.storage.put(clave, [...lista.filter((r) => ahora - r.creada < 300e3), { inicio, fin, creada: ahora }])
  }

  async reservasRecientes(doctor: string) {
    const ahora = Date.now()
    const lista = (await this.ctx.storage.get<{ inicio: number; fin: number; creada: number }[]>(`reciente:${doctor}`)) ?? []
    return lista.filter((r) => ahora - r.creada < 300e3).map(({ inicio, fin }) => ({ inicio, fin }))
  }

  /** Índice por teléfono y por cita: Marco no puede esperar a recorrer toda la hoja durante una llamada. */
  async indexar(pacientes: (readonly [string, Record<string, string>])[], citas: (readonly [string, Record<string, string>])[]) {
    const entradas: Record<string, unknown> = {}
    for (const [t, p] of pacientes) if (t) entradas[`p:${t}`] = p
    const porTel = new Map<string, string[]>()
    for (const [t, c] of citas) {
      entradas[`c:${c.id.toUpperCase()}`] = { ...c, _t: t }
      porTel.set(t, [...(porTel.get(t) ?? []), c.id.toUpperCase()])
    }
    for (const [t, ids] of porTel) entradas[`t:${t}`] = ids
    const claves = Object.keys(entradas)
    for (let i = 0; i < claves.length; i += 128) {
      await this.ctx.storage.put(Object.fromEntries(claves.slice(i, i + 128).map((k) => [k, entradas[k]])))
    }
    return { pacientes: pacientes.length, citas: citas.length }
  }

  /** Copia por día de la pestaña Llamadas: el panel lee de aquí sin gastar el límite de Sheets. */
  async guardarLlamadas(filas: Record<string, unknown>[]) {
    const porDia = new Map<string, Map<unknown, Record<string, unknown>>>()
    for (const f of filas) {
      const dia = ymd(Date.parse(String(f.inicio)))
      if (!porDia.has(dia)) porDia.set(dia, new Map())
      porDia.get(dia)!.set(f.conv_id, f)
    }
    for (const [dia, nuevas] of porDia) {
      const actuales = (await this.ctx.storage.get<Record<string, unknown>[]>(`ll:${dia}`)) ?? []
      await this.ctx.storage.put(`ll:${dia}`, [...actuales.filter((f) => !nuevas.has(f.conv_id)), ...nuevas.values()])
    }
  }

  async llamadasDe(fechas: string[]) {
    const mapa = await this.ctx.storage.get<Record<string, string>[]>(fechas.slice(0, 128).map((f) => `ll:${f}`))
    return [...mapa.values()].flat()
  }

  async leerPaciente(tel: string) {
    return (await this.ctx.storage.get<Record<string, string>>(`p:${tel}`)) ?? null
  }

  async guardarPaciente(tel: string, p: Record<string, string>) {
    await this.ctx.storage.put(`p:${tel}`, p)
  }

  async leerCita(id: string) {
    return (await this.ctx.storage.get<Record<string, string>>(`c:${id.toUpperCase()}`)) ?? null
  }

  async guardarCita(tel: string, c: Record<string, string>) {
    const id = c.id.toUpperCase()
    const ids = (await this.ctx.storage.get<string[]>(`t:${tel}`)) ?? []
    await this.ctx.storage.put({ [`c:${id}`]: { ...c, _t: tel }, [`t:${tel}`]: ids.includes(id) ? ids : [...ids, id] })
  }

  async citasDe(tel: string) {
    const ids = (await this.ctx.storage.get<string[]>(`t:${tel}`)) ?? []
    const mapa = await this.ctx.storage.get<Record<string, string>>(ids.slice(-100).map((i) => `c:${i}`))
    return [...mapa.values()]
  }

  /** Devuelve lo guardado la primera vez que se pidió esta clave, o null si esta es la primera. */
  async primeraVez(clave: string, valor: string) {
    const k = `una:${clave}`
    const existente = await this.ctx.storage.get<string>(k)
    if (existente) return existente
    await this.ctx.storage.put(k, valor)
    return null
  }

  async leer(clave: string): Promise<unknown> {
    return (await this.ctx.storage.get(`cfg:${clave}`)) ?? null
  }

  async guardar(clave: string, valor: unknown) {
    await this.ctx.storage.put(`cfg:${clave}`, valor)
  }

  async registrar(a: Actividad) {
    const lista = (await this.ctx.storage.get<Actividad[]>('actividad')) ?? []
    lista.unshift(a)
    await this.ctx.storage.put('actividad', lista.slice(0, 60))
  }

  async actividad() {
    return (await this.ctx.storage.get<Actividad[]>('actividad')) ?? []
  }

  /** Devuelve false si la clave superó `max` intentos en la ventana. */
  async limitar(clave: string, max: number, ventanaMs: number) {
    const ahora = Date.now()
    const e = (await this.ctx.storage.get<{ n: number; desde: number }>(`rl:${clave}`)) ?? { n: 0, desde: ahora }
    const vigente = ahora - e.desde < ventanaMs ? e : { n: 0, desde: ahora }
    vigente.n += 1
    await this.ctx.storage.put(`rl:${clave}`, vigente)
    return vigente.n <= max
  }
}

export const estado = (env: Env) => env.ESTADO.get(env.ESTADO.idFromName('clinica'))

export type Config = {
  spreadsheet_id?: string
  sheets_account?: string
  calendar_account?: string
  whatsapp_account?: string
  composio_user_id?: string
  whatsapp_phone_id?: string
  whatsapp_plantilla?: string
  telefono_urgencias?: string
}

// Se lee varias veces por petición; una caché breve por isolate evita ir al Durable Object cada vez.
let configCache: { hasta: number; valor: Config } | null = null

export async function leerConfig(env: Env): Promise<Config> {
  if (configCache && configCache.hasta > Date.now()) return configCache.valor
  const valor = ((await estado(env).leer('config')) as Config | null) ?? {}
  configCache = { hasta: Date.now() + 5000, valor }
  return valor
}

export async function guardarConfig(env: Env, cambios: Config) {
  configCache = null
  const actual = await leerConfig(env)
  const nueva = { ...actual, ...cambios }
  await estado(env).guardar('config', nueva)
  configCache = null
  return nueva
}
