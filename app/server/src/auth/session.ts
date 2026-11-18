import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { config } from "../config"
import { getDb } from "../db/connection"
import { mapSafeUser, type UserRow } from "../db/rows"
import type { SafeUser } from "../shared/types"

interface SessionClaims {
  u: string
  iat: number
  exp: number
  n: string
  user: SafeUser
}

const revokedTokens = new Set<string>()

function sign(payload: string): string {
  return createHmac("sha256", config.sessionSecret).update(payload).digest("base64url")
}

function encodeClaims(claims: SessionClaims): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url")
  return `${payload}.${sign(payload)}`
}

function decodeClaims(token: string): SessionClaims | null {
  const [payload, signature] = token.split(".")
  if (!payload || !signature) return null
  const expected = sign(payload)
  const received = Buffer.from(signature)
  const computed = Buffer.from(expected)
  if (received.length !== computed.length || !timingSafeEqual(received, computed)) return null
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionClaims
    if (!claims || typeof claims.u !== "string") return null
    if (typeof claims.iat !== "number" || typeof claims.exp !== "number") return null
    if (!claims.user || claims.user.id !== claims.u || claims.exp <= Date.now()) return null
    return claims
  } catch {
    return null
  }
}

function ensureLocalSession(token: string, claims: SessionClaims): void {
  const db = getDb()
  const session = db.prepare("SELECT token FROM sessions WHERE token = ?").get(token)
  if (!session) {
    db.prepare(
      "INSERT OR IGNORE INTO sessions (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)",
    ).run(token, claims.u, claims.iat, claims.exp)
  }
  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(claims.u)
  if (!user) {
    const snapshot = claims.user
    db.prepare(
      `INSERT OR IGNORE INTO users (id, name, email, password, role, active, avatar, classIds, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      snapshot.id,
      snapshot.name,
      snapshot.email,
      "!",
      snapshot.role,
      snapshot.active ? 1 : 0,
      snapshot.avatar,
      JSON.stringify(snapshot.classIds),
      snapshot.createdAt,
    )
  }
}

function findSessionUser(token: string): SafeUser | null {
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

export function createSession(userId: string, user: SafeUser): string {
  const db = getDb()
  const now = Date.now()
  const token = encodeClaims({
    u: userId,
    iat: now,
    exp: now + config.sessionTtlMs,
    n: randomBytes(16).toString("hex"),
    user,
  })
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
  revokedTokens.add(token)
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token)
}

export function revokeUserSessions(userId: string): void {
  revokeUserSessionsExcept(userId, null)
}

export function revokeUserSessionsExcept(userId: string, exceptToken: string | null): void {
  const db = getDb()
  const tokens = db
    .prepare("SELECT token FROM sessions WHERE userId = ? AND token <> ?")
    .all(userId, exceptToken ?? "") as Array<{ token: string }>
  for (const row of tokens) revokedTokens.add(row.token)
  db.prepare("DELETE FROM sessions WHERE userId = ? AND token <> ?").run(userId, exceptToken ?? "")
}

export function deleteExpiredSessions(): void {
  const db = getDb()
  db.prepare("DELETE FROM sessions WHERE expiresAt <= ?").run(Date.now())
}

export function touchSession(token: string): void {
  const db = getDb()
  const claims = decodeClaims(token)
  if (claims) ensureLocalSession(token, claims)
  db.prepare("UPDATE sessions SET expiresAt = ? WHERE token = ?").run(
    Date.now() + config.sessionTtlMs,
    token,
  )
}

export function getSessionUser(token: string): SafeUser | null {
  if (revokedTokens.has(token)) return null
  const claims = decodeClaims(token)
  if (claims) {
    ensureLocalSession(token, claims)
    return findSessionUser(token)
  }
  return findSessionUser(token)
}
