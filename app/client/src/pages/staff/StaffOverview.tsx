import { useCallback } from "react"
import type { EducatorOverview } from "../../lib/types"
import { api } from "../../lib/api"
import { useAsync } from "../../hooks/useAsync"
import { useUser } from "../../context/UserContext"
import { Card } from "../../components/ui/Card"
import { ErrorState, LoadingBlock } from "../../components/ui/EmptyState"

interface StaffOverviewProps {
  onNavigate: (page: "activities" | "validate" | "history") => void
}

export function StaffOverview({ onNavigate }: StaffOverviewProps) {
  const { user, roleTheme } = useUser()
  const overview = useAsync<EducatorOverview>(
    useCallback(() => api.get<EducatorOverview>("/api/dashboard/overview"), []),
    [],
  )

  const stats = [
    { label: "Minhas ações", value: overview.data?.myActivities ?? 0, icon: "📋", to: "activities" as const },
    { label: "Entregas pendentes", value: overview.data?.pending ?? 0, icon: "⏳", to: "validate" as const },
    { label: "Entregas aprovadas", value: overview.data?.approved ?? 0, icon: "✅", to: "validate" as const },
  ]

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-gradient-to-br from-green-600 to-green-800 border-none">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${roleTheme.avatar} flex items-center justify-center text-white text-2xl font-black shadow-lg ring-4 ring-white/20`} aria-hidden="true">
            {user.avatar}
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-extrabold text-white" style={{ fontFamily: "Nunito, sans-serif" }}>
              Bem-vindo(a), {user.name.split(" ")[0] || user.name}! 👋
            </h2>
            <p className="text-green-100 text-sm mt-1">
              Registre ações escolares e valide as entregas dos alunos.
            </p>
          </div>
        </div>
      </Card>

      {overview.loading && <LoadingBlock rows={1} label="Carregando resumo" />}
      {!overview.loading && overview.error && <ErrorState message={overview.error} onRetry={overview.reload} />}

      {!overview.loading && !overview.error && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {stats.map((stat) => (
              <button
                key={stat.label}
                type="button"
                onClick={() => onNavigate(stat.to)}
                className="text-left bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="text-2xl mb-2" aria-hidden="true">{stat.icon}</div>
                <div className="text-2xl font-black text-gray-900 dark:text-white">{stat.value}</div>
                <div className="text-xs text-gray-500 dark:text-slate-400 font-semibold mt-0.5">{stat.label}</div>
              </button>
            ))}
          </div>

          <Card className="p-5">
            <h3 className="text-sm font-extrabold text-gray-900 dark:text-white mb-3" style={{ fontFamily: "Nunito, sans-serif" }}>
              Ações rápidas
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onNavigate("activities")}
                className="flex items-center gap-3 bg-gray-50 dark:bg-slate-800 hover:bg-green-50 dark:hover:bg-slate-700 rounded-xl px-4 py-3 text-left transition-colors"
              >
                <span className="text-xl" aria-hidden="true">➕</span>
                <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">Criar ação escolar</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate("history")}
                className="flex items-center gap-3 bg-gray-50 dark:bg-slate-800 hover:bg-green-50 dark:hover:bg-slate-700 rounded-xl px-4 py-3 text-left transition-colors"
              >
                <span className="text-xl" aria-hidden="true">🕘</span>
                <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">Ver histórico</span>
              </button>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}