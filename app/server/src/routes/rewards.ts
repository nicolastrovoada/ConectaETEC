import { Router } from "express"
import { z } from "zod"
import { requireAuth, requireRoles, requireUser } from "../auth/middleware"
import { getDb } from "../db/connection"
import { findRewardById } from "../db/queries"
import { mapReward, type RewardRow } from "../db/rows"
import { withTransaction } from "../db/transaction"
import { notFound, conflict } from "../lib/errors"
import { handle, sendData } from "../lib/http"
import { uuid } from "../lib/uuid"
import { recordAudit } from "../services/audit"
import { getBalance, redeem } from "../services/points"
import type { Reward } from "../shared/types"

const createRewardSchema = z.object({
  label: z.string().trim().min(3, "Nome da recompensa deve ter ao menos 3 caracteres."),
  icon: z.string().optional().default("🏆"),
  points: z.number().int().positive("Preço deve ser inteiro positivo."),
  stock: z.number().int().nonnegative("Estoque não pode ser negativo."),
}).strict()

const updateRewardSchema = createRewardSchema.partial().strict()

export const rewardsRouter = Router()

rewardsRouter.get(
  "/",
  requireAuth,
  handle((_req, res) => {
    const user = requireUser(res)
    const db = getDb()
    const rows = db.prepare("SELECT * FROM rewards ORDER BY points ASC").all() as unknown as RewardRow[]
    const rewards = rows.map(mapReward)
    const balance = user.role === "student" ? getBalance(user.id) : null
    sendData(res, 200, balance === null ? rewards : { rewards, balance })
  }),
)

rewardsRouter.post(
  "/",
  requireAuth,
  requireRoles("coordinator"),
  handle((req, res) => {
    const body = createRewardSchema.parse(req.body)
    const coordinator = requireUser(res)
    const db = getDb()
    const id = uuid()
    db.prepare("INSERT INTO rewards (id, label, icon, points, stock) VALUES (?, ?, ?, ?, ?)").run(
      id,
      body.label,
      body.icon,
      body.points,
      body.stock,
    )
    const created = findRewardById(db, id)
    if (!created) throw notFound("Recompensa não encontrada após criação.")
    recordAudit({
      userId: coordinator.id,
      action: "REWARD_CREATED",
      entity: "Reward",
      entityId: id,
      description: `Coordenação criou recompensa '${created.label}' (${created.points} pts)`,
    })
    sendData(res, 201, created)
  }),
)

rewardsRouter.patch(
  "/:id",
  requireAuth,
  requireRoles("coordinator"),
  handle((req, res) => {
    const body = updateRewardSchema.parse(req.body)
    const coordinator = requireUser(res)
    const db = getDb()
    const reward = findRewardById(db, req.params.id)
    if (!reward) throw notFound("Recompensa não encontrada.")
    db.prepare("UPDATE rewards SET label = ?, icon = ?, points = ?, stock = ? WHERE id = ?").run(
      body.label ?? reward.label,
      body.icon ?? reward.icon,
      body.points ?? reward.points,
      body.stock ?? reward.stock,
      reward.id,
    )
    const updated = findRewardById(db, reward.id)
    if (!updated) throw notFound("Recompensa não encontrada após atualização.")
    recordAudit({
      userId: coordinator.id,
      action: "REWARD_UPDATED",
      entity: "Reward",
      entityId: reward.id,
      description: `Coordenação atualizou recompensa '${updated.label}'`,
    })
    sendData(res, 200, updated)
  }),
)

rewardsRouter.delete(
  "/:id",
  requireAuth,
  requireRoles("coordinator"),
  handle((req, res) => {
    const coordinator = requireUser(res)
    const db = getDb()
    const reward = findRewardById(db, req.params.id)
    if (!reward) throw notFound("Recompensa não encontrada.")
    // Guard de integridade (sem FKs no SQLite): recompensa com resgates não pode ser excluída.
    const linked = db
      .prepare("SELECT COUNT(*) AS total FROM redemptions WHERE rewardId = ?")
      .get(reward.id) as { total: number }
    if (Number(linked.total) > 0) {
      throw conflict(
        "Não é possível excluir a recompensa: há resgates vinculados.",
        "REWARD_HAS_REDEMPTIONS",
      )
    }
    db.prepare("DELETE FROM rewards WHERE id = ?").run(reward.id)
    recordAudit({
      userId: coordinator.id,
      action: "REWARD_DELETED",
      entity: "Reward",
      entityId: reward.id,
      description: `Coordenação removeu recompensa '${reward.label}'`,
    })
    sendData(res, 200, { ok: true })
  }),
)

rewardsRouter.post(
  "/:id/redeem",
  requireAuth,
  requireRoles("student"),
  handle((req, res) => {
    const user = requireUser(res)
    const db = getDb()
    const reward = findRewardById(db, req.params.id)
    if (!reward) throw notFound("Recompensa não encontrada.")

    let result: ReturnType<typeof redeem>
    // RN04/RN08 — redeem valida saldo+estoque e cria Redemption + débito de
    // forma atômica; AppError (422) propaga ao error handler central e a
    // transação é revertida, sem efeito parcial.
    result = withTransaction(db, () => redeem(reward, user.id))

    sendData(res, 201, {
      redemption: result.redemption,
      transaction: result.transaction,
      balance: result.balance,
    })
  }),
)

export type { Reward }