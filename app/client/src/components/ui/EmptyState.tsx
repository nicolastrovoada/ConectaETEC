import type { ReactNode } from "react"

/** Estado vazio padronizado com ícone + mensagem. */
export function EmptyState({ icon = "📭", title, description, action }: { icon?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div className="text-4xl mb-3" aria-hidden="true">
        {icon}
      </div>
      <h3 className="text-base font-bold text-gray-800 dark:text-slate-200" style={{ fontFamily: "Nunito, sans-serif" }}>
        {title}
      </h3>
      {description && <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Spinner de carregamento inline. */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Carregando"
      className={`inline-block w-5 h-5 border-2 border-gray-300 dark:border-slate-600 border-t-transparent rounded-full animate-spin ${className}`}
    />
  )
}

/** Carga em bloco para listas. */
export function LoadingBlock({ rows = 3, label = "Carregando..." }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-3" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="h-16 bg-gray-100 dark:bg-slate-800 rounded-xl animate-pulse"
          style={{ animationDelay: `${index * 120}ms` }}
        />
      ))}
    </div>
  )
}

/** Cartão de erro amigável com botão de tentar novamente. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm"
    >
      <span className="text-lg" aria-hidden="true">⚠️</span>
      <div className="flex-1">
        <p className="font-semibold text-red-700 dark:text-red-300">Não foi possível carregar os dados.</p>
        <p className="text-red-600 dark:text-red-400 mt-0.5">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 text-xs font-semibold text-red-700 dark:text-red-300 underline underline-offset-2 hover:no-underline"
          >
            Tentar novamente
          </button>
        )}
      </div>
    </div>
  )
}