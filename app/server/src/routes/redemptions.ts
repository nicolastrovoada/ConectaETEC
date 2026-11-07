import { Router } from "express"
import { z } from "zod"
import { requireAuth, requireRoles, requireUser } from "../auth/middleware"
import { getDb } from "../db/connection"
import { findRedemptionById, findUserById } from "../db/queries"
import { mapRedemption, type RedemptionRow } from "../db/rows"
import { withTransaction } from "../db/transaction"
import { nowBR } from "../lib/dates"
import { conflict, notFound } from "../lib/errors"
import { handle, sendData } from "../lib/http"
import { uuid } from "../lib/uuid"
import { recordAudit } from "../services/audit"
import { insertNotification } from "../services/notifications"

const processSchema = z.object({
  status: z.literal("processed"),
})

export const redemptionsRouter = Router()

redemptionsRouter.get(
  "/",
  requireAuth,
  handle((req, res) => {
    const user = requireUser(res)
    const db = getDb()
    const rows = db
      .prepare(
        user.role === "coordinator"
          ? "SELECT * FROM redemptions ORDER BY rowid DESC"
          : "SELECT * FROM redemptions WHERE studentId = ? ORDER BY rowid DESC",
      )
      .all(...(user.role === "coordinator" ? [] : [user.id])) as unknown as RedemptionRow[]
    sendData(res, 200, rows.map(mapRedemption))
  }),
)

/** Frente 2 (item 2.3) — coordenação cancela resgate ainda pendente: estorna o
 * débito, devolve o estoque, notifica o aluno e registra auditoria. */
redemptionsRouter.patch(
  "/:id/cancel",
  requireAuth,
  requireRoles("coordinator"),
  handle((req, res) => {
    const coordinator = requireUser(res)

    const db = getDb()
    const result = withTransaction(db, () => {
      const redemption = findRedemptionById(db, req.params.id)
      if (!redemption) throw notFound("Resgate não encontrado.")
      // Releitura fresca DENTRO da transação — outra requisição pode ter
      // processado/cancelado entre o GET do painel e este PATCH.
      if (redemption.status !== "pending") {
        throw conflict(
          redemption.status === "processed"
            ? "Resgate já foi processado — não é possível cancelar."
            : "Resgate já foi cancelado.",
          "REDEMPTION_ALREADY_PROCESSED",
        )
      }

      // 1) status
      db.prepare(
        "UPDATE redemptions SET status = ?, processedBy = ? WHERE id = ?",
      ).run("cancelled", coordinator.id, redemption.id)

      // 2) devolve o estoque (nunca negativo — WHERE stock >= 0 já está no DDL)
      db.prepare("UPDATE rewards SET stock = stock + 1 WHERE id = ?").run(redemption.rewardId)

      // 3) estorno do débito virou transação POSITIVA (manual_adjustment) —
      //    o net fica zero (RN04/RN05) e o aluno vê o motivo no extrato.
      db.prepare(
        `INSERT INTO transactions (id, studentId, amount, type, description, relatedActivityId, createdBy, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        uuid(),
        redemption.studentId,
        redemption.points,
        "manual_adjustment",
        `Estorno de resgate cancelado: ${redemption.rewardLabel}`,
        null,
        coordinator.id,
        nowBR(),
      )

      // 4) notificação ao aluno
      insertNotification({
        userId: redemption.studentId,
        title: "Resgate cancelado",
        message: `O resgate de "${redemption.rewardLabel}" foi cancelado pela coordenação. Os ${redemption.points} pts foram devolvidos ao seu saldo.`,
        type: "system",
      })

      // 5) auditoria
      const student = findUserById(db, redemption.studentId)
      recordAudit({
        userId: coordinator.id,
        action: "REDEMPTION_CANCELLED",
        entity: "Redemption",
        entityId: redemption.id,
        description: `Coordenação cancelou resgate de ${student?.name ?? redemption.studentId} (recompensa '${redemption.rewardLabel}') / ${coordinator.name}`,
      })

      return findRedemptionById(db, redemption.id)
    })
    if (!result) throw notFound("Resgate não encontrado após atualização.")
    sendData(res, 200, result)
  }),
)

redemptionsRouter.patch(
  "/:id",
  requireAuth,
  requireRoles("coordinator"),
  handle((req, res) => {
    const body = processSchema.parse(req.body)
    const coordinator = requireUser(res)

    const db = getDb()
    const result = withTransaction(db, () => {
      const redemption = findRedemptionById(db, req.params.id)
      if (!redemption) throw notFound("Resgate não encontrado.")
      if (redemption.status !== "pending") {
        throw conflict(
          redemption.status === "cancelled"
            ? "Resgate foi cancelado — não é possível processar."
            : "Resgate já processado.",
          "REDEMPTION_ALREADY_PROCESSED",
        )
      }

      db.prepare(
        "UPDATE redemptions SET status = ?, processedBy = ? WHERE id = ?",
      ).run("processed", coordinator.id, redemption.id)
      const updated = findRedemptionById(db, redemption.id)
      if (!updated) throw notFound("Resgate não encontrado após atualização.")

      // Frente 2 (item 2.3) — aluno é notificado quando a recompensa sai.
      insertNotification({
        userId: updated.studentId,
        title: "Recompensa entregue! 🎁",
        message: `O resgate de "${updated.rewardLabel}" foi processado pela coordenação.`,
        type: "system",
      })

      const student = findUserById(db, updated.studentId)
      recordAudit({
        userId: coordinator.id,
        action: "REDEMPTION_PROCESSED",
        entity: "Redemption",
        entityId: redemption.id,
        description: `Coordenação processou resgate de ${student?.name ?? updated.studentId} (recompensa '${updated.rewardLabel}') / ${coordinator.name}`,
      })
      return updated
    })
    if (!result) throw notFound("Resgate não encontrado após atualização.")
    sendData(res, 200, result)
  }),
)