const BASE = 'https://api.elevenlabs.io'

export class ErrorEleven extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

export async function eleven<T = any>(env: Env, ruta: string, init: RequestInit = {}): Promise<T> {
  if (!env.ELEVENLABS_API_KEY) throw new ErrorEleven('Falta ELEVENLABS_API_KEY', 503)
  const res = await fetch(`${BASE}${ruta}`, {
    ...init,
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'content-type': 'application/json', ...(init.headers ?? {}) },
    signal: init.signal ?? AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    const cuerpo = (await res.text()).slice(0, 300)
    throw new ErrorEleven(`ElevenLabs ${res.status}: ${cuerpo}`, res.status)
  }
  return res.json() as Promise<T>
}

/** Audio de una llamada, sin bufferizar. */
export async function audioConversacion(env: Env, id: string) {
  if (!env.ELEVENLABS_API_KEY) throw new ErrorEleven('Falta ELEVENLABS_API_KEY', 503)
  return fetch(`${BASE}/v1/convai/conversations/${encodeURIComponent(id)}/audio`, { headers: { 'xi-api-key': env.ELEVENLABS_API_KEY } })
}
