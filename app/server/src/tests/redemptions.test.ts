import { describe, it, expect, beforeAll } from "vitest"
import { makeApp, prepareDb, loginAgent, USERS } from "./helpers"
import { createTransaction } from "./fixtures"
import type { Express } from "express"

// Frente 2 (item 2.3) — cancelamento de resgate + notificação de processamento.
describe("Redemptions — cancelamento, estorno e notificações", () => {
  let app: Express

  beforeAll(() => {
    const db = prepareDb()
    // A V3 não semeia histórico de pontos: a Ana precisa de saldo para resgatar
    // a recompensa de 50 pts (r1). Crédito local, não regra.
    createTransaction(db, {
      studentId: "u1",
      amount: 300,
      type: "manual_adjustment",
      description: "Saldo inicial do teste",
    })
    app = makeApp()
  })

  it("cancelar resgate pendente: estorna pontos, devolve estoque, notifica e audita", async () => {
    const ana = await loginAgent(app, USERS.ana.email)
    const coord = await loginAgent(app, USERS.juliana.email)

    const balanceBefore = (await ana.get("/api/users/u1/points")).body.data.balance // 300
    const stockBefore = (
      (await coord.get("/api/rewards")).body.data as Array<{ id: string; stock: number }>
    ).find((r) => r.id === "r1")?.stock

    const redeemed = await ana.post("/api/rewards/r1/redeem") // custo 50
    expect(redeemed.status).toBe(201)
    const redemptionId = (redeemed.body.data.redemption as { id: string }).id
    expect((await ana.get("/api/users/u1/points")).body.data.balance).toBe(balanceBefore - 50)

    const cancel = await coord.patch(`/api/redemptions/${redemptionId}/cancel`)
    expect(cancel.status).toBe(200)
    expect(cancel.body.data.status).toBe("cancelled")

    // saldo de volta (net zero) e estoque restaurado ao valor original
    expect((await ana.get("/api/users/u1/points")).body.data.balance).toBe(balanceBefore)
    const stockAfter = (
      (await coord.get("/api/rewards")).body.data as Array<{ id: string; stock: number }>
    ).find((r) => r.id === "r1")?.stock
    expect(stockAfter).toBe(stockBefore)

    // estorno aparece no extrato como transação POSITIVA tipo manual_adjustment
    const txs = (await ana.get("/api/transactions")).body.data as Array<{
      type: string
      amount: number
      description: string
    }>
    const refund = txs.find(
      (t) => t.type === "manual_adjustment" && t.description.includes("Estorno de resgate cancelado"),
    )
    expect(refund?.amount).toBe(50)

    // notificação ao aluno
    const notifications = (await ana.get("/api/notifications")).body.data as Array<{ title: string }>
    expect(notifications.some((n) => n.title === "Resgate cancelado")).toBe(true)

    // auditoria REDEMPTION_CANCELLED
    const audit = await coord.get("/api/audit?action=REDEMPTION_CANCELLED")
    const logs = audit.body.data as Array<{ description: string }>
    expect(logs.some((l) => l.description.includes("Ana Luiza"))).toBe(true)
  })

  it("processar resgate notifica o aluno (Frente 2)", async () => {
    const ana = await loginAgent(app, USERS.ana.email)
    const coord = await loginAgent(app, USERS.juliana.email)

    const redeemed = await ana.post("/api/rewards/r1/redeem")
    expect(redeemed.status).toBe(201)
    const redemptionId = (redeemed.body.data.redemption as { id: string }).id

    const process = await coord.patch(`/api/redemptions/${redemptionId}`).send({ status: "processed" })
    expect(process.status).toBe(200)
    expect(process.body.data.status).toBe("processed")

    const notifications = (await ana.get("/api/notifications")).body.data as Array<{ title: string }>
    expect(notifications.some((n) => n.title === "Recompensa entregue! 🎁")).toBe(true)
  })

  it("cancelar resgate já processado ou já cancelado → 409", async () => {
    const ana = await loginAgent(app, USERS.ana.email)
    const coord = await loginAgent(app, USERS.juliana.email)

    // 1) já processado
    const first = await ana.post("/api/rewards/r1/redeem")
    expect(first.status).toBe(201)
    const firstId = (first.body.data.redemption as { id: string }).id
    await coord.patch(`/api/redemptions/${firstId}`).send({ status: "processed" })
    expect((await coord.patch(`/api/redemptions/${firstId}/cancel`)).status).toBe(409)

    // 2) já cancelado
    const second = await ana.post("/api/rewards/r1/redeem")
    expect(second.status).toBe(201)
    const secondId = (second.body.data.redemption as { id: string }).id
    await coord.patch(`/api/redemptions/${secondId}/cancel`)
    expect((await coord.patch(`/api/redemptions/${secondId}/cancel`)).status).toBe(409)
  })

  it("cancelamento exige coordenação (403) e id inexistente → 404", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    expect((await marcelo.patch("/api/redemptions/xyz/cancel")).status).toBe(403)

    const coord = await loginAgent(app, USERS.juliana.email)
    expect((await coord.patch("/api/redemptions/nao-existe/cancel")).status).toBe(404)
  })
})