import { describe, it, expect, beforeAll } from "vitest"
import request from "supertest"
import { makeApp, prepareDb, loginAgent, USERS } from "./helpers"
import { getDb } from "../db/connection"
import type { Express } from "express"

describe("Autenticação (RF01, RN01)", () => {
  let app: Express

  beforeAll(() => {
    prepareDb()
    app = makeApp()
  })

  it("login correto retorna SafeUser sem password e define cookie httpOnly", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: USERS.ana.email,
      password: USERS.ana.password,
    })
    expect(res.status).toBe(200)
    expect(res.body.data).toBeDefined()
    expect(res.body.data).not.toHaveProperty("password")
    expect(res.body.data.role).toBe("student")
    expect(res.body.data.email).toBe(USERS.ana.email)
    const cookie = res.headers["set-cookie"] as unknown as string[]
    expect(cookie.some((c) => c.includes("sid=") && c.includes("HttpOnly"))).toBe(true)
  })

  it("login com senha incorreta retorna 401", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: USERS.ana.email,
      password: "senha-errada",
    })
    expect(res.status).toBe(401)
    expect(res.body.error).toBeDefined()
  })

  it("login com e-mail inexistente retorna 401", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "nao-existe@etec.sp.gov.br",
      password: "123456",
    })
    expect(res.status).toBe(401)
  })

  it("RN01 — usuário inativo não autentica (mensagem genérica, sem enumeração)", async () => {
    const db = getDb()
    db.prepare("UPDATE users SET active = 0 WHERE id = ?").run(USERS.mateus.id)
    const res = await request(app).post("/api/auth/login").send({
      email: USERS.mateus.email,
      password: USERS.mateus.password,
    })
    expect(res.status).toBe(401)
    expect(res.body.error).toBe("E-mail ou senha incorretos.")
    expect(String(res.body.error).toLowerCase()).not.toContain("inativo")
    // restaura
    db.prepare("UPDATE users SET active = 1 WHERE id = ?").run(USERS.mateus.id)
  })

  it("RN01 — sessão existente de usuário desativado deixa de valer", async () => {
    const agent = await loginAgent(app, USERS.mateus.email)
    const ok = await agent.get("/api/auth/me")
    expect(ok.status).toBe(200)
    getDb().prepare("UPDATE users SET active = 0 WHERE id = ?").run(USERS.mateus.id)
    const denied = await agent.get("/api/auth/me")
    expect(denied.status).toBe(401)
    getDb().prepare("UPDATE users SET active = 1 WHERE id = ?").run(USERS.mateus.id)
  })

  it("GET /me sem cookie retorna 401", async () => {
    const res = await request(app).get("/api/auth/me")
    expect(res.status).toBe(401)
  })

  it("GET /me com cookie retorna o usuário da sessão", async () => {
    const agent = await loginAgent(app, USERS.ana.email)
    const res = await agent.get("/api/auth/me")
    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe(USERS.ana.id)
  })

  it("logout revoga a sessão", async () => {
    const agent = await loginAgent(app, USERS.ana.email)
    const logout = await agent.post("/api/auth/logout")
    expect(logout.status).toBe(200)
    const me = await agent.get("/api/auth/me")
    expect(me.status).toBe(401)
  })

  it("validação de payload: sem campos obrigatórios → 400", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "x" })
    expect(res.status).toBe(400)
    expect(res.body.details).toBeDefined()
  })
})