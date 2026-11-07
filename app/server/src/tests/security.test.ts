import { describe, it, expect, beforeAll, beforeEach } from "vitest"
import { makeApp, prepareDb, loginAgent, USERS } from "./helpers"
import { createTransaction } from "./fixtures"
import { enforceApiRateLimit, resetApiRateLimits } from "../auth/rateLimit"
import type { Express } from "express"

describe("Frente 1 — segurança no servidor (1.4 a 1.8)", () => {
  let app: Express

  beforeAll(() => {
    const db = prepareDb()
    // A V3 nasce sem histórico de pontos: a Ana precisa de saldo para exercitar
    // o resgate (a sessão/permissão é o que este arquivo testa).
    createTransaction(db, {
      studentId: "u1",
      amount: 300,
      type: "manual_adjustment",
      description: "Saldo inicial do teste",
    })
    app = makeApp()
    resetApiRateLimits()
  })

  beforeEach(() => {
    resetApiRateLimits()
  })

  it("rate limit genérico: mutação autenticada acima de 120/min retorna 429", async () => {
    // Pré-carrega a janela do usuário coordenação com 120 chamadas diretas,
    // simulando o consumo do limite de um minuto.
    for (let i = 0; i < 120; i++) {
      enforceApiRateLimit(USERS.juliana.id, "203.0.113.7")
    }
    const coord = await loginAgent(app, USERS.juliana.email)
    const res = await coord
      .patch("/api/rewards/r1")
      .send({ label: "Forçar limite", points: 50, stock: 10 })
    expect(res.status).toBe(429)
    expect(res.body.error).toBeDefined()
  })

  it("PATCH /redemptions ignora processedBy do body e usa a sessão", async () => {
    const ana = await loginAgent(app, USERS.ana.email)
    const redeemed = await ana.post("/api/rewards/r1/redeem")
    expect(redeemed.status).toBe(201)

    const coord = await loginAgent(app, USERS.juliana.email)
    const res = await coord
      .patch(`/api/redemptions/${(redeemed.body.data.redemption as { id: string }).id}`)
      .send({ status: "processed", processedBy: "Forjado no body" })
    expect(res.status).toBe(200)
    expect((res.body.data as { processedBy: string }).processedBy).toBe(USERS.juliana.id)
  })

  it("troca de senha pelo coordenador revoga sessões do aluno e mantém a do coordenador", async () => {
    const ana = await loginAgent(app, USERS.ana.email)
    expect((await ana.get("/api/auth/me")).status).toBe(200)

    const coord = await loginAgent(app, USERS.juliana.email)
    const patched = await coord.patch("/api/users/u1").send({ password: "novaSenha123" })
    expect(patched.status).toBe(200)

    const stale = await ana.get("/api/auth/me")
    expect(stale.status).toBe(401)
    expect((await coord.get("/api/auth/me")).status).toBe(200)
  })

  it("coordenador altera a própria senha e mantém a sessão atual", async () => {
    const coord = await loginAgent(app, USERS.juliana.email)
    const res = await coord.patch("/api/users/u9").send({ password: "novaSenhaCoord1" })
    expect(res.status).toBe(200)
    expect((await coord.get("/api/auth/me")).status).toBe(200)
    // restaura a senha demo para os testes seguintes
    const restored = await coord.patch("/api/users/u9").send({ password: "123456" })
    expect(restored.status).toBe(200)
    expect((await coord.get("/api/auth/me")).status).toBe(200)
  })

  it("PATCH /classes sincroniza users.classIds dos membros adicionados/removidos", async () => {
    const coord = await loginAgent(app, USERS.juliana.email)
    const classes = await coord.get("/api/classes")
    const c2 = (classes.body.data as Array<{ id: string; studentIds: string[] }>).find(
      (c) => c.id === "c2",
    )
    expect(c2).toBeDefined()
    const baseStudents = c2?.studentIds ?? []

    // Mateus (u2) é da c1: começa fora da c2, entra e sai de dentro do teste.
    const added = await coord
      .patch("/api/classes/c2")
      .send({ studentIds: [...baseStudents, USERS.mateus.id] })
    expect(added.status).toBe(200)

    const users = await coord.get("/api/users")
    const mateus = (users.body.data as Array<{ id: string; classIds: string[] }>).find(
      (u) => u.id === USERS.mateus.id,
    )
    expect(mateus?.classIds).toContain("c2")

    const removed = await coord
      .patch("/api/classes/c2")
      .send({ studentIds: baseStudents })
    expect(removed.status).toBe(200)

    const usersAfter = await coord.get("/api/users")
    const mateusAfter = (
      usersAfter.body.data as Array<{ id: string; classIds: string[] }>
    ).find((u) => u.id === USERS.mateus.id)
    expect(mateusAfter?.classIds).not.toContain("c2")
    // Mateus segue na própria turma c1 (remoção não apaga vínculos alheios)
    expect(mateusAfter?.classIds).toContain("c1")
  })

  it("professor só cria atividade em turma vinculada (403 + auditoria)", async () => {
    // A Prof. Sandra atua em c2/c3; a c1 é turma de outro professor.
    const sandra = await loginAgent(app, USERS.sandra.email)
    const res = await sandra.post("/api/activities").send({
      title: "Fora de escopo",
      subjectId: "s1",
      classId: "c1",
      points: 10,
      deadline: "15/12/2026",
      type: "academic",
    })
    expect(res.status).toBe(403)
    expect(res.body.error).toContain("Você não atua nessa turma")
  })
})