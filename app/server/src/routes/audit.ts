import { Router } from "express"
import { requireAuth, requireRoles } from "../auth/middleware"
import { handle, sendData } from "../lib/http"
import { listAuditLogs, listAuditLogsPage } from "../services/audit"

export const auditRouter = Router()

auditRouter.get(
  "/",
  requireAuth,
  requireRoles("coordinator"),
  handle((req, res) => {
    const role = typeof req.query.role === "string" ? req.query.role : undefined
    const action = typeof req.query.action === "string" ? req.query.action : undefined
    const date = typeof req.query.date === "string" ? req.query.date : undefined
    const user = typeof req.query.user === "string" ? req.query.user : undefined
    // Task 4.4 — período (YYYY-MM-DD, inclusivo) e busca textual. Valores fora
    // do formato são ignorados pelo serviço, sem quebrar a rota.
    const from = typeof req.query.from === "string" ? req.query.from : undefined
    const to = typeof req.query.to === "string" ? req.query.to : undefined
    const search = typeof req.query.search === "string" ? req.query.search : undefined

    // Frente 5 (item C) — paginação server-side: quando o client envia
    // `page`/`pageSize`, responde `{ items, total, page, pageSize }`.
    const hasPagination =
      typeof req.query.page === "string" || typeof req.query.pageSize === "string"
    if (hasPagination) {
      const page = Number(req.query.page) || 1
      const pageSize = Number(req.query.pageSize) || 50
      sendData(res, 200, listAuditLogsPage({ role, action, date, user, from, to, search, page, pageSize }))
      return
    }

    // Compat: sem `page`/`pageSize`, mantém o formato legado (array) com `limit`.
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) || 500 : 500
    sendData(res, 200, listAuditLogs({ role, action, date, user, from, to, search, limit }))
  }),
)