import { describe, it, expect, beforeAll } from "vitest"
import request from "supertest"
import { makeApp, prepareDb, loginAgent, USERS } from "./helpers"
import type { Express } from "express"

describe("Usuários (RF02, RF13)", () => {
  let app: Express

  beforeAll(() => {
    prepareDb()
    app = makeApp()
  })

  it("cadastro restrito à coordenação — aluno recebe 403", async () => {
    const agent = await loginAgent(app, USERS.ana.email)
    const res = await agent.post("/api/users").send({
      name: "Aluno Invasor",
      email: "invasor@etec.sp.gov.br",
      password: "123456",
      role: "student",
    })
    expect(res.status).toBe(403)
  })

  it("coordenação cria aluno com vínculo de turma → 201 e turma atualizada", async () => {
    const agent = await loginAgent(app, USERS.juliana.email)
    const res = await agent.post("/api/users").send({
      name: "Nova Aluna",
      email: "n.aluna@etec.sp.gov.br",
      password: "123456",
      role: "student",
      classId: "c2",
    })
    expect(res.status).toBe(201)
    expect(res.body.data).not.toHaveProperty("password")
    expect(res.body.data.classIds).toEqual(["c2"])

    const classes = await agent.get("/api/classes")
    const c2 = classes.body.data.find((c: { id: string }) => c.id === "c2")
    expect(c2.studentIds).toContain(res.body.data.id)
  })

  it("e-mail duplicado → 409", async () => {
    const agent = await loginAgent(app, USERS.juliana.email)
    const res = await agent.post("/api/users").send({
      name: "Ana Duplicada",
      email: USERS.ana.email,
      password: "123456",
      role: "student",
    })
    expect(res.status).toBe(409)
  })

  it("coordenação desativa usuário — RN01 bloqueia login depois", async () => {
    const agent = await loginAgent(app, USERS.juliana.email)
    const res = await agent.patch("/api/users/u2").send({ active: false })
    expect(res.status).toBe(200)
    expect(res.body.data.active).toBe(false)

    const login = await request(app).post("/api/auth/login").send({
      email: USERS.mateus.email,
      password: USERS.mateus.password,
    })
    expect(login.status).toBe(401)
  })

  it("lista usuários é restrita à coordenação", async () => {
    const student = await loginAgent(app, USERS.ana.email)
    const denied = await student.get("/api/users")
    expect(denied.status).toBe(403)

    const coord = await loginAgent(app, USERS.juliana.email)
    const res = await coord.get("/api/users?role=student")
    expect(res.status).toBe(200)
    const students = res.body.data as Array<{ id: string }>
    expect(students.length).toBeGreaterThanOrEqual(5)
  })

  it("GET /users/:id/points — aluno vê os próprios, outro papel não", async () => {
    const ana = await loginAgent(app, USERS.ana.email)
    const own = await ana.get("/api/users/u1/points")
    expect(own.status).toBe(200)
    expect(own.body.data.balance).toBe(0) // banco de demonstração nasce sem histórico
    expect(Array.isArray(own.body.data.transactions)).toBe(true)

    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const forbidden = await marcelo.get("/api/users/u1/points")
    expect(forbidden.status).toBe(403)

    const coord = await loginAgent(app, USERS.juliana.email)
    const any = await coord.get("/api/users/u3/points")
    expect(any.status).toBe(200)
    expect(any.body.data.balance).toBe(0)
  })
})