import { useEffect } from 'react'
import { ArrowRight, CalendarCheck, Clock3, Moon, PhoneOff } from 'lucide-react'
import { BarrasH, Columnas, Leyenda, type Serie } from '../ui/graficas'
import { Cargando, diaCorto, duracion, entero, Etiqueta, Falla, fechaHora, Indicador, mxn, MOTIVOS, RESULTADOS, seg, Tarjeta, useDatos, useFiltros, usd } from '../ui/kit'

const SERIES: Serie[] = [
  { clave: 'citas', nombre: 'Citas agendadas', color: 'var(--color-serie-1)' },
  { clave: 'otras', nombre: 'Otras llamadas', color: 'var(--color-serie-2)' },
]

export function Resumen() {
  const { dias, demo, setPreview } = useFiltros()
  const { datos: d, error, cargando, recargar } = useDatos<any>(`/resumen?dias=${dias}&demo=${demo ? 1 : 0}`, 60000)
  useEffect(() => { if (d) setPreview(d.preview) }, [d, setPreview])
  if (cargando && !d) return <Cargando />
  if (error && !d) return <Falla mensaje={error} reintentar={recargar} />
  const k = d.kpis
  const im = d.impacto
  const periodo = dias === 1 ? 'Hoy' : `En los últimos ${dias} días`
  const porDia = d.por_dia.map((x: any) => ({ ...x, otras: Math.max(x.llamadas - x.citas, 0) }))
  const motivos = d.motivos.map((m: any) => ({ nombre: MOTIVOS[m.nombre] ?? m.nombre, n: m.n }))

  return (
    <div className="space-y-4">
      <p className="text-[22px] font-medium leading-snug tracking-tight">
        {periodo} Marco contestó <b className="num font-semibold">{entero(k.llamadas)}</b> llamadas, agendó <b className="num font-semibold text-acento-fuerte">{entero(k.citas)}</b> citas y costó <b className="num font-semibold">{usd(k.costo_usd)}</b>.
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Indicador destacado etiqueta="Llamadas contestadas" valor={`${Math.round(k.contestadas_pct)}%`} nota={`${entero(k.llamadas)} de ${entero(k.llamadas)}`} />
        <Indicador etiqueta="Citas agendadas" valor={entero(k.citas)} nota={`${k.conversion_pct.toFixed(0)}% de las llamadas`} />
        <Indicador etiqueta="Resueltas sin recepción" valor={`${k.exito_pct.toFixed(0)}%`} nota={`${k.pendientes_abiertos} pendientes abiertos`} />
        <Indicador etiqueta="Tiempo de respuesta" valor={seg(k.respuesta_p50)} nota={`p95 ${seg(k.respuesta_p95)}`} />
        <Indicador etiqueta="Costo por llamada" valor={usd(k.costo_por_llamada, 3)} nota={k.citas ? `${usd(k.costo_por_cita)} por cita` : 'Sin citas todavía'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Tarjeta className="lg:col-span-2" titulo="Llamadas por día" detalle="Cuántas terminaron en una cita agendada" accion={<Leyenda series={SERIES} />}>
          <Columnas datos={porDia} series={SERIES} etiqueta={(x: any) => diaCorto(x.fecha)} cadaEtiqueta={dias > 14 ? 5 : 1} tooltipTitulo={(x: any) => `${diaCorto(x.fecha)} · ${x.llamadas} llamadas`} />
        </Tarjeta>
        <Tarjeta titulo="Antes y con Marco" detalle="Los problemas que tenía la clínica">
          <ul className="space-y-3">
            <Fila icono={<PhoneOff size={15} />} titulo="Llamadas perdidas" antes={`${im.perdidas_pct_base}% · ~${entero(im.perdidas_antes)}`} ahora="0" />
            <Fila icono={<CalendarCheck size={15} />} titulo="Dobles citas" antes="Agenda manual" ahora="Bloqueadas" />
            <Fila icono={<Moon size={15} />} titulo="Fuera de horario" antes="Cerrado" ahora={`${entero(k.fuera_horario)} atendidas`} />
            <Fila icono={<Clock3 size={15} />} titulo="Tiempo de recepción liberado" antes="Saturada" ahora={`${Math.round(im.horas_recepcion)} h`} />
          </ul>
          <div className="mt-3 rounded-lg bg-amarillo-suave px-3 py-2 text-[13px]">
            <span className="num font-semibold">{mxn(im.ingreso_rescatado_mxn)}</span> en citas de llamadas que antes se perdían
            <span className="mt-0.5 block text-xs text-tinta-2">Estimado con cifras de ejemplo, ajustables en la pestaña Configuracion.</span>
          </div>
        </Tarjeta>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Tarjeta className="lg:col-span-2" titulo="A qué hora llaman" detalle="Las columnas sombreadas son horas con la clínica cerrada">
          <Columnas
            datos={d.por_hora}
            alto={130}
            series={[{ clave: 'n', nombre: 'Llamadas', color: 'var(--color-serie-1)' }]}
            etiqueta={(x: any) => `${x.hora}h`}
            cadaEtiqueta={3}
            marcar={(x: any) => x.hora < 9 || x.hora >= 20}
            tooltipTitulo={(x: any) => `${x.hora}:00 a ${x.hora + 1}:00`}
          />
        </Tarjeta>
        <Tarjeta titulo="Por qué llaman">
          {motivos.length ? <BarrasH filas={motivos.slice(0, 7)} /> : <p className="text-sm text-tinta-3">Sin llamadas en este periodo.</p>}
        </Tarjeta>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Necesitan a una persona" detalle="Urgencias y pendientes abiertos" accion={<a href="#/pendientes" className="inline-flex items-center gap-1 text-xs font-medium text-acento-fuerte">Ver todos <ArrowRight size={12} aria-hidden /></a>} sinPadding>
          {d.pendientes.length ? (
            <ul className="divide-y divide-borde border-t border-borde">
              {d.pendientes.map((p: any) => (
                <li key={p.id} className="flex items-start gap-3 px-5 py-2.5">
                  <Etiqueta tono={p.prioridad === 'alta' ? 'critico' : p.prioridad === 'media' ? 'aviso' : 'neutro'}>{p.tipo === 'urgencia' ? 'Urgencia' : p.prioridad}</Etiqueta>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{p.paciente || 'Sin nombre'}</p>
                    <p className="line-clamp-1 text-xs text-tinta-2">{p.motivo}</p>
                  </div>
                  <span className="whitespace-nowrap text-xs text-tinta-3">{fechaHora(p.creado_en)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="px-5 pb-5 text-sm text-tinta-3">Nada pendiente.</p>}
        </Tarjeta>
        <Tarjeta titulo="Últimas llamadas" accion={<a href="#/llamadas" className="inline-flex items-center gap-1 text-xs font-medium text-acento-fuerte">Ver todas <ArrowRight size={12} aria-hidden /></a>} sinPadding>
          {d.recientes.length ? (
            <ul className="divide-y divide-borde border-t border-borde">
              {d.recientes.slice(0, 5).map((l: any) => {
                const r = RESULTADOS[l.resultado]
                return (
                  <li key={l.conv_id} className="flex items-center gap-3 px-5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{l.paciente || 'Paciente sin identificar'}</p>
                      <p className="text-xs text-tinta-3">{fechaHora(l.inicio)} · <span className="num">{duracion(Number(l.duracion_s))}</span></p>
                    </div>
                    <Etiqueta tono={r?.tono ?? 'neutro'}>{r?.t ?? l.resultado}</Etiqueta>
                  </li>
                )
              })}
            </ul>
          ) : <p className="px-5 pb-5 text-sm text-tinta-3">Todavía no hay llamadas.</p>}
        </Tarjeta>
      </div>
    </div>
  )
}

function Fila({ icono, titulo, antes, ahora }: { icono: React.ReactNode; titulo: string; antes: string; ahora: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-acento-suave text-acento-fuerte" aria-hidden>{icono}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{titulo}</p>
        <p className="truncate text-xs text-tinta-3 line-through decoration-tinta-3/50">{antes}</p>
      </div>
      <span className="num whitespace-nowrap text-sm font-semibold text-ok">{ahora}</span>
    </li>
  )
}
