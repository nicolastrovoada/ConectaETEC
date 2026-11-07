import type {
  Activity,
  ActivityType,
  Attachment,
  AuditLog,
  Class,
  ClassShift,
  CoordinatorNotice,
  Notice,
  Notification,
  NotificationType,
  PointsTransaction,
  PointsTxType,
  Redemption,
  Reward,
  Role,
  SafeUser,
  StudyContent,
  Submission,
  SubmissionStatus,
  Subject,
  User,
} from "../shared/types"

/**
 * Mappers entre linhas do SQLite (tipos brutos) e entidades do contrato
 * compartilhado. Nunca expõem password em respostas (use mapSafeUser).
 */

export interface UserRow {
  id: string
  name: string
  email: string
  password: string
  role: string
  active: number
  avatar: string
  classIds: string
  createdAt: string
}

export interface ClassRow {
  id: string
  name: string
  course: string
  year: number
  shift: string
  active: number
  studentIds: string
  teacherIds: string
}

export interface SubjectRow {
  id: string
  name: string
  icon: string
  teacherIds: string
  classIds: string
}

export interface ActivityRow {
  id: string
  title: string
  description: string
  subjectId: string
  teacherId: string
  classId: string
  points: number
  deadline: string
  lateWindowDays: number
  type: string
  status: string
  createdAt: string
  deletedAt: string | null
  deletedBy: string | null
}

export interface SubmissionRow {
  id: string
  activityId: string
  studentId: string
  submittedAt: string
  status: string
  delayed: number
  evidence: string
  comment: string
  validatedBy: string | null
  validatedAt: string | null
  feedback: string
}

/**
 * Colunas de anexo compartilhadas por `attachments` (entrega) e
 * `study_content_attachments` (reforço, 3.1). As duas tabelas guardam o mesmo
 * arquivo do mesmo jeito — muda só a coluna que aponta para o dono. Por isso o
 * mapper recebe a forma base e cada linha acresenta o seu id de dono.
 */
export interface AttachmentData {
  id: string
  filename: string
  storedName: string
  mimeType: string
  size: number
  uploadedAt: string
}

export interface AttachmentRow extends AttachmentData {
  submissionId: string
}

export interface StudyContentAttachmentRow extends AttachmentData {
  studyContentId: string
}

export interface TransactionRow {
  id: string
  studentId: string
  amount: number
  type: string
  description: string
  relatedActivityId: string | null
  createdBy: string
  createdAt: string
}

export interface RewardRow {
  id: string
  icon: string
  label: string
  points: number
  stock: number
}

export interface RedemptionRow {
  id: string
  studentId: string
  rewardId: string
  rewardLabel: string
  rewardIcon: string
  points: number
  status: string
  redeemedAt: string
  processedBy: string | null
}

export interface NotificationRow {
  id: string
  userId: string
  title: string
  message: string
  type: string
  read: number
  transient: number
  relatedActivityId: string | null
  createdAt: string
}

export interface AuditLogRow {
  id: string
  userId: string
  action: string
  entity: string
  entityId: string
  description: string
  timestamp: string
}

export interface StudyContentRow {
  id: string
  subject: string
  topic: string
  icon: string
  color: string
  exercises: number
  description: string
  content: string
  teacherId: string | null
  classIds: string
  points: number
  questions: string
}

export interface NoticeRow {
  id: string
  title: string
  message: string
  audienceType: string
  classIds: string
  createdBy: string
  createdAt: string
}

function parseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : []
  } catch {
    return []
  }
}

export function mapSafeUser(row: UserRow): SafeUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as Role,
    active: row.active === 1,
    avatar: row.avatar,
    classIds: parseStringArray(row.classIds),
    createdAt: row.createdAt,
  }
}

export function mapUser(row: UserRow): User {
  return { ...mapSafeUser(row), password: row.password }
}

/** Converte uma entidade User de volta para o formato de linha do SQLite. */
export function userToRow(user: User): UserRow {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    password: user.password,
    role: user.role,
    active: user.active ? 1 : 0,
    avatar: user.avatar,
    classIds: JSON.stringify(user.classIds),
    createdAt: user.createdAt,
  }
}

export function mapClass(row: ClassRow): Class {
  return {
    id: row.id,
    name: row.name,
    course: row.course,
    year: row.year,
    shift: row.shift as ClassShift,
    active: row.active === 1,
    studentIds: parseStringArray(row.studentIds),
    teacherIds: parseStringArray(row.teacherIds),
  }
}

