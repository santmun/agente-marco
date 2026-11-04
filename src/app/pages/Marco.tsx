import { useEffect, useMemo, useState } from 'react'
import { Play, Save, Wrench } from 'lucide-react'
import { Boton, Campo, Cargando, Estado, Falla, pedir, seg, Tarjeta, useDatos, usd } from '../ui/kit'

const MODELOS = ['claude-haiku-5-5', 'gemini-2.5-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gpt-5.4-mini', 'claude-sonnet-5-5']
const TTS = [
  { id: 'eleven_flash_v2_5', t: 'Flash v2.5: la más rápida (recomendada para teléfono)' },
  { id: 'eleven_v4_turbo', t: 'V4 Turbo: más natural' },
  { id: 'eleven_multilingual_v2', t: 'Multilingual v2: máxima calidad, más lenta' },
]
const SECCIONES = ['Comportamiento', 'Voz', 'Modelo', 'Llamada', 'Herramientas'] as const
const CAMPOS = ['prompt', 'primer_mensaje', 'llm', 'temperatura', 'voz', 'tts_modelo', 'velocidad', 'estabilidad', 'similitud', 'prisa_turno', 'espera_turno', 'colgar_silencio', 'duracion_max']

function Deslizador({ etiqueta, ayuda, valor, min, max, paso, cambiar, sufijo = '' }: { etiqueta: string; ayuda?: string; valor: number; min: number; max: number; paso: number; cambiar: (n: number) => void; sufijo?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-tinta-2">{etiqueta}</span>
        <span className="num text-sm font-medium">{valor}{sufijo}</span>
      </div>
      <input aria-label={etiqueta} type="range" min={min} max={max} step={paso} value={valor} onChange={(e) => cambiar(Number(e.target.value))} className="mt-1.5" />
      {ayuda && <p className="text-xs text-tinta-3">{ayuda}</p>}
    </div>
  )
}

