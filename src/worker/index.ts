import { Hono } from 'hono'
import { api } from './api'
import { reindexar } from './agenda'
import { herramientas } from './herramientas'
import { sincronizarLlamadas } from './sincronizar'

export { EstadoClinica } from './estado'

const app = new Hono<{ Bindings: Env }>()

app.route('/tools', herramientas)
app.route('/api', api)
app.notFound((c) => c.json({ error: 'no_encontrado' }, 404))
app.onError((err, c) => {
  console.error(JSON.stringify({ evento: 'error_worker', ruta: c.req.path, error: String(err) }))
  return c.json({ error: 'error_interno' }, 500)
})

export default {
  fetch: app.fetch,
  scheduled(evento, env, ctx) {
    // Cada hora se reconstruye el índice para recoger cambios hechos a mano en la hoja.
    const trabajo = evento.cron === '7 * * * *' ? reindexar(env) : sincronizarLlamadas(env)
    ctx.waitUntil(Promise.resolve(trabajo).catch((err) => console.error(JSON.stringify({ evento: 'error_cron', cron: evento.cron, error: String(err) }))))
  },
} satisfies ExportedHandler<Env>
