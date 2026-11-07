import request from "supertest"
import type { Express } from "express"
import type { DatabaseSync } from "node:sqlite"
import { createApp } from "../app"
import { getDb, resetDb } from "../db/connection"
import { runSchema } from "../db/schema"
import { runSeed } from "../db/seed"

/** Cria banco em memória limpo com schema + seed de demonstração. */
export function prepareDb() {
  resetDb()
  const db = getDb()
  runSchema(db)
  runSeed(db)
  return db
}

const SAFE_TABLE = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * `COUNT(*)` de uma tabela. Fica aqui (e não em cada arquivo de teste) porque
 * as sondagens de "a migração preservou as linhas" comparam contagens: o nome da
 * tabela é o único valor interpolado no SQL, então precisa ser identificador.
 */
export function count(db: DatabaseSync, table: string): number {
  if (!SAFE_TABLE.test(table)) throw new Error(`count: nome de tabela inválido ${JSON.stringify(table)}`)
  const row = db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get() as { total: number }
  return Number(row.total)
}

export function makeApp(): Express {
  return createApp()
}

/** Data local daqui a `days` dias no formato DD/MM/AAAA (prazos futuros). */
export function brDateInDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** Usuários demo do seed da V3 (1º/2º/3º ano do Técnico em Administração). */
export const USERS = {
  ana: { email: "ana@etec.sp.gov.br", password: "123456", id: "u1", role: "student", classId: "c1" },
  mateus: { email: "mateus@etec.sp.gov.br", password: "123456", id: "u2", role: "student", classId: "c1" },
  beatriz: { email: "beatriz@etec.sp.gov.br", password: "123456", id: "u3", role: "student", classId: "c2" },
  ricardo: { email: "ricardo@etec.sp.gov.br", password: "123456", id: "u4", role: "student", classId: "c2" },
  fernanda: { email: "fernanda@etec.sp.gov.br", password: "123456", id: "u5", role: "student", classId: "c3" },
  marcelo: { email: "marcelo@etec.sp.gov.br", password: "123456", id: "u6", role: "teacher", classId: "c1" },
  sandra: { email: "sandra@etec.sp.gov.br", password: "123456", id: "u7", role: "teacher", classId: "c2" },
  carlos: { email: "carlos@etec.sp.gov.br", password: "123456", id: "u8", role: "staff" },
  juliana: { email: "juliana@etec.sp.gov.br", password: "123456", id: "u9", role: "coordinator" },
} as const

/** Autentica e mantém o cookie de sessão via supertest agent. */
export async function loginAgent(
  app: Express,
  email: string,
  password = "123456",
): Promise<ReturnType<typeof request.agent>> {
  const agent = request.agent(app)
  const res = await agent.post("/api/auth/login").send({ email, password })
  if (res.status !== 200) {
    throw new Error(`login falhou para ${email}: ${res.status} ${JSON.stringify(res.body)}`)
  }
  return agent
}