import { useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { Boton, Cajon, Cargando, diaLargo, Etiqueta, Falla, hora, hoyMx, pedir, telefono, useDatos } from '../ui/kit'

const INICIO_H = 9
const FIN_H = 20
const PX_HORA = 56

const minutos = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 6 * 3600e3)
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}
const mover = (fecha: string, n: number) => new Date(Date.parse(`${fecha}T12:00:00Z`) + n * 86400e3).toISOString().slice(0, 10)

export function Agenda() {
  const [fecha, setFecha] = useState(hoyMx())
  const { datos, error, cargando, recargar } = useDatos<any>(`/agenda?fecha=${fecha}`, 60000)
  const [evento, setEvento] = useState<any>(null)
  const [cancelando, setCancelando] = useState(false)
  const total = (datos?.doctores ?? []).reduce((s: number, d: any) => s + d.eventos.length, 0)

  async function cancelar() {
    if (!evento?.cita_id || !window.confirm(`¿Cancelar la cita de ${evento.paciente || evento.titulo}? Se borra del calendario del doctor.`)) return
    setCancelando(true)
    await pedir(`/citas/${evento.cita_id}/cancelar`, 'POST', {}).catch((e) => window.alert(e.message))
    setCancelando(false)
    setEvento(null)
    recargar()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Boton aria-label="Día anterior" onClick={() => setFecha(mover(fecha, -1))}><ChevronLeft size={15} /></Boton>
        <Boton onClick={() => setFecha(hoyMx())}>Hoy</Boton>
        <Boton aria-label="Día siguiente" onClick={() => setFecha(mover(fecha, 1))}><ChevronRight size={15} /></Boton>
        <input type="date" aria-label="Elegir fecha" className="campo w-auto" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} />
        <p className="ml-1 font-medium first-letter:uppercase">{diaLargo(fecha)}</p>
        <span className="num ml-auto text-xs text-tinta-3">{total} citas · un calendario por doctor</span>
      </div>

      {cargando && !datos ? <Cargando /> : error && !datos ? <Falla mensaje={error} reintentar={recargar} /> : (
        <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
          <div className="grid min-w-[820px]" style={{ gridTemplateColumns: `52px repeat(${datos.doctores.length}, minmax(0, 1fr))` }}>
            <div className="sticky left-0 z-10 border-b border-borde bg-superficie" />
            {datos.doctores.map((d: any) => (
              <div key={d.id} className="border-b border-l border-borde px-3 py-2.5">
                <p className="truncate text-[13px] font-semibold">{d.nombre}</p>
                <p className="truncate text-xs text-tinta-3">{d.especialidad}</p>
                <p className="num mt-0.5 text-xs text-tinta-2">{d.horario ? d.horario.replace('-', ' a ') : 'No atiende este día'}</p>
              </div>
            ))}
            <div className="sticky left-0 z-10 bg-superficie" style={{ height: (FIN_H - INICIO_H) * PX_HORA }}>
              {Array.from({ length: FIN_H - INICIO_H }, (_, i) => (
                <span key={i} className="num absolute right-2 text-[11px] text-tinta-3" style={{ top: i * PX_HORA + 2 }}>{INICIO_H + i}:00</span>
              ))}
            </div>
            {datos.doctores.map((d: any) => <Columna key={d.id} doctor={d} abrir={setEvento} />)}
          </div>
        </div>
      )}

      <Cajon abierto={!!evento} cerrar={() => setEvento(null)} titulo={<p className="font-semibold">{evento?.paciente || evento?.titulo}</p>}>
        {evento && (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-1.5">
              {evento.canal === 'llamada' && <Etiqueta tono="acento" icono={false}>Agendada por Marco</Etiqueta>}
              {evento.canal === 'recepcion' && <Etiqueta icono={false}>Recepción</Etiqueta>}
              {evento.canal === 'manual' && <Etiqueta icono={false}>Bloqueo manual en Google Calendar</Etiqueta>}
              {evento.es_demo === '1' && <Etiqueta icono={false}>Dato de ejemplo</Etiqueta>}
            </div>
            <dl className="space-y-1.5">
              {[['Servicio', evento.servicio || '—'], ['Horario', `${hora(evento.inicio)} a ${hora(evento.fin)}`], ['Teléfono', telefono(evento.telefono)], ['Cita', evento.cita_id || '—']].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-borde pb-1.5"><dt className="text-tinta-3">{k}</dt><dd className="num text-right font-medium">{v}</dd></div>
              ))}
            </dl>
            <div className="flex flex-wrap gap-2 pt-1">
              {evento.enlace && <a href={evento.enlace} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-borde-2 px-3 py-1.5 text-sm font-medium hover:bg-fondo"><ExternalLink size={14} aria-hidden />Abrir en Google Calendar</a>}
              {evento.cita_id && <Boton variante="peligro" disabled={cancelando} onClick={cancelar}>{cancelando ? 'Cancelando' : 'Cancelar cita'}</Boton>}
            </div>
          </div>
        )}
      </Cajon>
    </div>
  )
}

function Columna({ doctor, abrir }: { doctor: any; abrir: (e: any) => void }) {
  const [abre, cierra] = doctor.horario ? doctor.horario.split('-').map((h: string) => Number(h.split(':')[0])) : [0, 0]
  return (
    <div className="relative border-l border-borde bg-[#f5f2ea]" style={{ height: (FIN_H - INICIO_H) * PX_HORA }}>
      {doctor.horario && <div className="absolute inset-x-0 bg-superficie" style={{ top: (abre - INICIO_H) * PX_HORA, height: (cierra - abre) * PX_HORA }} />}
      {Array.from({ length: FIN_H - INICIO_H }, (_, i) => (
        <div key={i} className="absolute inset-x-0 border-t border-borde/70" style={{ top: i * PX_HORA }} />
      ))}
      {doctor.eventos.map((e: any) => {
        const top = ((minutos(e.inicio) - INICIO_H * 60) / 60) * PX_HORA
        const alto = Math.max(((minutos(e.fin) - minutos(e.inicio)) / 60) * PX_HORA - 2, 24)
        const deMarco = e.canal === 'llamada'
        return (
          <button
            key={e.id}
            onClick={() => abrir(e)}
            className={`absolute inset-x-1 overflow-hidden rounded-md border-l-[3px] px-2 py-1 text-left text-xs transition-shadow hover:shadow-md ${deMarco ? 'border-acento bg-acento-suave' : 'border-tinta-3 bg-[#efece4]'}`}
            style={{ top, height: alto }}
          >
            <span className="block truncate font-medium">{e.paciente || e.titulo}</span>
            {alto > 34 && <span className="block truncate text-tinta-2">{hora(e.inicio)} · {e.servicio}</span>}
          </button>
        )
      })}
    </div>
  )
}
