import type { Activity, ActivityType, SubmissionStatus } from "@shared/types"
import {
  ACTIVITY_TYPE_COLORS,
  ACTIVITY_TYPE_LABELS,
  SUBMISSION_STATUS_COLORS,
  SUBMISSION_STATUS_LABELS,
} from "@shared/types"

/** Variantes dark locais (o shared não define dark para os mapas V1). */
const ACTIVITY_TYPE_DARK: Record<ActivityType, string> = {
  academic: "dark:bg-purple-900/40 dark:text-purple-300",
  school_action: "dark:bg-green-900/40 dark:text-green-300",
  event: "dark:bg-orange-900/40 dark:text-orange-300",
  library: "dark:bg-cyan-900/40 dark:text-cyan-300",
  support: "dark:bg-blue-900/40 dark:text-blue-300",
  other: "dark:bg-slate-800 dark:text-slate-300",
}

const SUBMISSION_STATUS_DARK: Record<SubmissionStatus, string> = {
  pending: "dark:bg-slate-800 dark:text-slate-300",
  submitted: "dark:bg-blue-900/40 dark:text-blue-300",
  under_review: "dark:bg-yellow-900/40 dark:text-yellow-300",
  approved: "dark:bg-green-900/40 dark:text-green-300",
  rejected: "dark:bg-red-900/40 dark:text-red-300",
  revision_required: "dark:bg-orange-900/40 dark:text-orange-300",
}

/** Badge genérico arredondado. */
export function Badge({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${className}`}>
      {children}
    </span>
  )
}

/** Badge de tipo de atividade usando os mapas do shared + variante dark local. */
export function ActivityTypeBadge({ type }: { type: ActivityType }) {
  return <Badge className={`${ACTIVITY_TYPE_COLORS[type]} ${ACTIVITY_TYPE_DARK[type]}`}>{ACTIVITY_TYPE_LABELS[type]}</Badge>
}

/** Badge de status de entrega usando os mapas do shared + variante dark local. */
export function SubmissionStatusBadge({ status }: { status: SubmissionStatus }) {
  return <Badge className={`${SUBMISSION_STATUS_COLORS[status]} ${SUBMISSION_STATUS_DARK[status]}`}>{SUBMISSION_STATUS_LABELS[status]}</Badge>
}

/** Badge de status de atividade (draft/active/closed). */
const ACTIVITY_STATUS_LABELS: Record<Activity["status"], string> = {
  draft: "Rascunho",
  active: "Ativa",
  closed: "Encerrada",
}

const ACTIVITY_STATUS_COLORS: Record<Activity["status"], string> = {
  draft: "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300",
  active: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  closed: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
}

export function ActivityStatusBadge({ status }: { status: Activity["status"] }) {
  return <Badge className={ACTIVITY_STATUS_COLORS[status]}>{ACTIVITY_STATUS_LABELS[status]}</Badge>
}