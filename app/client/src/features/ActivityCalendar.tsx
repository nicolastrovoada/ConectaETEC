import type { Activity } from "@shared/types"
import type { AsyncResult } from "../hooks/useAsync"
import { Card } from "../components/ui/Card"
import { EmptyState, ErrorState, LoadingBlock } from "../components/ui/EmptyState"
import { formatMonthLabel } from "../lib/format"

export interface ActivityCalendarMonth {
  month: string // MM/AAAA
  activities: Activity[]
}

type CalendarFetch = AsyncResult<{ calendar: ActivityCalendarMonth[] }>

interface ActivityCalendarProps {
  calendar: CalendarFetch
  renderActivity: (activity: Activity) => React.ReactNode
  emptyTitle?: string
  emptyDescription?: string
}

/** Calendário de atividades agrupado por mês de prazo (usa formatMonthLabel). */
export function ActivityCalendar({
  calendar,
  renderActivity,
  emptyTitle = "Sem atividades no calendário",
  emptyDescription = "Nenhuma atividade com prazo cadastrado.",
}: ActivityCalendarProps) {
  const { data, error, loading, reload } = calendar
  if (loading) return <LoadingBlock rows={3} label="Carregando calendário" />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data || data.calendar.length === 0) {
    return (
      <Card>
        <EmptyState icon="🗓️" title={emptyTitle} description={emptyDescription} />
      </Card>
    )
  }
  return (
    <div className="space-y-6">
      {data.calendar.map(({ month, activities }) => (
        <section key={month} aria-label={formatMonthLabel(month)}>
          <h3 className="text-base font-extrabold text-gray-800 dark:text-slate-200 mb-3 flex items-center gap-2" style={{ fontFamily: "Nunito, sans-serif" }}>
            <span aria-hidden="true">🗓️</span> {formatMonthLabel(month)}
            <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 rounded-full px-2 py-0.5">
              {activities.length} {activities.length === 1 ? "atividade" : "atividades"}
            </span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {activities.map((activity) => renderActivity(activity))}
          </div>
        </section>
      ))}
    </div>
  )
}