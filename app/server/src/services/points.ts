import type { DatabaseSync } from "node:sqlite"
import { getDb } from "../db/connection"
import { findUserById, sumTransactions } from "../db/queries"
import { mapTransaction, type TransactionRow } from "../db/rows"
import { nowBR, todayBR } from "../lib/dates"
import { conflict, unprocessable } from "../lib/errors"
import { uuid } from "../lib/uuid"
import type { Activity, PointsTransaction, Redemption, Reward, SafeUser, Submission } from "../shared/types"
import { levelLabel } from "../shared/types"
import { recordAudit } from "./audit"
import { insertNotification } from "./notifications"
import { currentStreakDays, grantStreakMilestone, highestUnclaimedMilestone, parseBRDate } from "./streak"

/**
 * Gamificação (RN04/RN05) — saldo sempre DERIVADO da soma das transações.
 * As operações compostas (aprovação, resgate, ajuste) são executadas dentro
 * de transação SQL no chamador (rotas), garantindo atomicidade.
 */

/** Limite de sanidade para bônus da coordenação (Frente 2 — item 2.7). */
export const BONUS_MAX_PER_TX = 500
export const BONUS_MAX_DAILY = 500

/**
 * RF07 — crédito que atravessa faixa de nível (Bronze→Prata→Ouro→Diamante):
 * notificação de celebração + auditoria LEVEL_UP. Chamado dentro da transação
 * SQL do chamador, SEMPRE após as transações de pontos já terem sido gravadas
 * (o saldo atual é lido na mesma transação).
 *
 * Exportada porque a conclusão do reforço (3.1) é o quarto caminho de crédito
 * do servidor e credita dentro da própria transação: sem a mesma função, cruzar
 * a faixa por reforço não gerava LEVEL_UP — e é o único caminho em que quem
 * credita é o próprio aluno.
 */
export function celebrateLevelUp(
  db: DatabaseSync,
  studentId: string,
  studentName: string,
  balanceBefore: number,
  actor: SafeUser,
  entityId: string,
): void {
  const levelBefore = levelLabel(balanceBefore)
  const levelAfter = levelLabel(getBalance(studentId, db))
  if (levelBefore === levelAfter) return
  insertNotification({
    userId: studentId,
    title: `Parabéns! Você subiu para ${levelAfter}`,
    message: `Você acabou de alcançar o nível ${levelAfter}. Continue assim! 🎉`,
    type: "system",
  })
  recordAudit({
    userId: actor.id,
    action: "LEVEL_UP",
    entity: "Transaction",
    entityId,
    description: `${studentName} subiu de nível: ${levelBefore} → ${levelAfter}`,
  })
}

/**
 * Saldo derivado da soma das transações (RN04).
 * `db` é o parâmetro da conexão corrente: dentro de uma transação SQL aberta
 * pelo chamador, a soma lê o estado já atualizado na MESMA transação (nunca um
 * snapshot anterior de outra conexão).
 */
export function getBalance(userId: string, db: DatabaseSync = getDb()): number {
  return Math.max(0, sumTransactions(db, userId))
}

function requireUserOrThrow(db: DatabaseSync, userId: string) {
  const user = findUserById(db, userId)
  if (!user) throw unprocessable("Aluno não encontrado.", "STUDENT_NOT_FOUND")
  return user
}

export interface CreditResult {
  transaction: PointsTransaction
  notificationId: string
  auditId: string
  streakBonus: PointsTransaction | null
  streakNotificationId: string | null
  streakAuditId: string | null
}

/**
 * RN05 — aprovação de entrega:
 * 1. PointsTransaction de crédito (type "activity", amount = `pointsToCredit`)
 * 2. Notificação ao aluno
 * 3. AuditLog SUBMISSION_APPROVED
 * 4. RF07 — se a sequência diária atingir um marco ainda não concedido,
 *    transação extra type "streak" + notificação + audit STREAK_BONUS.
 * Chamado dentro de transação SQL pelo validador; `validatedAt` é a data de
 * aprovação gravada no UPDATE (base do cálculo de sequência).
 *
 * `pointsToCredit` é o valor EFFECTIVAMENTE creditado: quando o chamador omite,
 * vale `activity.points` (caminho de sempre). Existe para a entrega atrasada, que
 * vale meia pontuação (Tarefa 2.2) — crédito, notificação e auditoria refletem
 * sempre o valor creditado. Sequence e level-up (RF07) seguem como estavam: não
 * têm nada a ver com o valor desta aprovação. Se informado, o valor tem de ser
 * inteiro positivo (422 `INVALID_AMOUNT`): nada de crédito negativo ou `NaN`.
 */
