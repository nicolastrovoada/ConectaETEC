import type { DatabaseSync } from "node:sqlite"
import type {
  Activity,
  ActivityType,
  NotificationType,
  PointsTxType,
  RedemptionStatus,
  SubmissionStatus,
} from "../shared/types"
import { nowBR } from "../lib/dates"
import { uuid } from "../lib/uuid"
import { brDateInDays } from "./helpers"

/**
 * Fixtures locais de teste para o cenário de uso da API.
 *
 * A V3 semeia o banco **sem histórico** (nenhuma atividade, entrega, ponto,
 * notificação ou auditoria): a demonstração começa zerada, por decisão de
 * produto. Os testes de regra — saldo, validação, permissões, prazo, streak,
 * auditoria — continuam válidos, mas o dado que eles exercitam passou a ser
 * criado aqui, dentro do próprio teste, em vez de vir do seed.
 *
 * Estas funções escrevem direto no banco pelo mesmo caminho do seed: é
 * estado inicial, não uma forma de burlar a rota que está sendo testada. Tudo
 * que passa por HTTP continua passando por HTTP no teste.
 *
 * Um fixture que planta um estado que nenhuma rota aceitaria deixa de servir de
 * referência para o que é estado válido — por isso `createActivity` só aceita
 * quem a rota de criação aceitaria (mesmo `requireRoles`, mesmo OU de
 * `classIds`/`teacherIds`) e o resto vira recusa explícita. As unions de tipo
 * vêm de `shared/types`, não são redigitadas aqui.
 */

export interface ActivityFixture {
  id?: string
  title?: string
  description?: string
  /** Disciplina do seed (s1..s16). */
  subjectId?: string
  /**
   * Professor (u6/u7) ou funcionário (u8) responsável — define quem valida.
   * Omitido: o primeiro professor da turma, que é quem a rota de criação
   * aceitaria como autor. Informado, precisa ser alguém que a rota aceitaria
   * naquela turma (ver `resolveTeacher`).
   */
  teacherId?: string
  classId: string
  points?: number
  /** Prazo em DD/MM/AAAA; padrão = daqui a 7 dias. */
  deadline?: string
  type?: ActivityType
  status?: Activity["status"]
}

/** `teacherIds` da turma, como está no banco (JSON). */
function teacherIdsOf(db: DatabaseSync, classId: string): string[] {
  const row = db.prepare("SELECT teacherIds FROM classes WHERE id = ?").get(classId) as
    | { teacherIds: string }
    | undefined
  if (!row) throw new Error(`Fixture: turma ${classId} não existe — rode o seed antes das fixtures.`)
  return JSON.parse(row.teacherIds) as string[]
}

/** `classIds` do usuário, como está no banco (JSON). */
function classIdsOf(db: DatabaseSync, userId: string): string[] {
  const row = db.prepare("SELECT classIds FROM users WHERE id = ?").get(userId) as
    | { classIds: string }
    | undefined
  if (!row) throw new Error(`Fixture: usuário ${userId} não existe — rode o seed antes das fixtures.`)
  return JSON.parse(row.classIds) as string[]
}

function roleOf(db: DatabaseSync, userId: string): string {
  const row = db.prepare("SELECT role FROM users WHERE id = ?").get(userId) as { role: string } | undefined
  if (!row) throw new Error(`Fixture: usuário ${userId} não existe — rode o seed antes das fixtures.`)
  return row.role
}

/**
 * Quem pode ser o responsável pela atividade plantada — o MESMO critério de
 * `POST /api/activities` (`routes/activities.ts`), etapa por etapa:
 *
 * 1. `requireRoles("teacher", "staff")`: nenhum outro papel cria atividade.
 * 2. `staff` não passa pelo teste de turma (a rota só limita o **tipo** dele aos
 *    operacionais; essa parte o fixture não replica, para não carregar a lista de
 *    tipos da rota — os fixtures com staff usam tipo operacional).
 * 3. Professor: `creator.classIds` cobre a turma **ou** a turma o lista em
 *    `teacherIds`. O OU importa: é o que autoriza o Prof. Marcelo (u6) a criar
 *    atividade no 3º Ano A, onde ele não é `teacherIds` — a divergência C1 do
 *    seed, documentada em `db/seed.ts`. Como o fixture espelha o OU, ele recusa
 *    aqui exatamente o que a rota recusaria com 403 `TEACHER_NOT_IN_CLASS`, e o
 *    estado C1 continua plantável para quem precisar exercitá-lo.
 */
function resolveTeacher(db: DatabaseSync, classId: string, teacherId: string | undefined): string {
  const professores = teacherIdsOf(db, classId)
  if (teacherId === undefined) {
    const primeiro = professores[0]
    if (!primeiro) throw new Error(`Fixture: a turma ${classId} não tem professor em teacherIds.`)
    return primeiro
  }

  const papel = roleOf(db, teacherId)
  if (papel !== "teacher" && papel !== "staff") {
    throw new Error(
      `Fixture: ${teacherId} tem papel ${papel} e não pode criar atividade — a rota aceita ` +
        `apenas teacher e staff (requireRoles).`,
    )
  }
  if (papel === "staff") return teacherId

  const turmasDoProfessor = classIdsOf(db, teacherId)
  if (professores.includes(teacherId) || turmasDoProfessor.includes(classId)) return teacherId
  throw new Error(
    `Fixture: ${teacherId} não atua em ${classId} — não está em teacherIds da turma ` +
      `(${professores.join(", ") || "nenhum"}) nem tem ${classId} no classIds dele ` +
      `(${turmasDoProfessor.join(", ") || "nenhuma"}); a rota de criação recusaria com 403 TEACHER_NOT_IN_CLASS.`,
  )
}

