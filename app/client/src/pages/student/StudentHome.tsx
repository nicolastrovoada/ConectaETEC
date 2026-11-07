import { useCallback, useEffect, useRef } from "react"
import type { StudentOverview, UserPointsResponse } from "../../lib/types"
import { levelLabel, levelProgress, nextLevelGoal, nextStreakMilestone } from "@shared/types"
import { api } from "../../lib/api"
import { useAsync } from "../../hooks/useAsync"
import { useUser } from "../../context/UserContext"
import { useToast } from "../../context/ToastContext"
import { Card } from "../../components/ui/Card"
import { Button } from "../../components/ui/Button"
import { ErrorState, LoadingBlock } from "../../components/ui/EmptyState"

/** Chave usada para detectar a subida de nível entre sessões (celebração 1x). */
const LEVEL_STORAGE_KEY = "conectaetec:lastLevel"

interface StudentHomeProps {
  onNavigate: (page: "atividades" | "recompensas" | "pontos" | "reforco") => void
}

export function StudentHome({ onNavigate }: StudentHomeProps) {
  const { user, roleTheme } = useUser()
  const { showToast } = useToast()

  const overview = useAsync<StudentOverview>(useCallback(() => api.get<StudentOverview>("/api/dashboard/overview"), []), [])
  const points = useAsync<UserPointsResponse>(
    useCallback(() => api.get<UserPointsResponse>(`/api/users/${user.id}/points`), [user.id]),
    [],
  )

  // RF07 — celebração de level-up: compara o nível atual com o último visto
  // (localStorage) e avisa 1x quando o endpooint é (re)carregado com nível novo.
  const celebratedRef = useRef(false)
  const level = levelLabel(points.data?.balance ?? 0)
  useEffect(() => {
    if (celebratedRef.current) return
    const currentLevel = level
    const stored = localStorage.getItem(LEVEL_STORAGE_KEY)
    if (!stored) {
      localStorage.setItem(LEVEL_STORAGE_KEY, currentLevel)
    } else if (stored !== currentLevel) {
      localStorage.setItem(LEVEL_STORAGE_KEY, currentLevel)
      celebratedRef.current = true
      showToast(`🎉 Você subiu para ${currentLevel}! Continue assim.`, "success")
    }
  }, [level, showToast])

  const loading = overview.loading && points.loading
  const error = overview.error ?? points.error
  const balance = overview.data?.balance ?? points.data?.balance ?? 0

  // Meta única: nível real (Prata/Ouro) ou meta de progresso do Diamante (800).
  const goal = nextLevelGoal(balance)
  const progress = levelProgress(balance)
  const remaining = goal.missing ?? 0
  const goalCopy =
    goal.kind === "max"
      ? "Nível máximo: Diamante • meta 800 atingida 🏆"
      : goal.kind === "milestone"
        ? `Você é Diamante — faltam ${remaining} pts para a meta 800 🏆`
        : `Faltam ${remaining} pts para o próximo nível`
  const goalLabel =
    goal.kind === "max" ? "Nível máximo atingido" : goal.kind === "milestone" ? "Progresso para a meta 800" : "Progresso para o próximo nível"

  // Sequência de participação (RF07 — Frente 2).
  const streak = points.data?.currentStreakDays ?? 0
  const nextMilestone = streak > 0 ? nextStreakMilestone(streak) : null
  const streakCopy =
    streak === 0
      ? "Complete uma atividade com aprovação para iniciar sua sequência."
      : nextMilestone
        ? `${streak} ${streak === 1 ? "dia" : "dias"} seguidos — faltam ${nextMilestone.days - streak} para +${nextMilestone.bonus} pts`
        : `${streak} dias seguidos — você atingiu todos os marcos! 🏆`

  const stats = [
    { label: "Atividades a fazer", value: overview.data?.pendingActivities ?? 0, icon: "📋", to: "atividades" as const },
    { label: "Entregas enviadas", value: overview.data?.submitted ?? 0, icon: "📤", to: "pontos" as const },
    { label: "Aprovadas", value: overview.data?.approved ?? 0, icon: "✅", to: "pontos" as const },
    { label: "Com feedback", value: overview.data?.withFeedback ?? 0, icon: "✏️", to: "atividades" as const },
  ]

  return (
    <div className="space-y-6">
      {/* Boas-vindas */}
      <Card className="p-6 bg-gradient-to-br from-blue-600 to-blue-800 border-none">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${roleTheme.avatar} flex items-center justify-center text-white text-2xl font-black shadow-lg ring-4 ring-white/20`} aria-hidden="true">
            {user.avatar}
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-extrabold text-white" style={{ fontFamily: "Nunito, sans-serif" }}>
              Olá, {user.name.split(" ")[0]}! 👋
            </h2>
            <p className="text-blue-100 text-sm mt-1">
              Continue assim! Complete as atividades para ganhar pontos e subir de nível.
            </p>
          </div>
          <div className="bg-white/10 rounded-2xl px-5 py-3 text-center backdrop-blur-sm">
            <p className="text-3xl font-black text-white" style={{ fontFamily: "Nunito, sans-serif" }}>
              {balance}
            </p>
            <p className="text-blue-100 text-xs font-semibold">pontos</p>
          </div>
        </div>
      </Card>

      {error && <ErrorState message={error} onRetry={overview.reload} />}
      {loading && !error && <LoadingBlock rows={2} label="Carregando resumo" />}

      {!loading && !error && (
        <>
          {/* Nível e progresso */}
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-extrabold text-gray-900 dark:text-white" style={{ fontFamily: "Nunito, sans-serif" }}>
                  Nível atual: {levelLabel(balance)}
                </h3>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                  {balance} pts · {goalCopy}
                </p>
              </div>
              <Button variant="secondary" onClick={() => onNavigate("recompensas")} className="text-xs px-3 py-2">
                🏆 Ver recompensas
              </Button>
            </div>
            <div className="mt-3 h-3 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={goalLabel}>
              <div className="h-full bg-gradient-to-r from-blue-500 to-blue-700 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </Card>

          {/* Sequência de participação (RF07) */}
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-extrabold text-gray-900 dark:text-white" style={{ fontFamily: "Nunito, sans-serif" }}>
                  🔥 Sequência de participação
                </h3>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{streakCopy}</p>
              </div>
              <div className="text-center shrink-0">
                <p className="text-3xl font-black text-gray-900 dark:text-white">{streak}</p>
                <p className="text-xs text-gray-500 dark:text-slate-400 font-semibold">dias seguidos</p>
              </div>
            </div>
          </Card>

          {/* Indicadores */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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

          {/* Acesso rápido */}
          <Card className="p-5">
            <h3 className="text-sm font-extrabold text-gray-900 dark:text-white mb-3" style={{ fontFamily: "Nunito, sans-serif" }}>
              Acesso rápido
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => onNavigate("atividades")}
                className="flex items-center gap-3 bg-gray-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 rounded-xl px-4 py-3 text-left transition-colors"
              >
                <span className="text-xl" aria-hidden="true">📋</span>
                <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">Entregar atividade</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate("reforco")}
                className="flex items-center gap-3 bg-gray-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 rounded-xl px-4 py-3 text-left transition-colors"
              >
                <span className="text-xl" aria-hidden="true">📚</span>
                <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">Reforço escolar</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate("pontos")}
                className="flex items-center gap-3 bg-gray-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 rounded-xl px-4 py-3 text-left transition-colors"
              >
                <span className="text-xl" aria-hidden="true">⭐</span>
                <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">Histórico de pontos</span>
              </button>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}