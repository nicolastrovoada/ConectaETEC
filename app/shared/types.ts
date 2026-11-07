// Contrato compartilhado do Conecta ETEC — V3
// Compatível com os tipos do protótipo V1 (ver codigo.txt), evoluído por adição.

// ─── Enums ────────────────────────────────────────────────────────────────────

export type Role = "student" | "teacher" | "staff" | "coordinator"

export type ActivityType =
  | "academic"
  | "school_action"
  | "event"
  | "library"
  | "support"
  | "other"

export type SubmissionStatus =
  | "pending"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "revision_required"

export type PointsTxType =
  | "activity"
  | "bonus"
  | "streak"
  | "reward_redemption"
  | "manual_adjustment"
  | "study_content" // adição V3 — crédito único do reforço escolar (3.1)

export type NotificationType =
  | "activity_approved"
  | "activity_rejected"
  | "activity_revision"
  | "coord_notice"
  | "new_activity"
  | "reward"
  | "system"

export type RedemptionStatus = "pending" | "processed" | "cancelled"

export type ClassShift = "morning" | "afternoon" | "evening"

// ─── Entidades ────────────────────────────────────────────────────────────────

export interface User {
  id: string
  name: string
  email: string
  password: string // NUNCA retornado pela API
  role: Role
  active: boolean
  avatar: string
  classIds: string[] // aluno: 1 turma; professor: várias
  createdAt: string
}

export interface SafeUser extends Omit<User, "password"> {}

export interface Class {
  id: string
  name: string
  course: string
  year: number
  shift: ClassShift
  active: boolean
  studentIds: string[]
  teacherIds: string[]
}

export interface Subject {
  id: string
  name: string
  icon: string
  teacherIds: string[]
  classIds: string[]
}

export interface Activity {
  id: string
  title: string
  description: string
  subjectId: string
  teacherId: string
  classId: string
  points: number
  deadline: string // DD/MM/AAAA
  lateWindowDays: number // adição V3 — dias de tolerância após o prazo; 0 = sem tolerância
  type: ActivityType
  status: "draft" | "active" | "closed"
  createdAt: string
  deletedAt: string | null // adição V3 — soft delete: null = atividade visível
  deletedBy: string | null // adição V3 — id SEM FK, pode ficar órfão; não assuma que resolve
}

export interface Attachment {
  id: string
  filename: string // nome original
  storedName: string // nome único no storage
  mimeType: string
  size: number
  uploadedAt: string
}

export interface Submission {
  id: string
  activityId: string
  studentId: string
  submittedAt: string
  status: SubmissionStatus
  delayed: boolean // adição V3 — entregue dentro da janela de atraso (gravado no envio, não no prazo)
  evidence: string
  comment: string
  attachments: Attachment[] // adição V2 (upload local, imagens + PDF)
  validatedBy: string | null
  validatedAt: string | null
  feedback: string
}

export interface PointsTransaction {
  id: string
  studentId: string
  amount: number // + crédito / - débito
  type: PointsTxType
  description: string
  relatedActivityId: string | null
  createdBy: string
  createdAt: string
}

export interface Reward {
  id: string
  icon: string
  label: string
  points: number
  stock: number // 0 = esgotado
}

export interface Redemption {
  id: string
  studentId: string
  rewardId: string
  rewardLabel: string
  rewardIcon: string
  points: number
  status: RedemptionStatus
  redeemedAt: string
  processedBy: string | null
}

export interface Notification {
  id: string
  userId: string
  title: string
  message: string
  type: NotificationType
  read: boolean
  transient: boolean // adição V3 — true = some sozinha depois de aparecer; false = persistente
  /**
   * Atividade à qual a notificação se refere, ou `null` quando não há
   * referência (adição V3 3.3, coluna `relatedActivityId` da migration 007).
   *
   * É o que permite resolver a "correção solicitada" POR ATIVIDADE: sem esta
   * referência, a notificação do aluno não distingue acorreção pendente
   * daquela que ele acabou de cumprir das correções das outras atividades.
   */
  relatedActivityId: string | null
  createdAt: string
}

