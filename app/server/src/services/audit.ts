import { getDb } from "../db/connection"
import { mapAuditLog, type AuditLogRow } from "../db/rows"
import { nowBR } from "../lib/dates"
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
  if (filters.action) {
    where.push("l.action LIKE ?")
    params.push(`%${filters.action}%`)
  }
  if (filters.date) {
    where.push("l.timestamp LIKE ?")
    params.push(`%${filters.date}%`)
  }
  if (filters.user) {
    where.push("u.name LIKE ?")
    params.push(`%${filters.user}%`)
  }
  return { where: where.length > 0 ? "WHERE " + where.join(" AND ") : "", params }
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
  const page = Math.max(1, Math.floor(filters.page ?? 1))
  const pageSize = Math.max(1, Math.min(Math.floor(filters.pageSize ?? 50), 200))

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total FROM auditLogs l LEFT JOIN users u ON u.id = l.userId ${where}`)
    .get(...params) as { total: number }

  const rows = db
    .prepare(`${AUDIT_SELECT} ${where} ORDER BY l.rowid DESC LIMIT ? OFFSET ?`)
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
  const limit = Math.max(1, Math.min(filters.limit ?? 500, 2000))
  const rows = db
    .prepare(`${AUDIT_SELECT} ${where} ORDER BY l.rowid DESC LIMIT ${limit}`)
    .all(...params) as unknown as Array<AuditLogRow & { userName: string | null }>
  return rows.map((r) => ({ ...mapAuditLog(r), userName: r.userName ?? "" }))
}