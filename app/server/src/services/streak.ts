import type { DatabaseSync } from "node:sqlite"
import { getDb } from "../db/connection"
import { nowBR } from "../lib/dates"
import { uuid } from "../lib/uuid"
import type { PointsTransaction, SafeUser, StreakMilestone } from "../shared/types"
import { STREAK_MILESTONES } from "../shared/types"
import { recordAudit } from "./audit"
import { insertNotification } from "./notifications"

export { STREAK_MILESTONES }
export type { StreakMilestone }

/**
 * Sequência de participação (RF07) — bônus de streak concedido na aprovação
 * de entrega.
 *
 * Estratégia (documentada):
 * - Sequência = dias de calendário CONSECUTIVOS com ao menos uma entrega
 *   aprovada (status `approved` e `validatedAt` preenchido), contando a data
 *   da aprovação corrente. Independe da atividade — basta UMA aprovação por
 *   dia (datas distintas, `DISTINCT substr(validatedAt,1,10)`).
 * - Marcos: 3→+10, 7→+20, 12→+40, 20→+80. Ao atingir um marco ainda não
 *   concedido, é emitida uma PointsTransaction `type: "streak"` com a
 *   descrição canônica do marco.
 * - NÃO-REPETIÇÃO: a própria transação `streak` com a descrição canônica do
 *   marco é a EVidência de concessão (uniqueness lógico). Antes de conceder,
 *   consultamos se já existe `type='streak' AND description = canônica` para
 *   o aluno; se existe, o marco é ignorado. Isso também reutiliza transações
 *   `streak` antigas do seed como prova irrevogável.
 * - Atomicidade: as funções de escrita assumem que o chamador está dentro de
 *   uma transação SQL (withTransaction), assim rollback reverte bônus, notificação
 *   e auditoria juntos.
 */

/** Próximo marco de streak acima da sequência atual; null quando todos foram atingidos. */
export function nextStreakMilestone(streak: number): StreakMilestone | null {
  return STREAK_MILESTONES.find((m) => m.days > streak) ?? null
}

/** Dias faltantes para o próximo marco; null quando a sequência já superou o último marco. */
export function daysToNextStreakMilestone(streak: number): number | null {
  const next = nextStreakMilestone(streak)
  return next ? next.days - streak : null
}

/** Descrição canônica do marco — chef que também serve de chave de unicidade. */
export function streakDescription(days: number): string {
  return `Bônus de sequência — ${days} dias seguidos`
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

/** Chave de dia calendário (local) em formato comparável "YYYY-MM-DD". */
export function brDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Zero-horário do dia local. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/** Converte "DD/MM/YYYY" (ou "DD/MM/YYYY HH:mm:ss") em Date local no zero-horário. */
export function parseBRDate(value: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(value.trim())
  if (!m) return null
  const [, d, mo, y] = m
  const date = new Date(Number(y), Number(mo) - 1, Number(d))
  return Number.isNaN(date.getTime()) ? null : date
}

/** Datas (dias) distintos com entrega aprovada do aluno. */
export function getApprovalDays(db: DatabaseSync, studentId: string): Date[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT substr(validatedAt, 1, 10) AS day
       FROM submissions
       WHERE studentId = ? AND status = 'approved' AND validatedAt IS NOT NULL`,
    )
    .all(studentId) as unknown as Array<{ day: string }>
  const days: Date[] = []
  for (const row of rows) {
    const day = parseBRDate(row.day)
    if (day) days.push(day)
  }
  return days
}

/**
 * Sequência atual do aluno: quantidade de dias de calendário consecutivos
 * (terminando em `today`) com aprovação distinta. Um dia sem aprovação quebra
 * a sequência.
 */
export function currentStreakDays(db: DatabaseSync, studentId: string, today: Date): number {
  const approved = new Set(getApprovalDays(db, studentId).map((d) => brDateKey(d)))
  const cursor = startOfDay(today)
  let streak = 0
  while (approved.has(brDateKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

/**
 * Maior marco alcançado pela sequência que AINDA não foi concedido ao aluno.
 * A existência de uma transação `type='streak'` com a descrição canônica exata
 * do marco é a prova de concessão (estratégia de não-duplicação).
 */
export function highestUnclaimedMilestone(
  db: DatabaseSync,
  studentId: string,
  streak: number,
): StreakMilestone | null {
  let best: StreakMilestone | null = null
  for (const milestone of STREAK_MILESTONES) {
    if (streak < milestone.days) continue
    const claimed = db
      .prepare(
        "SELECT 1 FROM transactions WHERE studentId = ? AND type = 'streak' AND description = ?",
      )
      .get(studentId, streakDescription(milestone.days))
    if (!claimed) best = milestone
  }
  return best
}

export interface StreakBonusResult {
  transaction: PointsTransaction
  notificationId: string
  auditId: string
}

/**
 * Insere a transação do marco de streak + notificação + auditoria STREAK_BONUS.
 * Deve ser chamado dentro de uma transação SQL (withTransaction) pelo chamador.
 */
export function grantStreakMilestone(
  milestone: StreakMilestone,
  studentName: string,
  studentId: string,
  validator: SafeUser,
): StreakBonusResult {
  const db = getDb()

  const transaction: PointsTransaction = {
    id: uuid(),
    studentId,
    amount: milestone.bonus,
    type: "streak",
    description: streakDescription(milestone.days),
    relatedActivityId: null,
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
    userId: studentId,
    title: "Bônus de sequência!",
    message: `Você atingiu ${milestone.days} dias seguidos de participação. +${milestone.bonus} pts 🔥`,
    type: "system",
  })

  const audit = recordAudit({
    userId: validator.id,
    action: "STREAK_BONUS",
    entity: "Transaction",
    entityId: transaction.id,
    description: `${validator.name} concedeu bônus de sequência de ${milestone.days} dias para ${studentName} (+${milestone.bonus} pts)`,
  })

  return { transaction, notificationId: notification.id, auditId: audit.id }
}