/** Cria uma atividade e devolve o id. */
export function createActivity(db: DatabaseSync, fixture: ActivityFixture): string {
  const id = fixture.id ?? `fx-a-${uuid().slice(0, 8)}`
  const teacherId = resolveTeacher(db, fixture.classId, fixture.teacherId)
  db.prepare(
    `INSERT INTO activities (id, title, description, subjectId, teacherId, classId, points, deadline, type, status, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    fixture.title ?? `Atividade de teste ${id}`,
    fixture.description ?? "Atividade criada pelo fixture local de teste.",
    fixture.subjectId ?? "s1",
    teacherId,
    fixture.classId,
    fixture.points ?? 10,
    fixture.deadline ?? brDateInDays(7),
    fixture.type ?? "academic",
    fixture.status ?? "active",
    nowBR(),
  )
  return id
}

export interface SubmissionFixture {
  id?: string
  activityId: string
  studentId: string
  status: SubmissionStatus
  /** `DD/MM/AAAA HH:MM:SS` (o que o app grava); padrão = agora. */
  submittedAt?: string
  validatedBy?: string
  validatedAt?: string
  feedback?: string
}

/** Estados em que a entrega já passou por validação (RN03). */
const STATUS_VALIDADOS = new Set(["approved", "rejected", "revision_required"])

/** Cria uma entrega e devolve o id. `validatedBy`/`validatedAt` saem juntos. */
export function createSubmission(db: DatabaseSync, fixture: SubmissionFixture): string {
  const id = fixture.id ?? `fx-sub-${uuid().slice(0, 8)}`
  const validada = STATUS_VALIDADOS.has(fixture.status)
  db.prepare(
    `INSERT INTO submissions (id, activityId, studentId, submittedAt, status, evidence, comment, validatedBy, validatedAt, feedback)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    fixture.activityId,
    fixture.studentId,
    fixture.submittedAt ?? nowBR(),
    fixture.status,
    "Evidência do fixture de teste",
    "Comentário do fixture de teste",
    validada ? fixture.validatedBy ?? "u6" : null,
    validada ? fixture.validatedAt ?? nowBR() : null,
    fixture.feedback ?? "",
  )
  return id
}

export interface TransactionFixture {
  id?: string
  studentId: string
  amount: number
  type?: PointsTxType
  description?: string
  relatedActivityId?: string
  createdBy?: string
}

/**
 * Lança uma transação direto na tabela. Serve para dar saldo a um aluno sem
 * passar por uma entrega — quando o teste exercita outra regra e só precisa
 * de um saldo não zero para chegar nela.
 */
export function createTransaction(db: DatabaseSync, fixture: TransactionFixture): string {
  const id = fixture.id ?? `fx-tx-${uuid().slice(0, 8)}`
  db.prepare(
    `INSERT INTO transactions (id, studentId, amount, type, description, relatedActivityId, createdBy, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    fixture.studentId,
    fixture.amount,
    fixture.type ?? "bonus",
    fixture.description ?? "Crédito do fixture local de teste",
    fixture.relatedActivityId ?? null,
    fixture.createdBy ?? "u9",
    nowBR(),
  )
  return id
}

export interface NotificationFixture {
  id?: string
  userId: string
  title?: string
  message?: string
  type?: NotificationType
  read?: boolean
}

/** Cria uma notificação e devolve o id. */
export function createNotification(db: DatabaseSync, fixture: NotificationFixture): string {
  const id = fixture.id ?? `fx-n-${uuid().slice(0, 8)}`
  db.prepare(
    `INSERT INTO notifications (id, userId, title, message, type, read, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    fixture.userId,
    fixture.title ?? "Notificação de teste",
    fixture.message ?? "Mensagem do fixture local de teste.",
    fixture.type ?? "system",
    fixture.read ? 1 : 0,
    nowBR(),
  )
  return id
}

export interface RedemptionFixture {
  id?: string
  studentId: string
  /** Recompensa do seed (r1..r6) — `redemptions.rewardId` tem FK para ela. */
  rewardId: string
  rewardLabel?: string
  rewardIcon?: string
  points: number
  status?: RedemptionStatus
  redeemedAt?: string
  processedBy?: string
}

/** Cria um resgate e devolve o id (estado inicial para testes de RN04/saldo). */
export function createRedemption(db: DatabaseSync, fixture: RedemptionFixture): string {
  const id = fixture.id ?? `fx-rd-${uuid().slice(0, 8)}`
  db.prepare(
    `INSERT INTO redemptions (id, studentId, rewardId, rewardLabel, rewardIcon, points, status, redeemedAt, processedBy)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    fixture.studentId,
    fixture.rewardId,
    fixture.rewardLabel ?? "Recompensa do fixture local de teste",
    fixture.rewardIcon ?? "🎁",
    fixture.points,
    fixture.status ?? "processed",
    fixture.redeemedAt ?? nowBR(),
    fixture.processedBy ?? "u9",
  )
  return id
}

export interface AuditLogFixture {
  id?: string
  userId: string
  action: string
  entity?: string
  entityId?: string
  description?: string
}

/** Cria uma linha de auditoria e devolve o id. */
export function createAuditLog(db: DatabaseSync, fixture: AuditLogFixture): string {
  const id = fixture.id ?? `fx-al-${uuid().slice(0, 8)}`
  db.prepare(
    `INSERT INTO auditLogs (id, userId, action, entity, entityId, description, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    fixture.userId,
    fixture.action,
    fixture.entity ?? "Activity",
    fixture.entityId ?? "",
    fixture.description ?? "Ação do fixture local de teste",
    nowBR(),
  )
  return id
}
