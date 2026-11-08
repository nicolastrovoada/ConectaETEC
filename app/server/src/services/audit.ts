import { getDb } from "../db/connection"
import { mapAuditLog, type AuditLogRow } from "../db/rows"
import { isValidBRDate, nowBR } from "../lib/dates"
import { uuid } from "../lib/uuid"
import type { AuditLog } from "../shared/types"

/** Códigos de auditoria (RN06) — ver docs/api-contract.md. */
export const AUDIT_ACTIONS = {
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",
  ACCESS_DENIED: "ACCESS_DENIED",
  USER_CREATED: "USER_CREATED",
  USER_UPDATED: "USER_UPDATED",
  ACTIVITY_CREATED: "ACTIVITY_CREATED",
  ACTIVITY_UPDATED: "ACTIVITY_UPDATED",
  ACTIVITY_PUBLISHED: "ACTIVITY_PUBLISHED",
  ACTIVITY_CLOSED: "ACTIVITY_CLOSED",
  ACTIVITY_DELETED: "ACTIVITY_DELETED",
  SUBMISSION_SENT: "SUBMISSION_SENT",
  SUBMISSION_RESUBMITTED: "SUBMISSION_RESUBMITTED",
  SUBMISSION_APPROVED: "SUBMISSION_APPROVED",
  SUBMISSION_REJECTED: "SUBMISSION_REJECTED",
  REVISION_REQUIRED: "REVISION_REQUIRED",
  STREAK_BONUS: "STREAK_BONUS",
  LEVEL_UP: "LEVEL_UP",
  ATTACHMENT_UPLOADED: "ATTACHMENT_UPLOADED",
  POINTS_ADJUSTED: "POINTS_ADJUSTED",
  REWARD_REDEEMED: "REWARD_REDEEMED",
  REDEMPTION_PROCESSED: "REDEMPTION_PROCESSED",
  REDEMPTION_CANCELLED: "REDEMPTION_CANCELLED",
  CLASS_CREATED: "CLASS_CREATED",
  SUBJECT_CREATED: "SUBJECT_CREATED",
  /** 3.3 — correção solicitada resolvida porque o aluno reenviou a entrega. */
  REVISION_RESOLVED: "REVISION_RESOLVED",
  /** 3.3 — acuse de leitura de uma notificação (transitória removida ou persistente marcada). */
  NOTIFICATION_ACKNOWLEDGED: "NOTIFICATION_ACKNOWLEDGED",
  /** 3.3 — mesmo acuse, na rota que atende todas de uma vez. */
  NOTIFICATIONS_ACKNOWLEDGED: "NOTIFICATIONS_ACKNOWLEDGED",
  /** 3.5 — aviso da coordenação publicado (quadro + notificação por destinatário). */
  NOTICE_CREATED: "NOTICE_CREATED",
} as const

export type AuditAction = keyof typeof AUDIT_ACTIONS | string

export interface AuditInput {
  userId: string
  action: string
  entity: string
  entityId: string
  description: string
}

/**
 * Registra um AuditLog (RN06). Chamado automaticamente pelos serviços/rotas
 * — o client nunca insere auditoria diretamente.
 */
