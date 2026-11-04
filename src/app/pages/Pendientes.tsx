import { useState } from 'react'
import { Check, Phone, RotateCcw } from 'lucide-react'
import { Boton, Cargando, Etiqueta, Falla, fechaHora, pedir, Tarjeta, telefono, useDatos, useFiltros, Vacio } from '../ui/kit'

const TIPOS: Record<string, string> = { urgencia: 'Urgencia', devolver_llamada: 'Devolver llamada', queja: 'Queja', seguro: 'Seguro', otro: 'Otro' }
const ORDEN: Record<string, number> = { alta: 0, media: 1, baja: 2 }

export function Pendientes() {
  const { demo } = useFiltros()
  const { datos, error, cargando, recargar } = useDatos<{ pendientes: any[] }>(`/pendientes?demo=${demo ? 1 : 0}`, 30000)
  const [ocupado, setOcupado] = useState('')

  async function cambiar(id: string, estado: string) {
    setOcupado(id)
    await pedir(`/pendientes/${id}`, 'PATCH', { estado }).catch((e) => window.alert(e.message))
    setOcupado('')
    recargar()
  }

  if (cargando && !datos) return <Cargando />
  if (error && !datos) return <Falla mensaje={error} reintentar={recargar} />
  const abiertos = (datos?.pendientes ?? []).filter((p) => p.estado === 'abierto').sort((a, b) => (a.tipo === 'urgencia' ? -1 : 0) - (b.tipo === 'urgencia' ? -1 : 0) || ORDEN[a.prioridad] - ORDEN[b.prioridad])
  const resueltos = (datos?.pendientes ?? []).filter((p) => p.estado !== 'abierto')

  const Lista = ({ filas, resuelto }: { filas: any[]; resuelto?: boolean }) => (
    <ul className="divide-y divide-borde border-t border-borde">
      {filas.map((p) => (
        <li key={p.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
          <div className="min-w-0 flex-1 basis-[280px]">
            <div className="flex flex-wrap items-center gap-1.5">
              <Etiqueta tono={resuelto ? 'neutro' : p.prioridad === 'alta' ? 'critico' : p.prioridad === 'media' ? 'aviso' : 'neutro'}>{TIPOS[p.tipo] ?? p.tipo}</Etiqueta>
              {p.es_demo === '1' && <Etiqueta icono={false}>Ejemplo</Etiqueta>}
              <span className="text-xs text-tinta-3">{fechaHora(p.creado_en)}</span>
            </div>
            <p className="mt-1.5 text-sm">{p.motivo}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-tinta-2">
              {p.paciente || 'Sin nombre'}
              {p.telefono && <span className="num inline-flex items-center gap-1"><Phone size={11} aria-hidden />{telefono(p.telefono)}</span>}
            </p>
          </div>
          {resuelto
            ? <Boton variante="fantasma" disabled={ocupado === p.id} onClick={() => cambiar(p.id, 'abierto')}><RotateCcw size={13} aria-hidden /> Reabrir</Boton>
            : <Boton disabled={ocupado === p.id} onClick={() => cambiar(p.id, 'resuelto')}><Check size={14} aria-hidden /> Marcar resuelto</Boton>}
        </li>
      ))}
    </ul>
  )

  return (
    <div className="space-y-4">
      <Tarjeta sinPadding titulo={`Abiertos (${abiertos.length})`} detalle="Lo que Marco no resolvió solo. Las urgencias van primero.">
        {abiertos.length ? <Lista filas={abiertos} /> : <Vacio titulo="Todo al día">No hay pendientes abiertos.</Vacio>}
      </Tarjeta>
      {!!resueltos.length && (
        <Tarjeta sinPadding titulo={`Resueltos (${resueltos.length})`}>
          <Lista filas={resueltos.slice(0, 30)} resuelto />
        </Tarjeta>
      )}
    </div>
  )
}
