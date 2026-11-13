import fs from "node:fs"
import path from "node:path"
import { Router, type NextFunction, type Request, type Response } from "express"
import multer from "multer"
import { z } from "zod"
import { requireAuth, requireRoles, requireUser, forbidAndAudit } from "../auth/middleware"
import { hashPassword, verifyPassword } from "../auth/password"
import { revokeUserSessionsExcept } from "../auth/session"
import { getDb } from "../db/connection"
import { findClassById, findUserByEmail, findUserById } from "../db/queries"
import { mapSafeUser, userToRow, type UserRow } from "../db/rows"
import { todayBR, startOfToday } from "../lib/dates"
import { badRequest, conflict, notFound, unprocessable } from "../lib/errors"
import { handle, sendData } from "../lib/http"
import { avatarDir, cleanupUploadedFiles, normalizeUploadedFile, uploadAvatar } from "../lib/uploads"
import { uuid } from "../lib/uuid"
import { recordAudit } from "../services/audit"
import { listTransactionsByStudent, getBalance } from "../services/points"
import { currentStreakDays, daysToNextStreakMilestone, nextStreakMilestone } from "../services/streak"
import { levelLabel, missingForNextLevel, nextLevelPts, type Role } from "../shared/types"

const createUserSchema = z.object({
  name: z.string().trim().min(3, "Nome deve ter ao menos 3 caracteres."),
  email: z.string().trim().email("E-mail inválido."),
  password: z.string().min(6, "Senha deve ter ao menos 6 caracteres."),
  role: z.enum(["student", "teacher", "staff", "coordinator"]),
  classId: z.string().optional(),
})

