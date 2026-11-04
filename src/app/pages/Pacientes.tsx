import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Cajon, Cargando, duracion, Etiqueta, Falla, fechaHora, MOTIVOS, RESULTADOS, Tarjeta, telefono, useDatos, useFiltros, Vacio } from '../ui/kit'

export function Pacientes() {
  const { demo } = useFiltros()
  const { datos, error, cargando, recargar } = useDatos<{ pacientes: any[] }>(`/pacientes?demo=${demo ? 1 : 0}`)
  const [q, setQ] = useState('')
  const [abierto, setAbierto] = useState<any>(null)
  const filas = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (datos?.pacientes ?? [])
      .filter((p) => !t || `${p.nombre} ${p.telefono}`.toLowerCase().includes(t))
      .sort((a, b) => (b.proxima_cita ? 1 : 0) - (a.proxima_cita ? 1 : 0) || a.nombre.localeCompare(b.nombre))
  }, [datos, q])

  if (cargando && !datos) return <Cargando />
  if (error && !datos) return <Falla mensaje={error} reintentar={recargar} />

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-tinta-3" aria-hidden />
          <input className="campo pl-8" placeholder="Buscar por nombre o teléfono" aria-label="Buscar pacientes" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="num text-xs text-tinta-3">{filas.length} pacientes</span>
      </div>
      <Tarjeta sinPadding className="overflow-hidden">
        {filas.length ? (
          <div className="-mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="border-b border-borde bg-[#fbfaf7] text-xs text-tinta-3">
                <tr>
                  {['Paciente', 'Teléfono', 'Próxima cita', 'Citas', 'Llamadas'].map((h, i) => (
                    <th key={h} scope="col" className={`px-4 py-2.5 font-medium ${i >= 3 ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {filas.slice(0, 200).map((p) => (
                  <tr key={p.id} className="cursor-pointer hover:bg-[#fbfaf7]" onClick={() => setAbierto(p)}>
                    <td className="px-4 py-2.5"><button className="font-medium hover:underline" onClick={() => setAbierto(p)}>{p.nombre}</button></td>
                    <td className="num px-4 py-2.5 text-tinta-2">{telefono(p.telefono)}</td>
                    <td className="px-4 py-2.5 text-tinta-2">{p.proxima_cita ? fechaHora(p.proxima_cita) : <span className="text-tinta-3">Sin cita</span>}</td>
                    <td className="num px-4 py-2.5 text-right">{p.citas}</td>
                    <td className="num px-4 py-2.5 text-right">{p.llamadas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Vacio titulo="Sin pacientes">Marco los registra en la hoja cuando agenda una cita.</Vacio>}
      </Tarjeta>
      {abierto && <Historial paciente={abierto} cerrar={() => setAbierto(null)} />}
    </div>
  )
}

function Historial({ paciente, cerrar }: { paciente: any; cerrar: () => void }) {
  const { datos, cargando, error } = useDatos<{ citas: any[]; llamadas: any[] }>(`/pacientes/${paciente.telefono}`)
  return (
    <Cajon abierto cerrar={cerrar} titulo={<><p className="font-semibold">{paciente.nombre}</p><p className="num text-xs text-tinta-3">{telefono(paciente.telefono)} · {paciente.id}</p></>}>
      {cargando ? <Cargando /> : error ? <Falla mensaje={error} /> : (
        <>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-tinta-3">Citas</h3>
          {datos?.citas.length ? (
            <ul className="mt-2 divide-y divide-borde">
              {datos.citas.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.servicio}</p>
                    <p className="text-xs text-tinta-3">{fechaHora(c.inicio)} · {c.doctor}</p>
                  </div>
                  <Etiqueta tono={c.estado === 'cancelada' ? 'neutro' : 'ok'}>{c.estado}</Etiqueta>
                </li>
              ))}
            </ul>
          ) : <p className="mt-1 text-sm text-tinta-3">Sin citas registradas.</p>}
          <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-tinta-3">Llamadas</h3>
          {datos?.llamadas.length ? (
            <ul className="mt-2 divide-y divide-borde">
              {datos.llamadas.map((l) => (
                <li key={l.conv_id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{MOTIVOS[l.motivo] ?? l.motivo}</p>
                    <p className="text-xs text-tinta-3">{fechaHora(l.inicio)} · <span className="num">{duracion(Number(l.duracion_s))}</span></p>
                  </div>
                  <Etiqueta tono={RESULTADOS[l.resultado]?.tono ?? 'neutro'}>{RESULTADOS[l.resultado]?.t ?? l.resultado}</Etiqueta>
                </li>
              ))}
            </ul>
          ) : <p className="mt-1 text-sm text-tinta-3">Sin llamadas registradas.</p>}
        </>
      )}
    </Cajon>
  )
}