export function Marco() {
  const { datos, error, cargando, recargar } = useDatos<any>('/agente')
  const voces = useDatos<{ voces: any[] }>('/voces')
  const costos = useDatos<any>('/costos?dias=1&demo=0')
  const [form, setForm] = useState<Record<string, any>>({})
  const [seccion, setSeccion] = useState<(typeof SECCIONES)[number]>('Comportamiento')
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState('')

  useEffect(() => { if (datos) setForm(Object.fromEntries(CAMPOS.map((k) => [k, datos[k]]))) }, [datos])
  const cambios = useMemo(() => (datos ? Object.fromEntries(CAMPOS.filter((k) => form[k] !== undefined && form[k] !== datos[k]).map((k) => [k, form[k]])) : {}), [form, datos])
  const hayCambios = Object.keys(cambios).length > 0
  const set = (k: string) => (v: any) => setForm((f) => ({ ...f, [k]: v }))

  async function guardar() {
    setGuardando(true)
    setAviso('')
    try {
      const r = await pedir('/agente', 'PATCH', cambios)
      setAviso(`Guardado. Marco ya usa estos cambios en las llamadas nuevas (versión ${String(r.version ?? '').slice(-6)}).`)
      recargar()
    } catch (e) {
      setAviso(`No se guardó: ${(e as Error).message}`)
    } finally {
      setGuardando(false)
    }
  }

  if (cargando && !datos) return <Cargando />
  if (error && !datos) return <Falla mensaje={error} reintentar={recargar} />

  const precio = (id: string) => costos.datos?.modelos?.find((m: any) => m.llm === id)?.price_per_minute
  const listaVoces = voces.datos?.voces ?? []
  const vozActual = listaVoces.find((v) => v.id === form.voz)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg border border-borde bg-superficie p-0.5" role="tablist">
          {SECCIONES.map((s) => (
            <button key={s} role="tab" aria-selected={seccion === s} onClick={() => setSeccion(s)} className={`rounded-md px-3 py-1.5 text-[13px] font-medium ${seccion === s ? 'bg-lateral text-white' : 'text-tinta-2 hover:bg-fondo'}`}>{s}</button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {aviso && <span className="text-xs text-tinta-2" role="status">{aviso}</span>}
          <Boton variante="primario" disabled={!hayCambios || guardando} onClick={guardar}><Save size={14} aria-hidden />{guardando ? 'Guardando' : hayCambios ? `Guardar ${Object.keys(cambios).length} cambios` : 'Sin cambios'}</Boton>
        </div>
      </div>

      {seccion === 'Comportamiento' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Tarjeta className="lg:col-span-2" titulo="Instrucciones de Marco" detalle="Es el manual de trabajo de Marco. Cada palabra cuenta: un cambio aquí afecta todas las llamadas.">
            <textarea aria-label="Instrucciones de Marco" className="campo min-h-[520px] font-mono text-[12.5px] leading-relaxed" value={form.prompt ?? ''} onChange={(e) => set('prompt')(e.target.value)} />
            <p className="num mt-1.5 text-xs text-tinta-3">{(form.prompt ?? '').length.toLocaleString('es-MX')} caracteres</p>
          </Tarjeta>
          <div className="space-y-4">
            <Tarjeta titulo="Primer mensaje" detalle="Lo primero que oye el paciente">
              <textarea aria-label="Primer mensaje" rows={5} className="campo text-sm" value={form.primer_mensaje ?? ''} onChange={(e) => set('primer_mensaje')(e.target.value)} />
              <p className="mt-1.5 text-xs text-tinta-3">Mantén el aviso de grabación y que es un asistente virtual.</p>
            </Tarjeta>
            <Tarjeta titulo="Datos actuales">
              <dl className="space-y-1.5 text-[13px]">
                {[['Idioma', datos.idioma], ['Guarda grabaciones', datos.grabar ? `${datos.retencion_dias} días` : 'No'], ['Tope diario', `${datos.limite_diario} llamadas`], ['Análisis de llamadas', datos.llm_analisis]].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3"><dt className="text-tinta-3">{k}</dt><dd className="truncate font-medium">{v}</dd></div>
                ))}
              </dl>
            </Tarjeta>
          </div>
        </div>
      )}

      {seccion === 'Voz' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Tarjeta titulo="Voz de Marco" detalle="Solo aparecen las voces agregadas a tu cuenta de ElevenLabs">
            <div className="space-y-3">
              <Campo etiqueta="Voz">
                <select className="campo" value={form.voz ?? ''} onChange={(e) => set('voz')(e.target.value)}>
                  {!vozActual && <option value={form.voz}>{form.voz}</option>}
                  {listaVoces.map((v) => <option key={v.id} value={v.id}>{v.nombre}{v.genero ? ` · ${v.genero}` : ''}{v.acento ? ` · ${v.acento}` : ''}</option>)}
                </select>
              </Campo>
              {vozActual?.muestra && (
                <div>
                  <p className="mb-1 flex items-center gap-1 text-xs font-medium text-tinta-2"><Play size={12} aria-hidden />Muestra</p>
                  <audio controls preload="none" src={vozActual.muestra} />
                </div>
              )}
              <Campo etiqueta="Motor de voz">
                <select className="campo" value={form.tts_modelo ?? ''} onChange={(e) => set('tts_modelo')(e.target.value)}>
                  {TTS.map((t) => <option key={t.id} value={t.id}>{t.t}</option>)}
                </select>
              </Campo>
            </div>
          </Tarjeta>
          <Tarjeta titulo="Cómo suena">
            <div className="space-y-4">
              <Deslizador etiqueta="Velocidad" valor={form.velocidad ?? 1} min={0.8} max={1.2} paso={0.01} cambiar={set('velocidad')} ayuda="Un poco más rápido acorta la llamada y baja el costo." />
              <Deslizador etiqueta="Estabilidad" valor={form.estabilidad ?? 0.5} min={0} max={1} paso={0.05} cambiar={set('estabilidad')} ayuda="Más alto suena más parejo; más bajo, más expresivo." />
              <Deslizador etiqueta="Parecido a la voz original" valor={form.similitud ?? 0.75} min={0} max={1} paso={0.05} cambiar={set('similitud')} />
            </div>
          </Tarjeta>
        </div>
      )}

      {seccion === 'Modelo' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Tarjeta titulo="Modelo de IA" detalle="Precio del modelo por minuto, sin contar la voz. El detalle está en Costos y velocidad.">
            <fieldset className="space-y-1.5">
              <legend className="sr-only">Modelo de IA</legend>
              {MODELOS.map((m) => (
                <label key={m} className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px] ${form.llm === m ? 'border-acento bg-acento-suave' : 'border-borde hover:bg-fondo'}`}>
                  <input type="radio" name="llm" className="accent-[var(--color-acento)]" checked={form.llm === m} onChange={() => set('llm')(m)} />
                  <span className="flex-1 font-mono text-xs">{m}</span>
                  {precio(m) !== undefined && <span className="num text-xs text-tinta-2">{usd(precio(m), 4)}/min</span>}
                </label>
              ))}
            </fieldset>
          </Tarjeta>
          <Tarjeta titulo="Ajustes del modelo">
            <div className="space-y-4">
              <Deslizador etiqueta="Temperatura" valor={form.temperatura ?? 0.2} min={0} max={1} paso={0.05} cambiar={set('temperatura')} ayuda="Bajo es más predecible. Para agendar citas conviene dejarlo bajo." />
              <p className="text-[13px] text-tinta-2">Modelo de respaldo si el principal falla: <span className="font-mono text-xs">{datos.respaldo_llm?.order?.[0] ?? 'ninguno'}</span></p>
            </div>
          </Tarjeta>
        </div>
      )}

      {seccion === 'Llamada' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Tarjeta titulo="Ritmo de conversación">
            <div className="space-y-4">
              <Campo etiqueta="Qué tan rápido contesta al terminar el paciente">
                <select className="campo" value={form.prisa_turno ?? 'normal'} onChange={(e) => set('prisa_turno')(e.target.value)}>
                  <option value="eager">Rápido: puede interrumpir a quien habla pausado</option>
                  <option value="normal">Normal (recomendado)</option>
                  <option value="patient">Paciente: espera más, se siente más lento</option>
                </select>
              </Campo>
              <Deslizador etiqueta="Vuelve a preguntar tras silencio" valor={form.espera_turno ?? 6} min={3} max={15} paso={1} cambiar={set('espera_turno')} sufijo=" s" />
            </div>
          </Tarjeta>
          <Tarjeta titulo="Límites de costo">
            <div className="space-y-4">
              <Deslizador etiqueta="Cuelga si nadie habla" valor={form.colgar_silencio ?? 25} min={10} max={60} paso={5} cambiar={set('colgar_silencio')} sufijo=" s" ayuda="Cada minuto en silencio también cuesta." />
              <Deslizador etiqueta="Duración máxima por llamada" valor={(form.duracion_max ?? 420) / 60} min={3} max={15} paso={1} cambiar={(n) => set('duracion_max')(n * 60)} sufijo=" min" ayuda="Al llegar al tope, Marco se despide y recepción devuelve la llamada." />
            </div>
          </Tarjeta>
          <Tarjeta className="lg:col-span-2" titulo="Palabras que Marco reconoce mejor" detalle="Nombres y términos dentales que el oído de Marco prioriza">
            <div className="flex flex-wrap gap-1.5">
              {datos.palabras_clave.map((p: string) => <span key={p} className="rounded-full bg-[#f1eee7] px-2 py-0.5 text-xs text-tinta-2">{p}</span>)}
            </div>
          </Tarjeta>
        </div>
      )}

      {seccion === 'Herramientas' && (
        <Tarjeta titulo="Lo que Marco puede hacer" detalle="Se ejecutan en Cloudflare y usan Composio para llegar a Google" sinPadding>
          <ul className="divide-y divide-borde border-t border-borde">
            {datos.herramientas.map((h: any) => (
              <li key={h.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <Wrench size={14} className="text-tinta-3" aria-hidden />
                <div className="min-w-0 flex-1 basis-[300px]">
                  <p className="font-mono text-xs font-medium">{h.nombre}</p>
                  <p className="mt-0.5 text-xs text-tinta-2">{h.descripcion}</p>
                </div>
                <span className="num text-xs text-tinta-2">{h.llamadas.toLocaleString('es-MX')} usos{h.latencia_ms ? ` · ${seg(h.latencia_ms)}` : ''}</span>
                <Estado ok texto="Activa" />
              </li>
            ))}
            {datos.sistema.map((s: string) => (
              <li key={s} className="flex items-center gap-3 px-5 py-2.5">
                <Wrench size={14} className="text-tinta-3" aria-hidden />
                <p className="flex-1 font-mono text-xs">{s}</p>
                <Estado ok texto="Del sistema" />
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}
    </div>
  )
}