export function creditForApproval(
  activity: Activity,
  submission: Submission,
  validator: SafeUser,
  validatedAt: string,
  pointsToCredit?: number,
): CreditResult {
  const db = getDb()
  if (!Number.isInteger(activity.points) || activity.points <= 0) {
    throw unprocessable("Atividade sem pontuação válida para aprovação.", "INVALID_ACTIVITY_POINTS")
  }
  // Mesmo raciocínio do `grantBonus` para o valor que o chamador manda creditar:
  // sem esta trava, um `0`/negativo/NaN passaria pelo `??` e viraria uma
  // transação de crédito corrompida (RN04). Só o 5º argumento é validado — o
  // guard de `activity.points` acima se comporta como antes.
  if (pointsToCredit !== undefined && (!Number.isInteger(pointsToCredit) || pointsToCredit <= 0)) {
    throw unprocessable("Pontuação a creditar deve ser um inteiro positivo.", "INVALID_AMOUNT")
  }
  // Ponto único de decisão: o que o chamador não informar, é a pontuação da atividade.
  const creditedPoints = pointsToCredit ?? activity.points
  const student = requireUserOrThrow(db, submission.studentId)
  const balanceBefore = getBalance(submission.studentId, db)

  const transaction: PointsTransaction = {
    id: uuid(),
    studentId: submission.studentId,
    amount: creditedPoints,
    type: "activity",
    description: `Atividade aprovada: ${activity.title}`,
    relatedActivityId: activity.id,
    createdBy: validator.id,
    createdAt: nowBR(),
  }
  db.prepare(
    `INSERT INTO transactions (id, studentId, amount, type, description, relatedActivityId, createdBy, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    transaction.id,
    transaction.studentId,
    transaction.amount,
    transaction.type,
    transaction.description,
    transaction.relatedActivityId,
    transaction.createdBy,
    transaction.createdAt,
  )

  const notification = insertNotification({
    userId: student.id,
    title: "Atividade aprovada! 🎉",
    message: `Sua entrega de '${activity.title}' foi aprovada. +${creditedPoints} pts 🎉`,
    type: "activity_approved",
  })

  const audit = recordAudit({
    userId: validator.id,
    action: "SUBMISSION_APPROVED",
    entity: "Submission",
    entityId: submission.id,
    // A auditoria guarda o valor creditado e o fato de a entrega ter sido feita
    // em atraso (2.2) — é o rastro de por que o valor não é o da atividade.
    description:
      `${validator.name} aprovou atividade '${activity.title}' de ${student.name} ` +
      `(+${creditedPoints} pts${submission.delayed ? ", entregue em atraso" : ""})`,
  })

  // RF07 — bônus de sequência (dias consecutivos com aprovação distinta).
  let streakBonus: PointsTransaction | null = null
  let streakNotificationId: string | null = null
  let streakAuditId: string | null = null
  const approvedDay = parseBRDate(validatedAt)
  if (approvedDay) {
    const streak = currentStreakDays(db, submission.studentId, approvedDay)
    const milestone = highestUnclaimedMilestone(db, submission.studentId, streak)
    if (milestone) {
      const bonus = grantStreakMilestone(milestone, student.name, student.id, validator)
      streakBonus = bonus.transaction
      streakNotificationId = bonus.notificationId
      streakAuditId = bonus.auditId
    }
  }

  // RF07 — atravessou faixa de nível com esta aprovação? (saldo lido na mesma tx)
  celebrateLevelUp(db, submission.studentId, student.name, balanceBefore, validator, transaction.id)

  return {
    transaction,
    notificationId: notification.id,
    auditId: audit.id,
    streakBonus,
    streakNotificationId,
    streakAuditId,
  }
}

export interface GrantBonusInput {
  studentId: string
  amount: number
  description: string
}

/** Bônus pela coordenação (type "bonus") + notificação + auditoria POINTS_ADJUSTED. */
export function grantBonus(input: GrantBonusInput, coordinator: SafeUser): PointsTransaction {
  const db = getDb()
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw unprocessable("Valor do bônus deve ser um inteiro positivo.", "INVALID_AMOUNT")
  }
  if (!input.description.trim()) {
    throw unprocessable("Descrição obrigatória para conceder bônus.", "DESCRIPTION_REQUIRED")
  }
  const student = requireUserOrThrow(db, input.studentId)
  const balanceBefore = getBalance(input.studentId, db)

  // Frente 2 (item 2.7) — teto de sanidade por bônus e por dia (fuso SP).
  if (input.amount > BONUS_MAX_PER_TX) {
    throw unprocessable(
      `Bônus acima do limite de ${BONUS_MAX_PER_TX} pts por transação.`,
      "BONUS_LIMIT_EXCEEDED",
    )
  }
  const today = todayBR()
  const dayRow = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
       WHERE studentId = ? AND type = 'bonus' AND substr(createdAt, 1, 10) = ?`,
    )
    .get(input.studentId, today) as { total: number }
  if (Number(dayRow.total) + input.amount > BONUS_MAX_DAILY) {
    throw unprocessable(
      `Teto diário de bônus atingido: ${student.name} já recebeu ${Number(dayRow.total)} pts hoje (máx. ${BONUS_MAX_DAILY} pts/dia).`,
      "BONUS_DAILY_LIMIT_EXCEEDED",
    )
  }

  const transaction: PointsTransaction = {
    id: uuid(),
    studentId: input.studentId,
    amount: input.amount,
    type: "bonus",
    description: input.description.trim(),
    relatedActivityId: null,
    createdBy: coordinator.id,
    createdAt: nowBR(),
  }
  db.prepare(
    `INSERT INTO transactions (id, studentId, amount, type, description, relatedActivityId, createdBy, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    transaction.id,
    transaction.studentId,
    transaction.amount,
    transaction.type,
    transaction.description,
    transaction.relatedActivityId,
    transaction.createdBy,
    transaction.createdAt,
  )

  insertNotification({
    userId: student.id,
    title: "Bônus de pontos recebido! 🎉",
    message: `Coordenação concedeu +${input.amount} pts: ${input.description.trim()}`,
    type: "system",
  })

  recordAudit({
    userId: coordinator.id,
    action: "POINTS_ADJUSTED",
    entity: "Transaction",
    entityId: transaction.id,
    description: `Coordenação ajustou +${input.amount} pts para ${student.name}: ${input.description.trim()}`,
  })

  // RF07 — bônus que atravessa faixa de nível gera celebração (2.2).
  celebrateLevelUp(db, input.studentId, student.name, balanceBefore, coordinator, transaction.id)

  return transaction
}

export interface AdjustPointsInput {
  studentId: string
  amount: number
  description: string
}

/** Ajuste manual pela coordenação; saldo nunca fica negativo (RN04). */
export function adjustPoints(input: AdjustPointsInput, coordinator: SafeUser): PointsTransaction {
  const db = getDb()
  if (!Number.isInteger(input.amount) || input.amount === 0) {
    throw unprocessable("Valor do ajuste deve ser um inteiro diferente de zero.", "INVALID_AMOUNT")
  }
  if (!input.description.trim()) {
    throw unprocessable("Descrição obrigatória para ajuste de pontos.", "DESCRIPTION_REQUIRED")
  }
  const student = requireUserOrThrow(db, input.studentId)

  // RN04 — o saldo é lido na conexão corrente (a transação já aberta pelo
  // chamador, se houver), nunca de um snapshot externo.
  const balanceBefore = getBalance(input.studentId, db)
  if (balanceBefore + input.amount < 0) {
    throw unprocessable(
      `Saldo insuficiente: aluno possui ${balanceBefore} pts e o ajuste é de ${input.amount} pts.`,
      "NEGATIVE_BALANCE",
    )
  }

  const transaction: PointsTransaction = {
    id: uuid(),
    studentId: input.studentId,
    amount: input.amount,
    type: "manual_adjustment",
    description: input.description.trim(),
    relatedActivityId: null,
    createdBy: coordinator.id,
    createdAt: nowBR(),
  }
  db.prepare(
    `INSERT INTO transactions (id, studentId, amount, type, description, relatedActivityId, createdBy, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    transaction.id,
    transaction.studentId,
    transaction.amount,
    transaction.type,
    transaction.description,
    transaction.relatedActivityId,
    transaction.createdBy,
    transaction.createdAt,
  )

  recordAudit({
    userId: coordinator.id,
    action: "POINTS_ADJUSTED",
    entity: "Transaction",
    entityId: transaction.id,
    description: `Coordenação ajustou ${input.amount > 0 ? "+" : ""}${input.amount} pts para ${student.name}: ${input.description.trim()}`,
  })

  // RF07 — ajuste POSITIVO que atravessa faixa de nível gera celebração (2.2).
  // Ajustes negativos (nível abaixo) não geram notificação de subida.
  if (input.amount > 0) {
    celebrateLevelUp(db, input.studentId, student.name, balanceBefore, coordinator, transaction.id)
  }

  return transaction
}

export interface RedeemResult {
  redemption: Redemption
  transaction: PointsTransaction
  balance: number
}

/**
 * RN04/RN08 — resgate de recompensa:
 * - valida saldo >= custo e estoque > 0
 * - cria Redemption pending + decrementa stock
 * - cria transação negativa (reward_redemption)
 * - notificação + auditoria REWARD_REDEEMED
 * Se qualquer regra falhar, a transação SQL é revertida (nenhum efeito parcial).
 */
export function redeem(reward: Reward, studentId: string): RedeemResult {
  const db = getDb()
  const student = requireUserOrThrow(db, studentId)
  const balance = getBalance(studentId, db)

  if (reward.stock <= 0) {
    throw unprocessable("Recompensa esgotada.", "REWARD_OUT_OF_STOCK")
  }
  if (balance < reward.points) {
    throw unprocessable(
      `Saldo insuficiente: você tem ${balance} pts e o resgate custa ${reward.points} pts.`,
      "INSUFFICIENT_BALANCE",
    )
  }

  const now = nowBR()
  const redemption: Redemption = {
    id: uuid(),
    studentId,
    rewardId: reward.id,
    rewardLabel: reward.label,
    rewardIcon: reward.icon,
    points: reward.points,
    status: "pending",
    redeemedAt: now,
    processedBy: null,
  }
  db.prepare(
    `INSERT INTO redemptions (id, studentId, rewardId, rewardLabel, rewardIcon, points, status, redeemedAt, processedBy)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    redemption.id,
    redemption.studentId,
    redemption.rewardId,
    redemption.rewardLabel,
    redemption.rewardIcon,
    redemption.points,
    redemption.status,
    redemption.redeemedAt,
    redemption.processedBy,
  )

  // Frente 2 (item 2.5) — decremento ATÔMICO: a condição `stock > 0` no WHERE
  // protege contra corrida multi-processo (o snapshot `reward` acima pode estar
  // defasado). changes === 0 significa estoque zerado por outra requisição.
  const stockResult = db
    .prepare("UPDATE rewards SET stock = stock - 1 WHERE id = ? AND stock > 0")
    .run(reward.id)
  if (Number(stockResult.changes) !== 1) {
    throw conflict("Recompensa esgotada.", "REWARD_OUT_OF_STOCK")
  }

  const transaction: PointsTransaction = {
    id: uuid(),
    studentId,
    amount: -reward.points,
    type: "reward_redemption",
    description: `Resgate: ${reward.label}`,
    relatedActivityId: null,
    createdBy: studentId,
    createdAt: now,
  }
  db.prepare(
    `INSERT INTO transactions (id, studentId, amount, type, description, relatedActivityId, createdBy, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    transaction.id,
    transaction.studentId,
    transaction.amount,
    transaction.type,
    transaction.description,
    transaction.relatedActivityId,
    transaction.createdBy,
    transaction.createdAt,
  )

  insertNotification({
    userId: studentId,
    title: "Recompensa resgatada!",
    message: `Você resgatou "${reward.label}" (-${reward.points} pts). Retire na coordenação.`,
    type: "reward",
  })

  recordAudit({
    userId: studentId,
    action: "REWARD_REDEEMED",
    entity: "Redemption",
    entityId: redemption.id,
    description: `${student.name} resgatou "${reward.label}" (-${reward.points} pts)`,
  })

  return { redemption, transaction, balance: balance - reward.points }
}

export function listTransactionsByStudent(studentId: string): PointsTransaction[] {
  const db = getDb()
  const rows = db
    .prepare("SELECT * FROM transactions WHERE studentId = ? ORDER BY rowid DESC")
    .all(studentId) as unknown as TransactionRow[]
  return rows.map(mapTransaction)
}

export function listAllTransactions(): PointsTransaction[] {
  const db = getDb()
  const rows = db
    .prepare("SELECT * FROM transactions ORDER BY rowid DESC")
    .all() as unknown as TransactionRow[]
  return rows.map(mapTransaction)
}