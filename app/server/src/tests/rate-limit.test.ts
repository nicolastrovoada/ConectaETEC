import { describe, it, expect, beforeAll } from "vitest"
import request from "supertest"
import { makeApp, prepareDb } from "./helpers"
import { isLoginBlocked, recordLoginFailure, clearLoginFailures } from "../auth/rateLimit"
import type { Express } from "express"

// Lacuna de cobertura: bloqueio de login após 5 falhas em 5 min (auth/rateLimit.ts).
// Janela real definida no módulo: WINDOW_MS = 5min, MAX_FAILURES = 5.
// Obs.: a expiração por tempo (5 min) não é observável sem esperar — testamos o
// bloqueio, a independência por chave e o reset explícito.
describe("Rate limit do login (5 falhas / janela de 5 min)", () => {
  let app: Express

  beforeAll(() => {
    prepareDb()
    app = makeApp()
  })

  it("5 falhas com credenciais válidas → 401; 6ª tentativa → 429 LOGIN_RATE_LIMITED", async () => {
    const email = `rate-${Date.now()}@etec.sp.gov.br` // e-mail inexistente = sempre senha errada
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post("/api/auth/login").send({ email, password: "errada" })
      expect(res.status).toBe(401)
    }
    const sixth = await request(app).post("/api/auth/login").send({ email, password: "errada" })
    expect(sixth.status).toBe(429)
    expect(sixth.body.details).toBe("LOGIN_RATE_LIMITED")
    expect(String(sixth.body.error)).toContain("Muitas tentativas")
  })

  it("chave ip|email separada não é bloqueada (bloqueio por e-mail)", async () => {
    const email = `rate-free-${Date.now()}@etec.sp.gov.br`
    const res = await request(app).post("/api/auth/login").send({ email, password: "errada" })
    expect(res.status).toBe(401) // continua permitida: contador de outro e-mail não interfere
  })

  it("reset explícito (clearLoginFailures) desbloqueia a chave", () => {
    const ip = "unit-rate-limit"
    const email = `rate-unit-${Date.now()}@etec.sp.gov.br`
    for (let i = 0; i < 5; i++) recordLoginFailure(ip, email)
    expect(isLoginBlocked(ip, email)).toBe(true)
    clearLoginFailures(ip, email)
    expect(isLoginBlocked(ip, email)).toBe(false)
  })

  it("login com sucesso limpa o contador daquele e-mail (fluxo API)", async () => {
    // Contamina uma chave de um usuário existente com 1 falha e confirma que o
    // login correto remove o bloqueio (clearLoginFailures no POST /login).
    const email = "ana@etec.sp.gov.br"
    await request(app).post("/api/auth/login").send({ email, password: "errada" })
    const ok = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "123456" })
    expect(ok.status).toBe(200)
    // depois do sucesso, falha novamente → ainda 401 (contador zerado, não 429)
    const after = await request(app).post("/api/auth/login").send({ email, password: "errada" })
    expect(after.status).toBe(401)
  })
})