import { randomBytes } from "node:crypto"
import { config } from "../config"
import { getDb } from "../db/connection"
import { mapSafeUser, type UserRow } from "../db/rows"
import type { SafeUser } from "../shared/types"

/** Sessões server-side persistidas no SQLite (tabela `sessions`). */

export function createSession(userId: string): string {
  const db = getDb()
  const token = randomBytes(32).toString("hex")
  const now = Date.now()
  db.prepare("INSERT INTO sessions (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)").run(
    token,
    userId,
    now,
    now + config.sessionTtlMs,
  )
  return token
}

export function revokeSession(token: string): void {
  const db = getDb()
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token)
}

/** Revoga todas as sessões de um usuário (ex.: troca de senha). */
export function revokeUserSessions(userId: string): void {
  revokeUserSessionsExcept(userId, null)
}

/** Revoga as sessões do usuário mantendo opcionalmente o token informado. */
export function revokeUserSessionsExcept(userId: string, exceptToken: string | null): void {
  const db = getDb()
  if (exceptToken) {
    db.prepare("DELETE FROM sessions WHERE userId = ? AND token <> ?").run(userId, exceptToken)
  } else {
    db.prepare("DELETE FROM sessions WHERE userId = ?").run(userId)
  }
}

export function deleteExpiredSessions(): void {
  const db = getDb()
  db.prepare("DELETE FROM sessions WHERE expiresAt <= ?").run(Date.now())
}

/** Renova a validade da sessão (janela móvel). */
export function touchSession(token: string): void {
  const db = getDb()
  const now = Date.now()
  db.prepare("UPDATE sessions SET expiresAt = ? WHERE token = ?").run(now + config.sessionTtlMs, token)
}

/**
 * Retorna o usuário da sessão ativa. Aplica RN01 também na leitura:
 * se o usuário foi desativado, a sessão deixa de valer.
 */
export function getSessionUser(token: string): SafeUser | null {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s
       JOIN users u ON u.id = s.userId
       WHERE s.token = ? AND s.expiresAt > ? AND u.active = 1`,
    )
    .get(token, Date.now()) as UserRow | undefined
  return row ? mapSafeUser(row) : null
}