export function mapSubject(row: SubjectRow): Subject {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    teacherIds: parseStringArray(row.teacherIds),
    classIds: parseStringArray(row.classIds),
  }
}

export function mapActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    subjectId: row.subjectId,
    teacherId: row.teacherId,
    classId: row.classId,
    points: row.points,
    deadline: row.deadline,
    lateWindowDays: row.lateWindowDays,
    type: row.type as ActivityType,
    status: row.status as Activity["status"],
    createdAt: row.createdAt,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
  }
}

export function mapAttachment(row: AttachmentData): Attachment {
  return {
    id: row.id,
    filename: row.filename,
    storedName: row.storedName,
    mimeType: row.mimeType,
    size: row.size,
    uploadedAt: row.uploadedAt,
  }
}

export function mapSubmission(row: SubmissionRow, attachments: Attachment[]): Submission {
  return {
    id: row.id,
    activityId: row.activityId,
    studentId: row.studentId,
    submittedAt: row.submittedAt,
    status: row.status as SubmissionStatus,
    delayed: row.delayed === 1,
    evidence: row.evidence,
    comment: row.comment,
    attachments,
    validatedBy: row.validatedBy,
    validatedAt: row.validatedAt,
    feedback: row.feedback,
  }
}

export function mapTransaction(row: TransactionRow): PointsTransaction {
  return {
    id: row.id,
    studentId: row.studentId,
    amount: row.amount,
    type: row.type as PointsTxType,
    description: row.description,
    relatedActivityId: row.relatedActivityId,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  }
}

export function mapReward(row: RewardRow): Reward {
  return {
    id: row.id,
    icon: row.icon,
    label: row.label,
    points: row.points,
    stock: row.stock,
  }
}

export function mapRedemption(row: RedemptionRow): Redemption {
  return {
    id: row.id,
    studentId: row.studentId,
    rewardId: row.rewardId,
    rewardLabel: row.rewardLabel,
    rewardIcon: row.rewardIcon,
    points: row.points,
    status: row.status as Redemption["status"],
    redeemedAt: row.redeemedAt,
    processedBy: row.processedBy,
  }
}

export function mapNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    message: row.message,
    type: row.type as NotificationType,
    read: row.read === 1,
    transient: row.transient === 1,
    relatedActivityId: row.relatedActivityId ?? null,
    createdAt: row.createdAt,
  }
}

export function mapAuditLog(row: AuditLogRow): AuditLog {
  return {
    id: row.id,
    userId: row.userId,
    action: row.action,
    entity: row.entity,
    entityId: row.entityId,
    description: row.description,
    timestamp: row.timestamp,
  }
}

/**
 * O segundo argumento é OBRIGATÓRIO de propósito: `attachments` faz parte do
 * contrato de `StudyContent` e vem sempre preenchida (vazia quando o reforço não
 * tem anexo). Deixar o parâmetro opcional permitiria a rota esquecer a carga e
 * devolver um reforço sem o campo; com ele obrigatório, quem mapeia é obrigado a
 * dizer de onde veio a lista (`queries.listAttachmentsForStudyContents` ou `[]`).
 */
export function mapStudyContent(row: StudyContentRow, attachments: Attachment[]): StudyContent {
  return {
    id: row.id,
    subject: row.subject,
    topic: row.topic,
    icon: row.icon,
    color: row.color,
    exercises: row.exercises,
    description: row.description,
    content: row.content,
    teacherId: row.teacherId,
    classIds: parseStringArray(row.classIds),
    points: row.points,
    questions: parseStringArray(row.questions),
    attachments,
  }
}

/**
 * Aviso da coordenação (3.5) como o QUADRO da coordenação lê: a linha de
 * `notices` mais o nome do autor que vem do `LEFT JOIN users`.
 *
 * `createdByName` é `string | null` porque o autor pode não resolver (usuário
 * removido) ou estar inativo (o filtro `u.active = 1` fica no `ON` do join, em
 * `services/notices.ts`): o aviso continua legível e o id do autor fica no lugar
 * do nome. A mesma convenção da lixeira de atividades (2.6).
 */
export function mapNotice(row: NoticeRow & { createdByName: string | null }): CoordinatorNotice {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    audienceType: row.audienceType as Notice["audienceType"],
    classIds: parseStringArray(row.classIds),
    createdBy: row.createdBy,
    createdByName: row.createdByName,
    createdAt: row.createdAt,
  }
}