/**
 * Transitório ou persistente, por TIPO — fonte única de verdade (3.3).
 *
 * `true` = a notificação **some sozinha depois de aparecer**: ela avisa que
 * algo aconteceu (entregue, aprovada, resgatado, subiu de nível) e, lida,
 * não tem nada a continuar dizendo. `false` = ela **fica até ser lida ou
 * resolvida**: é uma obrigação do aluno (`activity_revision`), um compromisso
 * da escola (`new_activity`) ou um aviso institucional que não pode sumir
 * porque a tela estava fechada.
 *
 * Por que isto é um `Record<NotificationType, boolean>` e não um `if` em cada
 * `insertNotification`: são ~20 call sites (`points.ts`, `streak.ts`, rotas) e
 * uma divergência — marcar "Atividade aprovada" como persistente, digamos —
 * passa despercebida em revisão. Aqui não há como divergir: o `satisfies` é
 * EXAUSTIVO, então adicionar um `NotificationType` novo sem classificar aqui
 * **quebra o build** (`npm run typecheck`), não o comportamento em produção.
 * É o mesmo mecanismo que o projeto já usa em `PointsTxType` (CHECK no SQLite
 * gravado pela migration 002) e nos `Record<>` de label/corpo das telas.
 */
export const TRANSIENT_BY_TYPE = {
  activity_approved: true,
  activity_rejected: true,
  reward: true,
  system: true,
  new_activity: false,
  activity_revision: false,
  coord_notice: false,
} as const satisfies Record<NotificationType, boolean>

/** A notificação deste tipo some sozinha depois de aparecer? */
export function isTransientNotificationType(type: NotificationType): boolean {
  return TRANSIENT_BY_TYPE[type]
}

/** Os tipos de notificação, todos (derivado da tabela acima). */
const ALL_NOTIFICATION_TYPES = Object.keys(TRANSIENT_BY_TYPE) as NotificationType[]

/** Tipos que somem sozinhos depois de aparecer. */
export const TRANSIENT_TYPES: NotificationType[] = ALL_NOTIFICATION_TYPES.filter(isTransientNotificationType)

/** Tipos que ficam até o usuário ler ou a obrigação ser resolvida. */
export const PERSISTENT_TYPES: NotificationType[] = ALL_NOTIFICATION_TYPES.filter(
  (type) => !TRANSIENT_BY_TYPE[type],
)

export interface AuditLog {
  id: string
  userId: string
  action: string
  entity: string
  entityId: string
  description: string
  timestamp: string
}

export interface StudyContent {
  id: string
  subject: string
  topic: string
  icon: string
  color: string
  exercises: number
  description: string // adição V3 — resumo do reforço
  content: string // adição V3 — lição/aula
  teacherId: string | null // adição V3 — id SEM FK: o reforço sobrevive ao professor que saiu
  classIds: string[] // adição V3 — turmas destinatárias
  points: number // adição V3 — crédito único ao concluir o reforço
  questions: string[] // adição V3 — questões de verificação (JSON no SQLite)
  attachments: Attachment[] // adição V3 (3.1) — anexos do reforço (imagem/PDF); sempre presente, vazia quando não há
}

/**
 * R31 — o reforço como o ALUNO o lê: `completedAt` é o estado da conclusão DELE
 * (`null` = ainda não concluiu), lido de `study_content_completions` na mesma
 * consulta da listagem.
 *
 * É um tipo SEPARADO, e não um campo opcional em `StudyContent`, por dois motivos:
 * - o campo é OBRIGATÓRIO aqui, então o client do aluno não compila ignorando o
 *   estado (a tela precisa tratar `null` e a data);
 * - quem não conclui (professor, staff, coordenação) recebe `StudyContent`, e o
 *   campo é OMITIDO do payload. Trazer `null` para eles seria mentir: lido como
 *   "este reforço não foi concluído por ninguém", que é afirmação que a rota não
 *   pode fazer — para eles a pergunta nem se aplica.
 */
export interface StudentStudyContent extends StudyContent {
  completedAt: string | null
}

