import { Router } from "express"
import { z } from "zod"
import { requireAuth, requireRoles, requireUser } from "../auth/middleware"
import { getDb } from "../db/connection"
import { findClassById } from "../db/queries"
import { mapClass, type ClassRow } from "../db/rows"
import { conflict, forbidden, notFound } from "../lib/errors"
import { handle, sendData } from "../lib/http"
import { uuid } from "../lib/uuid"
import { recordAudit } from "../services/audit"
import { classDetailOf } from "../services/classDetail"
import { toCsv } from "../services/reports"
import type { Class, SafeUser } from "../shared/types"

const createClassSchema = z.object({
  name: z.string().trim().min(1, "Nome da turma obrigatório."),
  course: z.string().trim().min(1, "Curso obrigatório."),
  year: z.number().int().min(1).max(5),
  shift: z.enum(["morning", "afternoon", "evening"]),
  active: z.boolean().optional().default(true),
  studentIds: z.array(z.string()).optional().default([]),
  teacherIds: z.array(z.string()).optional().default([]),
})

const updateClassSchema = createClassSchema.partial().strict()

export const classesRouter = Router()

classesRouter.get(
  "/",
  requireAuth,
  handle((_req, res) => {
    const user = requireUser(res)
    const db = getDb()
    const rows = db.prepare("SELECT * FROM classes ORDER BY name COLLATE NOCASE ASC").all() as unknown as ClassRow[]
    let classes = rows.map(mapClass)
    if (user.role === "student") {
      classes = classes.filter((c) => c.studentIds.includes(user.id))
    } else if (user.role === "teacher") {
      classes = classes.filter((c) => c.teacherIds.includes(user.id))
    }
    sendData(res, 200, classes)
  }),
)

/**
 * Quem abre o detalhe de uma turma (R1/R2).
 *
 * O recorte é `class.teacherIds` — o MESMO de `GET /api/classes` (a lista que
 * alimenta esta tela) e o mesmo dos relatórios da 4.2
 * (`services/reports.ts:43,88,329`): se o drill-down aceitasse um par
 * (professor, turma) que a lista não mostra, a navegação seria inconsistente.
 * Coordenação e staff passam; aluno NUNCA, mesmo estando em `studentIds`.
 *
 * Isto não reconcilia a divergência C1 (`routes/activities.ts:302-315`
 * autoriza por `classIds OU teacherIds`): a reconciliação é decisão de produto
 * em aberto para a F.1, e os outros call sites ficam como estão.
 */
function canSeeClassDetail(user: SafeUser, klass: Class): boolean {
  if (user.role === "coordinator" || user.role === "staff") return true
  if (user.role === "student") return false
  return klass.teacherIds.includes(user.id)
}

/**
 * GET /api/classes/:id/detail — "Minha turma" do professor (4.3): lista de
 * alunos, pontuação por matéria e export CSV.
 *
 * Ordem dos guards: 404 (a turma não existe) → 403 (não atuante) → monta o
 * detalhe. O 404 vem primeiro para não vazar a existência de uma turma que o
 * chamador não pode ver.
 *
 * A auditoria da negativa é escrita À MÃO (e não com `forbidAndAudit`) porque é
 * o `forbidden()` do middleware que não carrega `details` — recusar e explicar o
 * motivo é metade do contrato. É o mesmo caminho de
 * `routes/activities.ts:306-312` e `routes/studyContents.ts:101-107`.
 */
classesRouter.get(
  "/:id/detail",
  requireAuth,
  handle((req, res) => {
    const user = requireUser(res)
    const db = getDb()
    const klass = findClassById(db, req.params.id)
    if (!klass) throw notFound("Turma não encontrada.")

    if (!canSeeClassDetail(user, klass)) {
      const aluno = user.role === "student"
      recordAudit({
        userId: user.id,
        action: "ACCESS_DENIED",
        entity: "Route",
        entityId: `${req.baseUrl}/${req.params.id}/detail`,
        description: aluno
          ? `${user.name} (aluno) tentou abrir o detalhe da turma ${klass.name}`
          : `${user.name} tentou abrir o detalhe da turma ${klass.name}, em que não atua`,
      })
      throw forbidden(
        aluno ? "Alunos não abrem o detalhe da turma." : "Você não atua nessa turma.",
        aluno ? "STUDENT_NOT_ALLOWED" : "TEACHER_NOT_IN_CLASS",
      )
    }

    // Turma INATIVA é servida (R7): a lista (`GET /api/classes`) não filtra
    // `active`, então negar o clique seria pior que serving — e o campo `active`
    // segue no `class` do payload, que é como a tela avisa.
    const detail = classDetailOf(klass)

    if (req.query.format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8")
      res.setHeader("Content-Disposition", `attachment; filename="turma-${klass.id}.csv"`)
      res.send(
        toCsv(
          ["Aluno", "E-mail", "Nível", "Saldo", "Sequência", "Aprovadas"],
          detail.students.map((s) => [s.name, s.email, s.level, s.balance, s.streak, s.approved]),
        ),
      )
      return
    }
    sendData(res, 200, detail)
  }),
)

