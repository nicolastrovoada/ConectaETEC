// Wrapper de chamadas à API do Conecta ETEC.
// Contrato do servidor: sucesso `{ data: <T> }`; erro `{ error, details? }`.
// Sessão via cookie httpOnly — todas as chamadas usam credentials: "include".

export type ApiDetails = string | unknown

export class ApiError extends Error {
  status: number
  details: ApiDetails | undefined

  constructor(message: string, status: number, details?: ApiDetails) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.details = details
  }
}

type QueryValue = string | number | boolean | undefined | null

export function buildQuery(params: Record<string, QueryValue | QueryValue[]>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, String(item))
    } else {
      search.set(key, String(value))
    }
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ""
}

function isErrorBody(body: unknown): body is { error: string; details?: ApiDetails } {
  return typeof body === "object" && body !== null && "error" in body
}

async function request<T>(method: string, path: string, body?: BodyInit | object | null): Promise<T> {
  let headers: Record<string, string> = {}
  let payload: BodyInit | undefined

  if (body instanceof FormData) {
    payload = body
    // Deixa o navegador definir o Content-Type com o boundary do FormData.
  } else if (body !== undefined && body !== null) {
    headers["Content-Type"] = "application/json"
    payload = JSON.stringify(body)
  }

  const res = await fetch(path, {
    method,
    headers,
    credentials: "include",
    body: payload,
  })

  const contentType = res.headers.get("content-type") ?? ""
  const raw: unknown = contentType.includes("application/json") ? await res.json().catch(() => null) : null

  if (!res.ok) {
    let message = `Falha na requisição (${res.status}).`
    let details: ApiDetails | undefined
    if (isErrorBody(raw)) {
      message = raw.error || message
      details = raw.details
    }
    throw new ApiError(message, res.status, details)
  }

  if (raw === null || raw === undefined) {
    return undefined as unknown as T
  }
  if (typeof raw === "object" && raw !== null && "data" in raw) {
    return (raw as { data: T }).data
  }
  return raw as T
}

export const api = {
  get: <T>(path: string, params?: Record<string, QueryValue | QueryValue[]>): Promise<T> =>
    request<T>("GET", params ? `${path}${buildQuery(params)}` : path),

  post: <T>(path: string, body?: object): Promise<T> => request<T>("POST", path, body),

  postForm: <T>(path: string, form: FormData): Promise<T> => request<T>("POST", path, form),

  patch: <T>(path: string, body?: object): Promise<T> => request<T>("PATCH", path, body),

  delete: <T>(path: string): Promise<T> => request<T>("DELETE", path),
}

/** Baixa um arquivo (CSV de relatório ou anexo) disparando o download no navegador. */
export async function downloadFile(path: string): Promise<void> {
  if (path.startsWith("/uploads/")) {
    window.open(path, "_blank")
    return
  }
  const res = await fetch(path, { credentials: "include" })
  if (!res.ok) {
    const raw: unknown = await res.json().catch(() => null)
    let message = `Falha ao baixar arquivo (${res.status}).`
    if (isErrorBody(raw)) message = raw.error || message
    throw new ApiError(message, res.status)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  const disposition = res.headers.get("Content-Disposition")
  const match = disposition?.match(/filename="?([^";]+)"?/i)
  anchor.download = match?.[1] ?? "download"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}