/** Conclusão do reforço escolar; o par (aluno, reforço) é único (UNIQUE no banco). */
export interface StudyContentCompletion {
  id: string
  studentId: string
  studyContentId: string
  completedAt: string
}

/** Aviso da coordenação: público amplo ou turmas específicas. */
export interface Notice {
  id: string
  title: string
  message: string
  audienceType: "all" | "classes"
  classIds: string[]
  createdBy: string
  createdAt: string
}

/**
 * O aviso como o QUADRO DA COORDENAÇÃO o lê: a mesma linha de `notices` mais o
 * nome de quem publicou.
 *
 * O nome vem do `LEFT JOIN users` no servidor e é `null` quando o autor não
 * resolve (usuário removido) — por isso `string | null` e não `string`. A tela
 * mostra o id nesse caso, como faz a lixeira de atividades (2.6): o quadro não
 * pode quebrar por causa de um id órfão.
 */
export interface CoordinatorNotice extends Notice {
  createdByName: string | null
}

/** Página do quadro de avisos — paginação server-side (o volume fica no servidor). */
export interface CoordinatorNoticePage {
  items: CoordinatorNotice[]
  total: number
  page: number
  pageSize: number
}

/** Público do aviso: toda a escola ou só as turmas indicadas. */
export type NoticeAudienceType = Notice["audienceType"]

export interface DB {
  users: User[]
  classes: Class[]
  subjects: Subject[]
  activities: Activity[]
  submissions: Submission[]
  transactions: PointsTransaction[]
  rewards: Reward[]
  redemptions: Redemption[]
  notifications: Notification[]
  auditLogs: AuditLog[]
  studyContents: StudyContent[]
  studyContentCompletions: StudyContentCompletion[]
  notices: Notice[]
}

// ─── Gamificação (helpers compartilhados) ─────────────────────────────────────

// Fonte de verdade do saldo é o servidor; este helper serve para exibição
// imediata quando o cliente já possui a lista de transações do usuário.
export function getBalance(studentId: string, transactions: PointsTransaction[]): number {
  return Math.max(
    0,
    transactions
      .filter((t) => t.studentId === studentId)
      .reduce((acc, t) => acc + t.amount, 0),
  )
}

export function levelLabel(pts: number): string {
  if (pts >= 500) return "🥇 Diamante"
  if (pts >= 300) return "🥇 Ouro"
  if (pts >= 100) return "🥈 Prata"
  return "🥉 Bronze"
}

export function nextLevelPts(pts: number): number {
  if (pts >= 500) return 800
  if (pts >= 300) return 500
  if (pts >= 100) return 300
  return 100
}

// Decisão de design (Frente 2): Diamante (>= 500) é o NÍVEL mais alto — não
// existe "próximo nível" a partir daí. O limiar 800 (retornado por
// nextLevelPts para >= 500) continua existindo apenas como META de progresso
// da barra dentro do Diamante, nunca como nível. `missingForNextLevel`
// resume isso: null = nível máximo (>= 500); caso contrário, os pontos que
// faltam para o próximo nível real (100/300/500).

/** Limiares das faixas na ordem: [Bronze, Prata, Ouro, Diamante, Meta]. */
export const LEVEL_THRESHOLDS: readonly [number, number, number, number, number] = [0, 100, 300, 500, 800]

export interface StreakMilestone {
  days: number
  bonus: number
}

/** Marcos da sequência de participação (RF07) — fonte única de verdade. */
export const STREAK_MILESTONES: readonly StreakMilestone[] = [
  { days: 3, bonus: 10 },
  { days: 7, bonus: 20 },
  { days: 12, bonus: 40 },
  { days: 20, bonus: 80 },
]

/** Próximo marco de streak acima da sequência atual; null quando todos foram atingidos. */
export function nextStreakMilestone(streak: number): StreakMilestone | null {
  return STREAK_MILESTONES.find((m) => m.days > streak) ?? null
}

/** Pontos faltantes para o próximo nível real; null quando já é Diamante (>= 500). */
export function missingForNextLevel(balance: number): number | null {
  if (balance >= 500) return null
  return Math.max(0, nextLevelPts(balance) - balance)
}