classesRouter.post(
  "/",
  requireAuth,
  requireRoles("coordinator"),
  handle((req, res) => {
    const body = createClassSchema.parse(req.body)
    const coordinator = requireUser(res)
    const db = getDb()
    const id = uuid()
    db.prepare(
      `INSERT INTO classes (id, name, course, year, shift, active, studentIds, teacherIds)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      body.name,
      body.course,
      body.year,
      body.shift,
      body.active ? 1 : 0,
      JSON.stringify(body.studentIds),
      JSON.stringify(body.teacherIds),
    )
    const created = findClassById(db, id)
    if (!created) throw notFound("Turma não encontrada após criação.")
    recordAudit({
      userId: coordinator.id,
      action: "CLASS_CREATED",
      entity: "Class",
      entityId: id,
      description: `Coordenação criou turma '${created.name}' (${created.course})`,
    })
    sendData(res, 201, created)
  }),
)

classesRouter.patch(
  "/:id",
  requireAuth,
  requireRoles("coordinator"),
  handle((req, res) => {
    const body = updateClassSchema.parse(req.body)
    const coordinator = requireUser(res)
    const db = getDb()
    const klass = findClassById(db, req.params.id)
    if (!klass) throw notFound("Turma não encontrada.")

    const nextStudentIds = body.studentIds ? [...new Set(body.studentIds)] : klass.studentIds
    const nextTeacherIds = body.teacherIds ? [...new Set(body.teacherIds)] : klass.teacherIds

    // Reconciliar users.classIds dos membros adicionados/removidos (espelha a
    // lógica do PATCH /users: aluno/professor mantêm vínculo espelhado na turma).
    const syncUserClassIds = (userId: string, add: boolean): void => {
      const row = db.prepare("SELECT classIds FROM users WHERE id = ?").get(userId) as
        | { classIds: string }
        | undefined
      if (!row) return
      let current: string[] = []
      try {
        const parsed: unknown = JSON.parse(row.classIds)
        current = Array.isArray(parsed) ? parsed.map((item) => String(item)) : []
      } catch {
        current = []
      }
      const next = add
        ? current.includes(klass.id)
          ? current
          : [...current, klass.id]
        : current.filter((cid) => cid !== klass.id)
      db.prepare("UPDATE users SET classIds = ? WHERE id = ?").run(JSON.stringify(next), userId)
    }

    for (const userId of klass.studentIds.filter((sid) => !nextStudentIds.includes(sid))) {
      syncUserClassIds(userId, false)
    }
    for (const userId of nextStudentIds.filter((sid) => !klass.studentIds.includes(sid))) {
      syncUserClassIds(userId, true)
    }
    for (const userId of klass.teacherIds.filter((tid) => !nextTeacherIds.includes(tid))) {
      syncUserClassIds(userId, false)
    }
    for (const userId of nextTeacherIds.filter((tid) => !klass.teacherIds.includes(tid))) {
      syncUserClassIds(userId, true)
    }

    db.prepare(
      `UPDATE classes SET name = ?, course = ?, year = ?, shift = ?, active = ?,
        studentIds = ?, teacherIds = ? WHERE id = ?`,
    ).run(
      body.name ?? klass.name,
      body.course ?? klass.course,
      body.year ?? klass.year,
      body.shift ?? klass.shift,
      body.active ?? klass.active ? 1 : 0,
      JSON.stringify(nextStudentIds),
      JSON.stringify(nextTeacherIds),
      klass.id,
    )
    const updated = findClassById(db, klass.id)
    if (!updated) throw notFound("Turma não encontrada após atualização.")
    recordAudit({
      userId: coordinator.id,
      action: "CLASS_UPDATED",
      entity: "Class",
      entityId: klass.id,
      description: `Coordenação atualizou turma '${updated.name}'`,
    })
    sendData(res, 200, updated)
  }),
)

classesRouter.delete(
  "/:id",
  requireAuth,
  requireRoles("coordinator"),
  handle((req, res) => {
    const coordinator = requireUser(res)
    const db = getDb()
    const klass = findClassById(db, req.params.id)
    if (!klass) throw notFound("Turma não encontrada.")

    // Guards de integridade (sem FKs no SQLite): turma referenciada por
    // usuários (users.classIds) ou atividades (activities.classId) não pode ser excluída.
    const linkedUsers = db
      .prepare("SELECT COUNT(*) AS total FROM users WHERE classIds LIKE ?")
      .get(`%"${klass.id}"%`) as { total: number }
    if (Number(linkedUsers.total) > 0) {
      throw conflict(
        "Não é possível excluir a turma: há alunos ou professores vinculados.",
        "CLASS_HAS_MEMBERS",
      )
    }
    const linkedActivities = db
      .prepare("SELECT COUNT(*) AS total FROM activities WHERE classId = ?")
      .get(klass.id) as { total: number }
    if (Number(linkedActivities.total) > 0) {
      throw conflict(
        "Não é possível excluir a turma: há atividades vinculadas.",
        "CLASS_HAS_ACTIVITIES",
      )
    }

    db.prepare("DELETE FROM classes WHERE id = ?").run(klass.id)
    recordAudit({
      userId: coordinator.id,
      action: "CLASS_DELETED",
      entity: "Class",
      entityId: klass.id,
      description: `Coordenação removeu turma '${klass.name}'`,
    })
    sendData(res, 200, { ok: true })
  }),
)