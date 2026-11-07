import { describe, it, expect, beforeAll } from "vitest"
import { makeApp, prepareDb, loginAgent, USERS } from "./helpers"
import { createActivity } from "./fixtures"
import { getDb } from "../db/connection"
import type { Express } from "express"

type Agent = Awaited<ReturnType<typeof loginAgent>>

// Lacuna de cobertura: CRUD de disciplinas (RF13) — somente coordenação.
describe("CRUD de disciplinas (RF13)", () => {
  let app: Express

  beforeAll(() => {
    prepareDb()
    app = makeApp()
  })

  /** Cada cenário reinicia o banco e autentica a coordenação. */
  async function setupCoord(): Promise<Agent> {
    prepareDb()
    return loginAgent(app, USERS.juliana.email)
  }

  it("coordenação cria disciplina", async () => {
    const coord = await setupCoord()
    const res = await coord.post("/api/subjects").send({
      name: "Empreendedorismo",
      icon: "🚀",
      teacherIds: [USERS.marcelo.id],
      classIds: ["c1", "c2"],
    })
    expect(res.status).toBe(201)
    expect(res.body.data.name).toBe("Empreendedorismo")
    expect(res.body.data.icon).toBe("🚀")
    expect(res.body.data.teacherIds).toEqual([USERS.marcelo.id])
  })

  it("coordenação lista disciplinas", async () => {
    const coord = await setupCoord()
    const res = await coord.get("/api/subjects")
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(16) // seed s1..s16 (12 BNCC + 4 técnicas)
  })

  it("coordenação edita disciplina", async () => {
    const coord = await setupCoord()
    const res = await coord.patch("/api/subjects/s1").send({ name: "Matemática Aplicada" })
    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe("Matemática Aplicada")

    const list = await coord.get("/api/subjects")
    const s1 = list.body.data.find((s: { id: string }) => s.id === "s1")
    expect(s1?.name).toBe("Matemática Aplicada")
  })

  it("delete de disciplina com atividades → 409 SUBJECT_HAS_ACTIVITIES", async () => {
    await setupCoord()
    // A V3 não semeia histórico, então o vínculo que o guard do delete
    // verifica é criado aqui: uma atividade da s1 é o que torna a disciplina
    // indeletável (o resto do cadastro do banco segue zerado).
    // Sem `teacherId` o fixture usa o professor de c1 (Prof. Marcelo) — a
    // mesma atividade que `POST /api/activities` aceitaria criar.
    createActivity(getDb(), { subjectId: "s1", classId: "c1" })

    const coord = await loginAgent(app, USERS.juliana.email)
    const res = await coord.delete("/api/subjects/s1")
    expect(res.status).toBe(409)
    expect(res.body.details).toBe("SUBJECT_HAS_ACTIVITIES")
  })

  it("delete de disciplina sem atividades → 200 e some da listagem", async () => {
    const coord = await setupCoord()
    const created = await coord.post("/api/subjects").send({ name: "Disciplina Descartável" })
    const id = created.body.data.id as string

    const res = await coord.delete(`/api/subjects/${id}`)
    expect(res.status).toBe(200)

    const list = await coord.get("/api/subjects")
    expect(list.body.data.some((s: { id: string }) => s.id === id)).toBe(false)
  })

  it("não-coordenação recebe 403 ao criar/editar/excluir disciplina", async () => {
    await setupCoord()

    const teacher = await loginAgent(app, USERS.marcelo.email)
    const teacherCreate = await teacher.post("/api/subjects").send({ name: "hack" })
    expect(teacherCreate.status).toBe(403)

    const teacherEdit = await teacher.patch("/api/subjects/s1").send({ name: "hack" })
    expect(teacherEdit.status).toBe(403)

    const teacherDelete = await teacher.delete("/api/subjects/s1")
    expect(teacherDelete.status).toBe(403)

    const student = await loginAgent(app, USERS.ana.email)
    const studentCreate = await student.post("/api/subjects").send({ name: "hack" })
    expect(studentCreate.status).toBe(403)
  })

  it("payload inválido → 400 com details", async () => {
    const coord = await setupCoord()
    const res = await coord.post("/api/subjects").send({ name: "" })
    expect(res.status).toBe(400)
    expect(res.body.details).toBeDefined()
  })
})