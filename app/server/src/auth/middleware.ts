import type { NextFunction, Request, Response } from "express"
import { config } from "../config"
import { forbidden, unauthorized } from "../lib/errors"
import type { Role, SafeUser } from "../shared/types"
import { getSessionUser } from "./session"
import { enforceApiRateLimit } from "./rateLimit"
import { recordAudit } from "../services/audit"

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      user?: SafeUser
      sessionToken?: string
    }
  }
}

/** Usuário autenticado da requisição (obrigatório após requireAuth). */
export function requireUser(res: Response): SafeUser {
  if (!res.locals.user) throw unauthorized()
  return res.locals.user
}

/** Middleware de autenticação — valida cookie httpOnly `sid`. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[config.cookieName] as string | undefined
  if (!token) {
    next(unauthorized())
    return
  }
  const user = getSessionUser(token)
  if (!user) {
    next(unauthorized("Sessão inválida ou expirada."))
    return
  }
  // Rate limit genérico para mutações autenticadas (proteção além do login).
  if (req.method === "POST" || req.method === "PATCH" || req.method === "DELETE") {
    enforceApiRateLimit(user.id, req.ip ?? req.socket.remoteAddress ?? "unknown")
  }
  res.locals.user = user
  res.locals.sessionToken = token
  next()
}

/**
 * Caminho AUDITÁVEL da requisição: `baseUrl + path`, e não só `req.path`.
 *
 * Dentro de um router montado, `req.path` é o pedaço que sobra depois do mount
 * (ex.: `POST /api/notices` chega como `req.path === "/"`), então uma negativa
 * por papel ficava auditada como `entityId: "/"` — indistinguível de qualquer
 * outra rota de raiz, exatamente o oposto do que a RN06 pede ("quem tentou o
 * quê"). `baseUrl` (`/api/notices`) + `path` (`/`) reconstitui a rota real, sem
 * a query string (que é filtro, não recurso).
 */
function auditPath(req: Request): string {
  return `${req.baseUrl}${req.path}`
}

/**
 * Middleware de autorização por papel (matriz no servidor).
 * Tentativas negadas são registradas em auditoria (RN06/ACCESS_DENIED).
 */
export function requireRoles(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = res.locals.user
    if (!user) {
      next(unauthorized())
      return
    }
    if (!roles.includes(user.role)) {
      const path = auditPath(req)
      recordAudit({
        userId: user.id,
        action: "ACCESS_DENIED",
        entity: "Route",
        entityId: path,
        description: `${user.name} tentou ${req.method} ${path} com papel ${user.role} não permitido`,
      })
      next(forbidden())
      return
    }
    next()
  }
}

/**
 * Registra AUDITORIA de acesso negado (RN06) e lança 403.
 * Usado para barreiras de posse/recurso após o papel estar correto.
 */
export function forbidAndAudit(req: Request, user: SafeUser, description: string): never {
  recordAudit({
    userId: user.id,
    action: "ACCESS_DENIED",
    entity: "Route",
    entityId: auditPath(req),
    description,
  })
  throw forbidden()
}