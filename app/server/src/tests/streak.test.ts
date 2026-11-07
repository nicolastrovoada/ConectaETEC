import { describe, it, expect, beforeAll } from "vitest"
import { makeApp, prepareDb, loginAgent, USERS, brDateInDays } from "./helpers"
import { createActivity, createSubmission } from "./fixtures"
import { getDb } from "../db/connection"
// O "hoje" do teste tem que ser o MESMO "hoje" de São Paulo usado pelo servidor
// (via `lib/dates`), e não o relógio local da máquina: num runner UTC perto da
// meia-noite o dia local já virou enquanto o de São Paulo não, e as aprovações
// plantadas caem no dia errado (streak 2 em vez de 3, sem marco).
import { brDateInDays as brDateSP } from "../lib/dates"
import type { Express } from "express"

/** Data de `daysAgo` dias atrás, ancorada no dia de calendário de São Paulo. */
function brDate(daysAgo: number): string {
  return `${brDateSP(-daysAgo)} 12:00:00`
}

describe("Sequência de participação (RF07) — streak na aprovação", () => {
  let app: Express

  beforeAll(() => {
    const db = prepareDb()
    // A V3 não semeia histórico: as atividades e a entrega de hoje da Ana são
    // criadas aqui. a4 é do funcionário (u8) — é o que permite ao Carlos
    // (staff) validar uma entrega, como no modelo de ação escolar.
    createActivity(db, { id: "a1", title: "Revisão de Língua Portuguesa", subjectId: "s1", teacherId: "u6", classId: "c1", points: 15 })
    createActivity(db, { id: "a3", title: "Exercícios de Biologia", subjectId: "s8", teacherId: "u6", classId: "c2", points: 12 })
    createActivity(db, { id: "a4", title: "Apoio no Evento da Semana da Administração", subjectId: "s1", teacherId: "u8", classId: "c1", points: 20, type: "event" })
    createActivity(db, { id: "a5", title: "Relatório de Gestão Empresarial", subjectId: "s3", teacherId: "u6", classId: "c1", points: 18 })
    createSubmission(db, { id: "sub1", activityId: "a1", studentId: "u1", status: "revision_required" })
    createSubmission(db, { id: "sub2", activityId: "a4", studentId: "u1", status: "under_review" })
    app = makeApp()
  })

  it("3 aprovações em dias consecutivos concedem bônus de streak (+10, marco 3)", async () => {
    // Planta 2 entregas aprovadas de Ana há 2 e 1 dia (dias distintos).
    const db = getDb()
    const insert = db.prepare(
      `INSERT INTO submissions (id, activityId, studentId, submittedAt, status, evidence, comment, validatedBy, validatedAt, feedback)
       VALUES (?, ?, ?, ?, 'approved', '', 'plantio streak', 'u6', ?, '')`,
    )
    insert.run("stk1", "a5", "u1", brDate(3), brDate(2))
    insert.run("stk2", "a1", "u1", brDate(3), brDate(1))

    // Aprova a entrega de hoje (sub1, atividade a1, revision_required)
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const list = await marcelo.get("/api/submissions?activityId=a1&studentId=u1")
    const pending = (list.body.data as Array<{ id: string; status: string }>).find(
      (s) => s.status === "revision_required",
    )
    expect(pending).toBeDefined()

    const approve = await marcelo
      .post(`/api/submissions/${(pending as { id: string }).id}/validate`)
      .send({ action: "approve", feedback: "Aprovada após correções." })
    expect(approve.status).toBe(200)
    expect(approve.body.data.status).toBe("approved")

    // Transação activity (+15 da a1) + transação streak (+10 do marco 3)
    const ana = await loginAgent(app, USERS.ana.email)
    const transactions = (await ana.get("/api/transactions")).body.data as Array<{
      type: string
      amount: number
      description: string
    }>

    const streakTx = transactions.find(
      (t) => t.type === "streak" && t.description.includes("3 dias seguidos"),
    )
    expect(streakTx).toBeDefined()
    expect((streakTx as { amount: number }).amount).toBe(10)
    expect((streakTx as { description: string }).description).toBe(
      "Bônus de sequência — 3 dias seguidos",
    )

    // Saldo: banco nasce zerado, então 15 (atividade a1) + 10 (streak).
    expect((await ana.get("/api/users/u1/points")).body.data.balance).toBe(25)

    // Notificação do bônus
    const notifications = (await ana.get("/api/notifications")).body.data as Array<{
      title: string
      message: string
    }>
    expect(
      notifications.some((n) => n.title === "Bônus de sequência!" && n.message.includes("3 dias seguidos")),
    ).toBe(true)

    // Auditoria STREAK_BONUS
    const coord = await loginAgent(app, USERS.juliana.email)
    const audit = await coord.get("/api/audit?action=STREAK_BONUS")
    const logs = audit.body.data as Array<{ action: string; description: string }>
    expect(logs.length).toBe(1)
    expect(logs[0].description).toContain("bônus de sequência de 3 dias")
  })

  it("aprovar outra entrega no mesmo dia NÃO duplica o marco de streak", async () => {
    const carlos = await loginAgent(app, USERS.carlos.email)
    const list = await carlos.get("/api/submissions?activityId=a4&studentId=u1")
    const pending = (list.body.data as Array<{ id: string; status: string }>).find(
      (s) => s.status === "under_review",
    )
    expect(pending).toBeDefined()

    const ana = await loginAgent(app, USERS.ana.email)
    const streakBefore = (await ana.get("/api/transactions")).body.data.filter(
      (t: { type: string }) => t.type === "streak",
    ).length

    const approve = await carlos
      .post(`/api/submissions/${(pending as { id: string }).id}/validate`)
      .send({ action: "approve", feedback: "Segunda aprovação no mesmo dia." })
    expect(approve.status).toBe(200)

    const transactions = (await ana.get("/api/transactions")).body.data as Array<{
      type: string
      description: string
    }>
    const streakAfter = transactions.filter((t) => t.type === "streak").length
    const marco3Count = transactions.filter(
      (t) => t.type === "streak" && t.description === "Bônus de sequência — 3 dias seguidos",
    ).length

    expect(streakAfter).toBe(streakBefore)
    expect(marco3Count).toBe(1) // único registro do marco 3 (prova de concessão)
  })

  it("aprovação sem dias consecutivos não gera bônus (streak = 1)", async () => {
    const db = getDb()
    // Planta apenas 1 aprovação isolada (há >1 dia sem aprovar → sequência quebrada).
    db.prepare(
      `INSERT INTO submissions (id, activityId, studentId, submittedAt, status, evidence, comment, validatedBy, validatedAt, feedback)
       VALUES (?, ?, ?, ?, 'approved', '', 'plantio isolado', 'u7', ?, '')`,
    ).run("stk3", "a3", "u3", brDate(1), brDate(9))

    // Aprova hoje uma entrega pendente de Beatriz (stk3 já aprovada — usa a3 nova)
    const sandra = await loginAgent(app, USERS.sandra.email)
    const created = await sandra.post("/api/activities").send({
      title: "Redação Empresarial — Sprint Streak",
      subjectId: "s1",
      classId: "c2",
      points: 10,
      deadline: brDateInDays(15),
      type: "academic",
      status: "active",
    })
    expect(created.status).toBe(201)
    const activityId = (created.body.data as { id: string }).id

    const beatriz = await loginAgent(app, USERS.beatriz.email)
    const subm = await beatriz
      .post(`/api/activities/${activityId}/submissions`)
      .field("comment", "Entrega para teste de streak isolado")
    expect(subm.status).toBe(201)

    const list = await sandra.get(`/api/submissions?activityId=${activityId}&studentId=u3`)
    const pending = (list.body.data as Array<{ id: string; status: string }>).find(
      (s) => s.status === "under_review",
    )
    expect(pending).toBeDefined()

    const before = (await beatriz.get("/api/transactions")).body.data.length
    const approve = await sandra
      .post(`/api/submissions/${(pending as { id: string }).id}/validate`)
      .send({ action: "approve", feedback: "Ok." })
    expect(approve.status).toBe(200)

    // A aprovação de hoje não encosta na de 9 dias atrás → sequência zera em 1
    // dia e nenhum marco é concedido (o mínimo é 3).
    const after = (await beatriz.get("/api/transactions")).body.data
    const streakTxs = after.filter((t: { type: string }) => t.type === "streak")
    expect(after.length).toBe(before + 1) // apenas a transação activity (+10)
    expect(streakTxs.length).toBe(0)
  })
})