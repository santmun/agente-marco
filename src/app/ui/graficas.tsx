import { useState, type ReactNode } from 'react'

export type Serie = { clave: string; nombre: string; color: string; formato?: (n: number) => string }

function techo(max: number) {
  if (max <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(max))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= max) return m * p
  return 10 * p
}

export function Leyenda({ series }: { series: Serie[] }) {
  if (series.length < 2) return null
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-tinta-2">
      {series.map((s) => (
        <span key={s.clave} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden />
          {s.nombre}
        </span>
      ))}
    </div>
  )
}

/** Columnas apiladas con tooltip por columna. La primera serie va abajo, pegada a la base. */
export function Columnas<T extends Record<string, any>>({
  datos, series, etiqueta, alto = 170, tooltipTitulo, marcar, cadaEtiqueta = 1, formatoEje = (n: number) => n.toLocaleString('es-MX'),
}: {
  datos: T[]
  series: Serie[]
  etiqueta: (d: T) => string
  alto?: number
  tooltipTitulo?: (d: T) => ReactNode
  marcar?: (d: T) => boolean
  cadaEtiqueta?: number
  formatoEje?: (n: number) => string
}) {
  const [activo, setActivo] = useState<number | null>(null)
  const maximo = techo(Math.max(...datos.map((d) => series.reduce((s, x) => s + (Number(d[x.clave]) || 0), 0)), 0))
  const marcas = [maximo, maximo / 2, 0]
  return (
    <div>
      <div className="flex gap-2">
        <div className="relative w-9 shrink-0 text-right text-[11px] text-tinta-3 num" style={{ height: alto }} aria-hidden>
          {marcas.map((m, i) => (
            <span key={m} className="absolute right-0 -translate-y-1/2" style={{ top: `${(i / 2) * 100}%` }}>{formatoEje(m)}</span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1" style={{ height: alto }} onMouseLeave={() => setActivo(null)}>
          {marcas.slice(0, 2).map((m, i) => (
            <div key={m} className="absolute inset-x-0 border-t border-dashed border-borde" style={{ top: `${(i / 2) * 100}%` }} />
          ))}
          <div className="absolute inset-x-0 bottom-0 border-t border-borde-2" />
          <div className="absolute inset-0 flex items-end gap-[3px]">
            {datos.map((d, i) => {
              const total = series.reduce((s, x) => s + (Number(d[x.clave]) || 0), 0)
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={`${etiqueta(d)}: ${series.map((s) => `${s.nombre} ${(s.formato ?? String)(Number(d[s.clave]) || 0)}`).join(', ')}`}
                  className={`relative flex h-full min-w-0 flex-1 cursor-default flex-col-reverse items-stretch justify-start rounded-t ${marcar?.(d) ? 'bg-[#f5f1e8]' : ''}`}
                  onMouseEnter={() => setActivo(i)}
                  onFocus={() => setActivo(i)}
                  onBlur={() => setActivo(null)}
                >
                  {series.map((s, j) => {
                    const v = Number(d[s.clave]) || 0
                    if (!v) return null
                    const superior = series.slice(j + 1).every((x) => !Number(d[x.clave]))
                    return (
                      <span
                        key={s.clave}
                        className={`mx-auto block w-full max-w-7 ${superior ? 'rounded-t-[4px]' : ''}`}
                        style={{ height: `${(v / maximo) * 100}%`, background: s.color, marginTop: superior ? 0 : 2, opacity: activo === null || activo === i ? 1 : 0.55 }}
                      />
                    )
                  })}
                  {activo === i && (
                    <span
                      className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-lateral px-2.5 py-1.5 text-left text-xs font-normal text-white shadow-lg"
                      style={{ left: '50%', bottom: `${Math.min((total / maximo) * 100, 72) + 3}%` }}
                    >
                      <span className="mb-0.5 block font-medium">{tooltipTitulo?.(d) ?? etiqueta(d)}</span>
                      {series.map((s) => (
                        <span key={s.clave} className="num flex items-center gap-2 text-[#d8d2c5]">
                          <span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} aria-hidden />
                          {s.nombre}: {(s.formato ?? ((n: number) => n.toLocaleString('es-MX')))(Number(d[s.clave]) || 0)}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <div className="ml-11 mt-1.5 flex gap-[3px] text-center text-[11px] text-tinta-3" aria-hidden>
        {datos.map((d, i) => (
          <span key={i} className="min-w-0 flex-1 truncate">{i % cadaEtiqueta === 0 ? etiqueta(d) : ''}</span>
        ))}
      </div>
    </div>
  )
}

/** Barras horizontales rankeadas con etiqueta y valor directos. */
export function BarrasH({ filas, formato = (n: number) => n.toLocaleString('es-MX'), color = 'var(--color-serie-1)' }: { filas: { nombre: string; n: number }[]; formato?: (n: number) => string; color?: string }) {
  const maximo = Math.max(...filas.map((f) => f.n), 1)
  return (
    <ul className="space-y-2.5">
      {filas.map((f) => (
        <li key={f.nombre}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate text-tinta-2">{f.nombre}</span>
            <span className="num font-medium">{formato(f.n)}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-[#f1eee7]">
            <div className="h-full rounded-full" style={{ width: `${(f.n / maximo) * 100}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Barra de partes de un todo: dos fills con 2 px de separación y etiquetas directas. */
export function BarraPartes({ partes }: { partes: { nombre: string; valor: number; color: string; texto: string }[] }) {
  const total = partes.reduce((s, p) => s + p.valor, 0) || 1
  return (
    <div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
        {partes.map((p) => (
          <div key={p.nombre} title={`${p.nombre}: ${p.texto}`} style={{ width: `${Math.max((p.valor / total) * 100, 1)}%`, background: p.color }} />
        ))}
      </div>
      <ul className="mt-2.5 space-y-1.5">
        {partes.map((p) => (
          <li key={p.nombre} className="flex items-center justify-between gap-3 text-[13px]">
            <span className="inline-flex items-center gap-1.5 text-tinta-2">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: p.color }} aria-hidden />
              {p.nombre}
            </span>
            <span className="num font-medium">{p.texto} <span className="font-normal text-tinta-3">· {((p.valor / total) * 100).toFixed(1)}%</span></span>
          </li>
        ))}
      </ul>
    </div>
  )
}
