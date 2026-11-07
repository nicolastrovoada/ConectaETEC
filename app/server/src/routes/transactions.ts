import { Router } from "express"
import { z } from "zod"
import { requireAuth, requireRoles, requireUser } from "../auth/middleware"
import { getDb } from "../db/connection"
import { findUserById } from "../db/queries"
import { mapTransaction, type TransactionRow } from "../db/rows"
import { withTransaction } from "../db/transaction"
import { notFound, unprocessable } from "../lib/errors"
import { handle, sendData } from "../lib/http"
import { adjustPoints, grantBonus, listTransactionsByStudent } from "../services/points"

const bonusSchema = z.object({
  studentId: z.string().min(1, "Aluno obrigatório."),
  // Sem `.positive()` aqui: a RN de bônus (inteiro > 0) é validada em
  // grantBonus e responde 422 (unprocessable), como as demais regras de saldo.
  amount: z.number().int("Bônus deve ser inteiro."),
  description: z.string().trim().min(1, "Justificativa obrigatória."),
}).strict()

const adjustSchema = z.object({
  studentId: z.string().min(1, "Aluno obrigatório."),
  amount: z.number().int("Ajuste deve ser inteiro.").refine((v) => v !== 0, "Ajuste deve ser diferente de zero."),
  description: z.string().trim().min(3, "Descrição deve ter ao menos 3 caracteres."),
}).strict()

export const transactionsRouter = Router()

transactionsRouter.get(
  "/",
  requireAuth,
  handle((req, res) => {
    const user = requireUser(res)
    const db = getDb()
    const studentIdFilter = typeof req.query.studentId === "string" ? req.query.studentId : undefined
    const typeFilter = typeof req.query.type === "string" ? req.query.type : undefined

    let transactions
    if (user.role === "coordinator") {
      let rows = db
        .prepare("SELECT * FROM transactions ORDER BY rowid DESC")
        .all() as unknown as TransactionRow[]
      if (studentIdFilter) rows = rows.filter((r) => r.studentId === studentIdFilter)
      if (typeFilter) rows = rows.filter((r) => r.type === typeFilter)
      transactions = rows.map(mapTransaction)
    } else {
      let list = listTransactionsByStudent(user.id)
      if (typeFilter) list = list.filter((t) => t.type === typeFilter)
      transactions = list
    }
    sendData(res, 200, transactions)
  }),
)

/** POST /api/points/bonus — coordenação concede bônus (notificação + audit automáticos). */
export const pointsRouter = Router()

pointsRouter.post(
  "/bonus",
  requireAuth,
  requireRoles("coordinator"),
  handle((req, res) => {
    const body = bonusSchema.parse(req.body)
    const coordinator = requireUser(res)
    const db = getDb()
    const student = findUserById(db, body.studentId)
    if (!student) throw notFound("Aluno não encontrado.")
    if (student.role !== "student") {
      throw unprocessable("Transação só pode ser concedida a alunos.", "NOT_STUDENT")
    }
    // RN04 — transação + notificação + auditoria recebem rollback atômico
    // se qualquer etapa falhar (esta é a transação SQL do chamador).
    const tx = withTransaction(db, () =>
      grantBonus(
        { studentId: body.studentId, amount: body.amount, description: body.description },
        coordinator,
      ),
    )
    sendData(res, 201, tx)
  }),
)

pointsRouter.post(
  "/adjust",
  requireAuth,
  requireRoles("coordinator"),
  handle((req, res) => {
    const body = adjustSchema.parse(req.body)
    const coordinator = requireUser(res)
    const db = getDb()
    const student = findUserById(db, body.studentId)
    if (!student) throw notFound("Aluno não encontrado.")
    if (student.role !== "student") {
      throw unprocessable("Transação só pode ser concedida a alunos.", "NOT_STUDENT")
    }
    // RN04 — saldo nunca fica negativo: adjustPoints valida saldo + amount >= 0
    // lendo o estado da MESMA transação; rollback atômico em falha.
    const tx = withTransaction(db, () =>
      adjustPoints(
        { studentId: body.studentId, amount: body.amount, description: body.description },
        coordinator,
      ),
    )
    sendData(res, 201, tx)
  }),
)