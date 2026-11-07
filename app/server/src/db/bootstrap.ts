import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { hashPassword } from "../auth/password"
import { nowBR, todayBR } from "../lib/dates"
import { uuid } from "../lib/uuid"
import { withTransaction } from "./transaction"

/**
 * Bootstrap do primeiro coordenador a partir de variáveis de ambiente.
 *
 * O boot do servidor NÃO semeia mais contas de demonstração. Em um banco vazio,
 * a coordenação inicial é criada apenas quando as três variáveis abaixo estão
 * definidas:
 *
 * - `BOOTSTRAP_ADMIN_NAME`
 * - `BOOTSTRAP_ADMIN_EMAIL`
 * - `BOOTSTRAP_ADMIN_PASSWORD`
 *
 * Contratos:
 * - idempotente: se já existe QUALQUER usuário, retorna sem tocar no banco;
 * - sem as três variáveis, o banco sobe vazio (boot normal);
 * - com apenas parte delas, o boot FALHA (nunca cria um admin incompleto nem
 *   ignora uma configuração pela metade em silêncio).
 */

const BOOTSTRAP_NAME = "BOOTSTRAP_ADMIN_NAME"
const BOOTSTRAP_EMAIL = "BOOTSTRAP_ADMIN_EMAIL"
const BOOTSTRAP_PASSWORD = "BOOTSTRAP_ADMIN_PASSWORD"

const bootstrapSchema = z.object({
  name: z.string().min(3, `${BOOTSTRAP_NAME} deve ter ao menos 3 caracteres.`),
  email: z.string().email(`${BOOTSTRAP_EMAIL} inválido.`),
  password: z.string().min(6, `${BOOTSTRAP_PASSWORD} deve ter ao menos 6 caracteres.`),
})

/** True quando a variável existe e tem conteúdo após `trim`. */
function isDefined(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0
}

/**
 * Cria a coordenação inicial em um banco vazio. Não usa o singleton
 * `getDb()`/`recordAudit` de propósito: recebe a conexão do boot e grava a
 * auditoria na mesma transação da criação do usuário.
 */
export function bootstrapAdminFromEnv(
  db: DatabaseSync,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const count = db.prepare("SELECT COUNT(*) AS total FROM users").get() as { total: number }
  if (Number(count.total) > 0) return

  const rawName = env[BOOTSTRAP_NAME]
  const rawEmail = env[BOOTSTRAP_EMAIL]
  const rawPassword = env[BOOTSTRAP_PASSWORD]

  const nameDefined = isDefined(rawName)
  const emailDefined = isDefined(rawEmail)
  const passwordDefined = isDefined(rawPassword)

  // Nenhuma variável definida: banco sobe vazio, sem erro.
  if (!nameDefined && !emailDefined && !passwordDefined) return

  // Configuração parcial nunca pode virar um admin incompleto/silencioso.
  if (!nameDefined || !emailDefined || !passwordDefined) {
    const missing: string[] = []
    if (!nameDefined) missing.push(BOOTSTRAP_NAME)
    if (!emailDefined) missing.push(BOOTSTRAP_EMAIL)
    if (!passwordDefined) missing.push(BOOTSTRAP_PASSWORD)
    throw new Error(
      `Bootstrap do coordenador incompleto: defina também ${missing.join(", ")} ` +
        "(ou remova todas as variáveis BOOTSTRAP_ADMIN_* para subir com o banco vazio).",
    )
  }

  const parsed = bootstrapSchema.parse({
    name: rawName.trim(),
    email: rawEmail.trim().toLowerCase(),
    password: rawPassword,
  })

  const id = uuid()
  const avatar = (parsed.name.charAt(0) || "?").toUpperCase()

  withTransaction(db, () => {
    db.prepare(
      `INSERT INTO users (id, name, email, password, role, active, avatar, classIds, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      parsed.name,
      parsed.email,
      hashPassword(parsed.password),
      "coordinator",
      1,
      avatar,
      "[]",
      todayBR(),
    )

    db.prepare(
      `INSERT INTO auditLogs (id, userId, action, entity, entityId, description, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      uuid(),
      id,
      "USER_CREATED",
      "User",
      id,
      `Bootstrap criou coordenação '${parsed.name}' (${parsed.email})`,
      nowBR(),
    )
  })

  // Apenas o e-mail: a senha nunca vai para o log.
  console.log(
    `[conecta-etec-server] Coordenador inicial criado via bootstrap: ${parsed.email}`,
  )
}
