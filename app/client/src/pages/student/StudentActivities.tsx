import { useCallback, useMemo, useState } from "react"
import type { Activity, Submission } from "@shared/types"
import { api } from "../../lib/api"
import { useAsync } from "../../hooks/useAsync"
import { Card, SectionHeader } from "../../components/ui/Card"
import { Button } from "../../components/ui/Button"
import { EmptyState, ErrorState, LoadingBlock } from "../../components/ui/EmptyState"
import { StudentSubmitModal } from "../../features/StudentSubmitModal"
import { ActivityCalendar } from "../../features/ActivityCalendar"
import { ActivityCard } from "../../features/ActivityCard"

interface StudentActivitiesProps {
  onNavigate?: (page: "reforco") => void
}

export function StudentActivities({ onNavigate }: StudentActivitiesProps) {
  const [calendarMode, setCalendarMode] = useState(false)
  const [submitActivity, setSubmitActivity] = useState<Activity | null>(null)

  const activities = useAsync<Activity[]>(
    useCallback(() => api.get<Activity[]>("/api/activities", { calendar: false }), []),
    [],
  )
  const calendar = useAsync<{ calendar: Array<{ month: string; activities: Activity[] }> }>(
    useCallback(() => api.get<{ calendar: Array<{ month: string; activities: Activity[] }> }>("/api/activities", { calendar: true }), []),
    [],
  )
  const mySubmissions = useAsync<Submission[]>(
    useCallback(() => api.get<Submission[]>("/api/submissions"), []),
    [],
  )

  const submissionByActivityId = useMemo(() => {
    const map = new Map<string, Submission>()
    for (const sub of mySubmissions.data ?? []) map.set(sub.activityId, sub)
    return map
  }, [mySubmissions.data])

  const submissionFor = (activity: Activity) => submissionByActivityId.get(activity.id)

  function renderCard(activity: Activity) {
    const submission = submissionFor(activity)
    const canResubmit = submission?.status === "revision_required"
    const locked = submission !== undefined && !canResubmit
    return (
      <ActivityCard key={activity.id} activity={activity} submission={submission ?? null}>
        {submission?.feedback && (
          <p className="text-xs text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900 rounded-xl px-3 py-2 whitespace-pre-wrap mb-2">
            <strong>Feedback:</strong> {submission.feedback}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {!submission && (
            <Button onClick={() => setSubmitActivity(activity)} className="bg-blue-700 hover:bg-blue-800 text-xs px-3 py-1.5">
              📤 Entregar atividade
            </Button>
          )}
          {canResubmit && (
            <Button onClick={() => setSubmitActivity(activity)} className="bg-blue-700 hover:bg-blue-800 text-xs px-3 py-1.5">
              🔄 Reenviar entrega
            </Button>
          )}
          {locked && (
            <span className="px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-slate-800 text-xs font-semibold text-gray-500 dark:text-slate-400">
              Entrega registrada — aguardando validação
            </span>
          )}
        </div>
      </ActivityCard>
    )
  }

  const loading = activities.loading || mySubmissions.loading
  const error = activities.error || mySubmissions.error

  return (
    <div>
      <SectionHeader
        icon="📋"
        title="Atividades da minha turma"
        subtitle="Envie suas entregas até o prazo para ganhar pontos"
        action={
          <button
            type="button"
            onClick={() => setCalendarMode((v) => !v)}
            aria-pressed={calendarMode}
            className={`px-4 py-2 rounded-xl border text-sm font-semibold transition-colors ${
              calendarMode
                ? "bg-blue-700 border-blue-700 text-white"
                : "border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800"
            }`}
          >
            {calendarMode ? "🗓️ Ver lista" : "🗓️ Ver calendário"}
          </button>
        }
      />

      {loading && <LoadingBlock rows={4} label="Carregando atividades" />}
      {!loading && error && <ErrorState message={error} onRetry={activities.reload} />}

      {!loading && !error && !calendarMode && (activities.data ?? []).length === 0 && (
        <Card>
          <EmptyState
            icon="📭"
            title="Nenhuma atividade disponível"
            description="Novas atividades da sua turma aparecerão aqui."
            action={
              onNavigate ? (
                <Button variant="secondary" onClick={() => onNavigate("reforco")}>
                  📚 Ver reforço escolar
                </Button>
              ) : undefined
            }
          />
        </Card>
      )}

      {!loading && !error && !calendarMode && (activities.data ?? []).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(activities.data ?? []).map(renderCard)}
        </div>
      )}

      {!loading && !error && calendarMode && (
        <ActivityCalendar
          calendar={calendar}
          renderActivity={renderCard}
          emptyTitle="Calendário vazio"
          emptyDescription="Nenhuma atividade com prazo cadastrado."
        />
      )}

      <StudentSubmitModal
        open={submitActivity !== null}
        activity={submitActivity}
        onClose={() => setSubmitActivity(null)}
        onSubmitted={() => {
          setSubmitActivity(null)
          activities.reload()
          mySubmissions.reload()
        }}
      />
    </div>
  )
}