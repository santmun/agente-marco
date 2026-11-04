import { useState } from 'react'
import { ArrowRight, BookOpen, CalendarDays, ExternalLink, MessageCircle, Mic, Phone, Siren, Table2, User } from 'lucide-react'
import { Boton, Campo, Cargando, Estado, Falla, fechaHora, pedir, seg, Tarjeta, useDatos } from '../ui/kit'

export function Conexiones() {
  const { datos: d, error, cargando, recargar } = useDatos<any>('/conexiones')
  const actividad = useDatos<{ actividad: any[] }>('/actividad', 15000)
  const [progreso, setProgreso] = useState('')
  const [instalando, setInstalando] = useState(false)
  const [urgencias, setUrgencias] = useState('')
  const [aviso, setAviso] = useState('')

  if (cargando && !d) return <Cargando />
  if (error && !d) return <Falla mensaje={error} reintentar={recargar} />

  const conCalendarios = d.calendarios.filter((c: any) => c.conectado).length
  const hojaLista = !!d.config.spreadsheet_id && !d.preview
  const whatsappListo = !!(d.config.whatsapp_account && d.config.whatsapp_phone_id && d.config.whatsapp_plantilla)
  const cuentas = (t: string) => d.cuentas.filter((c: any) => c.toolkit === t)

  async function instalar() {
    setInstalando(true)
    setProgreso('Ligando cuentas')
    try {
      let paso: string | null = 'cuentas'
      let parte = 0
      while (paso) {
        const r: any = await pedir('/instalar', 'POST', { paso, parte })
        if (!r.ok) throw new Error(r.mensaje)
        paso = r.siguiente
        parte = r.parte ?? 0
        setProgreso(r.progreso ?? (paso ? `Paso: ${paso}` : 'Instalación terminada'))
      }
      await recargar()
    } catch (e) {
      setProgreso(`Se detuvo: ${(e as Error).message}`)
    } finally {
      setInstalando(false)
    }
  }

  async function guardarUrgencias() {
    try {
      await pedir('/urgencias', 'POST', { telefono: urgencias })
      setAviso('Número guardado. Marco ya puede transferir urgencias.')
      recargar()
    } catch (e) {
      setAviso((e as Error).message === 'usa_formato_internacional' ? 'Usa el formato internacional, por ejemplo +5281…' : (e as Error).message)
    }
  }

  async function ligar(campo: string, valor: string) {
    await pedir('/conexiones', 'PATCH', { [campo]: valor })
    recargar()
  }

  return (
    <div className="space-y-4">
      <Tarjeta titulo="Cómo fluye una llamada" detalle="El estado de cada pieza, en vivo">
        <div className="flex flex-wrap items-stretch gap-2">
          <Pieza icono={<User size={16} />} titulo="Paciente llama" estado={<Estado ok texto="Listo" />} />
          <Flecha />
          <Pieza icono={<Phone size={16} />} titulo="Teléfono SIP / Twilio" estado={d.telefono.length ? <Estado ok texto={d.telefono[0]} /> : <Estado ok={false} texto="Falta un número" />} />
          <Flecha />
          <Pieza fuerte icono={<Mic size={16} />} titulo="Marco" subtitulo="Scribe · Haiku 5.5 · Flash v2.5" estado={d.llaves.elevenlabs ? <Estado ok texto="Conectado" /> : <Estado ok={false} parcial texto="Falta la llave" />} />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Pieza icono={<CalendarDays size={16} />} titulo="Google Calendar" subtitulo={`${conCalendarios} de ${d.calendarios.length} calendarios`} estado={conCalendarios === d.calendarios.length ? <Estado ok texto="Conectado" /> : <Estado ok={false} texto="Sin conectar" />} />
          <Pieza icono={<BookOpen size={16} />} titulo="Base de conocimiento" subtitulo="6 documentos" estado={<Estado ok texto="Cargada" />} />
          <Pieza icono={<Siren size={16} />} titulo="Urgencias a humano" subtitulo={d.config.telefono_urgencias || 'Queda como pendiente urgente'} estado={d.config.telefono_urgencias ? <Estado ok texto="Transfiere" /> : <Estado ok={false} parcial texto="Falta el número" />} />
          <Pieza icono={<MessageCircle size={16} />} titulo="Confirma por WhatsApp" estado={whatsappListo ? <Estado ok texto="Conectado" /> : <Estado ok={false} texto="Sin conectar" />} />
          <Pieza icono={<Table2 size={16} />} titulo="Registro en Sheet" estado={hojaLista ? <Estado ok texto="Conectado" /> : <Estado ok={false} texto="Sin conectar" />} />
        </div>
      </Tarjeta>

      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo="1. Llaves en Cloudflare" detalle="Se guardan cifradas en el Worker; nunca se muestran aquí">
          <ul className="space-y-2 text-[13px]">
            <li className="flex items-center justify-between"><span>ElevenLabs: llamadas, grabaciones y ajustes</span><Estado ok={d.llaves.elevenlabs} texto={d.llaves.elevenlabs ? 'Agregada' : 'Falta'} /></li>
            <li className="flex items-center justify-between"><span>Composio: Google Sheets, Calendar y WhatsApp</span><Estado ok={d.llaves.composio} texto={d.llaves.composio ? 'Agregada' : 'Falta'} /></li>
          </ul>
          {(!d.llaves.elevenlabs || !d.llaves.composio) && (
            <p className="mt-3 rounded-lg bg-fondo px-3 py-2 font-mono text-xs leading-relaxed text-tinta-2">
              {!d.llaves.elevenlabs && <>npx wrangler secret put ELEVENLABS_API_KEY<br /></>}
              {!d.llaves.composio && <>npx wrangler secret put COMPOSIO_API_KEY</>}
            </p>
          )}
          {d.errorComposio && <p className="mt-2 text-xs text-critico">{d.errorComposio}</p>}
        </Tarjeta>

        <Tarjeta titulo="2. Google: base de datos y calendarios" detalle="Crea la hoja, un calendario por doctor y carga los datos de ejemplo">
          <div className="space-y-3">
            {d.llaves.composio && (
              <div className="grid gap-2 sm:grid-cols-2">
                <SelectorCuenta etiqueta="Cuenta de Google Sheets" lista={cuentas('googlesheets')} valor={d.config.sheets_account} cambiar={(v) => ligar('sheets_account', v)} />
                <SelectorCuenta etiqueta="Cuenta de Google Calendar" lista={cuentas('googlecalendar')} valor={d.config.calendar_account} cambiar={(v) => ligar('calendar_account', v)} />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {!(hojaLista && conCalendarios === d.calendarios.length) && <Boton variante="primario" disabled={!d.llaves.composio || instalando} onClick={instalar}>{instalando ? 'Instalando' : 'Instalar en Google'}</Boton>}
              {d.hoja_url && <a className="inline-flex items-center gap-1 text-[13px] font-medium text-acento-fuerte" href={d.hoja_url} target="_blank" rel="noreferrer">Abrir la hoja <ExternalLink size={12} aria-hidden /></a>}
            </div>
            {progreso && <p className="text-xs text-tinta-2" role="status">{progreso}</p>}
            {!!d.calendarios.length && (
              <ul className="grid gap-1 text-[13px] sm:grid-cols-2">
                {d.calendarios.map((c: any) => (
                  <li key={c.doctor} className="flex items-center justify-between gap-2 rounded-lg border border-borde px-2.5 py-1.5">
                    <span className="min-w-0 truncate">{c.doctor} <span className="text-xs text-tinta-3">· {c.horario}</span></span>
                    <Estado ok={c.conectado} texto="" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Tarjeta>

        <Tarjeta titulo="3. Teléfono de urgencias" detalle="Marco transfiere aquí las urgencias. Solo funciona en llamadas por teléfono, no en la prueba web.">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1">
              <Campo etiqueta="Número real con lada internacional"><input className="campo num" placeholder="+5281…" defaultValue={d.config.telefono_urgencias} onChange={(e) => setUrgencias(e.target.value)} /></Campo>
            </div>
            <Boton disabled={!d.llaves.elevenlabs} onClick={guardarUrgencias}>Guardar</Boton>
          </div>
          {aviso && <p className="mt-2 text-xs text-tinta-2" role="status">{aviso}</p>}
        </Tarjeta>

        <Tarjeta titulo="4. WhatsApp Business" detalle="Requiere una cuenta de Meta, un número y una plantilla aprobada. Sin esto, Marco no promete confirmación.">
          <div className="grid gap-2 sm:grid-cols-2">
            <SelectorCuenta etiqueta="Cuenta en Composio" lista={cuentas('whatsapp')} valor={d.config.whatsapp_account} cambiar={(v) => ligar('whatsapp_account', v)} />
            <Campo etiqueta="ID del número"><input className="campo num" defaultValue={d.config.whatsapp_phone_id} onBlur={(e) => e.target.value !== (d.config.whatsapp_phone_id ?? '') && ligar('whatsapp_phone_id', e.target.value)} /></Campo>
            <Campo etiqueta="Nombre de la plantilla" ayuda="Con 4 variables: paciente, servicio, fecha y doctor."><input className="campo" defaultValue={d.config.whatsapp_plantilla} onBlur={(e) => e.target.value !== (d.config.whatsapp_plantilla ?? '') && ligar('whatsapp_plantilla', e.target.value)} /></Campo>
          </div>
        </Tarjeta>
      </div>

      <Tarjeta titulo="Actividad en vivo" detalle="Cada vez que Marco usa una herramienta" sinPadding>
        {actividad.datos?.actividad.length ? (
          <ul className="divide-y divide-borde border-t border-borde">
            {actividad.datos.actividad.slice(0, 15).map((a, i) => (
              <li key={i} className="flex flex-wrap items-center gap-3 px-5 py-2 text-[13px]">
                <Estado ok={a.ok} texto="" />
                <span className="font-mono text-xs">{a.tool}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-tinta-2">{a.detalle}</span>
                <span className="num text-xs text-tinta-3">{a.ms ? seg(a.ms) : ''} · {fechaHora(new Date(a.t).toISOString())}</span>
              </li>
            ))}
          </ul>
        ) : <p className="px-5 pb-5 text-sm text-tinta-3">Aquí aparecen las herramientas en cuanto Marco las use en una llamada.</p>}
      </Tarjeta>
    </div>
  )
}

function SelectorCuenta({ etiqueta, lista, valor, cambiar }: { etiqueta: string; lista: any[]; valor?: string; cambiar: (v: string) => void }) {
  return (
    <Campo etiqueta={etiqueta}>
      <select className="campo font-mono text-xs" value={valor ?? ''} onChange={(e) => cambiar(e.target.value)} disabled={!lista.length}>
        <option value="">{lista.length ? 'La predeterminada' : 'Sin cuentas activas'}</option>
        {lista.map((c) => <option key={c.id} value={c.id}>{c.correo || c.id}{c.correo ? ` · ${c.id}` : ''}{c.creada ? ` · ${new Date(c.creada).toLocaleDateString('es-MX')}` : ''}</option>)}
      </select>
    </Campo>
  )
}

const Flecha = () => <ArrowRight size={15} className="hidden shrink-0 self-center text-tinta-3 sm:block" aria-hidden />

function Pieza({ icono, titulo, subtitulo, estado, fuerte }: { icono: React.ReactNode; titulo: string; subtitulo?: string; estado: React.ReactNode; fuerte?: boolean }) {
  return (
    <div className={`flex min-w-[170px] flex-1 flex-col gap-1.5 rounded-lg border px-3 py-2.5 ${fuerte ? 'border-acento bg-acento-suave' : 'border-borde'}`}>
      <span className="flex items-center gap-2 text-[13px] font-semibold"><span className="text-acento-fuerte" aria-hidden>{icono}</span>{titulo}</span>
      {subtitulo && <span className="truncate text-xs text-tinta-3">{subtitulo}</span>}
      <span className="mt-auto">{estado}</span>
    </div>
  )
}
