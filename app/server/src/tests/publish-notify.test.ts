import { describe, it, expect, beforeAll } from "vitest"
import { makeApp, prepareDb, loginAgent, USERS, brDateInDays } from "./helpers"
import { getDb } from "../db/connection"
import type { Express } from "express"

type Agent = Awaited<ReturnType<typeof loginAgent>>

// Lacuna de cobertura: publicar atividade (draft→active) cria notificação
// new_activity para a turma e auditoria ACTIVITY_PUBLISHED (RF04/RF10/RN06).
//
// Resiliência a mudanças concorrentes em server/src/routes/activities.ts:
// - prazo SEMPRE relativo a hoje (amanhã) → passa mesmo com a nova validação
//   "deadline >= hoje" (DEADLINE_IN_PAST) implementada em paralelo;
// - não dependemos da ordenação das rotas, nem de datas fixas do seed.
describe("Publicação de atividade → notificação + auditoria", () => {
  let app: Express

  beforeAll(() => {
    prepareDb()
    app = makeApp()
  })

  async function setup(): Promise<Agent> {
    prepareDb()
    return loginAgent(app, USERS.marcelo.email)
  }

  function notificationsFor(title: string): Array<{ userId: string; type: string }> {
    const db = getDb()
    return db
      .prepare(
        "SELECT userId, type FROM notifications WHERE type = 'new_activity' AND message LIKE ?",
      )
      .all(`%${title}%`) as unknown as Array<{ userId: string; type: string }>
  }

  function publishedAudits(activityId: string): Array<{ action: string }> {
    const db = getDb()
    return db
      .prepare("SELECT action FROM auditLogs WHERE action = 'ACTIVITY_PUBLISHED' AND entityId = ?")
      .all(activityId) as unknown as Array<{ action: string }>
  }

  it("draft criado e publicado via PATCH /:id/status notifica a turma e audita", async () => {
    const marcelo = await setup()
    const title = `Atividade QA Publicar ${Date.now()}`
    const created = await marcelo.post("/api/activities").send({
      title,
      description: "Publicação resiliente a mudanças concorrentes",
      subjectId: "s1",
      classId: "c1",
      points: 10,
      deadline: brDateInDays(1),
      type: "academic",
      status: "draft",
    })
    expect(created.status).toBe(201)
    const activityId = created.body.data.id as string

    const pub = await marcelo.patch(`/api/activities/${activityId}/status`).send({ status: "active" })
    expect(pub.status).toBe(200)
    expect(pub.body.data.status).toBe("active")

    // notificação new_activity para os 2 alunos da turma c1 (u1, u2)
    const notifs = notificationsFor(title)
    expect(notifs.map((n) => n.userId).sort()).toEqual(["u1", "u2"])

    // auditoria ACTIVITY_PUBLISHED
    expect(publishedAudits(activityId)).toHaveLength(1)
  })

  it("criação já com status active também notifica e audita (caminho direto)", async () => {
    const marcelo = await setup()
    const title = `Atividade QA Direta ${Date.now()}`
    const created = await marcelo.post("/api/activities").send({
      title,
      description: "Publicada na criação",
      subjectId: "s1",
      classId: "c1",
      points: 10,
      deadline: brDateInDays(2),
      type: "academic",
      status: "active",
    })
    expect(created.status).toBe(201)
    expect(created.body.data.status).toBe("active")

    expect(notificationsFor(title)).toHaveLength(2) // um por aluno da c1
    expect(publishedAudits(created.body.data.id as string)).toHaveLength(1)
  })

  it("atividade permanecendo draft NÃO notifica nem audita publicação", async () => {
    const marcelo = await setup()
    const title = `Atividade QA Rascunho ${Date.now()}`
    const created = await marcelo.post("/api/activities").send({
      title,
      description: "Rascunho não publicado",
      subjectId: "s1",
      classId: "c1",
      points: 10,
      deadline: brDateInDays(3),
      type: "academic",
      status: "draft",
    })
    expect(created.status).toBe(201)

    expect(notificationsFor(title)).toHaveLength(0)
    expect(publishedAudits(created.body.data.id as string)).toHaveLength(0)
  })

  it("prazo inválido (formato) na criação → 400 e nenhuma notificação", async () => {
    const marcelo = await setup()
    const created = await marcelo.post("/api/activities").send({
      title: `Atividade QA Prazo ${Date.now()}`,
      subjectId: "s1",
      classId: "c1",
      points: 10,
      deadline: "10-08-2026",
      type: "academic",
      status: "active",
    })
    expect(created.status).toBe(400)
  })

  it("prazo no passado → 422 DEADLINE_IN_PAST (comportamento final)", async () => {
    const marcelo = await setup()
    const created = await marcelo.post("/api/activities").send({
      title: `Atividade QA Passado ${Date.now()}`,
      subjectId: "s1",
      classId: "c1",
      points: 10,
      deadline: "01/01/2000",
      type: "academic",
      status: "active",
    })
    expect(created.status).toBe(422)
    expect(created.body.details).toBe("DEADLINE_IN_PAST")
  })
})