import { useCallback, useMemo } from "react"
import type { CoordinatorOverview } from "../../lib/types"
import type { ActivitiesByTypeRow } from "../../lib/types"
import { api } from "../../lib/api"
import { useAsync } from "../../hooks/useAsync"
import { useUser } from "../../context/UserContext"
import { Card, SectionHeader } from "../../components/ui/Card"
import { BarChart } from "../../components/ui/BarChart"
import { ErrorState, LoadingBlock } from "../../components/ui/EmptyState"

export function CoordinatorOverview() {
  const { user, roleTheme } = useUser()

  const overview = useAsync<CoordinatorOverview>(
    useCallback(() => api.get<CoordinatorOverview>("/api/dashboard/overview"), []),
    [],
  )
  const byType = useAsync<ActivitiesByTypeRow[]>(
    useCallback(() => api.get<ActivitiesByTypeRow[]>("/api/reports/activities-by-type"), []),
    [],
  )

  const stats = useMemo(
    () => [
      { label: "Usuários ativos", value: overview.data?.activeUsers ?? 0, icon: "👥" },
      { label: "Alunos", value: overview.data?.students ?? 0, icon: "🎓" },
      { label: "Turmas ativas", value: overview.data?.activeClasses ?? 0, icon: "🏫" },
      { label: "Atividades totais", value: overview.data?.totalActivities ?? 0, icon: "🗂️" },
      { label: "Atividades ativas", value: overview.data?.activeActivities ?? 0, icon: "🚀" },
      { label: "Validações pendentes", value: overview.data?.pendingValidations ?? 0, icon: "⏳" },
      { label: "Entregas aprovadas", value: overview.data?.approvedSubmissions ?? 0, icon: "✅" },
      { label: "Pontos emitidos", value: overview.data?.pointsIssued ?? 0, icon: "⭐" },
    ],
    [overview.data],
  )

  return (
    <div>
      <SectionHeader icon="📊" title="Visão Global" subtitle="Como está a plataforma hoje" />

      <Card className="p-6 bg-gradient-to-br from-orange-500 to-red-600 border-none mb-6">
        <div className="flex items-center gap-4">
          <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${roleTheme.avatar} flex items-center justify-center text-white text-2xl font-black shadow-lg ring-4 ring-white/20`} aria-hidden="true">
            {user.avatar}
          </div>
          <div>
            <h2 className="text-2xl font-extrabold text-white" style={{ fontFamily: "Nunito, sans-serif" }}>
              Coordenação — {user.name.split(" ")[0] || user.name}
            </h2>
            <p className="text-orange-100 text-sm mt-1">Acompanhe o engajamento e a saúde da plataforma.</p>
          </div>
        </div>
      </Card>

      {overview.loading && <LoadingBlock rows={2} label="Carregando indicadores" />}
      {!overview.loading && overview.error && <ErrorState message={overview.error} onRetry={overview.reload} />}

      {!overview.loading && !overview.error && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="text-2xl mb-2" aria-hidden="true">{stat.icon}</div>
              <div className="text-2xl font-black text-gray-900 dark:text-white">{stat.value}</div>
              <div className="text-xs text-gray-500 dark:text-slate-400 font-semibold mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      <Card className="p-5">
        <h3 className="text-sm font-extrabold text-gray-900 dark:text-white mb-4" style={{ fontFamily: "Nunito, sans-serif" }}>
          Atividades por tipo
        </h3>
        {byType.loading && <LoadingBlock rows={1} label="Carregando gráfico" />}
        {!byType.loading && byType.error && <ErrorState message={byType.error} onRetry={byType.reload} />}
        {!byType.loading && !byType.error && (byType.data ?? []).length > 0 && (
          <BarChart
            series={(byType.data ?? []).map((row) => ({ label: row.label, value: row.count }))}
            color="bg-gradient-to-t from-orange-500 to-red-500"
          />
        )}
      </Card>
    </div>
  )
}