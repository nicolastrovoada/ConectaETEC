// Tipos de resposta da API (além dos contratos de entidade em @shared/types).
import type {
  Activity,
  PointsTransaction,
  Redemption,
  Reward,
  StudyContentCompletion,
} from "@shared/types"

export interface ActivityDetail extends Activity {
  submissionsCount: number
  approvedCount: number
}

export interface StudentOverview {
  balance: number
  pendingActivities: number
  submitted: number
  approved: number
  withFeedback: number
}

export interface EducatorOverview {
  myActivities: number
  students: number
  pending: number
  approved: number
}

export interface CoordinatorOverview {
  activeUsers: number
  students: number
  activeClasses: number
  totalActivities: number
  activeActivities: number
  pendingValidations: number
  approvedSubmissions: number
  pointsIssued: number
  classes: number
}

export interface ActivityCalendarMonth {
  month: string // MM/AAAA
  activities: Activity[]
}

export interface ActivityCalendarResponse {
  calendar: ActivityCalendarMonth[]
}

export interface RewardsStoreResponse {
  rewards: Reward[]
  balance: number
}

export interface UserPointsResponse {
  balance: number
  levelLabel: string
  nextLevel: number
  /** Pontos que faltam para o próximo nível; null quando já está no topo (Diamante). */
  missingForNextLevel: number | null
  /** Sequência atual de dias com aprovação (RF07). */
  currentStreakDays: number
  /** Próximo marco de sequência em dias; null quando todos os marcos foram atingidos. */
  nextStreakMilestone: number | null
  daysToNextMilestone: number | null
  transactions: PointsTransaction[]
}

export interface CompletionReportRow {
  className: string
  course: string
  students: number
  activities: number
  possible: number
  done: number
  pct: number
}

export interface PointsReportRow {
  studentName: string
  className: string
  balance: number
  level: string
}

export interface ActivitiesByTypeRow {
  type: string
  label: string
  count: number
}

/**
 * Uma atividade do professor com as contagens de entrega — `GET
 * /api/reports/teacher-performance` (4.2). Espelha `TeacherActivityMetricRow` do
 * serviço de relatórios, que fica no servidor porque é o dono do recorte (por
 * DONO da atividade, não por turma), então não é contrato de `shared/`.
 *
 * `deadline` chega como está gravado (`DD/MM/AAAA`): a tela exibe cru, sem
 * passar por `new Date()`, que leria "10/02/2026" como 2 de outubro.
 */
export interface TeacherActivityMetricRow {
  activityId: string
  title: string
  subject: string
  className: string
  deadline: string
  lateWindowDays: number
  deliveries: number
  approved: number
  rejected: number
  pending: number
  late: number
  donePct: number
}

/** Uma linha do ranking de pontos: um aluno dentro de uma turma. */
export interface TeacherRankingRow {
  studentName: string
  balance: number
  level: string
  streak: number
}

/**
 * Ranking agrupado por turma — a turma é a CHAVE do grupo, não um campo da
 * linha: um aluno em duas turmas do professor aparece nos dois grupos (o que o
 * `pointsReport`, chapado, resolve por `classIds[0]` e por isso não mostra).
 */
export interface TeacherRankingGroup {
  className: string
  course: string
  rows: TeacherRankingRow[]
}

/** Desempenho do professor (4.2): métricas por atividade + ranking por turma. */
export interface TeacherPerformanceReport {
  activities: TeacherActivityMetricRow[]
  ranking: TeacherRankingGroup[]
}

export interface RedeemResult {
  redemption: Redemption
  transaction: PointsTransaction
  balance: number
}

export interface ValidationInput {
  action: "approve" | "reject" | "revision"
  feedback: string
}

/**
 * Resposta de `POST /api/study-contents/:id/complete` (3.1): a conclusão, a
 * transação creditada e o saldo do servidor DEPOIS do crédito. O saldo vem
 * pronto — RN04: a tela mostra o que a API devolve, não recalcula (3.2).
 */
export interface StudyContentCompletionResult {
  completion: StudyContentCompletion
  transaction: PointsTransaction
  balance: number
}