const updateUserSchema = z.object({
  name: z.string().trim().min(3).optional(),
  role: z.enum(["student", "teacher", "staff", "coordinator"]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(6, "Senha deve ter ao menos 6 caracteres.").optional(),
  classIds: z.array(z.string()).optional(),
}).strict()

/**
 * Payload do próprio perfil. `.strict()` é proposital: papel, turmas, situação,
 * e-mail e avatar NÃO são campos que o usuário muda por aqui — o avatar tem a
 * rota multipart própria e os demais são exclusivos da coordenação. Um payload
 * com qualquer um deles é 400 (não ignoramos em silêncio).
 */
const updateSelfSchema = z
  .object({
    name: z.string().trim().min(3, "Nome deve ter ao menos 3 caracteres.").optional(),
    currentPassword: z.string().optional(),
    newPassword: z.string().min(6, "Senha deve ter ao menos 6 caracteres.").optional(),
  })
  .strict()

const PARTIAL_SYNC_ROLES: Role[] = ["student", "teacher"]

export const usersRouter = Router()

usersRouter.get(
  "/",
  requireAuth,
  requireRoles("coordinator"),
  handle((req, res) => {
    const db = getDb()
    const role = typeof req.query.role === "string" ? req.query.role : undefined
    const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : undefined

    let rows = db.prepare("SELECT * FROM users ORDER BY name COLLATE NOCASE ASC").all() as unknown as UserRow[]
    if (role) rows = rows.filter((r) => r.role === role)
    if (search) {
      rows = rows.filter(
        (r) => r.name.toLowerCase().includes(search) || r.email.toLowerCase().includes(search),
      )
    }
    sendData(res, 200, rows.map((r) => mapSafeUser(r)))
  }),
)

usersRouter.post(
  "/",
  requireAuth,
  requireRoles("coordinator"),
  handle((req, res) => {
    const body = createUserSchema.parse(req.body)
    const coordinator = requireUser(res)
    const db = getDb()

    const email = body.email.toLowerCase()
    if (findUserByEmail(db, email)) {
      throw conflict("E-mail já cadastrado.")
    }

    let classIds: string[] = []
    if (body.role === "student") {
      if (body.classId) {
        const klass = findClassById(db, body.classId)
        if (!klass) throw notFound("Turma não encontrada.", "CLASS_NOT_FOUND")
        if (!klass.active) throw conflict("Turma inativa.", "CLASS_INACTIVE")
        classIds = [klass.id]
      }
    } else if (body.role === "teacher" && body.classId) {
      const klass = findClassById(db, body.classId)
      if (klass) classIds = [klass.id]
    }

    const avatar = (body.name.trim().charAt(0) || "?").toUpperCase()
    const insert = db.prepare(
      `INSERT INTO users (id, name, email, password, role, active, avatar, classIds, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const id = uuid()
    insert.run(
      id,
      body.name.trim(),
      email,
      hashPassword(body.password),
      body.role,
      1,
      avatar,
      JSON.stringify(classIds),
      todayBR(),
    )

    // Vínculo de aluno à turma mantém Class.studentIds consistente (RF02)
    if (classIds.length > 0) {
      const klass = findClassById(db, classIds[0])
      if (klass && !klass.studentIds.includes(id)) {
        db.prepare("UPDATE classes SET studentIds = ? WHERE id = ?").run(
          JSON.stringify([...klass.studentIds, id]),
          klass.id,
        )
      }
    }

    const created = findUserById(db, id)
    if (!created) throw notFound("Usuário não encontrado após criação.")
    recordAudit({
      userId: coordinator.id,
      action: "USER_CREATED",
      entity: "User",
      entityId: id,
      description: `Coordenação criou ${created.role} '${created.name}' (${created.email})${classIds.length > 0 ? " em " + classIds.join(",") : ""}`,
    })
    sendData(res, 201, mapSafeUser(userToRow(created)))
  }),
)

/**
 * Multer de avatar com erro de limite traduzido para o contexto da foto (o
 * handler central fala em 5 MB, que é o limite das evidências).
 */
const avatarUpload = uploadAvatar.single("avatar")
function avatarUploadMiddleware(req: Request, res: Response, next: NextFunction): void {
  avatarUpload(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      if (req.file) cleanupUploadedFiles([req.file])
      next(unprocessable("Arquivo excede o limite de 2 MB.", "LIMIT_FILE_SIZE"))
      return
    }
    next(error)
  })
}

/**
 * PATCH /api/users/me — o próprio usuário edita nome e senha.
 *
 * Registrada ANTES de `PATCH /:id`: no Express a ordem importa e `/me` cairia no
 * handler de coordenação (403 para aluno/professor).
 *
 * `currentPassword` só é exigido quando `newPassword` vem. Nome sozinho não pede
 * senha (decisão de UX): não é credencial, e exigir a senha para corrigir o
 * próprio nome criaria atrito sem ganho de segurança. Trocar a senha, sim,
 * exige a atual — inclusive para invalidar sessões antigas com a nova.
 */
usersRouter.patch(
  "/me",
  requireAuth,
  handle((req, res) => {
    const body = updateSelfSchema.parse(req.body)
    const self = requireUser(res)
    const db = getDb()

    const current = findUserById(db, self.id)
    if (!current) throw notFound("Usuário não encontrado.")

    const changes: string[] = []
    let nextPassword = current.password
    let nextAvatar = current.avatar
    const nextName = body.name ?? current.name

    if (body.newPassword !== undefined) {
      if (!body.currentPassword || !verifyPassword(body.currentPassword, current.password)) {
        throw badRequest("Senha atual inválida.", "INVALID_CURRENT_PASSWORD")
      }
      nextPassword = hashPassword(body.newPassword)
      changes.push("senha atualizada")
    }

    if (body.name !== undefined && body.name !== current.name) {
      changes.push(`nome → ${body.name}`)
      // A letra de fallback acompanha o nome; uma foto enviada é preservada.
      if (!current.avatar.startsWith("/uploads/")) {
        nextAvatar = (body.name.charAt(0) || "?").toUpperCase()
      }
    }

    if (changes.length === 0) {
      // Payload vazio, ou só `currentPassword`, não altera nada: 400 explícito
      // evita que um bug de cliente passe como sucesso silencioso.
      throw badRequest("Nenhuma alteração para salvar.", "NO_CHANGES")
    }

    db.prepare("UPDATE users SET name = ?, password = ?, avatar = ? WHERE id = ?").run(
      nextName,
      nextPassword,
      nextAvatar,
      current.id,
    )

    if (body.newPassword !== undefined) {
      // A sessão que fez a troca continua válida; as demais caem (RN de sessão).
      revokeUserSessionsExcept(current.id, res.locals.sessionToken ?? null)
    }

    recordAudit({
      userId: current.id,
      action: "USER_UPDATED",
      entity: "User",
      entityId: current.id,
      description: `${current.name} atualizou o próprio perfil: ${changes.join(", ")}`,
    })

    const updated = findUserById(db, current.id)
    if (!updated) throw notFound("Usuário não encontrado após atualização.")
    sendData(res, 200, mapSafeUser(userToRow(updated)))
  }),
)

/**
 * POST /api/users/me/avatar — upload da foto de perfil (multipart "avatar").
 *
 * A foto vive em `uploadsDir/avatars`, com nome único e extensão DETECTADA por
 * magic bytes (`normalizeUploadedFile`). O multer já restringe este fluxo a
 * imagens (MIME + extensão), e o helper confirma o conteúdo real — não há um
 * segundo guard de MIME aqui porque ele seria inalcançável.
 */
usersRouter.post(
  "/me/avatar",
  requireAuth,
  avatarUploadMiddleware,
  handle((req, res) => {
    const self = requireUser(res)
    const file = req.file
    if (!file) throw badRequest("Selecione uma imagem para a foto de perfil.", "FILE_REQUIRED")

    try {
      normalizeUploadedFile(file, {
        directory: avatarDir(),
        invalidContentMessage: "Envie uma imagem (JPEG/PNG/WebP/GIF) para a foto de perfil.",
      })

      const storedName = path.basename(file.path)
      const db = getDb()
      const current = findUserById(db, self.id)
      if (!current) throw notFound("Usuário não encontrado.")

      db.prepare("UPDATE users SET avatar = ? WHERE id = ?").run(
        `/uploads/avatars/${storedName}`,
        current.id,
      )

      // A foto antiga não fica órfã no disco (best-effort: ausência não falha).
      if (current.avatar.startsWith("/uploads/avatars/")) {
        const oldName = path.basename(current.avatar)
        if (oldName !== storedName && /^[A-Za-z0-9._-]+$/.test(oldName)) {
          try {
            fs.unlinkSync(path.join(avatarDir(), oldName))
          } catch {
            // arquivo já removido — ignora
          }
        }
      }

      recordAudit({
        userId: current.id,
        action: "USER_UPDATED",
        entity: "User",
        entityId: current.id,
        description: `${current.name} atualizou a própria foto de perfil`,
      })

      const updated = findUserById(db, current.id)
      if (!updated) throw notFound("Usuário não encontrado após atualização.")
      sendData(res, 200, mapSafeUser(userToRow(updated)))
    } catch (error) {
      cleanupUploadedFiles([file])
      throw error
    }
  }),
)

usersRouter.patch(
  "/:id",
  requireAuth,
  requireRoles("coordinator"),
  handle((req, res) => {
    const body = updateUserSchema.parse(req.body)
    const coordinator = requireUser(res)
    const db = getDb()
    const id = req.params.id

    const user = findUserById(db, id)
    if (!user) throw notFound("Usuário não encontrado.")

    const previousClassIds = [...user.classIds]
    const nextRole = body.role ?? user.role
    const nextActive = body.active ?? user.active
    const nextClassIds = body.classIds ? [...new Set(body.classIds)] : user.classIds

    // Validação de turmas no PATCH — mesmas regras do POST (RF02):
    // a turma deve existir e, para alunos, estar ativa.
    for (const classId of nextClassIds) {
      const klass = findClassById(db, classId)
      if (!klass) throw notFound("Turma não encontrada.", "CLASS_NOT_FOUND")
      if (nextRole === "student" && !klass.active) {
        throw conflict("Turma inativa.", "CLASS_INACTIVE")
      }
    }

    const changes: string[] = []
    if (body.name !== undefined && body.name !== user.name) changes.push(`nome → ${body.name.trim()}`)
    if (body.role !== undefined && body.role !== user.role) changes.push(`papel → ${body.role}`)
    if (body.active !== undefined && body.active !== user.active)
      changes.push(body.active ? "ativado" : "desativado")
    if (body.password !== undefined) changes.push("senha atualizada")
    if (body.classIds !== undefined && JSON.stringify(body.classIds) !== JSON.stringify(user.classIds))
      changes.push(`turmas → ${body.classIds.join(",") || "nenhuma"}`)

    // Sincroniza rosters das turmas (remove das antigas, adiciona nas novas)
    const syncRoster = nextRole === "student" || nextRole === "teacher"
    if (syncRoster) {
      for (const classId of previousClassIds.filter((cid) => !nextClassIds.includes(cid))) {
        const klass = findClassById(db, classId)
        if (klass) {
          if (nextRole === "student") {
            db.prepare("UPDATE classes SET studentIds = ? WHERE id = ?").run(
              JSON.stringify(klass.studentIds.filter((sid) => sid !== user.id)),
              klass.id,
            )
          } else {
            db.prepare("UPDATE classes SET teacherIds = ? WHERE id = ?").run(
              JSON.stringify(klass.teacherIds.filter((tid) => tid !== user.id)),
              klass.id,
            )
          }
        }
      }
      for (const classId of nextClassIds.filter((cid) => !previousClassIds.includes(cid))) {
        const klass = findClassById(db, classId)
        if (klass) {
          if (nextRole === "student") {
            if (!klass.studentIds.includes(user.id)) {
              db.prepare("UPDATE classes SET studentIds = ? WHERE id = ?").run(
                JSON.stringify([...klass.studentIds, user.id]),
                klass.id,
              )
            }
          } else if (!klass.teacherIds.includes(user.id)) {
            db.prepare("UPDATE classes SET teacherIds = ? WHERE id = ?").run(
              JSON.stringify([...klass.teacherIds, user.id]),
              klass.id,
            )
          }
        }
      }
    } else {
      // usuário deixou de ser aluno/professor — remove de todos os rosters
      for (const classId of previousClassIds) {
        const klass = findClassById(db, classId)
        if (klass) {
          db.prepare("UPDATE classes SET studentIds = ?, teacherIds = ? WHERE id = ?").run(
            JSON.stringify(klass.studentIds.filter((sid) => sid !== user.id)),
            JSON.stringify(klass.teacherIds.filter((tid) => tid !== user.id)),
            klass.id,
          )
        }
      }
    }

    // Só recalcula a letra de fallback quando o avatar atual NÃO é uma foto.
    // O modal da coordenação envia `name` em toda edição (papel, turma,
    // situação); sem esta guarda, editar um aluno com foto trocaria a URL por
    // uma letra e deixaria o arquivo órfão no disco.
    const nextAvatar =
      body.name && !user.avatar.startsWith("/uploads/avatars/")
        ? (body.name.trim().charAt(0) || "?").toUpperCase()
        : user.avatar

    db.prepare(
      `UPDATE users SET name = ?, role = ?, active = ?, classIds = ?, avatar = ? WHERE id = ?`,
    ).run(
      body.name?.trim() ?? user.name,
      nextRole,
      nextActive ? 1 : 0,
      JSON.stringify(nextClassIds),
      nextAvatar,
      user.id,
    )
    if (body.password !== undefined) {
      db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashPassword(body.password), user.id)
      // Troca de senha revoga as sessões existentes do usuário. Quando o alvo é
      // o próprio coordenador, a sessão atual dele é preservada.
      const exceptToken = user.id === coordinator.id ? (res.locals.sessionToken ?? null) : null
      revokeUserSessionsExcept(user.id, exceptToken)
    }

    recordAudit({
      userId: coordinator.id,
      action: "USER_UPDATED",
      entity: "User",
      entityId: user.id,
      description: `Coordenação atualizou '${user.name}'${changes.length > 0 ? ": " + changes.join(", ") : ""}`,
    })

    const updated = findUserById(db, user.id)
    if (!updated) throw notFound("Usuário não encontrado após atualização.")
    sendData(res, 200, mapSafeUser(userToRow(updated)))
  }),
)

usersRouter.get(
  "/:id/points",
  requireAuth,
  handle((req, res) => {
    const requester = requireUser(res)
    const db = getDb()
    const id = req.params.id

    if (requester.role !== "coordinator" && requester.id !== id) {
      forbidAndAudit(req, requester, `${requester.name} tentou consultar pontos de outro usuário`)
    }
    const user = findUserById(db, id)
    if (!user) throw notFound("Usuário não encontrado.")

    const balance = getBalance(user.id)
    const streak = currentStreakDays(db, user.id, startOfToday())
    const milestone = nextStreakMilestone(streak)
    sendData(res, 200, {
      balance,
      levelLabel: levelLabel(balance),
      nextLevel: nextLevelPts(balance),
      missingForNextLevel: missingForNextLevel(balance),
      currentStreakDays: streak,
      nextStreakMilestone: milestone ? milestone.days : null,
      daysToNextMilestone: daysToNextStreakMilestone(streak),
      transactions: listTransactionsByStudent(user.id),
    })
  }),
)
