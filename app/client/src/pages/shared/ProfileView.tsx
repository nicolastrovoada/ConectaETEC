import { useCallback } from "react"
import {
  ROLE_ICONS,
  ROLE_LABELS,
  getBalance,
  levelLabel,
  nextLevelGoal,
  type PointsTransaction,
} from "@shared/types"
import { useUser } from "../../context/UserContext"
import { api } from "../../lib/api"
import { useAsync } from "../../hooks/useAsync"
import { Card, SectionHeader } from "../../components/ui/Card"
import { ErrorState, LoadingBlock } from "../../components/ui/EmptyState"
import { formatBrDate } from "../../lib/format"

export function ProfileView() {
  const { user, roleTheme } = useUser()

  const points = useAsync<PointsTransaction[]>(
    useCallback(() => api.get<PointsTransaction[]>("/api/transactions"), []),
    [],
  )

  const balance = points.data ? getBalance(user.id, points.data) : 0
  const goal = nextLevelGoal(balance)
  const metaValue = goal.kind === "max" ? "800 ✓" : `+${goal.missing ?? 0}`
  const metaLabel =
    goal.kind === "max" ? "Meta 800 atingida" : goal.kind === "milestone" ? "Meta do Diamante (800)" : "Faltam p/ próx. nível"

  return (
    <div className="max-w-2xl mx-auto">
      <SectionHeader icon="👤" title="Meu Perfil" subtitle="Seus dados de acesso e resumo de participação" />

      <Card className="p-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <div
            className={`w-20 h-20 rounded-full bg-gradient-to-br ${roleTheme.avatar} flex items-center justify-center text-white text-3xl font-black shrink-0 shadow-lg`}
            aria-hidden="true"
          >
            {user.avatar}
          </div>
          <div className="text-center sm:text-left flex-1">
            <h2 className="text-xl font-extrabold text-gray-900 dark:text-white" style={{ fontFamily: "Nunito, sans-serif" }}>
              {user.name}
            </h2>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">{user.email}</p>
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300">
              <span aria-hidden="true">{ROLE_ICONS[user.role]}</span>
              {ROLE_LABELS[user.role]}
            </p>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm border-t border-gray-100 dark:border-slate-800 pt-5">
          <div>
            <dt className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Cadastro em</dt>
            <dd className="text-gray-800 dark:text-slate-200 mt-0.5">{formatBrDate(user.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Situação</dt>
            <dd className="text-green-600 dark:text-green-400 mt-0.5 font-semibold">Ativo</dd>
          </div>
        </dl>
      </Card>

      {user.role === "student" && (
        <Card className="p-6 mt-5">
          <h3 className="text-base font-extrabold text-gray-900 dark:text-white mb-4" style={{ fontFamily: "Nunito, sans-serif" }}>
            Meus pontos
          </h3>
          {points.loading && <LoadingBlock rows={1} label="Carregando pontos" />}
          {!points.loading && points.error && <ErrorState message={points.error} onRetry={points.reload} />}
          {!points.loading && !points.error && points.data && (
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-4">
                <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{balance}</p>
                <p className="text-xs text-gray-500 dark:text-slate-400 font-semibold mt-1">Saldo (pts)</p>
              </div>
              <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-4">
                <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{levelLabel(balance)}</p>
                <p className="text-xs text-gray-500 dark:text-slate-400 font-semibold mt-1">Nível atual</p>
              </div>
              <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-4">
                <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{metaValue}</p>
                <p className="text-xs text-gray-500 dark:text-slate-400 font-semibold mt-1">{metaLabel}</p>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}