import { useMemo, useState } from 'react'
import { Search, Wrench } from 'lucide-react'
import { Cajon, Cargando, duracion, Etiqueta, Falla, fechaHora, MOTIVOS, RESULTADOS, seg, Tarjeta, telefono, useDatos, useFiltros, usd, Vacio } from '../ui/kit'

export function Llamadas() {
  const { dias, demo } = useFiltros()
  const { datos, error, cargando, recargar } = useDatos<{ llamadas: any[] }>(`/llamadas?dias=${dias}&demo=${demo ? 1 : 0}`, 60000)
  const [q, setQ] = useState('')
  const [motivo, setMotivo] = useState('')
  const [resultado, setResultado] = useState('')
  const [abierta, setAbierta] = useState<any>(null)

  const filas = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (datos?.llamadas ?? []).filter((l) =>
      (!motivo || l.motivo === motivo) && (!resultado || l.resultado === resultado) &&
      (!t || `${l.paciente} ${l.telefono} ${l.resumen} ${l.servicio}`.toLowerCase().includes(t)),
    )
  }, [datos, q, motivo, resultado])

  if (cargando && !datos) return <Cargando />
  if (error && !datos) return <Falla mensaje={error} reintentar={recargar} />

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-tinta-3" aria-hidden />
          <input className="campo pl-8" placeholder="Buscar por paciente, teléfono o resumen" aria-label="Buscar llamadas" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="campo w-auto" aria-label="Filtrar por motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
          <option value="">Todos los motivos</option>
          {Object.entries(MOTIVOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="campo w-auto" aria-label="Filtrar por resultado" value={resultado} onChange={(e) => setResultado(e.target.value)}>
          <option value="">Todos los resultados</option>
          {Object.entries(RESULTADOS).map(([k, v]) => <option key={k} value={k}>{v.t}</option>)}
        </select>
        <span className="num text-xs text-tinta-3">{filas.length} llamadas</span>
      </div>

      <Tarjeta sinPadding className="overflow-hidden !pt-0">
        {filas.length ? (
          <div className="-mt-3 overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-[13px]">
              <thead className="border-b border-borde bg-[#fbfaf7] text-xs text-tinta-3">
                <tr>
                  {['Fecha', 'Paciente', 'Motivo', 'Resultado', 'Duración', 'Costo', 'Respuesta'].map((h, i) => (
                    <th key={h} scope="col" className={`px-4 py-2.5 font-medium ${i >= 4 ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {filas.slice(0, 200).map((l) => {
                  const r = RESULTADOS[l.resultado]
                  return (
                    <tr key={l.conv_id} className="cursor-pointer hover:bg-[#fbfaf7]" onClick={() => setAbierta(l)}>
                      <td className="whitespace-nowrap px-4 py-2.5 text-tinta-2">{fechaHora(l.inicio)}</td>
                      <td className="max-w-[210px] px-4 py-2.5">
                        <button className="block max-w-full truncate text-left font-medium hover:underline" onClick={() => setAbierta(l)}>{l.paciente || 'Sin identificar'}</button>
                        <span className="num text-xs text-tinta-3">{telefono(l.telefono)}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-tinta-2">{MOTIVOS[l.motivo] ?? l.motivo}{l.fuera_horario === '1' && <span className="ml-1.5 text-xs text-tinta-3">· fuera de horario</span>}</td>
                      <td className="px-4 py-2.5"><Etiqueta tono={r?.tono ?? 'neutro'}>{r?.t ?? l.resultado}</Etiqueta></td>
                      <td className="num px-4 py-2.5 text-right">{duracion(Number(l.duracion_s))}</td>
                      <td className="num px-4 py-2.5 text-right">{usd(Number(l.costo_usd), 3)}</td>
                      <td className="num px-4 py-2.5 text-right text-tinta-2">{Number(l.respuesta_ms) ? seg(Number(l.respuesta_ms)) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <Vacio titulo="Sin llamadas con estos filtros">Prueba con otro periodo o haz una llamada de prueba con el botón de arriba.</Vacio>}
      </Tarjeta>
      {abierta && <Detalle fila={abierta} cerrar={() => setAbierta(null)} />}
    </div>
  )
}

export function Detalle({ fila, cerrar }: { fila: any; cerrar: () => void }) {
  const esDemo = fila.es_demo === '1'
  const { datos: d, error, cargando } = useDatos<any>(`/llamadas/${encodeURIComponent(fila.conv_id)}`)
  const r = RESULTADOS[fila.resultado]
  return (
    <Cajon abierto cerrar={cerrar} titulo={
      <>
        <p className="truncate font-semibold">{fila.paciente || 'Paciente sin identificar'}</p>
        <p className="text-xs text-tinta-3">{fechaHora(fila.inicio)} · {duracion(Number(fila.duracion_s))} · {fila.canal === 'web' ? 'Prueba web' : 'Teléfono'}</p>
      </>
    }>
      <div className="flex flex-wrap gap-1.5">
        <Etiqueta tono={r?.tono ?? 'neutro'}>{r?.t ?? fila.resultado}</Etiqueta>
        <Etiqueta icono={false}>{MOTIVOS[fila.motivo] ?? fila.motivo}</Etiqueta>
        {fila.urgencia === '1' && <Etiqueta tono="critico">Urgencia</Etiqueta>}
        {esDemo && <Etiqueta tono="acento" icono={false}>Dato de ejemplo</Etiqueta>}
      </div>

      {fila.resumen && <p className="mt-3 text-sm leading-relaxed text-tinta-2">{fila.resumen}</p>}

      <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-borde bg-borde text-center">
        {[
          ['Costo total', usd(Number(fila.costo_usd), 3)],
          ['Voz', usd(Number(fila.voz_usd), 3)],
          ['Modelo de IA', usd(Number(fila.llm_usd), 4)],
          ['Modelo responde', Number(fila.llm_ttfb_ms) ? seg(Number(fila.llm_ttfb_ms)) : '—'],
          ['Voz arranca', Number(fila.tts_ttfb_ms) ? seg(Number(fila.tts_ttfb_ms)) : '—'],
          ['Herramientas', Number(fila.tool_ms) ? seg(Number(fila.tool_ms)) : '—'],
        ].map(([k, v]) => (
          <div key={k} className="bg-superficie px-2 py-2.5">
            <dt className="text-[11px] text-tinta-3">{k}</dt>
            <dd className="num mt-0.5 text-sm font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      {esDemo ? (
        <p className="mt-4 rounded-lg bg-fondo px-3 py-2.5 text-sm text-tinta-2">Esta llamada es de ejemplo, por eso no tiene grabación ni transcripción. Las llamadas reales las muestran aquí completas.</p>
      ) : cargando ? <Cargando /> : error ? <Falla mensaje={error} /> : (
        <>
          <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-tinta-3">Grabación</h3>
          {d?.tiene_audio
            ? <audio className="mt-2" controls preload="none" src={`/api/llamadas/${encodeURIComponent(fila.conv_id)}/audio`} />
            : <p className="mt-1 text-sm text-tinta-3">Sin grabación disponible.</p>}

          {!!d?.criterios?.length && (
            <>
              <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-tinta-3">Evaluación automática</h3>
              <ul className="mt-2 space-y-1.5">
                {d.criterios.map((c: any) => (
                  <li key={c.id} className="text-[13px]">
                    <Etiqueta tono={c.resultado === 'success' ? 'ok' : c.resultado === 'failure' ? 'critico' : 'neutro'}>{c.id === 'resolvio_sin_humano' ? 'Resolvió sin recepción' : 'Datos sin inventar'}</Etiqueta>
                    <p className="mt-1 text-xs text-tinta-2">{c.razon}</p>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-tinta-3">Transcripción</h3>
          <ol className="mt-2 space-y-2.5">
            {(d?.transcripcion ?? []).map((t: any, i: number) => (
              <li key={i}>
                {t.texto && (
                  <div className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${t.rol === 'agent' ? 'bg-fondo' : 'ml-auto bg-acento-suave'}`}>
                    <span className="flex justify-between gap-3 text-[11px] text-tinta-3">
                      <span className="font-medium">{t.rol === 'agent' ? 'Marco' : 'Paciente'}</span>
                      <span className="num">{duracion(t.t)}{t.llm_ms ? ` · ${seg(t.llm_ms)}` : ''}</span>
                    </span>
                    {t.texto}
                    {t.interrumpido && <span className="mt-0.5 block text-[11px] text-tinta-3">Interrumpido por el paciente</span>}
                  </div>
                )}
                {t.resultados_tool?.map((x: any, j: number) => (
                  <details key={j} className="mt-1.5 rounded-lg border border-borde px-3 py-1.5 text-xs">
                    <summary className="flex cursor-pointer items-center gap-1.5 text-tinta-2">
                      <Wrench size={12} aria-hidden /> {x.nombre}
                      <span className="num text-tinta-3">{seg(x.ms)}</span>
                      {x.error && <Etiqueta tono="critico">Error</Etiqueta>}
                    </summary>
                    <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-tinta-2">{x.resultado}</pre>
                  </details>
                ))}
              </li>
            ))}
          </ol>
        </>
      )}
    </Cajon>
  )
}
