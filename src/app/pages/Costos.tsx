import { ArrowRight } from 'lucide-react'
import { BarraPartes, Columnas, type Serie } from '../ui/graficas'
import { Cargando, diaCorto, entero, Etiqueta, Falla, Indicador, mxn, seg, Tarjeta, useDatos, useFiltros, usd } from '../ui/kit'

const COSTO: Serie[] = [{ clave: 'costo', nombre: 'Costo', color: 'var(--color-serie-1)', formato: (n) => usd(n) }]

export function Costos() {
  const { dias, demo } = useFiltros()
  const { datos: d, error, cargando, recargar } = useDatos<any>(`/costos?dias=${dias}&demo=${demo ? 1 : 0}`, 60000)
  if (cargando && !d) return <Cargando />
  if (error && !d) return <Falla mensaje={error} reintentar={recargar} />
  const t = d.total
  const l = d.latencia
  const ahorro = d.recepcion_mes_mxn - d.proyeccion_mes_mxn
  const etapas = [
    { n: 'Oír', sub: 'Voz a texto', v: 'Scribe', ms: null as number | null },
    { n: 'Pensar', sub: 'Modelo de IA', v: 'Haiku 5.5', ms: l.llm.p50 },
    { n: 'Hablar', sub: 'Texto a voz', v: 'Flash v2.5', ms: l.tts.p50 },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador destacado etiqueta={dias === 1 ? 'Costo de hoy' : `Costo en ${dias} días`} valor={usd(t.costo)} nota={`${entero(t.minutos)} minutos · ${entero(t.llamadas)} llamadas`} />
        <Indicador etiqueta="Proyección a 30 días" valor={usd(d.proyeccion_mes_usd, 0)} nota={`≈ ${mxn(d.proyeccion_mes_mxn)}`} />
        <Indicador etiqueta="Costo por llamada" valor={usd(t.por_llamada, 3)} nota={`${usd(t.por_minuto, 3)} por minuto`} />
        <Indicador etiqueta="Respuesta típica" valor={seg(l.respuesta.p50)} nota={`p95 ${seg(l.respuesta.p95)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Tarjeta className="lg:col-span-2" titulo="Costo por día" detalle="En dólares, según lo que reporta ElevenLabs por llamada">
          <Columnas datos={d.por_dia} series={COSTO} etiqueta={(x: any) => diaCorto(x.fecha)} cadaEtiqueta={dias > 14 ? 5 : 1} formatoEje={(n) => `$${n}`} />
        </Tarjeta>
        <Tarjeta titulo="En qué se va el dinero" detalle="La voz domina: bajar costo es acortar llamadas">
          <BarraPartes partes={[
            { nombre: 'Voz y minutos', valor: t.voz, color: 'var(--color-serie-1)', texto: usd(t.voz) },
            { nombre: 'Modelo de IA', valor: t.llm, color: 'var(--color-serie-2)', texto: usd(t.llm) },
          ]} />
          <p className="num mt-3 text-xs text-tinta-2">{entero(d.tokens.entrada)} tokens de entrada · {entero(d.tokens.salida)} de salida</p>
          <div className="mt-3 rounded-lg bg-amarillo-suave px-3 py-2 text-[13px]">
            {ahorro >= 0
              ? <>Frente a una recepcionista de {mxn(d.recepcion_mes_mxn)} al mes, son <b className="num">{mxn(ahorro)}</b> menos.</>
              : <>A este volumen cuesta <b className="num">{mxn(-ahorro)}</b> más que una recepcionista de {mxn(d.recepcion_mes_mxn)}, pero contesta las 24 horas.</>}
          </div>
        </Tarjeta>
      </div>

      <Tarjeta titulo="Qué tan rápido responde" detalle="Tiempo desde que el paciente deja de hablar hasta que oye a Marco. Por debajo de 1.5 s se siente natural.">
        <div className="flex flex-wrap items-stretch gap-2">
          {etapas.map((e, i) => (
            <div key={e.n} className="flex min-w-[150px] flex-1 items-center gap-2">
              <div className="flex-1 rounded-lg border border-borde px-3 py-2.5">
                <p className="text-[13px] font-semibold">{e.n}</p>
                <p className="text-xs text-tinta-3">{e.sub} · {e.v}</p>
                <p className="num mt-1 text-lg font-semibold">{e.ms === null ? '<100 ms' : seg(e.ms)}</p>
              </div>
              {i < etapas.length - 1 && <ArrowRight size={15} className="shrink-0 text-tinta-3" aria-hidden />}
            </div>
          ))}
          <div className="flex min-w-[150px] flex-1 items-center">
            <div className="flex-1 rounded-lg border border-borde bg-fondo px-3 py-2.5">
              <p className="text-[13px] font-semibold">Herramientas</p>
              <p className="text-xs text-tinta-3">Calendar y Sheets vía Composio</p>
              <p className="num mt-1 text-lg font-semibold">{l.herramienta.p50 ? seg(l.herramienta.p50) : '—'}</p>
            </div>
          </div>
        </div>
        <p className="num mt-2 text-xs text-tinta-2">{d.errores_herramienta} errores de herramientas en el periodo · percentil 95 de herramientas: {l.herramienta.p95 ? seg(l.herramienta.p95) : '—'}</p>
      </Tarjeta>

      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Comparar modelos" detalle="Precio del modelo por minuto de llamada, sin contar la voz" sinPadding>
          {d.modelos.length ? (
            <table className="w-full border-t border-borde text-left text-[13px]">
              <thead className="text-xs text-tinta-3">
                <tr><th scope="col" className="px-5 py-2 font-medium">Modelo</th><th scope="col" className="px-5 py-2 text-right font-medium">Por minuto</th><th scope="col" className="px-5 py-2 text-right font-medium">Al mes a este ritmo</th></tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {d.modelos.map((m: any) => (
                  <tr key={m.llm} className={m.llm === 'claude-haiku-5-5' ? 'bg-acento-suave' : ''}>
                    <td className="px-5 py-2 font-mono text-xs">{m.llm} {m.llm === 'claude-haiku-5-5' && <Etiqueta tono="acento" icono={false}>En uso</Etiqueta>}</td>
                    <td className="num px-5 py-2 text-right">{usd(m.price_per_minute, 4)}</td>
                    <td className="num px-5 py-2 text-right">{usd((m.price_per_minute * t.minutos * 30) / Math.max(dias, 1), 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="px-5 pb-5 text-sm text-tinta-3">Agrega la llave de ElevenLabs para ver precios en vivo.</p>}
        </Tarjeta>
        <Tarjeta titulo="Plan de ElevenLabs">
          {d.plan ? (
            <>
              <p className="text-sm">Plan <b className="capitalize">{d.plan.nombre}</b></p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#f1eee7]">
                <div className="h-full rounded-full bg-serie-1" style={{ width: `${Math.min((d.plan.usados / Math.max(d.plan.limite, 1)) * 100, 100)}%` }} />
              </div>
              <p className="num mt-1.5 text-xs text-tinta-2">{entero(d.plan.usados)} de {entero(d.plan.limite)} créditos usados{d.plan.renueva ? ` · renueva el ${new Date(d.plan.renueva * 1000).toLocaleDateString('es-MX')}` : ''}</p>
            </>
          ) : <p className="text-sm text-tinta-3">Agrega la llave de ElevenLabs para ver el uso del plan.</p>}
          <p className="mt-3 text-xs text-tinta-3">Los precios son los del plan actual y bajan en planes con más volumen. En ejemplo, las llamadas se calculan con la tarifa observada en llamadas reales.</p>
        </Tarjeta>
      </div>
    </div>
  )
}
