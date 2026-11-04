const BASE = 'https://backend.composio.dev/api'
const MCP = 'https://connect.composio.dev/mcp'

export class ErrorComposio extends Error {}
/** Composio recorta las respuestas de más de unos 35 KB: quien lee debe pedir menos filas. */
export class RespuestaGrande extends ErrorComposio {}

export type Cuenta = { id?: string; usuario?: string }
export type Accion = { slug: string; args: Record<string, unknown> }

// Las llaves ck_ solo funcionan por el servidor MCP de Composio; las demás, por la API REST.
const esLlaveMcp = (env: Env) => env.COMPOSIO_API_KEY?.startsWith('ck_')

function cabecerasRest(env: Env): Record<string, string> {
  const llave = env.COMPOSIO_API_KEY
  return { 'content-type': 'application/json', [llave?.startsWith('uak_') ? 'x-user-api-key' : 'x-api-key']: llave }
}

async function llamarMcp(env: Env, herramienta: string, args: Record<string, unknown>, timeoutMs: number) {
  const res = await fetch(MCP, {
    method: 'POST',
    headers: { 'x-consumer-api-key': env.COMPOSIO_API_KEY, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: herramienta, arguments: args } }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new ErrorComposio(`${herramienta}: HTTP ${res.status}`)
  const cuerpo = await res.text()
  const eventos = cuerpo.split('\n').filter((l) => l.startsWith('data:'))
  const rpc = JSON.parse(eventos.length ? eventos[eventos.length - 1].slice(5) : cuerpo) as any
  if (rpc.error) throw new ErrorComposio(`${herramienta}: ${rpc.error.message ?? 'error'}`.slice(0, 400))
  const json = JSON.parse(rpc.result?.content?.[0]?.text ?? '{}')
  // Si falló una herramienta dentro del lote, quien llama lee el error específico en results.
  if (!json.successful && !json.data?.results) throw new ErrorComposio(`${herramienta}: ${String(json.error ?? 'falló').slice(0, 400)}`)
  return json.data as any
}

function resultadoMcp(r: any, slug: string) {
  if (r?.error || !r?.response?.successful) {
    throw new ErrorComposio(`${slug}: ${String(r?.error ?? r?.response?.error ?? 'falló').slice(0, 400)}`)
  }
  if (r.response.data === undefined) throw new RespuestaGrande(`${slug}: respuesta demasiado grande`)
  return r.response.data
}

async function ejecutarRest(env: Env, cuenta: Cuenta, a: Accion, timeoutMs: number) {
  const res = await fetch(`${BASE}/v3.1/tools/execute/${a.slug}`, {
    method: 'POST',
    headers: cabecerasRest(env),
    body: JSON.stringify({ connected_account_id: cuenta.id, user_id: cuenta.usuario, arguments: a.args }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const json = (await res.json().catch(() => null)) as any
  if (!res.ok || !json?.successful) {
    const msg = typeof json?.error === 'string' ? json.error : json?.error?.message
    throw new ErrorComposio(`${a.slug}: ${msg ?? `HTTP ${res.status}`}`.slice(0, 400))
  }
  return json.data
}

/** Ejecuta una herramienta con una cuenta conectada y devuelve sus datos. */
export async function ejecutar<T = any>(env: Env, cuenta: Cuenta, slug: string, args: Record<string, unknown>, timeoutMs = 10000): Promise<T> {
  if (!env.COMPOSIO_API_KEY) throw new ErrorComposio('Falta COMPOSIO_API_KEY')
  if (!cuenta.id) throw new ErrorComposio(`Sin cuenta conectada para ${slug}`)
  if (!esLlaveMcp(env)) return ejecutarRest(env, cuenta, { slug, args }, timeoutMs)
  const data = await llamarMcp(env, 'COMPOSIO_MULTI_EXECUTE_TOOL', {
    tools: [{ tool_slug: slug, arguments: args, account: cuenta.id }],
    sync_response_to_workbench: false,
  }, timeoutMs)
  return resultadoMcp(data.results?.[0], slug)
}

/** Ejecuta varias acciones en paralelo; usado para cargas masivas al instalar. */
export async function ejecutarVarios(env: Env, cuenta: Cuenta, acciones: Accion[], timeoutMs = 30000): Promise<any[]> {
  if (!acciones.length) return []
  if (!esLlaveMcp(env)) return Promise.all(acciones.map((a) => ejecutarRest(env, cuenta, a, timeoutMs)))
  const data = await llamarMcp(env, 'COMPOSIO_MULTI_EXECUTE_TOOL', {
    tools: acciones.map((a) => ({ tool_slug: a.slug, arguments: a.args, account: cuenta.id })),
    sync_response_to_workbench: false,
  }, timeoutMs)
  const porIndice = [...(data.results ?? [])].sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0))
  return porIndice.map((r: any, i: number) => resultadoMcp(r, acciones[i].slug))
}

export type CuentaConectada = { id: string; toolkit: string; status: string; user_id?: string; creada?: string; correo?: string; predeterminada?: boolean }

/** Lista las cuentas activas para ligarlas sin copiar IDs a mano. */
export async function listarCuentas(env: Env, toolkits: string[]): Promise<CuentaConectada[]> {
  if (!env.COMPOSIO_API_KEY) return []
  if (esLlaveMcp(env)) {
    const data = await llamarMcp(env, 'COMPOSIO_MANAGE_CONNECTIONS', { toolkits: toolkits.map((name) => ({ name, action: 'list' })) }, 10000)
    return toolkits.flatMap((t) =>
      (data.results?.[t]?.accounts ?? [])
        .filter((c: any) => c.status === 'active')
        .map((c: any) => ({ id: c.id, toolkit: t, status: 'ACTIVE', predeterminada: !!c.is_default, correo: c.user_info?.email ?? c.user_info?.summary ?? '' })),
    )
  }
  const url = `${BASE}/v3/connected_accounts?statuses=ACTIVE&limit=100&${toolkits.map((t) => `toolkit_slugs=${t}`).join('&')}`
  const res = await fetch(url, { headers: cabecerasRest(env), signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new ErrorComposio(`connected_accounts: HTTP ${res.status}`)
  const json = (await res.json()) as any
  return (json.items ?? []).map((c: any) => ({
    id: c.id,
    toolkit: c.toolkit?.slug ?? c.toolkit_slug ?? '',
    status: c.status,
    user_id: c.user_id,
    creada: c.created_at,
  }))
}
