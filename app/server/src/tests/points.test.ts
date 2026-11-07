import { describe, it, expect, beforeAll } from "vitest"
import { makeApp, prepareDb, loginAgent, USERS } from "./helpers"
import { createActivity, createSubmission, createTransaction } from "./fixtures"
import { getDb } from "../db/connection"
import { findActivityById, findSafeUserById, findSubmissionById } from "../db/queries"
import { withTransaction } from "../db/transaction"
import { nowBR } from "../lib/dates"
import type { AppError } from "../lib/errors"
import { creditForApproval, getBalance } from "../services/points"
import type { Express } from "express"

describe("Pontos, saldo e resgates (RN04, RN05)", () => {
  let app: Express

  beforeAll(() => {
    const db = prepareDb()
    // A V3 semeia o banco sem histórico, então o saldo de partida é zero. Os
    // créditos abaixo são fixtures locais (transações gravadas direto na tabela,
    // com o mesmo formato do app) só para dar com o que trabalhar nos cenários
    // de resgate/ajuste — as regras testadas são as mesmas.
    createTransaction(db, { studentId: "u1", amount: 200, type: "manual_adjustment", description: "Saldo inicial do teste" })
    createTransaction(db, { studentId: "u1", amount: 20, type: "bonus", description: "Bônus do fixture" })
    createTransaction(db, { studentId: "u1", amount: 10, type: "activity", description: "Atividade do fixture" })
    createTransaction(db, { studentId: "u4", amount: 100, type: "manual_adjustment", description: "Saldo inicial do teste" })

    // Atividade ativa na c1: dá pendência ao dashboard do aluno.
    createActivity(db, { id: "a1", title: "Revisão de Língua Portuguesa", subjectId: "s1", teacherId: "u6", classId: "c1", points: 15 })
    // Ação escolar do funcionário (u8) com entrega da Ana JÁ aprovada: é o caso
    // de RN05 (revalidar não credita ponto nem streak de novo).
    createActivity(db, { id: "a2", title: "Organização da Biblioteca", subjectId: "s1", teacherId: "u8", classId: "c1", points: 20, type: "library" })
    createSubmission(db, { id: "sub1", activityId: "a2", studentId: "u1", status: "approved", validatedBy: "u8" })
    app = makeApp()
  })

  it("banco de demonstração nasce zerado: todo aluno demo começa com saldo 0", async () => {
    // Substitui a antiga conferência do saldo semeado (284/390/75): na V3 não
    // existe histórico de pontos, e é isso que o produto pediu. O que precisa
    // continuar verdadeiro é RN04 — o saldo é sempre a soma das transações.
    const coord = await loginAgent(app, USERS.juliana.email)
    for (const user of [USERS.mateus, USERS.beatriz, USERS.fernanda]) {
      const points = (await coord.get(`/api/users/${user.id}/points`)).body.data as {
        balance: number
        transactions: unknown[]
      }
      expect(points.balance, `saldo inicial de ${user.id}`).toBe(0)
      expect(points.transactions).toEqual([])
    }
  })

  it("extrato próprio e filtro por aluno somente coord", async () => {
    const ana = await loginAgent(app, USERS.ana.email)
    const own = await ana.get("/api/transactions")
    expect(own.status).toBe(200)
    expect(own.body.data.length).toBe(3) // as 3 transações do fixture local

    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const filtered = await marcelo.get("/api/transactions?studentId=u1")
    expect(filtered.status).toBe(200)
    expect(filtered.body.data).toEqual([]) // professor não é coord → não recebe extrato de outro

    const coord = await loginAgent(app, USERS.juliana.email)
    const coordView = await coord.get("/api/transactions?studentId=u1")
    expect(coordView.status).toBe(200)
    expect(coordView.body.data.length).toBe(3)
  })

  it("bônus da coordenação: crédito + notificação + auditoria", async () => {
    const ana = await loginAgent(app, USERS.ana.email)
    const balanceBefore = (await ana.get("/api/users/u1/points")).body.data.balance as number

    const coord = await loginAgent(app, USERS.juliana.email)
    const res = await coord.post("/api/points/bonus").send({
      studentId: USERS.ana.id,
      amount: 25,
      description: "Destaque na feira de ciências",
    })
    expect(res.status).toBe(201)
    expect(res.body.data.type).toBe("bonus")

    expect((await ana.get("/api/users/u1/points")).body.data.balance).toBe(balanceBefore + 25)

    const notifications = await ana.get("/api/notifications")
    const hasBonus = (notifications.body.data as Array<{ message: string }>).some((n) =>
      n.message.includes("feira de ciências"),
    )
    expect(hasBonus).toBe(true)
  })

  it("ajuste negativo além do saldo é rejeitado — saldo nunca negativo (RN04)", async () => {
    const coord = await loginAgent(app, USERS.juliana.email)
    const before = (await coord.get("/api/users/u4/points")).body.data.balance // 100 (fixture)
    const res = await coord.post("/api/points/adjust").send({
      studentId: USERS.ricardo.id,
      amount: -500,
      description: "Tentativa de zerar para negativo",
    })
    expect(res.status).toBe(422)

    const after = (await coord.get("/api/users/u4/points")).body.data.balance
    expect(after).toBe(before)

    // ajuste válido (dentro do saldo)
    const ok = await coord.post("/api/points/adjust").send({
      studentId: USERS.ricardo.id,
      amount: -25,
      description: "Ajuste de conferência",
    })
    expect(ok.status).toBe(201)
    expect((await coord.get("/api/users/u4/points")).body.data.balance).toBe(before - 25)
  })

  it("resgate com sucesso: débito + estoque -1 + Redemption pending", async () => {
    const ana = await loginAgent(app, USERS.ana.email)
    const before = (await ana.get("/api/users/u1/points")).body.data.balance // 309 no momento
    const res = await ana.post("/api/rewards/r2/redeem") // custo 100
    expect(res.status).toBe(201)
    expect(res.body.data.redemption.status).toBe("pending")
    expect(res.body.data.transaction.amount).toBe(-100)
    expect(res.body.data.balance).toBe(before - 100)

    const coord = await loginAgent(app, USERS.juliana.email)
    const rewards = await coord.get("/api/rewards")
    expect(rewards.status).toBe(200)
    const r2 = (rewards.body.data as Array<{ id: string; stock: number }>).find(
      (r) => r.id === "r2",
    )
    expect(r2?.stock).toBe(4) // era 5
  })

  it("saldo insuficiente bloqueia resgate (422) sem efeitos parciais", async () => {
    const ricardo = await loginAgent(app, USERS.ricardo.email)
    const before = (await ricardo.get("/api/users/u4/points")).body.data.balance // 50 (após -25 ajuste)
    const res = await ricardo.post("/api/rewards/r2/redeem") // custo 100 > saldo
    expect(res.status).toBe(422)

    const after = (await ricardo.get("/api/users/u4/points")).body.data.balance
    expect(after).toBe(before)

    const coord = await loginAgent(app, USERS.juliana.email)
    const redemptions = await coord.get("/api/redemptions")
    const mine = (redemptions.body.data as Array<{ studentId: string }>).filter(
      (r) => r.studentId === USERS.ricardo.id,
    )
    expect(mine.length).toBe(0)
  })

  it("estoque zerado bloqueia resgate", async () => {
    const coord = await loginAgent(app, USERS.juliana.email)
    await coord.patch("/api/rewards/r3").send({ stock: 0 })

    const beatriz = await loginAgent(app, USERS.beatriz.email)
    const res = await beatriz.post("/api/rewards/r3/redeem") // custo 200, saldo 390
    expect(res.status).toBe(422)
  })

  it("coordenação processa resgate pendente (status processed)", async () => {
    const ana = await loginAgent(app, USERS.ana.email)
    const redeemed = await ana.post("/api/rewards/r1/redeem") // custo 50
    expect(redeemed.status).toBe(201)

    const coord = await loginAgent(app, USERS.juliana.email)
    const process = await coord
      .patch(`/api/redemptions/${redeemed.body.data.redemption.id}`)
      .send({ status: "processed", processedBy: "Juliana Santos" })
    expect(process.status).toBe(200)
    expect(process.body.data.status).toBe("processed")

    const again = await coord
      .patch(`/api/redemptions/${redeemed.body.data.redemption.id}`)
      .send({ status: "processed", processedBy: "Juliana Santos" })
    expect(again.status).toBe(409)
  })

  it("dashboard do aluno expõe saldo e pendências", async () => {
    const ana = await loginAgent(app, USERS.ana.email)
    const res = await ana.get("/api/dashboard/overview")
    expect(res.status).toBe(200)
    expect(res.body.data.balance).toBeGreaterThanOrEqual(0)
    expect(res.body.data.pendingActivities).toBeGreaterThan(0)
  })

  it("reaprovação de entrega já aprovada não duplica pontos nem streak (RN05)", async () => {
    const carlos = await loginAgent(app, USERS.carlos.email)
    const ana = await loginAgent(app, USERS.ana.email)

    const txsBefore = (await ana.get("/api/transactions")).body.data.length
    const balanceBefore = (await ana.get("/api/users/u1/points")).body.data.balance
    const streakBefore = (await ana.get("/api/transactions")).body.data.filter(
      (t: { type: string }) => t.type === "streak",
    ).length

    const list = await carlos.get("/api/submissions?activityId=a2&studentId=u1")
    const approved = (list.body.data as Array<{ id: string; status: string }>).find(
      (s) => s.status === "approved",
    )
    expect(approved).toBeDefined()

    const res = await carlos
      .post(`/api/submissions/${(approved as { id: string }).id}/validate`)
      .send({ action: "approve", feedback: "validar de novo" })
    expect(res.status).toBe(409)

    const txsAfter = (await ana.get("/api/transactions")).body.data.length
    const balanceAfter = (await ana.get("/api/users/u1/points")).body.data.balance
    const streakAfter = (await ana.get("/api/transactions")).body.data.filter(
      (t: { type: string }) => t.type === "streak",
    ).length
    expect(txsAfter).toBe(txsBefore)
    expect(balanceAfter).toBe(balanceBefore)
    expect(streakAfter).toBe(streakBefore)
  })

  it("bônus com valor inválido (<= 0) é rejeitado (422) sem criar transação", async () => {
    const coord = await loginAgent(app, USERS.juliana.email)
    const ana = await loginAgent(app, USERS.ana.email)

    const before = (await ana.get("/api/transactions")).body.data.length
    for (const amount of [0, -10]) {
      const res = await coord.post("/api/points/bonus").send({
        studentId: USERS.ana.id,
        amount,
        description: "Bônus inválido de teste",
      })
      expect(res.status).toBe(422)
    }
    const after = (await ana.get("/api/transactions")).body.data.length
    expect(after).toBe(before)
  })

  it("regressão: resgate sem saldo não cria transação nem Redemption", async () => {
    const ricardo = await loginAgent(app, USERS.ricardo.email)

    const balanceBefore = (await ricardo.get("/api/users/u4/points")).body.data.balance
    expect(balanceBefore).toBeLessThan(100) // r2 custa 100 → saldo insuficiente
    const txsBefore = (await ricardo.get("/api/transactions")).body.data.length

    const res = await ricardo.post("/api/rewards/r2/redeem")
    expect(res.status).toBe(422)

    const txsAfter = (await ricardo.get("/api/transactions")).body.data.length
    expect(txsAfter).toBe(txsBefore)

    const redemptions = (await ricardo.get("/api/redemptions")).body.data as unknown[]
    expect(redemptions.length).toBe(0)
  })

  it("regressão: ajuste com déficit não cria transação (saldo nunca negativo)", async () => {
    const coord = await loginAgent(app, USERS.juliana.email)
    const ricardo = await loginAgent(app, USERS.ricardo.email)

    const balanceBefore = (await ricardo.get("/api/users/u4/points")).body.data.balance
    const txsBefore = (await ricardo.get("/api/transactions")).body.data.length

    const res = await coord.post("/api/points/adjust").send({
      studentId: USERS.ricardo.id,
      amount: -9999,
      description: "Débito que estouraria o saldo",
    })
    expect(res.status).toBe(422)

    const balanceAfter = (await ricardo.get("/api/users/u4/points")).body.data.balance
    const txsAfter = (await ricardo.get("/api/transactions")).body.data.length
    expect(balanceAfter).toBe(balanceBefore)
    expect(txsAfter).toBe(txsBefore)
  })

  it("Frente 2: bônus acima do teto por transação é rejeitado (422) sem efeitos", async () => {
    const coord = await loginAgent(app, USERS.juliana.email)
    const ana = await loginAgent(app, USERS.ana.email)

    const before = (await ana.get("/api/transactions")).body.data.length
    const res = await coord.post("/api/points/bonus").send({
      studentId: USERS.ana.id,
      amount: 600, // > BONUS_MAX_PER_TX (500)
      description: "Bônus acima do teto",
    })
    expect(res.status).toBe(422)
    const after = (await ana.get("/api/transactions")).body.data.length
    expect(after).toBe(before)
  })

  it("Frente 2: teto diário de bônus por aluno (422) conta bônus do mesmo dia", async () => {
    const coord = await loginAgent(app, USERS.juliana.email)
    const ricardo = await loginAgent(app, USERS.ricardo.email)
    const before = (await ricardo.get("/api/users/u4/points")).body.data.balance // 50 no momento

    const first = await coord.post("/api/points/bonus").send({
      studentId: USERS.ricardo.id,
      amount: 400, // dentro do teto diário (500)
      description: "Destaque no evento da escola",
    })
    expect(first.status).toBe(201)
    expect((await ricardo.get("/api/users/u4/points")).body.data.balance).toBe(before + 400)

    const second = await coord.post("/api/points/bonus").send({
      studentId: USERS.ricardo.id,
      amount: 200, // 400 + 200 > teto diário (500)
      description: "Bônus que estoura o teto diário",
    })
    expect(second.status).toBe(422)
    expect((await ricardo.get("/api/users/u4/points")).body.data.balance).toBe(before + 400)
  })

  it("RF07/Frente 2: crédito que cruza faixa de nível gera notificação + auditoria LEVEL_UP", async () => {
    const coord = await loginAgent(app, USERS.juliana.email)
    const beatriz = await loginAgent(app, USERS.beatriz.email)
    const before = (await beatriz.get("/api/users/u3/points")).body.data.balance // 0 (Bronze)

    const res = await coord.post("/api/points/bonus").send({
      studentId: USERS.beatriz.id,
      amount: 500, // teto por transação: Bronze (0) → Diamante (>= 500)
      description: "Reconhecimento pela feira tecnológica",
    })
    expect(res.status).toBe(201)
    const after = (await beatriz.get("/api/users/u3/points")).body.data.balance
    expect(after).toBe(before + 500)

    const notifications = await beatriz.get("/api/notifications")
    const celebrated = (notifications.body.data as Array<{ title: string }>).some((n) =>
      n.title.includes("Você subiu para 🥇 Diamante"),
    )
    expect(celebrated).toBe(true)

    const audit = await coord.get("/api/audit?action=LEVEL_UP")
    const logs = audit.body.data as Array<{ description: string }>
    expect(logs.some((l) => l.description.includes("Beatriz"))).toBe(true)
  })

  it("Frente 2: GET /users/:id/points expõe streak e meta do nível correto", async () => {
    const ana = await loginAgent(app, USERS.ana.email)
    const data = (await ana.get("/api/users/u1/points")).body.data as {
      missingForNextLevel: unknown
      currentStreakDays: unknown
      nextStreakMilestone: unknown
      daysToNextMilestone: unknown
    }
    expect(typeof data.currentStreakDays).toBe("number")
    expect(data.missingForNextLevel === null || typeof data.missingForNextLevel === "number").toBe(true)
    expect(data.nextStreakMilestone === null || typeof data.nextStreakMilestone === "number").toBe(true)
    expect(data.daysToNextMilestone === null || typeof data.daysToNextMilestone === "number").toBe(true)
  })

  it("Frente 2: corrida de resgate com estoque 1 — só um vence e estoque nunca fica negativo", async () => {
    const coord = await loginAgent(app, USERS.juliana.email)
    const ricardo = await loginAgent(app, USERS.ricardo.email)

    const created = await coord.post("/api/rewards").send({
      label: "Corrida de resgate",
      icon: "⚡",
      points: 30,
      stock: 1,
    })
    expect(created.status).toBe(201)
    const rewardId = (created.body.data as { id: string }).id

    const statuses = await Promise.all([
      ricardo.post(`/api/rewards/${rewardId}/redeem`).then((r) => r.status),
      ricardo.post(`/api/rewards/${rewardId}/redeem`).then((r) => r.status),
    ])
    expect(statuses.sort()).toEqual([201, 422])

    const rewards = await coord.get("/api/rewards")
    const reward = (rewards.body.data as Array<{ id: string; stock: number }>).find((r) => r.id === rewardId)
    expect(reward?.stock).toBe(0)

    const redemptions = (await coord.get("/api/redemptions")).body.data as Array<{ rewardId: string }>
    expect(redemptions.filter((r) => r.rewardId === rewardId).length).toBe(1)
  })

  // ─── V3 Fase 2 · Tarefa 2.1: valor creditado além de activity.points ───────
  // A entrega atrasada vale meia pontuação (Tarefa 2.2), então a aprovação passa a
  // informar QUANTO creditar. Aqui o valor vem do chamador: a serviço continua
  // decidindo saldo, notificação e auditoria, e todos os três têm de refletir o
  // valor realmente creditado — não o da atividade.

  it("aprovação com valor customizado: transação, saldo, notificação e auditoria mostram o valor creditado", async () => {
    const db = getDb()
    const activityId = createActivity(db, {
      id: "a-meia",
      title: "Resenha da Semana Literária",
      subjectId: "s1",
      teacherId: USERS.marcelo.id,
      classId: "c1",
      points: 15,
    })
    const submissionId = createSubmission(db, {
      id: "sub-meia",
      activityId,
      studentId: USERS.mateus.id,
      status: "under_review",
    })
    const activity = findActivityById(db, activityId)
    const submission = findSubmissionById(db, submissionId)
    const validator = findSafeUserById(db, USERS.marcelo.id)
    if (!activity || !submission || !validator) {
      throw new Error("Fixture de crédito: atividade, entrega ou validador não encontrado.")
    }

    const mateus = await loginAgent(app, USERS.mateus.email)
    const coord = await loginAgent(app, USERS.juliana.email)
    const balanceBefore = (await mateus.get(`/api/users/${USERS.mateus.id}/points`)).body.data.balance as number

    // Mesmo caminho do validador na rota (transação SQL), mas informando 8 = ceil(15/2).
    withTransaction(db, () => {
      creditForApproval(activity, { ...submission, status: "approved" }, validator, nowBR(), 8)
    })

    const transactions = (await mateus.get("/api/transactions")).body.data as Array<{
      type: string
      amount: number
      relatedActivityId: string | null
    }>
    const credit = transactions.find((t) => t.type === "activity" && t.relatedActivityId === activityId)
    expect(credit?.amount, "transação de crédito da atividade").toBe(8)
    expect((await mateus.get(`/api/users/${USERS.mateus.id}/points`)).body.data.balance).toBe(
      balanceBefore + 8,
    )

    const notifications = (await mateus.get("/api/notifications")).body.data as Array<{
      title: string
      message: string
    }>
    const approval = notifications.find((n) => n.title === "Atividade aprovada! 🎉")
    expect(approval?.message, "notificação de aprovação").toContain("+8 pts")
    expect(approval?.message).not.toContain("+15 pts")

    const audit = await coord.get("/api/audit?action=SUBMISSION_APPROVED")
    const logs = (audit.body.data as Array<{ description: string }>).filter((l) =>
      l.description.includes("Resenha da Semana Literária"),
    )
    expect(logs.length).toBe(1)
    expect(logs[0].description, "auditoria da aprovação").toContain("+8 pts")
  })

  it("aprovação sem valor customizado continua creditando activity.points (RN05 inalterado)", async () => {
    // Contrato de compatibilidade: a assinatura nova é opcional e o caminho
    // antigo (rota de validação, sem o 5º argumento) precisa ficar idêntico.
    const db = getDb()
    const activityId = createActivity(db, {
      id: "a-cheia",
      title: "Mapa Mental de História",
      subjectId: "s1",
      teacherId: USERS.sandra.id,
      classId: "c3",
      points: 15,
    })

    const fernanda = await loginAgent(app, USERS.fernanda.email)
    const sent = await fernanda
      .post(`/api/activities/${activityId}/submissions`)
      .field("comment", "Mapa mental entregue no prazo")
    expect(sent.status).toBe(201)
    const submissionId = (sent.body.data as { id: string }).id

    const sandra = await loginAgent(app, USERS.sandra.email)
    const approved = await sandra
      .post(`/api/submissions/${submissionId}/validate`)
      .send({ action: "approve", feedback: "Ótimo trabalho." })
    expect(approved.status).toBe(200)

    const transactions = (await fernanda.get("/api/transactions")).body.data as Array<{
      type: string
      amount: number
      relatedActivityId: string | null
    }>
    const credit = transactions.find((t) => t.type === "activity" && t.relatedActivityId === activityId)
    expect(credit?.amount, "crédito no valor integral da atividade").toBe(15)

    const notifications = (await fernanda.get("/api/notifications")).body.data as Array<{
      title: string
      message: string
    }>
    const approval = notifications.find((n) => n.title === "Atividade aprovada! 🎉")
    expect(approval?.message, "notificação de aprovação").toContain("+15 pts")

    const coord = await loginAgent(app, USERS.juliana.email)
    const audit = await coord.get("/api/audit?action=SUBMISSION_APPROVED")
    const logs = (audit.body.data as Array<{ description: string }>).filter((l) =>
      l.description.includes("Mapa Mental de História"),
    )
    expect(logs.length).toBe(1)
    expect(logs[0].description, "auditoria da aprovação").toContain("+15 pts")
  })

  // ─── V3 Fase 2 · Tarefa 2.2: o valor a creditar é validado (R32) ────────────
  // A rota de validação só passa `Math.ceil(points / 2)`, mas o serviço é quem
  // garante que nada inválido chegue à transação: `0`, negativo ou `NaN` lançam
  // em vez de virar um crédito (ou um saldo) corrompido.
  it("creditForApproval recusa valor a creditar inválido e não grava nada", () => {
    const db = getDb()
    const activityId = createActivity(db, {
      id: "a-guard",
      title: "Atividade com crédito inválido",
      subjectId: "s1",
      teacherId: USERS.marcelo.id,
      classId: "c1",
      points: 15,
    })
    const submissionId = createSubmission(db, {
      id: "sub-guard",
      activityId,
      studentId: USERS.mateus.id,
      status: "under_review",
    })
    const activity = findActivityById(db, activityId)
    const submission = findSubmissionById(db, submissionId)
    const validator = findSafeUserById(db, USERS.marcelo.id)
    if (!activity || !submission || !validator) {
      throw new Error("Fixture do guard: atividade, entrega ou validador não encontrado.")
    }
    const balanceBefore = getBalance(USERS.mateus.id, db)

    const erroDe = (amount: number): AppError | null => {
      try {
        creditForApproval(activity, { ...submission, status: "approved" }, validator, nowBR(), amount)
        return null
      } catch (error) {
        return error as AppError
      }
    }

    for (const amount of [0, -8, 1.5, Number.NaN]) {
      const error = erroDe(amount)
      expect(error, `valor ${String(amount)} deve ser recusado`).not.toBeNull()
      expect(error?.status).toBe(422)
      expect(error?.details).toBe("INVALID_AMOUNT")
    }

    // Nenhuma escrita parcial: nem transação, nem saldo mexido.
    const credit = db
      .prepare("SELECT COUNT(*) AS total FROM transactions WHERE relatedActivityId = ?")
      .get(activityId) as { total: number }
    expect(Number(credit.total), "nenhuma transação gravada").toBe(0)
    expect(getBalance(USERS.mateus.id, db), "saldo intacto").toBe(balanceBefore)
  })
})