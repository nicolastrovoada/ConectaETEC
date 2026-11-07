import type { DatabaseSync } from "node:sqlite"
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { bootstrapAdminFromEnv } from "../db/bootstrap"
import { getDb, resetDb } from "../db/connection"
import { runSchema } from "../db/schema"
import { verifyPassword } from "../auth/password"
import type { UserRow } from "../db/rows"
import { count } from "./helpers"

const KEYS = [
  "BOOTSTRAP_ADMIN_NAME",
  "BOOTSTRAP_ADMIN_EMAIL",
  "BOOTSTRAP_ADMIN_PASSWORD",
] as const

type BootstrapKey = (typeof KEYS)[number]

/** Define as variáveis de bootstrap no ambiente (e remove as ausentes). */
function setBootstrapEnv(values: Partial<Record<BootstrapKey, string>>): void {
  for (const key of KEYS) {
    const value = values[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

/** Banco em memória limpo com o schema aplicado (sem seed). */
function freshDb(): DatabaseSync {
  resetDb()
  const db = getDb()
  runSchema(db)
  return db
}

function users(db: DatabaseSync): UserRow[] {
  return db.prepare("SELECT * FROM users ORDER BY createdAt").all() as unknown as UserRow[]
}

interface AuditRow {
  id: string
  userId: string
  action: string
  entity: string
  entityId: string
  description: string
  timestamp: string
}

function auditLogs(db: DatabaseSync): AuditRow[] {
  return db.prepare("SELECT * FROM auditLogs").all() as unknown as AuditRow[]
}

describe("Bootstrap do primeiro coordenador", () => {
  let originalEnv: Partial<Record<BootstrapKey, string | undefined>>

  beforeEach(() => {
    originalEnv = {}
    for (const key of KEYS) originalEnv[key] = process.env[key]
  })

  afterEach(() => {
    for (const key of KEYS) {
      const previous = originalEnv[key]
      if (previous === undefined) delete process.env[key]
      else process.env[key] = previous
    }
    resetDb()
  })

  it("banco vazio + env completo cria 1 coordenador ativo com senha hasheada e auditoria", () => {
    const db = freshDb()
    setBootstrapEnv({
      BOOTSTRAP_ADMIN_NAME: "  Maria Coordenadora  ",
      BOOTSTRAP_ADMIN_EMAIL: "  Coordenacao@Etec.SP.GOV.BR ",
      BOOTSTRAP_ADMIN_PASSWORD: "senhaSegura123",
    })

    bootstrapAdminFromEnv(db)

    const rows = users(db)
    expect(rows).toHaveLength(1)
    const user = rows[0]
    expect(user).toMatchObject({
      name: "Maria Coordenadora",
      email: "coordenacao@etec.sp.gov.br",
      role: "coordinator",
      active: 1,
      avatar: "M",
      classIds: "[]",
    })
    // A senha nunca é gravada em texto puro e o hash corresponde à original.
    expect(user.password).not.toBe("senhaSegura123")
    expect(user.password.startsWith("$2")).toBe(true)
    expect(verifyPassword("senhaSegura123", user.password)).toBe(true)

    const audits = auditLogs(db)
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      userId: user.id,
      action: "USER_CREATED",
      entity: "User",
      entityId: user.id,
      description: `Bootstrap criou coordenação '${user.name}' (${user.email})`,
    })
  })

  it("chamar duas vezes não duplica o usuário nem a auditoria", () => {
    const db = freshDb()
    setBootstrapEnv({
      BOOTSTRAP_ADMIN_NAME: "Maria Coordenadora",
      BOOTSTRAP_ADMIN_EMAIL: "coordenacao@etec.sp.gov.br",
      BOOTSTRAP_ADMIN_PASSWORD: "senhaSegura123",
    })

    bootstrapAdminFromEnv(db)
    bootstrapAdminFromEnv(db)

    expect(count(db, "users")).toBe(1)
    expect(count(db, "auditLogs")).toBe(1)
  })

  it("banco com usuário existente + env definido não cria outro usuário", () => {
    const db = freshDb()
    db.prepare(
      `INSERT INTO users (id, name, email, password, role, active, avatar, classIds, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("u-existing", "Aluno Existente", "aluno@etec.sp.gov.br", "hash", "student", 1, "A", "[]", "01/08/2026")
    setBootstrapEnv({
      BOOTSTRAP_ADMIN_NAME: "Maria Coordenadora",
      BOOTSTRAP_ADMIN_EMAIL: "coordenacao@etec.sp.gov.br",
      BOOTSTRAP_ADMIN_PASSWORD: "senhaSegura123",
    })

    bootstrapAdminFromEnv(db)

    const rows = users(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe("u-existing")
    expect(count(db, "auditLogs")).toBe(0)
  })

  it("sem nenhuma variável definida não cria usuário e não lança", () => {
    const db = freshDb()
    setBootstrapEnv({})

    expect(() => bootstrapAdminFromEnv(db)).not.toThrow()
    expect(count(db, "users")).toBe(0)
    expect(count(db, "auditLogs")).toBe(0)
  })

  it("env parcial lança citando exatamente as variáveis faltantes", () => {
    const db = freshDb()
    setBootstrapEnv({ BOOTSTRAP_ADMIN_NAME: "Maria Coordenadora" })

    let message = ""
    try {
      bootstrapAdminFromEnv(db)
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }

    expect(message).toContain("BOOTSTRAP_ADMIN_EMAIL")
    expect(message).toContain("BOOTSTRAP_ADMIN_PASSWORD")
    expect(message).not.toContain("BOOTSTRAP_ADMIN_NAME")
    expect(count(db, "users")).toBe(0)
  })

  it("nome, e-mail ou senha inválidos lançam e não criam usuário", () => {
    const db = freshDb()

    setBootstrapEnv({
      BOOTSTRAP_ADMIN_NAME: "Jo",
      BOOTSTRAP_ADMIN_EMAIL: "coordenacao@etec.sp.gov.br",
      BOOTSTRAP_ADMIN_PASSWORD: "senhaSegura123",
    })
    expect(() => bootstrapAdminFromEnv(db)).toThrow(/BOOTSTRAP_ADMIN_NAME/)

    setBootstrapEnv({
      BOOTSTRAP_ADMIN_NAME: "Maria Coordenadora",
      BOOTSTRAP_ADMIN_EMAIL: "email-invalido",
      BOOTSTRAP_ADMIN_PASSWORD: "senhaSegura123",
    })
    expect(() => bootstrapAdminFromEnv(db)).toThrow(/BOOTSTRAP_ADMIN_EMAIL/)

    setBootstrapEnv({
      BOOTSTRAP_ADMIN_NAME: "Maria Coordenadora",
      BOOTSTRAP_ADMIN_EMAIL: "coordenacao@etec.sp.gov.br",
      BOOTSTRAP_ADMIN_PASSWORD: "12345",
    })
    expect(() => bootstrapAdminFromEnv(db)).toThrow(/BOOTSTRAP_ADMIN_PASSWORD/)

    expect(count(db, "users")).toBe(0)
  })
})
