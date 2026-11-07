import { describe, it, expect, beforeAll } from "vitest"
import { makeApp, prepareDb, loginAgent, USERS, brDateInDays } from "./helpers"
import { createActivity } from "./fixtures"
import type { ActivityType } from "../shared/types"
import type { Express } from "express"

type Demo = keyof typeof USERS

/**
 * Contrato do guard de autoria de `createActivity` (`tests/fixtures.ts`).
 *
 * O guard existe para o fixture não plantar uma atividade que a rota de criação
 * recusaria. Este arquivo diz qual é a régua: para cada par (responsável, turma),
 * **o que o fixture aceita tem que ser exatamente o que `POST /api/activities`
 * aceita** — e a régua é comparada contra a rota real, por HTTP, não contra a
 * opinião do fixture sobre a rota.
 *
 * O caso que mais importa é o C1 do seed: o Prof. Marcelo (u6) tem as três turmas
 * em `users.classIds`, mas é `teacherIds` só de `c1` e `c2`. A rota autoriza pelo
 * OU (`classIds` cobre a turma **ou** a turma o lista), então ele cria no 3º Ano A
 * — e o fixture precisa continuar plantando esse estado, que é a divergência real
 * e documentada que a revisão final vai querer exercitar.
 */
describe("Guard de autoria do fixture createActivity", () => {
  let app: Express

  beforeAll(() => {
    prepareDb()
    app = makeApp()
  })

  /** Status que a rota real devolve para o mesmo par (responsável, turma). */
  async function statusDaRota(user: Demo, classId: string, type: ActivityType): Promise<number> {
    prepareDb()
    const agent = await loginAgent(app, USERS[user].email)
    const res = await agent.post("/api/activities").send({
      title: `Atividade de ${USERS[user].id} em ${classId}`,
      subjectId: "s1",
      classId,
      points: 10,
      deadline: brDateInDays(10),
      type,
      status: "draft",
    })
    return res.status
  }

  /** O fixture aceitou plantar a atividade? */
  function fixtureAceita(user: Demo, classId: string, type: ActivityType): boolean {
    try {
      createActivity(prepareDb(), { teacherId: USERS[user].id, classId, type })
      return true
    } catch {
      return false
    }
  }

  const casos: Array<{ user: Demo; classId: string; type: ActivityType; motivo: string }> = [
    { user: "marcelo", classId: "c1", type: "academic", motivo: "é teacherIds do 1º Ano A" },
    { user: "marcelo", classId: "c2", type: "academic", motivo: "é teacherIds do 2º Ano A" },
    { user: "sandra", classId: "c2", type: "academic", motivo: "é teacherIds do 2º Ano A" },
    { user: "sandra", classId: "c3", type: "academic", motivo: "é teacherIds do 3º Ano A" },
    { user: "marcelo", classId: "c3", type: "academic", motivo: "C1: classIds cobre o 3º, e a rota libera" },
    { user: "carlos", classId: "c1", type: "school_action", motivo: "staff cria em qualquer turma" },
    { user: "sandra", classId: "c1", type: "academic", motivo: "não atua no 1º Ano A: os dois caminhos recusam" },
    { user: "fernanda", classId: "c2", type: "academic", motivo: "aluno não cria atividade (requireRoles)" },
  ]

  for (const { user, classId, type, motivo } of casos) {
    it(`${USERS[user].id} × ${classId} — ${motivo}`, async () => {
      const status = await statusDaRota(user, classId, type)
      const aceito = fixtureAceita(user, classId, type)
      expect(aceito, `fixture e rota discordaram (rota respondeu ${status})`).toBe(status === 201)
    })
  }

  it("sem teacherId, a atividade nasce com o professor de verdade da turma", () => {
    // Sem `db.close()`: é o banco compartilhado, quem fecha é o `resetDb` do
    // próximo `prepareDb`.
    const db = prepareDb()
    const id = createActivity(db, { classId: "c1" })
    const planted = db.prepare("SELECT teacherId FROM activities WHERE id = ?").get(id) as { teacherId: string }
    expect(planted.teacherId).toBe("u6") // teacherIds de c1 no seed
  })

  it("a recusa diz o que a rota faria, e a quem", () => {
    const db = prepareDb()
    // Recusa por turma: a mensagem nomeia o 403 que a rota devolveria.
    expect(() => createActivity(db, { teacherId: USERS.sandra.id, classId: "c1" })).toThrow(
      /TEACHER_NOT_IN_CLASS/,
    )
    expect(() => createActivity(db, { teacherId: USERS.sandra.id, classId: "c1" })).toThrow(/c1/)
    // Recusa por papel: a mensagem nomeia o requireRoles da rota.
    expect(() => createActivity(db, { teacherId: USERS.ana.id, classId: "c1" })).toThrow(/teacher e staff/)
  })
})
