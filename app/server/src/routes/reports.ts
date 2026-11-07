import { Router } from "express"
import { requireAuth, requireRoles, requireUser } from "../auth/middleware"
import { handle, sendData } from "../lib/http"
import {
  activitiesByTypeReport,
  completionReport,
  pointsReport,
  teacherPerformanceReport,
  toCsv,
} from "../services/reports"

export const reportsRouter = Router()

reportsRouter.get(
  "/completion",
  requireAuth,
  requireRoles("teacher", "coordinator"),
  handle((req, res) => {
    const user = requireUser(res)
    const data = completionReport({ role: user.role, userId: user.id })
    if (req.query.format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8")
      res.setHeader("Content-Disposition", 'attachment; filename="relatorio-conclusao.csv"')
      res.send(
        toCsv(
          ["Turma", "Curso", "Alunos", "Atividades", "Possíveis", "Concluídas", "%"],
          data.map((r) => [r.className, r.course, r.students, r.activities, r.possible, r.done, r.pct]),
        ),
      )
      return
    }
    sendData(res, 200, data)
  }),
)

reportsRouter.get(
  "/points",
  requireAuth,
  requireRoles("teacher", "coordinator"),
  handle((req, res) => {
    const user = requireUser(res)
    const data = pointsReport({ role: user.role, userId: user.id })
    if (req.query.format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8")
      res.setHeader("Content-Disposition", 'attachment; filename="relatorio-pontos.csv"')
      res.send(
        toCsv(
          ["Aluno", "Turma", "Saldo", "Nível"],
          data.map((r) => [r.studentName, r.className, r.balance, r.level]),
        ),
      )
      return
    }
    sendData(res, 200, data)
  }),
)

reportsRouter.get(
  "/activities-by-type",
  requireAuth,
  requireRoles("coordinator"),
  handle((req, res) => {
    const data = activitiesByTypeReport()
    if (req.query.format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8")
      res.setHeader("Content-Disposition", 'attachment; filename="relatorio-atividades-tipo.csv"')
      res.send(toCsv(["Tipo", "Quantidade"], data.map((r) => [r.label, r.count])))
      return
    }
    sendData(res, 200, data)
  }),
)

/**
 * GET /api/reports/teacher-performance — desempenho do professor (4.2).
 *
 * **Teacher-only** (R9): a coordenação tem o relatório geral da Fase 4.5, então
 * `requireRoles("teacher")` devolve 403 para ela (e a negativa fica auditada em
 * `ACCESS_DENIED` pelo próprio middleware). Aluno e funcionário também: não têm
 * relatório de desempenho.
 *
 * Sem `?format=csv` aqui de propósito (R4.2-G): o CSV desta fase é o da MinhaTurma
 * (4.3) e o da coordenação (4.5). Mandar `?format=csv` aqui devolve o JSON
 * normal — o parâmetro só é lido nas rotas que têm o ramo CSV.
 */
reportsRouter.get(
  "/teacher-performance",
  requireAuth,
  requireRoles("teacher"),
  handle((_req, res) => {
    const user = requireUser(res)
    const data = teacherPerformanceReport({ role: user.role, userId: user.id })
    sendData(res, 200, data)
  }),
)