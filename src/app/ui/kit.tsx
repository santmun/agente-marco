import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Circle, Clock, Loader2, X } from 'lucide-react'

export class ErrorApi extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

export async function pedir<T = any>(ruta: string, metodo = 'GET', cuerpo?: unknown): Promise<T> {
  const res = await fetch(`/api${ruta}`, {
    method: metodo,
    headers: metodo === 'GET' ? {} : { 'content-type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    credentials: 'same-origin',
  })
  const json: any = await res.json().catch(() => ({}))
  if (res.status === 401 && ruta !== '/login') {
    window.location.reload()
  }
  if (!res.ok) throw new ErrorApi(json.error ?? `Error ${res.status}`, res.status)
  return json as T
}

export function useDatos<T = any>(ruta: string | null, intervaloMs?: number) {
  const [datos, setDatos] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)
  const recargar = useCallback(async () => {
    if (!ruta) return
    try {
      const d = await pedir<T>(ruta)
      setDatos(d)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCargando(false)
    }
  }, [ruta])
  useEffect(() => {
    setCargando(true)
    recargar()
    if (!intervaloMs) return
    const t = setInterval(recargar, intervaloMs)
    return () => clearInterval(t)
  }, [recargar, intervaloMs])
  return { datos, error, cargando, recargar }
}

export const Filtros = createContext<{ dias: number; demo: boolean; preview: boolean; setPreview: (v: boolean) => void }>({ dias: 7, demo: true, preview: false, setPreview: () => {} })
export const useFiltros = () => useContext(Filtros)

const ZONA = 'America/Monterrey'
export const usd = (n: number, d = 2) => `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`
export const mxn = (n: number) => `$${Math.round(n ?? 0).toLocaleString('es-MX')} MXN`
export const entero = (n: number) => Math.round(n ?? 0).toLocaleString('es-MX')
export const seg = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`)
export const duracion = (s: number) => {
  const n = Math.round(Number(s) || 0)
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`
}
export const fechaHora = (iso: string) => (iso ? new Date(iso).toLocaleString('es-MX', { timeZone: ZONA, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—')
export const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { timeZone: ZONA, hour: 'numeric', minute: '2-digit' })
export const diaCorto = (ymd: string) => new Date(`${ymd}T12:00:00-06:00`).toLocaleDateString('es-MX', { timeZone: ZONA, weekday: 'short', day: 'numeric' })
export const diaLargo = (ymd: string) => new Date(`${ymd}T12:00:00-06:00`).toLocaleDateString('es-MX', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long' })
export const telefono = (t: string) => (t && t.length === 10 ? `${t.slice(0, 2)} ${t.slice(2, 6)} ${t.slice(6)}` : t || '—')
export const hoyMx = () => new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10)

export const MOTIVOS: Record<string, string> = {
  agendar: 'Agendar cita', reagendar: 'Cambiar cita', cancelar: 'Cancelar cita', informacion: 'Información', precios: 'Precios',
  urgencia: 'Urgencia', seguro: 'Seguros', queja: 'Queja', otro: 'Otro',
}
export const RESULTADOS: Record<string, { t: string; tono: Tono }> = {
  cita_agendada: { t: 'Cita agendada', tono: 'ok' },
  cita_reagendada: { t: 'Cita cambiada', tono: 'ok' },
  cita_cancelada: { t: 'Cita cancelada', tono: 'neutro' },
  informacion_resuelta: { t: 'Información resuelta', tono: 'ok' },
  escalada_a_humano: { t: 'Pasó a una persona', tono: 'aviso' },
  pendiente_registrado: { t: 'Pendiente para recepción', tono: 'aviso' },
  sin_resolver: { t: 'Sin resolver', tono: 'critico' },
  colgo_sin_terminar: { t: 'Colgó sin terminar', tono: 'neutro' },
}

export type Tono = 'ok' | 'aviso' | 'critico' | 'neutro' | 'acento'
const TONOS: Record<Tono, string> = {
  ok: 'bg-ok-suave text-ok',
  aviso: 'bg-aviso-suave text-aviso',
  critico: 'bg-critico-suave text-critico',
  neutro: 'bg-[#f1eee7] text-tinta-2',
  acento: 'bg-acento-suave text-acento-fuerte',
}
const ICONOS: Partial<Record<Tono, ReactNode>> = {
  ok: <CheckCircle2 size={12} aria-hidden />,
  aviso: <Clock size={12} aria-hidden />,
  critico: <AlertCircle size={12} aria-hidden />,
}

export function Etiqueta({ tono = 'neutro', children, icono = true }: { tono?: Tono; children: ReactNode; icono?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONOS[tono]}`}>
      {icono && ICONOS[tono]}
      {children}
    </span>
  )
}

export function Tarjeta({ titulo, detalle, accion, children, className = '', sinPadding = false }: { titulo?: ReactNode; detalle?: ReactNode; accion?: ReactNode; children: ReactNode; className?: string; sinPadding?: boolean }) {
  return (
    <section className={`min-w-0 rounded-xl border border-borde bg-superficie ${className}`}>
      {(titulo || accion) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            {titulo && <h2 className="text-sm font-semibold">{titulo}</h2>}
            {detalle && <p className="mt-0.5 text-xs text-tinta-3">{detalle}</p>}
          </div>
          {accion}
        </header>
      )}
      <div className={sinPadding ? 'pt-3' : 'px-5 pb-5 pt-3'}>{children}</div>
    </section>
  )
}

export function Indicador({ etiqueta, valor, nota, destacado }: { etiqueta: string; valor: ReactNode; nota?: ReactNode; destacado?: boolean }) {
  return (
    <div className={`min-w-0 rounded-xl border px-4 py-3.5 ${destacado ? 'border-transparent bg-lateral text-white' : 'border-borde bg-superficie'}`}>
      <p className={`text-xs ${destacado ? 'text-[#b8b2a7]' : 'text-tinta-3'}`}>{etiqueta}</p>
      <p className="num mt-1 text-2xl font-semibold tracking-tight">{valor}</p>
      {nota && <p className={`mt-0.5 text-xs ${destacado ? 'text-[#b8b2a7]' : 'text-tinta-2'}`}>{nota}</p>}
    </div>
  )
}

export function Boton({ variante = 'secundario', children, className = '', ...p }: { variante?: 'primario' | 'secundario' | 'fantasma' | 'peligro' } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const v = {
    primario: 'bg-acento text-white hover:bg-acento-fuerte disabled:opacity-50',
    secundario: 'border border-borde-2 bg-white text-tinta hover:bg-fondo disabled:opacity-50',
    fantasma: 'text-tinta-2 hover:bg-[#f1eee7] disabled:opacity-50',
    peligro: 'border border-critico/30 bg-white text-critico hover:bg-critico-suave disabled:opacity-50',
  }[variante]
  return (
    <button {...p} className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${v} ${className}`}>
      {children}
    </button>
  )
}

