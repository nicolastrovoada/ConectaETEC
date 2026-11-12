import { Router } from "express"
import { requireAuth, requireRoles, requireUser } from "../auth/middleware"
import { handle, sendData } from "../lib/http"
import {
  activitiesByTypeReport,
  activityDetailReport,
  classRankingsReport,
  completionReport,
  pointsReport,
  subjectRankingsReport,
  teacherPerformanceReport,
  teacherSummaryReport,
  toCsv,
  type ReportFilters,
} from "../services/reports"
import { ACTIVITY_TYPE_LABELS } from "../shared/types"

export const reportsRouter = Router()

/** String de query não vazia; ausente/vazia = filtro desligado. */
function queryString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined
}

/**
 * Filtros comuns da Task 4.5. A validação de calendário de `from`/`to` fica no
 * serviço (`reportDayKey`): data inexistente é IGNORADA, sem 400 — o contrato
 * da 4.5 pede exatamente isso.
 */
function reportFiltersOf(query: Record<string, unknown>): ReportFilters {
  return {
    from: queryString(query.from),
    to: queryString(query.to),
    classId: queryString(query.classId),
    subjectId: queryString(query.subjectId),
    teacherId: queryString(query.teacherId),
  }
}

function sendCsv(res: Parameters<typeof sendData>[0], filename: string, content: string): void {
  res.setHeader("Content-Type", "text/csv; charset=utf-8")
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
  res.send(content)
}

reportsRouter.get(
  "/completion",
  requireAuth,
  requireRoles("teacher", "coordinator"),
  handle((req, res) => {
    const user = requireUser(res)
    const data = completionReport({ role: user.role, userId: user.id }, reportFiltersOf(req.query))
    if (req.query.format === "csv") {
      sendCsv(
        res,
        "relatorio-conclusao.csv",
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
    const data = pointsReport({ role: user.role, userId: user.id }, reportFiltersOf(req.query))
    if (req.query.format === "csv") {
      sendCsv(
        res,
        "relatorio-pontos.csv",
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
    const data = activitiesByTypeReport(reportFiltersOf(req.query))
    if (req.query.format === "csv") {
      sendCsv(
        res,
        "relatorio-atividades-tipo.csv",
        toCsv(["Tipo", "Quantidade"], data.map((r) => [r.label, r.count])),
      )
      return
    }
    sendData(res, 200, data)
  }),
)

/**
 * GET /api/reports/activity-detail — relatório detalhado de atividades (4.5).
 *
 * Coordinator-only (`requireRoles("coordinator")`): professor já tem as
 * próprias métricas em `/teacher-performance`; a negativa de qualquer outro
 * papel é auditada como `ACCESS_DENIED` pelo middleware.
 */
reportsRouter.get(
  "/activity-detail",
  requireAuth,
  requireRoles("coordinator"),
  handle((req, res) => {
    const data = activityDetailReport(reportFiltersOf(req.query))
    if (req.query.format === "csv") {
      sendCsv(
        res,
        "relatorio-atividades.csv",
        toCsv(
          ["Atividade", "Tipo", "Matéria", "Turma", "Professor", "Prazo", "Entregas", "Aprovadas", "Reprovadas", "Pendentes", "Atrasadas", "Aprovação"],
          data.map((r) => [
            r.title,
            ACTIVITY_TYPE_LABELS[r.type as keyof typeof ACTIVITY_TYPE_LABELS] ?? r.type,
            r.subject,
            r.className,
            r.teacherName,
            r.deadline,
            r.deliveries,
            r.approved,
            r.rejected,
            r.pending,
            r.late,
            r.donePct,
          ]),
        ),
      )
      return
    }
    sendData(res, 200, data)
  }),
)

/**
 * GET /api/reports/teacher-summary — conclusão e atraso POR PROFESSOR (4.5).
 *
 * Coordinator-only, como os demais relatórios agregados. Reaproveita os filtros
 * comuns (`reportFiltersOf`) e o mesmo recorte de `activity-detail`; o CSV leva
 * as seis colunas exibidas na tela.
 */
reportsRouter.get(
  "/teacher-summary",
  requireAuth,
  requireRoles("coordinator"),
  handle((req, res) => {
    const data = teacherSummaryReport(reportFiltersOf(req.query))
    if (req.query.format === "csv") {
      sendCsv(
        res,
        "relatorio-professores.csv",
        toCsv(
          ["Professor", "Atividades", "Entregas", "Aprovadas", "Atrasadas", "Aprovação %"],
          data.map((r) => [r.teacherName, r.activities, r.deliveries, r.approved, r.late, r.approvalPct]),
        ),
      )
      return
    }
    sendData(res, 200, data)
  }),
)

/** GET /api/reports/rankings/classes — ranking de pontos por turma (4.5). */
reportsRouter.get(
  "/rankings/classes",
  requireAuth,
  requireRoles("coordinator"),
  handle((req, res) => {
    const data = classRankingsReport(reportFiltersOf(req.query))
    if (req.query.format === "csv") {
      sendCsv(
        res,
        "relatorio-ranking-turmas.csv",
        toCsv(
          ["Turma", "Curso", "Aluno", "Pontos", "Nível"],
          data.flatMap((group) =>
            group.rows.map((row) => [group.className, group.course, row.studentName, row.points, row.level]),
          ),
        ),
      )
      return
    }
    sendData(res, 200, data)
  }),
)

/** GET /api/reports/rankings/subjects — ranking de pontos por matéria (4.5). */
reportsRouter.get(
  "/rankings/subjects",
  requireAuth,
  requireRoles("coordinator"),
  handle((req, res) => {
    const data = subjectRankingsReport(reportFiltersOf(req.query))
    if (req.query.format === "csv") {
      sendCsv(
        res,
        "relatorio-ranking-materias.csv",
        toCsv(
          ["Matéria", "Aluno", "Turma", "Pontos", "Nível"],
          data.flatMap((group) =>
            group.rows.map((row) => [group.subjectName, row.studentName, row.className, row.points, row.level]),
          ),
        ),
      )
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