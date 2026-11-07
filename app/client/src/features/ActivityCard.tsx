import type { Activity, Submission } from "@shared/types"
import { Card } from "../components/ui/Card"
import { ActivityStatusBadge, ActivityTypeBadge, SubmissionStatusBadge } from "../components/ui/Badge"
import { daysUntil, formatBrDate } from "../lib/format"

export interface ActivityNamed extends Activity {
  className?: string
  subjectName?: string
  subjectIcon?: string
}

interface ActivityCardProps {
  activity: ActivityNamed
  /** Entrega do aluno (quando presente, substitui o badge de status da atividade). */
  submission?: Submission | null
  /** Conteúdo adicional (ações por papel, status da entrega do aluno etc.). */
  children?: React.ReactNode
}

/** Badge de contagem regressiva do prazo com cor de urgência. */
function DeadlineBadge({ deadline }: { deadline: string }) {
  const days = daysUntil(deadline)
  let label = formatBrDate(deadline)
  let tone = "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300"
  if (days !== null) {
    if (days < 0) {
      label = "Prazo encerrado"
      tone = "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
    } else if (days === 0) {
      label = "Vence hoje"
      tone = "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
    } else if (days <= 3) {
      label = days === 1 ? "Vence amanhã" : `Faltam ${days} dias`
      tone = "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
    } else {
      label = `Faltam ${days} dias`
      tone = "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
    }
  }
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${tone}`}>
      ⏳ {label}
    </span>
  )
}

export function ActivityCard({ activity, submission, children }: ActivityCardProps) {
  return (
    <Card className="p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-extrabold text-gray-900 dark:text-white leading-snug" style={{ fontFamily: "Nunito, sans-serif" }}>
            {activity.title}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <ActivityTypeBadge type={activity.type} />
            {submission ? <SubmissionStatusBadge status={submission.status} /> : <ActivityStatusBadge status={activity.status} />}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-black text-blue-700 dark:text-blue-400">{activity.points} pts</p>
        </div>
      </div>

      {activity.description && (
        <p className="text-sm text-gray-600 dark:text-slate-300 line-clamp-2">{activity.description}</p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500 dark:text-slate-400">
        <span>
          📅 Prazo: <strong className="text-gray-700 dark:text-slate-200">{formatBrDate(activity.deadline)}</strong>
        </span>
        <DeadlineBadge deadline={activity.deadline} />
        {activity.subjectIcon && (
          <span>
            {activity.subjectIcon} {activity.subjectName}
          </span>
        )}
        {activity.className && <span>🏫 {activity.className}</span>}
      </div>

      {children && <div className="mt-auto pt-1 border-t border-gray-100 dark:border-slate-800">{children}</div>}
    </Card>
  )
}