export function Cargando({ texto = 'Cargando' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-tinta-3" role="status">
      <Loader2 size={16} className="animate-spin" aria-hidden /> {texto}
    </div>
  )
}

export function Falla({ mensaje, reintentar }: { mensaje: string; reintentar?: () => void }) {
  const falta = /Falta ELEVENLABS_API_KEY|Falta COMPOSIO/.test(mensaje)
  return (
    <div className="rounded-xl border border-borde bg-superficie px-5 py-6">
      <p className="flex items-center gap-2 text-sm font-medium"><AlertCircle size={15} className="text-critico" aria-hidden />{falta ? 'Falta conectar esta cuenta' : 'No se pudo cargar'}</p>
      <p className="mt-1 text-sm text-tinta-2">{falta ? 'Agrega la llave en Cloudflare para ver esta sección. Los pasos están en Conexiones.' : mensaje}</p>
      {reintentar && !falta && <Boton className="mt-3" onClick={reintentar}>Reintentar</Boton>}
    </div>
  )
}

export function Vacio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="px-5 py-12 text-center">
      <p className="text-sm font-medium">{titulo}</p>
      {children && <p className="mx-auto mt-1 max-w-sm text-sm text-tinta-3">{children}</p>}
    </div>
  )
}

export function Cajon({ abierto, cerrar, titulo, children }: { abierto: boolean; cerrar: () => void; titulo: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!abierto) return
    const f = (e: KeyboardEvent) => e.key === 'Escape' && cerrar()
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [abierto, cerrar])
  if (!abierto) return null
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <button aria-label="Cerrar" className="absolute inset-0 cursor-default bg-black/25" onClick={cerrar} />
      <div className="relative flex h-full w-full max-w-[560px] flex-col bg-superficie shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-borde px-5 py-4">
          <div className="min-w-0 flex-1">{titulo}</div>
          <button aria-label="Cerrar panel" onClick={cerrar} className="rounded-md p-1 text-tinta-3 hover:bg-fondo"><X size={18} /></button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

export function Estado({ ok, parcial, texto }: { ok: boolean; parcial?: boolean; texto: string }) {
  const color = ok ? 'text-ok' : parcial ? 'text-aviso' : 'text-tinta-3'
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${color}`}>
      {ok ? <CheckCircle2 size={13} aria-hidden /> : parcial ? <Clock size={13} aria-hidden /> : <Circle size={13} aria-hidden />}
      {texto}
    </span>
  )
}

export const Campo = ({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: ReactNode }) => (
  <label className="block">
    <span className="text-xs font-medium text-tinta-2">{etiqueta}</span>
    <div className="mt-1">{children}</div>
    {ayuda && <span className="mt-1 block text-xs text-tinta-3">{ayuda}</span>}
  </label>
)
