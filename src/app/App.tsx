import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent } from 'react'
import { BookOpen, CalendarDays, CircleDollarSign, Inbox, LayoutDashboard, LogOut, Mic, Phone, PlugZap, SlidersHorizontal, Users } from 'lucide-react'
import { Boton, Filtros, pedir, useDatos } from './ui/kit'
import { Resumen } from './pages/Resumen'
import { Llamadas } from './pages/Llamadas'
import { Agenda } from './pages/Agenda'
import { Pacientes } from './pages/Pacientes'
import { Pendientes } from './pages/Pendientes'
import { Marco } from './pages/Marco'
import { Conocimiento } from './pages/Conocimiento'
import { Costos } from './pages/Costos'
import { Conexiones } from './pages/Conexiones'

// El cliente de voz pesa cerca de 700 KB: solo se descarga al abrir la llamada de prueba.
const ProbarMarco = lazy(() => import('./ProbarMarco').then((m) => ({ default: m.ProbarMarco })))

const PAGINAS = [
  { id: 'resumen', t: 'Resumen', i: LayoutDashboard, c: Resumen, filtros: true },
  { id: 'llamadas', t: 'Llamadas', i: Phone, c: Llamadas, filtros: true },
  { id: 'agenda', t: 'Agenda', i: CalendarDays, c: Agenda },
  { id: 'pacientes', t: 'Pacientes', i: Users, c: Pacientes },
  { id: 'pendientes', t: 'Pendientes', i: Inbox, c: Pendientes },
  { id: 'marco', t: 'Marco', i: SlidersHorizontal, c: Marco },
  { id: 'conocimiento', t: 'Conocimiento', i: BookOpen, c: Conocimiento },
  { id: 'costos', t: 'Costos y velocidad', i: CircleDollarSign, c: Costos, filtros: true },
  { id: 'conexiones', t: 'Conexiones', i: PlugZap, c: Conexiones },
]

function Entrada({ listo }: { listo: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  async function enviar(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    try {
      await pedir('/login', 'POST', { password })
      listo()
    } catch (err) {
      const m = (err as Error).message
      setError(m === 'demasiados_intentos' ? 'Demasiados intentos. Espera quince minutos.' : 'Contraseña incorrecta.')
    } finally {
      setEnviando(false)
    }
  }
  return (
    <main className="flex min-h-full items-center justify-center bg-lateral px-4">
      <form onSubmit={enviar} className="w-full max-w-sm rounded-2xl bg-superficie p-7">
        <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-acento text-white"><Mic size={20} aria-hidden /></div>
        <h1 className="text-lg font-semibold">Centro de control de Marco</h1>
        <p className="mt-1 text-sm text-tinta-2">Clínica Dental Alborada</p>
        <label className="mt-5 block text-xs font-medium text-tinta-2" htmlFor="password">Contraseña del dueño</label>
        <input id="password" type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="campo mt-1" />
        {error && <p className="mt-2 text-sm text-critico" role="alert">{error}</p>}
        <Boton variante="primario" className="mt-4 w-full py-2" disabled={enviando || !password}>{enviando ? 'Entrando' : 'Entrar'}</Boton>
      </form>
    </main>
  )
}

function usarPagina() {
  const leer = () => window.location.hash.replace('#/', '') || 'resumen'
  const [pagina, setPagina] = useState(leer)
  useEffect(() => {
    const f = () => setPagina(leer())
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return pagina
}

export function App() {
  const sesion = useDatos<{ autenticado: boolean; clinica: string }>('/me')
  const pagina = usarPagina()
  const [dias, setDias] = useState(7)
  const [demo, setDemo] = useState(true)
  const [preview, setPreview] = useState(false)
  const [probar, setProbar] = useState(false)
  const filtros = useMemo(() => ({ dias, demo, preview, setPreview }), [dias, demo, preview])

  if (sesion.cargando && !sesion.datos) return <div className="h-full bg-lateral" />
  if (!sesion.datos?.autenticado) return <Entrada listo={sesion.recargar} />

  const actual = PAGINAS.find((p) => p.id === pagina) ?? PAGINAS[0]
  const Pagina = actual.c

  return (
    <Filtros.Provider value={filtros}>
      <div className="flex min-h-full flex-col md:flex-row">
        <aside className="shrink-0 bg-lateral text-[#cfc9bd] md:sticky md:top-0 md:h-screen md:w-56">
          <div className="flex items-center gap-2.5 px-4 py-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-acento text-white"><Mic size={16} aria-hidden /></div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">Marco</p>
              <p className="truncate text-xs text-[#8f897e]">{sesion.datos.clinica}</p>
            </div>
          </div>
          <nav className="flex gap-0.5 overflow-x-auto px-2 pb-2 md:block md:space-y-0.5 md:overflow-visible" aria-label="Secciones">
            {PAGINAS.map((p) => (
              <a
                key={p.id}
                href={`#/${p.id}`}
                aria-current={p.id === actual.id ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${p.id === actual.id ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-white'}`}
              >
                <p.i size={15} aria-hidden className={p.id === actual.id ? 'text-amarillo' : ''} />
                {p.t}
              </a>
            ))}
          </nav>
          <div className="hidden px-2 md:absolute md:bottom-3 md:block md:w-56">
            <button
              onClick={async () => { await pedir('/logout', 'POST', {}); sesion.recargar() }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-[#8f897e] hover:bg-white/5 hover:text-white"
            >
              <LogOut size={15} aria-hidden /> Salir
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-borde bg-fondo/90 px-4 py-3 backdrop-blur md:px-7">
            <h1 className="mr-auto text-base font-semibold">{actual.t}</h1>
            {actual.filtros && (
              <div className="flex items-center gap-1 rounded-lg border border-borde bg-superficie p-0.5" role="group" aria-label="Periodo">
                {[[1, 'Hoy'], [7, '7 días'], [30, '30 días']].map(([v, t]) => (
                  <button key={v} onClick={() => setDias(v as number)} aria-pressed={dias === v} className={`rounded-md px-2.5 py-1 text-xs font-medium ${dias === v ? 'bg-lateral text-white' : 'text-tinta-2 hover:bg-fondo'}`}>{t}</button>
                ))}
              </div>
            )}
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-tinta-2">
              <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} className="accent-[var(--color-acento)]" />
              Incluir datos de ejemplo
            </label>
            <Boton variante="primario" onClick={() => setProbar(true)}><Mic size={14} aria-hidden /> Probar a Marco</Boton>
          </header>
          {preview && (
            <div className="border-b border-amarillo/40 bg-amarillo-suave px-4 py-2 text-[13px] text-aviso md:px-7">
              Vista previa con datos de ejemplo: Google Sheets y Calendar todavía no están conectados. <a href="#/conexiones" className="font-medium underline">Ver qué falta</a>
            </div>
          )}
          <main className="mx-auto max-w-[1240px] px-4 py-5 md:px-7">
            <Pagina key={actual.id} />
          </main>
        </div>
      </div>
      {probar && <Suspense fallback={null}><ProbarMarco cerrar={() => setProbar(false)} /></Suspense>}
    </Filtros.Provider>
  )
}
