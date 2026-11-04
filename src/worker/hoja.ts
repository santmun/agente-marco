import { COLUMNAS, type Pestana } from './catalogo'
import { ejecutar, RespuestaGrande } from './composio'
import { estado, leerConfig, type Config } from './estado'
import { datosDemo } from './demo'

export type Fila = Record<string, string> & { _fila: string }

const TTL: Record<Pestana, number> = {
  Negocio: 600e3, Doctores: 600e3, Servicios: 600e3, Configuracion: 600e3,
  Pacientes: 60e3, Citas: 30e3, Pendientes: 10e3, Llamadas: 120e3,
}
// El catálogo casi no cambia: se comparte entre isolates para que Marco no espere a Sheets en cada arranque.
const CATALOGO = new Set<Pestana>(['Negocio', 'Doctores', 'Servicios', 'Configuracion'])
const FILAS_POR_PAGINA = 40
const PAGINAS_EN_PARALELO = 4
const REINTENTOS_POR_CUOTA = 2

// Caché por isolate: solo datos de la hoja, para no pasar el límite de 60 lecturas por minuto de Sheets.
const cache = new Map<Pestana, { hasta: number; filas: Fila[] }>()
let memoria: Record<string, Fila[]> | null = null

function columna(n: number) {
  let s = ''
  for (let i = n; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s
  return s
}

const cuentaHoja = (c: Config) => ({ id: c.sheets_account, usuario: c.composio_user_id })

/** Sin Sheet conectado, el panel funciona con datos de ejemplo en memoria (vista previa). */
export async function modoVistaPrevia(env: Env) {
  const c = await leerConfig(env)
  return !(c.spreadsheet_id && c.sheets_account && env.COMPOSIO_API_KEY)
}

function vistaPrevia(tab: Pestana): Fila[] {
  memoria ??= Object.fromEntries(
    Object.entries(datosDemo()).map(([t, filas]) => [t, filas.map((f, i) => ({ ...f, _fila: String(i + 2) }) as Fila)]),
  )
  return memoria[tab] ?? []
}

async function leerRango(env: Env, c: Config, tab: Pestana, desde: number, n: number, intento = 0): Promise<unknown[][]> {
  const ultima = columna(COLUMNAS[tab].length - 1)
  try {
    const data = await ejecutar<any>(env, cuentaHoja(c), 'GOOGLESHEETS_VALUES_GET', {
      spreadsheet_id: c.spreadsheet_id,
      range: `${tab}!A${desde}:${ultima}${desde + n - 1}`,
      value_render_option: 'UNFORMATTED_VALUE',
    }, 15000)
    return data?.values ?? data?.response_data?.values ?? []
  } catch (err) {
    if (err instanceof RespuestaGrande && n > 5) {
      const mitad = Math.floor(n / 2)
      const [a, b] = await Promise.all([leerRango(env, c, tab, desde, mitad), leerRango(env, c, tab, desde + mitad, n - mitad)])
      return [...a, ...b]
    }
    // Sheets limita a 60 lecturas por minuto; ante un 429 se espera y se reintenta.
    if (intento < REINTENTOS_POR_CUOTA && /429|quota|rate limit/i.test(String(err))) {
      await new Promise((r) => setTimeout(r, 2000 * (intento + 1)))
      return leerRango(env, c, tab, desde, n, intento + 1)
    }
    throw err
  }
}

/** Lee la pestaña por páginas. Las filas vacías al final de un rango simplemente no vienen. */
async function leerTodo(env: Env, c: Config, tab: Pestana) {
  const primera = await leerRango(env, c, tab, 1, FILAS_POR_PAGINA)
  const valores = [...primera]
  let siguiente = 1 + FILAS_POR_PAGINA
  let completa = primera.length === FILAS_POR_PAGINA
  while (completa) {
    const lote = await Promise.all(
      Array.from({ length: PAGINAS_EN_PARALELO }, (_, i) => leerRango(env, c, tab, siguiente + i * FILAS_POR_PAGINA, FILAS_POR_PAGINA)),
    )
    for (const pagina of lote) valores.push(...pagina)
    siguiente += PAGINAS_EN_PARALELO * FILAS_POR_PAGINA
    completa = lote[lote.length - 1].length === FILAS_POR_PAGINA
  }
  return valores
}

function aFilas(tab: Pestana, valores: unknown[][]) {
  const [cabecera, ...resto] = valores
  const nombres = (cabecera ?? COLUMNAS[tab]).map(String)
  return resto.map((v, i) => {
    const f = { _fila: String(i + 2) } as Fila
    nombres.forEach((n, j) => { f[n] = v[j] === undefined || v[j] === null ? '' : String(v[j]) })
    return f
  })
}

export async function leer(env: Env, tab: Pestana, fresco = false): Promise<Fila[]> {
  const c = await leerConfig(env)
  if (!(c.spreadsheet_id && c.sheets_account && env.COMPOSIO_API_KEY)) return vistaPrevia(tab)
  const guardado = cache.get(tab)
  if (!fresco && guardado && guardado.hasta > Date.now()) return guardado.filas

  const compartido = CATALOGO.has(tab) && !fresco
    ? ((await estado(env).leer(`hoja:${tab}`)) as { hasta: number; filas: Fila[] } | null)
    : null
  if (compartido && compartido.hasta > Date.now()) {
    cache.set(tab, compartido)
    return compartido.filas
  }

  const filas = aFilas(tab, await leerTodo(env, c, tab))
  const entrada = { hasta: Date.now() + TTL[tab], filas }
  cache.set(tab, entrada)
  if (CATALOGO.has(tab)) await estado(env).guardar(`hoja:${tab}`, entrada)
  return filas
}

function aRenglon(tab: Pestana, datos: Record<string, unknown>) {
  return COLUMNAS[tab].map((c) => {
    const v = datos[c]
    return v === undefined || v === null ? '' : typeof v === 'boolean' ? (v ? '1' : '0') : (v as string | number)
  })
}

/** Agrega filas y devuelve el número de la primera, si Sheets lo informa. */
export async function agregar(env: Env, tab: Pestana, filas: Record<string, unknown>[]): Promise<number | undefined> {
  if (!filas.length) return undefined
  const c = await leerConfig(env)
  if (!(c.spreadsheet_id && c.sheets_account && env.COMPOSIO_API_KEY)) {
    const lista = vistaPrevia(tab)
    for (const f of filas) lista.unshift({ ...(f as Record<string, string>), _fila: String(lista.length + 2) } as Fila)
    return undefined
  }
  const data = await ejecutar<any>(env, cuentaHoja(c), 'GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND', {
    spreadsheetId: c.spreadsheet_id,
    range: `${tab}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    values: filas.map((f) => aRenglon(tab, f)),
  }, 20000)
  cache.delete(tab)
  const rango: string = data?.updates?.updatedRange ?? data?.updatedRange ?? data?.response_data?.updates?.updatedRange ?? ''
  const fila = /![A-Z]+(\d+)/.exec(rango)?.[1]
  return fila ? Number(fila) : undefined
}

/** Si alguien borró u ordenó filas a mano, el número guardado ya no apunta a este registro: se vuelve a buscar. */
async function filaVigente(env: Env, c: Config, tab: Pestana, fila: Fila) {
  const clave = COLUMNAS[tab][0] as string
  const [renglon] = await leerRango(env, c, tab, Number(fila._fila), 1)
  if (fila._fila && String(renglon?.[0] ?? '') === fila[clave]) return fila._fila
  const encontrada = (await leer(env, tab, true)).find((f) => f[clave] === fila[clave])
  if (!encontrada) throw new Error(`No encontré ${fila[clave]} en ${tab}`)
  return encontrada._fila
}

export async function actualizar(env: Env, tab: Pestana, fila: Fila, cambios: Record<string, unknown>) {
  const combinada = { ...fila, ...cambios }
  const c = await leerConfig(env)
  if (!(c.spreadsheet_id && c.sheets_account && env.COMPOSIO_API_KEY)) {
    Object.assign(fila, cambios)
    return
  }
  const numero = await filaVigente(env, c, tab, fila)
  const n = COLUMNAS[tab].length
  await ejecutar(env, cuentaHoja(c), 'GOOGLESHEETS_VALUES_UPDATE', {
    spreadsheet_id: c.spreadsheet_id,
    range: `${tab}!A${numero}:${columna(n - 1)}${numero}`,
    value_input_option: 'RAW',
    values: [aRenglon(tab, combinada)],
  })
  await olvidarCache(env, tab)
}

/** Escribe una pestaña completa desde la celda A1 (usado solo al instalar). */
export async function escribirPestana(env: Env, tab: Pestana, renglones: (string | number)[][]) {
  const c = await leerConfig(env)
  await ejecutar(env, cuentaHoja(c), 'GOOGLESHEETS_VALUES_UPDATE', {
    spreadsheet_id: c.spreadsheet_id,
    range: `${tab}!A1`,
    value_input_option: 'RAW',
    auto_expand_sheet: true,
    values: [[...COLUMNAS[tab]], ...renglones],
  }, 20000)
  await olvidarCache(env, tab)
}

export async function olvidarCache(env: Env, tab: Pestana) {
  cache.delete(tab)
  if (CATALOGO.has(tab)) await estado(env).guardar(`hoja:${tab}`, null)
}
