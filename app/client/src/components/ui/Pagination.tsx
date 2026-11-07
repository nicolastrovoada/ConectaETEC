import { useMemo } from "react"

interface PaginationProps {
  total: number
  pageSize: number
  current: number
  onChange: (page: number) => void
}

export function Pagination({ total, pageSize, current, onChange }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  const pages = useMemo(() => {
    const items: number[] = []
    for (let p = 1; p <= pageCount; p += 1) {
      if (p === 1 || p === pageCount || Math.abs(p - current) <= 1) items.push(p)
    }
    const result: number[] = []
    let prev = 0
    for (const p of items) {
      if (p - prev > 1) result.push(-prev)
      result.push(p)
      prev = p
    }
    return result
  }, [pageCount, current])

  if (pageCount <= 1) return null

  return (
    <nav className="flex items-center justify-center gap-1.5 mt-4" aria-label="Paginação">
      <button
        type="button"
        disabled={current <= 1}
        onClick={() => onChange(current - 1)}
        className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
      >
        ← Anterior
      </button>
      {pages.map((p, index) =>
        p < 0 ? (
          <span key={`gap-${index}`} className="px-1 text-gray-400 dark:text-slate-500" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            aria-current={p === current ? "page" : undefined}
            onClick={() => onChange(p)}
            className={`min-w-8 px-2.5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              p === current
                ? "bg-blue-700 text-white"
                : "border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800"
            }`}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        disabled={current >= pageCount}
        onClick={() => onChange(current + 1)}
        className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
      >
        Próxima →
      </button>
    </nav>
  )
}