export function recordAudit(input: AuditInput): AuditLog {
  const db = getDb()
  const entry: AuditLog = {
    id: uuid(),
    userId: input.userId,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    description: input.description,
    timestamp: nowBR(),
  }
  db.prepare(
    `INSERT INTO auditLogs (id, userId, action, entity, entityId, description, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(entry.id, entry.userId, entry.action, entry.entity, entry.entityId, entry.description, entry.timestamp)
  return entry
}

export interface AuditLogWithUserName extends AuditLog {
  userName: string
}

export interface AuditLogFilters {
  role?: string
  action?: string
  date?: string
  user?: string
  /** Limite inferior do período (inclusivo), no formato `YYYY-MM-DD`. */
  from?: string
  /** Limite superior do período (inclusivo), no formato `YYYY-MM-DD`. */
  to?: string
  /** Busca textual em nome do usuário, ação e descrição. */
  search?: string
}

/** Formato de data aceito pelos filtros de período (`from`/`to`). */
const AUDIT_DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Chave comparável ao dia do `timestamp` gravado por `nowBR()`
 * (`DD/MM/AAAA, HH:mm:ss`): a expressão SQL
 * `substr(timestamp,7,4)||substr(timestamp,4,2)||substr(timestamp,1,2)`
 * produz `AAAAMMDD`, então o valor de `from`/`to` também precisa perder os
 * hífens antes do bind — comparar `AAAAMMDD` com `AAAA-MM-DD` inverteria a
 * ordem no separador e o filtro nunca cortaria nada.
 *
 * O regex sozinho não basta: `2020-13-01` e `2020-02-31` têm o formato certo,
 * mas não são datas de calendário. A conversão para `DD/MM/AAAA` passa por
 * `isValidBRDate`, que rejeita mês/dia inexistente. Valor inválido é ignorado
 * (retorna `null`), nunca quebra a rota.
 */
function auditDayKey(value: string): string | null {
  const match = AUDIT_DAY_PATTERN.exec(value.trim())
  if (!match) return null
  const [, year, month, day] = match
  return isValidBRDate(`${day}/${month}/${year}`) ? `${year}${month}${day}` : null
}

/** Página paginada de auditoria (Frente 5, item C). */
export interface AuditLogPage {
  items: AuditLogWithUserName[]
  total: number
  page: number
  pageSize: number
}

function buildAuditWhere(filters: AuditLogFilters): { where: string; params: string[] } {
  const where: string[] = []
  const params: string[] = []
  if (filters.role) {
    where.push("u.role = ?")
    params.push(filters.role)
  }

  // Filtros legados (`action`, `date`, `user`) continuam aceitando substring.
  // `action` e `user` usam `namekey` (minúsculas, sem acento) e `instr`, então
  // `%`/`_` são literais — `LIKE` os trataria como curinga. `date` é o texto
  // `DD/MM/AAAA` do timestamp e é comparado literalmente.
  const action = filters.action?.trim()
  if (action) {
    where.push("instr(namekey(l.action), namekey(?)) > 0")
    params.push(action)
  }
  if (filters.date) {
    where.push("instr(l.timestamp, ?) > 0")
    params.push(filters.date)
  }
  const user = filters.user?.trim()
  if (user) {
    where.push("instr(namekey(u.name), namekey(?)) > 0")
    params.push(user)
  }

  // Período (inclusivo nas duas pontas) sobre o DIA do timestamp gravado em
  // `DD/MM/AAAA, HH:mm:ss`. A expressão do plano vira `AAAAMMDD`.
  const from = filters.from ? auditDayKey(filters.from) : null
  if (from) {
    where.push(
      "substr(l.timestamp,7,4)||substr(l.timestamp,4,2)||substr(l.timestamp,1,2) >= ?",
    )
    params.push(from)
  }
  const to = filters.to ? auditDayKey(filters.to) : null
  if (to) {
    where.push(
      "substr(l.timestamp,7,4)||substr(l.timestamp,4,2)||substr(l.timestamp,1,2) <= ?",
    )
    params.push(to)
  }

  // Busca textual accent-insensitive e literal: nome do usuário, ação e
  // descrição. Termo só com espaços (ou vazio) é ignorado.
  const search = filters.search?.trim()
  if (search) {
    where.push(
      "(instr(namekey(u.name), namekey(?)) > 0" +
        " OR instr(namekey(l.action), namekey(?)) > 0" +
        " OR instr(namekey(l.description), namekey(?)) > 0)",
    )
    params.push(search, search, search)
  }

  return { where: where.length > 0 ? "WHERE " + where.join(" AND ") : "", params }
}

/**
 * Ordena do mais recente para o mais antigo pelo DIA + HORA do timestamp
 * (`AAAAMMDDHHMMSS`), não pela ordem de inserção. `rowid DESC` é só o
 * desempate de registros gravados no mesmo segundo.
 */
const AUDIT_ORDER = `
  ORDER BY (
    substr(l.timestamp,7,4)||substr(l.timestamp,4,2)||substr(l.timestamp,1,2)||
    substr(l.timestamp,13,2)||substr(l.timestamp,16,2)||substr(l.timestamp,19,2)
  ) DESC, l.rowid DESC
`

/** Inteiro finito com clamp; `Infinity`, `NaN`, `1e21` etc. nunca viram SQL inválido. */
function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  const numeric = value !== undefined && Number.isFinite(value) ? Math.floor(value) : fallback
  return Math.min(Math.max(numeric, min), max)
}

const AUDIT_SELECT = `
  SELECT l.*, u.name AS userName
  FROM auditLogs l
  LEFT JOIN users u ON u.id = l.userId
`

/**
 * Paginação server-side (Frente 5) — `page` 1-based, `pageSize` com default 50
 * e limite de 200. Retorna `{ items, total, page, pageSize }` para a tela de
 * auditoria (CoordinatorAuditView) deixar o volume no servidor.
 */
export function listAuditLogsPage(
  filters: AuditLogFilters & { page?: number; pageSize?: number },
): AuditLogPage {
  const db = getDb()
  const { where, params } = buildAuditWhere(filters)
  const page = clampInt(filters.page, 1, 1, 1_000_000)
  const pageSize = clampInt(filters.pageSize, 50, 1, 200)

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total FROM auditLogs l LEFT JOIN users u ON u.id = l.userId ${where}`)
    .get(...params) as { total: number }

  const rows = db
    .prepare(`${AUDIT_SELECT} ${where} ${AUDIT_ORDER} LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize) as unknown as Array<
    AuditLogRow & { userName: string | null }
  >

  return {
    items: rows.map((r) => ({ ...mapAuditLog(r), userName: r.userName ?? "" })),
    total: Number(totalRow.total),
    page,
    pageSize,
  }
}

/**
 * Compat com o client antigo / rotas legadas: lista completa com `limit`
 * (default 500, máx. 2000), retornando ARRAY — preserva o contrato usado pelos
 * testes e por clientes que ainda não usam `page`/`pageSize`.
 */
export function listAuditLogs(
  filters: AuditLogFilters & { limit?: number },
): AuditLogWithUserName[] {
  const db = getDb()
  const { where, params } = buildAuditWhere(filters)
  const limit = clampInt(filters.limit, 500, 1, 2000)
  const rows = db
    .prepare(`${AUDIT_SELECT} ${where} ${AUDIT_ORDER} LIMIT ${limit}`)
    .all(...params) as unknown as Array<AuditLogRow & { userName: string | null }>
  return rows.map((r) => ({ ...mapAuditLog(r), userName: r.userName ?? "" }))
}