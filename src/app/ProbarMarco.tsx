import { useEffect, useRef, useState } from 'react'
import { Conversation } from '@elevenlabs/client'
import { Mic, PhoneOff } from 'lucide-react'
import { Boton, Cajon, pedir } from './ui/kit'

type Linea = { quien: 'Marco' | 'Tú'; texto: string }
type Sesion = Awaited<ReturnType<typeof Conversation.startSession>>

/** Llamada real a Marco desde el navegador, con URL firmada que entrega el Worker. */
export function ProbarMarco({ cerrar }: { cerrar: () => void }) {
  const [estado, setEstado] = useState<'lista' | 'conectando' | 'en_llamada' | 'terminada'>('lista')
  const [modo, setModo] = useState('')
  const [error, setError] = useState('')
  const [lineas, setLineas] = useState<Linea[]>([])
  const sesion = useRef<Sesion | null>(null)
  const fin = useRef<HTMLDivElement>(null)

  useEffect(() => { fin.current?.scrollIntoView({ behavior: 'smooth' }) }, [lineas])
  useEffect(() => () => { sesion.current?.endSession() }, [])

  async function iniciar() {
    setError('')
    setLineas([])
    setEstado('conectando')
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
      const { signed_url } = await pedir<{ signed_url: string }>('/agente/llamada-prueba')
      sesion.current = await Conversation.startSession({
        signedUrl: signed_url,
        onConnect: () => setEstado('en_llamada'),
        onDisconnect: () => setEstado('terminada'),
        onModeChange: ({ mode }) => setModo(mode),
        onMessage: ({ source, message }) => setLineas((l) => [...l, { quien: source === 'ai' ? 'Marco' : 'Tú', texto: message }]),
        onError: (m) => setError(String(m)),
      })
    } catch (e) {
      const m = (e as Error).message
      setError(/Falta ELEVENLABS/.test(m) ? 'Falta agregar la llave de ElevenLabs en Cloudflare. Los pasos están en Conexiones.' : /Permission|NotAllowed/i.test(m) ? 'El navegador no dio permiso para usar el micrófono.' : m)
      setEstado('lista')
    }
  }

  async function colgar() {
    await sesion.current?.endSession()
    sesion.current = null
    setEstado('terminada')
  }

  return (
    <Cajon abierto cerrar={cerrar} titulo={<><p className="font-semibold">Probar a Marco</p><p className="text-xs text-tinta-3">Es una llamada real: usa las mismas herramientas, agenda de verdad y gasta minutos.</p></>}>
      <div className="flex flex-col items-center gap-3 rounded-xl bg-lateral px-5 py-7 text-center text-white">
        <div className={`flex h-16 w-16 items-center justify-center rounded-full ${estado === 'en_llamada' ? 'bg-acento' : 'bg-white/10'}`}>
          <Mic size={26} aria-hidden className={modo === 'speaking' ? 'dot-pulso' : ''} />
        </div>
        <p className="text-sm" role="status">
          {estado === 'lista' && 'Lista para llamar'}
          {estado === 'conectando' && 'Conectando'}
          {estado === 'en_llamada' && (modo === 'speaking' ? 'Marco está hablando' : 'Marco te escucha')}
          {estado === 'terminada' && 'Llamada terminada. Aparece en Llamadas en unos minutos.'}
        </p>
        {estado === 'en_llamada'
          ? <Boton variante="peligro" onClick={colgar}><PhoneOff size={14} aria-hidden /> Colgar</Boton>
          : <Boton variante="primario" onClick={iniciar} disabled={estado === 'conectando'}><Mic size={14} aria-hidden /> {estado === 'terminada' ? 'Llamar otra vez' : 'Iniciar llamada'}</Boton>}
      </div>
      {error && <p className="mt-3 text-sm text-critico" role="alert">{error}</p>}
      <div className="mt-4 space-y-2.5">
        {lineas.map((l, i) => (
          <div key={i} className={`max-w-[88%] rounded-xl px-3 py-2 text-sm ${l.quien === 'Marco' ? 'bg-fondo' : 'ml-auto bg-acento-suave'}`}>
            <span className="block text-[11px] font-medium text-tinta-3">{l.quien}</span>
            {l.texto}
          </div>
        ))}
        <div ref={fin} />
      </div>
    </Cajon>
  )
}
