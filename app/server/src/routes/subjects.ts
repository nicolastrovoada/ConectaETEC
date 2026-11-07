import { Router } from "express"
import { z } from "zod"
import { requireAuth, requireRoles, requireUser } from "../auth/middleware"
import { getDb } from "../db/connection"
import { findSubjectById } from "../db/queries"
import { mapSubject, type SubjectRow } from "../db/rows"
import { notFound, conflict } from "../lib/errors"
import { handle, sendData } from "../lib/http"
import { uuid } from "../lib/uuid"
import { recordAudit } from "../services/audit"

const createSubjectSchema = z.object({
  name: z.string().trim().min(1, "Nome da disciplina obrigatório."),
  icon: z.string().optional().default("📘"),
  teacherIds: z.array(z.string()).optional().default([]),
  classIds: z.array(z.string()).optional().default([]),
})

const updateSubjectSchema = createSubjectSchema.partial().strict()

export const subjectsRouter = Router()

subjectsRouter.get(
  "/",
  requireAuth,
  handle((_req, res) => {
    const db = getDb()
    const rows = db.prepare("SELECT * FROM subjects ORDER BY name COLLATE NOCASE ASC").all() as unknown as SubjectRow[]
    sendData(res, 200, rows.map(mapSubject))
  }),
)

subjectsRouter.post(
  "/",
  requireAuth,
  requireRoles("coordinator"),
  handle((req, res) => {
    const body = createSubjectSchema.parse(req.body)
    const coordinator = requireUser(res)
    const db = getDb()
    const id = uuid()
    db.prepare(
      `INSERT INTO subjects (id, name, icon, teacherIds, classIds) VALUES (?, ?, ?, ?, ?)`,
    ).run(id, body.name, body.icon, JSON.stringify(body.teacherIds), JSON.stringify(body.classIds))
    const created = findSubjectById(db, id)
    if (!created) throw notFound("Disciplina não encontrada após criação.")
    recordAudit({
      userId: coordinator.id,
      action: "SUBJECT_CREATED",
      entity: "Subject",
      entityId: id,
      description: `Coordenação criou disciplina '${created.name}'`,
    })
    sendData(res, 201, created)
  }),
)

subjectsRouter.patch(
  "/:id",
  requireAuth,
  requireRoles("coordinator"),
  handle((req, res) => {
    const body = updateSubjectSchema.parse(req.body)
    const coordinator = requireUser(res)
    const db = getDb()
    const subject = findSubjectById(db, req.params.id)
    if (!subject) throw notFound("Disciplina não encontrada.")
    db.prepare(
      `UPDATE subjects SET name = ?, icon = ?, teacherIds = ?, classIds = ? WHERE id = ?`,
    ).run(
      body.name ?? subject.name,
      body.icon ?? subject.icon,
      JSON.stringify(body.teacherIds ?? subject.teacherIds),
      JSON.stringify(body.classIds ?? subject.classIds),
      subject.id,
    )
    const updated = findSubjectById(db, subject.id)
    if (!updated) throw notFound("Disciplina não encontrada após atualização.")
    recordAudit({
      userId: coordinator.id,
      action: "SUBJECT_UPDATED",
      entity: "Subject",
      entityId: subject.id,
      description: `Coordenação atualizou disciplina '${updated.name}'`,
    })
    sendData(res, 200, updated)
  }),
)

subjectsRouter.delete(
  "/:id",
  requireAuth,
  requireRoles("coordinator"),
  handle((req, res) => {
    const coordinator = requireUser(res)
    const db = getDb()
    const subject = findSubjectById(db, req.params.id)
    if (!subject) throw notFound("Disciplina não encontrada.")
    // Guard de integridade (sem FKs no SQLite): disciplina usada por atividade não pode ser excluída.
    const linked = db
      .prepare("SELECT COUNT(*) AS total FROM activities WHERE subjectId = ?")
      .get(subject.id) as { total: number }
    if (Number(linked.total) > 0) {
      throw conflict(
        "Não é possível excluir a disciplina: há atividades vinculadas.",
        "SUBJECT_HAS_ACTIVITIES",
      )
    }
    db.prepare("DELETE FROM subjects WHERE id = ?").run(subject.id)
    recordAudit({
      userId: coordinator.id,
      action: "SUBJECT_DELETED",
      entity: "Subject",
      entityId: subject.id,
      description: `Coordenação removeu disciplina '${subject.name}'`,
    })
    sendData(res, 200, { ok: true })
  }),
)