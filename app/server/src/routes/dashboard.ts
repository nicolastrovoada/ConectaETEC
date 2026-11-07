import { Router } from "express"
import { requireAuth, requireUser } from "../auth/middleware"
import { getDb } from "../db/connection"
import type { ActivityRow, ClassRow, SubmissionRow } from "../db/rows"
import { handle, sendData } from "../lib/http"
import { getBalance } from "../services/points"

export const dashboardRouter = Router()

dashboardRouter.get(
  "/overview",
  requireAuth,
  handle((_req, res) => {
    const user = requireUser(res)
    const db = getDb()

    if (user.role === "student") {
      const classPlaceholders = user.classIds.map(() => "?").join(",")
      const classFilter = user.classIds.length > 0 ? ` AND classId IN (${classPlaceholders})` : " AND 1 = 0"
      const pending = db
        .prepare(`SELECT * FROM activities WHERE status = 'active' AND deletedAt IS NULL${classFilter}`)
        .all(...user.classIds) as unknown as ActivityRow[]
      const submissions = db
        .prepare("SELECT * FROM submissions WHERE studentId = ?")
        .all(user.id) as unknown as SubmissionRow[]
      const approved = submissions.filter((s) => s.status === "approved").length
      const withFeedback = submissions.filter((s) => s.status === "rejected" || s.status === "revision_required")
      sendData(res, 200, {
        balance: getBalance(user.id),
        pendingActivities: pending.length,
        submitted: submissions.length,
        approved,
        withFeedback: withFeedback.length,
      })
      return
    }

    if (user.role === "teacher" || user.role === "staff") {
      // Soft delete (2.4): "minhas atividades" conta as que o app mostra —
      // excluída não aparece no painel do responsável.
      const own = db
        .prepare("SELECT id FROM activities WHERE teacherId = ? AND deletedAt IS NULL")
        .all(user.id) as unknown as Array<{ id: string }>
      const ownIds = own.map((a) => a.id)
      const studentIds =
        user.role === "teacher" && user.classIds.length > 0
          ? (() => {
              const classPlaceholders = user.classIds.map(() => "?").join(",")
              const classes = db
                .prepare(`SELECT studentIds FROM classes WHERE id IN (${classPlaceholders})`)
                .all(...user.classIds) as unknown as Array<{ studentIds: string }>
              return classes.flatMap((c) => {
                try {
                  return JSON.parse(c.studentIds) as string[]
                } catch {
                  return []
                }
              })
            })()
          : []
      const uniqueStudentIds = Array.from(new Set(studentIds))
      const pendingCount = db
        .prepare(
          `SELECT COUNT(*) AS total FROM submissions WHERE status IN ('pending','submitted','under_review','revision_required') ${
            ownIds.length > 0 ? `AND activityId IN (${ownIds.map(() => "?").join(",")})` : "AND 1 = 0"
          }`,
        )
        .all(...ownIds) as unknown as Array<{ total: number }>
      const approvedTotal = db
        .prepare(
          `SELECT COUNT(*) AS total FROM submissions WHERE status = 'approved' ${
            ownIds.length > 0 ? `AND activityId IN (${ownIds.map(() => "?").join(",")})` : "AND 1 = 0"
          }`,
        )
        .all(...ownIds) as unknown as Array<{ total: number }>
      sendData(res, 200, {
        myActivities: ownIds.length,
        students: uniqueStudentIds.length,
        pending: Number((pendingCount[0] as { total: number }).total),
        approved: Number((approvedTotal[0] as { total: number }).total),
      })
      return
    }

    // coordenação
    // Soft delete (2.4): os totais de atividade também são só das visíveis.
    const users = db.prepare("SELECT COUNT(*) AS t FROM users WHERE active = 1").get() as { t: number }
    const students = db
      .prepare("SELECT COUNT(*) AS t FROM users WHERE role = 'student' AND active = 1")
      .get() as { t: number }
    const classes = db.prepare("SELECT COUNT(*) AS t FROM classes WHERE active = 1").get() as { t: number }
    const activities = db
      .prepare("SELECT COUNT(*) AS t FROM activities WHERE deletedAt IS NULL")
      .get() as { t: number }
    const active = db
      .prepare("SELECT COUNT(*) AS t FROM activities WHERE status = 'active' AND deletedAt IS NULL")
      .get() as { t: number }
    const pending = db
      .prepare("SELECT COUNT(*) AS t FROM submissions WHERE status IN ('pending','submitted','under_review','revision_required')")
      .get() as { t: number }
    const approved = db
      .prepare("SELECT COUNT(*) AS t FROM submissions WHERE status = 'approved'")
      .get() as { t: number }
    const totalTx = db.prepare("SELECT COALESCE(SUM(amount), 0) AS t FROM transactions").get() as { t: number }
    const classRows = db.prepare("SELECT * FROM classes WHERE active = 1").all() as unknown as ClassRow[]
    sendData(res, 200, {
      activeUsers: Number(users.t),
      students: Number(students.t),
      activeClasses: Number(classes.t),
      totalActivities: Number(activities.t),
      activeActivities: Number(active.t),
      pendingValidations: Number(pending.t),
      approvedSubmissions: Number(approved.t),
      pointsIssued: Number(totalTx.t),
      classes: classRows.length,
    })
  }),
)