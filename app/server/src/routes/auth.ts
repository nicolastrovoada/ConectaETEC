import { Router } from "express"
import { z } from "zod"
import { config } from "../config"
import { verifyPassword } from "../auth/password"
import { createSession, deleteExpiredSessions, revokeSession, touchSession } from "../auth/session"
import { requireAuth, requireUser } from "../auth/middleware"
import {
  isLoginBlocked,
  recordLoginFailure,
  clearLoginFailures,
} from "../auth/rateLimit"
import { getDb } from "../db/connection"
import { findUserByEmail, findUserById } from "../db/queries"
import { mapSafeUser, userToRow } from "../db/rows"
import { handle, sendData } from "../lib/http"
import { unauthorized, tooMany } from "../lib/errors"
import { recordAudit } from "../services/audit"

const loginSchema = z.object({
  email: z.string().trim().email("E-mail inválido."),
  password: z.string().min(1, "Senha obrigatória."),
})

export const authRouter = Router()

authRouter.post(
  "/login",
  handle((req, res) => {
    const body = loginSchema.parse(req.body)
    const email = body.email.toLowerCase()
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown"

    // Rate limit por ip+e-mail (5 falhas em 5 min) — apenas no login.
    if (isLoginBlocked(ip, email)) {
      throw tooMany(
        "Muitas tentativas de login. Aguarde 5 minutos antes de tentar novamente.",
        "LOGIN_RATE_LIMITED",
      )
    }

    const db = getDb()
    const user = findUserByEmail(db, email)
    if (!user || !verifyPassword(body.password, user.password)) {
      recordLoginFailure(ip, email)
      throw unauthorized("E-mail ou senha incorretos.")
    }
    // RN01 — somente usuários ativos autenticam. A mensagem é a MESMA do caso
    // de credencial inválida para não vazar estado da conta (anti-enumeração).
    if (!user.active) {
      recordLoginFailure(ip, email)
      throw unauthorized("E-mail ou senha incorretos.")
    }
    clearLoginFailures(ip, email)
    deleteExpiredSessions()
    const token = createSession(user.id)
    res.cookie(config.cookieName, token, {
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: "lax",
      maxAge: config.sessionTtlMs,
      path: "/",
    })
    recordAudit({
      userId: user.id,
      action: "LOGIN",
      entity: "User",
      entityId: user.id,
      description: `${user.name} fez login como ${user.role}`,
    })
    sendData(res, 200, mapSafeUser(userToRow(user)))
  }),
)

authRouter.post(
  "/logout",
  requireAuth,
  handle((_req, res) => {
    const user = requireUser(res)
    const token = res.locals.sessionToken
    if (token) revokeSession(token)
    res.clearCookie(config.cookieName, {
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: "lax",
      path: "/",
    })
    recordAudit({
      userId: user.id,
      action: "LOGOUT",
      entity: "User",
      entityId: user.id,
      description: `${user.name} encerrou a sessão`,
    })
    sendData(res, 200, { ok: true })
  }),
)

authRouter.get(
  "/me",
  requireAuth,
  handle((_req, res) => {
    const user = requireUser(res)
    // Renovação de sessão (janela móvel)
    if (res.locals.sessionToken) touchSession(res.locals.sessionToken)
    const db = getDb()
    const fresh = findUserById(db, user.id)
    if (!fresh) throw unauthorized()
    sendData(res, 200, mapSafeUser(userToRow(fresh)))
  }),
)