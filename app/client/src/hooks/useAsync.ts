import { useCallback, useEffect, useState, type DependencyList } from "react"

export interface AsyncResult<T> {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => void
}

/** Hook genérico de dados assíncronos (loading/erro/recarregar). */
export function useAsync<T>(factory: () => Promise<T>, deps: DependencyList = []): AsyncResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    factory()
      .then((result) => {
        if (alive) setData(result)
      })
      .catch((err: unknown) => {
        if (!alive) return
        setError(err instanceof Error ? err.message : String(err))
        setData(null)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  return { data, error, loading, reload }
}