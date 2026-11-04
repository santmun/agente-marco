import { useEffect, useState } from 'react'
import { FileText, Plus, Save, Trash2 } from 'lucide-react'
import { Boton, Campo, Cargando, Falla, pedir, Tarjeta, useDatos } from '../ui/kit'

export function Conocimiento() {
  const { datos, error, cargando, recargar } = useDatos<{ documentos: any[] }>('/conocimiento')
  const [elegido, setElegido] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [texto, setTexto] = useState('')
  const [original, setOriginal] = useState({ nombre: '', texto: '' })
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState('')
  const docs = datos?.documentos ?? []

  useEffect(() => {
    if (elegido === null && docs.length) setElegido(docs[0].id)
  }, [docs, elegido])

  useEffect(() => {
    setAviso('')
    if (!elegido || elegido === 'nuevo') {
      setNombre('')
      setTexto('')
      setOriginal({ nombre: '', texto: '' })
      return
    }
    let vigente = true
    pedir(`/conocimiento/${elegido}`).then((d) => {
      if (!vigente) return
      setNombre(d.nombre)
      setTexto(d.texto)
      setOriginal({ nombre: d.nombre, texto: d.texto })
    }).catch((e) => setAviso(e.message))
    return () => { vigente = false }
  }, [elegido])

  async function guardar() {
    setOcupado(true)
    try {
      const r = elegido === 'nuevo'
        ? await pedir('/conocimiento', 'POST', { nombre, texto })
        : await pedir(`/conocimiento/${elegido}`, 'PUT', { nombre, texto })
      await recargar()
      setElegido(r.id)
      setAviso('Guardado. Marco ya lo usa en las llamadas nuevas.')
    } catch (e) {
      setAviso(`No se guardó: ${(e as Error).message}`)
    } finally {
      setOcupado(false)
    }
  }

  async function borrar() {
    if (!elegido || !window.confirm(`¿Borrar "${nombre}"? Marco dejará de usar esta información.`)) return
    setOcupado(true)
    await pedir(`/conocimiento/${elegido}`, 'DELETE', {}).catch((e) => setAviso(e.message))
    setElegido(null)
    await recargar()
    setOcupado(false)
  }

  if (cargando && !datos) return <Cargando />
  if (error && !datos) return <Falla mensaje={error} reintentar={recargar} />
  const cambiado = nombre !== original.nombre || texto !== original.texto

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Tarjeta sinPadding titulo="Documentos" detalle="Lo que Marco sabe de la clínica" accion={<Boton variante="fantasma" aria-label="Nuevo documento" onClick={() => setElegido('nuevo')}><Plus size={15} /></Boton>}>
        <ul className="border-t border-borde">
          {docs.map((d) => (
            <li key={d.id}>
              <button onClick={() => setElegido(d.id)} aria-current={elegido === d.id} className={`flex w-full items-center gap-2.5 border-b border-borde px-5 py-2.5 text-left text-[13px] last:border-0 ${elegido === d.id ? 'bg-acento-suave font-medium' : 'hover:bg-fondo'}`}>
                <FileText size={14} className="shrink-0 text-tinta-3" aria-hidden />
                <span className="truncate">{d.name.replace('Alborada · ', '')}</span>
              </button>
            </li>
          ))}
        </ul>
      </Tarjeta>
      <Tarjeta>
        <div className="space-y-3">
          <Campo etiqueta="Nombre del documento"><input className="campo" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Por ejemplo: Promociones de diciembre" /></Campo>
          <Campo etiqueta="Contenido" ayuda="Escríbelo como se lo explicarías a una recepcionista nueva. Marco lo consulta durante las llamadas.">
            <textarea className="campo min-h-[460px] text-[13px] leading-relaxed" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </Campo>
          <div className="flex flex-wrap items-center gap-2">
            <Boton variante="primario" disabled={ocupado || !cambiado || !nombre.trim() || !texto.trim()} onClick={guardar}><Save size={14} aria-hidden />{ocupado ? 'Guardando' : 'Guardar'}</Boton>
            {elegido && elegido !== 'nuevo' && <Boton variante="peligro" disabled={ocupado} onClick={borrar}><Trash2 size={14} aria-hidden />Borrar</Boton>}
            {aviso && <span className="text-xs text-tinta-2" role="status">{aviso}</span>}
          </div>
        </div>
      </Tarjeta>
    </div>
  )
}
