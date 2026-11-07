import { useToast } from "../../context/ToastContext"

/** Renderiza os toasts globais com aria-live (convenção: cor do papel no toast). */
export function ToastHost({ accentClassName }: { accentClassName?: string }) {
  const { toasts } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-5 right-5 z-[100] space-y-2 w-80 max-w-[calc(100vw-2rem)]">
      {toasts.map((toast) => {
        const toneClass =
          toast.tone === "error"
            ? "bg-red-600"
            : toast.tone === "info"
              ? "bg-slate-700"
              : accentClassName ?? "bg-blue-700"
        return (
          <div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            aria-live={toast.tone === "error" ? "assertive" : "polite"}
            className={`${toneClass} text-white px-5 py-3 rounded-xl shadow-xl text-sm font-semibold flex items-start gap-2`}
          >
            <span aria-hidden="true">{toast.tone === "error" ? "✕" : toast.tone === "info" ? "ℹ️" : "✓"}</span>
            <span>{toast.message}</span>
          </div>
        )
      })}
    </div>
  )
}