export interface LevelGoal {
  next: number // limiar exibível (próximo nível real ou meta 800)
  missing: number | null // pontos faltantes; null = topo atingido (>= 800)
  kind: "level" | "milestone" | "max"
}

/** Meta única para as telas: nível (abaixo de Diamante) ou meta de progresso (Diamante). */
export function nextLevelGoal(balance: number): LevelGoal {
  if (balance >= 800) return { next: 800, missing: null, kind: "max" }
  if (balance >= 500) return { next: 800, missing: 800 - balance, kind: "milestone" }
  const next = nextLevelPts(balance)
  return { next, missing: next - balance, kind: "level" }
}

/** Progresso (%) dentro da faixa atual usando os limiares oficiais (800 = 100%). */
export function levelProgress(pts: number): number {
  const nextIdx = LEVEL_THRESHOLDS.findIndex((t) => pts < t)
  if (nextIdx === -1) return 100
  const base = LEVEL_THRESHOLDS[nextIdx - 1]
  const next = LEVEL_THRESHOLDS[nextIdx]
  return Math.min(100, Math.round(((pts - base) / (next - base)) * 100))
}

// ─── Labels / cores (mapas consumidos pela UI) ───────────────────────────────

export const ROLE_LABELS: Record<Role, string> = {
  student: "Aluno",
  teacher: "Professor",
  staff: "Funcionário",
  coordinator: "Coordenação",
}

export const ROLE_ICONS: Record<Role, string> = {
  student: "🎓",
  teacher: "👨‍🏫",
  staff: "🏫",
  coordinator: "📊",
}

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  academic: "Pedagógica",
  school_action: "Ação Escolar",
  event: "Evento",
  library: "Biblioteca",
  support: "Suporte",
  other: "Outro",
}

export const ACTIVITY_TYPE_COLORS: Record<ActivityType, string> = {
  academic: "bg-purple-100 text-purple-700",
  school_action: "bg-green-100 text-green-700",
  event: "bg-orange-100 text-orange-700",
  library: "bg-cyan-100 text-cyan-700",
  support: "bg-blue-100 text-blue-700",
  other: "bg-gray-100 text-gray-600",
}

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  pending: "Pendente",
  submitted: "Enviada",
  under_review: "Em análise",
  approved: "Aprovada",
  rejected: "Reprovada",
  revision_required: "Correção solicitada",
}

export const SUBMISSION_STATUS_COLORS: Record<SubmissionStatus, string> = {
  pending: "bg-gray-100 text-gray-600",
  submitted: "bg-blue-100 text-blue-700",
  under_review: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  revision_required: "bg-orange-100 text-orange-700",
}

// ─── Minha turma (4.3) ──────────────────────────────────────────────────────────

/**
 * Um aluno da turma no detalhe do professor.
 *
 * `level` é RÓTULO pronto (`levelLabel`): o servidor deriva do saldo e o client
 * mostra o que veio — recalcular no cliente seria duplicar a regra (RN04).
 * `approved` = entregas aprovadas cujas atividades são DESTA turma e não estão
 * soft-deleted (R3). `streak` em dias, com "hoje" em São Paulo (R13).
 */
export type ClassDetailStudent = {
  id: string
  name: string
  email: string
  balance: number
  level: string
  streak: number
  approved: number
}

/**
 * Pontuação média por aluno da turma NA MATÉRIA (R5) — e NÃO o saldo: só entram
 * as transações ligadas por `relatedActivityId` a uma atividade da turma, então
 * bônus, ajuste, resgate, sequência e reforço não contam aqui.
 */
export type ClassDetailSubject = {
  name: string
  avg: number
}

export type ClassDetail = {
  class: Class
  students: ClassDetailStudent[]
  subjects: ClassDetailSubject[]
  /** Derivado da MESMA lista `students` — os três campos não podem discordar entre si (R4). */
  stats: { students: number; avgBalance: number; total: number }
}

// ─── Contratos de API (respostas padronizadas) ───────────────────────────────

export type ApiError = {
  error: string
  details?: string
}

export type ApiResult<T> =
  | { data: T; error?: never }
  | { data?: never; error: string }