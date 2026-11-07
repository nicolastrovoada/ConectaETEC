import { Router } from "express"
import { z } from "zod"
import { requireAuth, requireRoles, requireUser, forbidAndAudit } from "../auth/middleware"
import { getDb } from "../db/connection"
import { findActivityById, findClassById, findSubjectById } from "../db/queries"
import { withTransaction } from "../db/transaction"
import { mapActivity, type ActivityRow } from "../db/rows"
import { conflict, forbidden, notFound, unprocessable } from "../lib/errors"
import { handle, sendData } from "../lib/http"
import { nowBR, isDeadlineOnOrAfterToday, isValidBRDate } from "../lib/dates"
import { uuid } from "../lib/uuid"
import { recordAudit } from "../services/audit"
import { insertNotification } from "../services/notifications"
import type { Activity, ActivityType, SafeUser } from "../shared/types"
import { ACTIVITY_TYPE_LABELS } from "../shared/types"

const OPERATIONAL_TYPES: ActivityType[] = ["school_action", "event", "library", "support"]

/**
 * Tolerância de entrega de uma atividade recém-criada: espelha o DEFAULT da coluna
 * `activities.lateWindowDays` (migration 004), que é a fonte da verdade. Serve ao
 * literal do schema abaixo e ao INSERT — que agora escreve a coluna (antes o
 * valor vinha sempre do DEFAULT do banco, e o professor não tinha como escolher
 * a tolerância).
 */
const DEFAULT_LATE_WINDOW_DAYS = 7

/** Ordenação por deadline tratando DD/MM/AAAA como data (não lexicográfica). */
const DEADLINE_SORT = "substr(deadline, 7, 4) || substr(deadline, 4, 2) || substr(deadline, 1, 2)"

/**
 * Atividade da LIXEIRA (2.6): a linha + o nome de quem excluiu.
 *
 * `deletedBy` é id SEM FK, então o nome não vem garantido: o LEFT JOIN só
 * resolve usuário existente E ativo, e o resto volta `null` para quem consome
 * tratar (a aba "Excluídas" da coordenação mostra o id, com o rótulo
 * "Usuário removido"). Fora da lixeira o campo não existe — a listagem de
 * atividades vivas continua sendo `Activity` puro.
 */
export interface DeletedActivity extends Activity {
  deletedByName: string | null
}

/** Linha de `activities` com o nome do autor da exclusão (só na lixeira). */
type ActivityListRow = ActivityRow & { deletedByName?: string | null }

/**
 * `FROM`/`SELECT` da listagem. A lixeira (`?deleted=true`) precisa do nome de
 * quem excluiu; o resto das leituras não muda nada.
 *
 * `activities.*` (e não `*`) de propósito: o join traz as colunas de `users`
 * junto, e `id`/`createdAt` existem nos dois lados — com `*` o mapper leria o
 * id do usuário no lugar do id da atividade. `AND u.active = 1` fica no ON (e
 * não no WHERE) para a linha excluída continuar na resposta mesmo sem autor
 * resolvível.
 */
function listagemFrom(showDeleted: boolean): { select: string; from: string } {
  // No ramo `showDeleted` a query tem DUAS tabelas no escopo: qualquer coluna sem
  // prefixo que exista em `users` (id, createdAt, name…) passa a ser ambígua ou, pior,
  // sobrepõe a da atividade no `mapActivity` — prefixe com `activities.` / `u.` ao
  // adicionar coluna aqui.
  return showDeleted
    ? {
        select: "SELECT activities.*, u.name AS deletedByName",
        from: "FROM activities LEFT JOIN users u ON u.id = activities.deletedBy AND u.active = 1",
      }
    : { select: "SELECT *", from: "FROM activities" }
}

const lateWindowSchema = z
  .number({ invalid_type_error: "Janela de atraso deve ser um número de dias." })
  .int("Janela de atraso deve ser um número inteiro de dias.")
  .min(0, "Janela de atraso não pode ser negativa.")
  .max(90, "Janela de atraso pode ter no máximo 90 dias.")

const createActivitySchema = z.object({
  title: z.string().trim().min(3, "Título deve ter ao menos 3 caracteres."),
  description: z.string().trim().optional().default(""),
  subjectId: z.string().min(1, "Disciplina obrigatória."),
  classId: z.string().min(1, "Turma obrigatória."),
  points: z.number().int().positive("Pontos deve ser um inteiro positivo."),
  deadline: z
    .string()
    .regex(/^\d{2}\/\d{2}\/\d{4}$/, "Prazo deve estar no formato DD/MM/AAAA.")
    .refine(isValidBRDate, "Prazo deve ser uma data válida no formato DD/MM/AAAA."),
  // 0 = sem tolerância (só o dia do prazo). No PATCH, `.partial()` torna o campo
  // opcional e o default NÃO é aplicado quando a chave falta — quem decide é
  // `body.lateWindowDays ?? activity.lateWindowDays`.
  lateWindowDays: lateWindowSchema.optional().default(DEFAULT_LATE_WINDOW_DAYS),
  type: z.enum(["academic", "school_action", "event", "library", "support", "other"]),
  status: z.enum(["draft", "active", "closed"]).optional().default("draft"),
})

const updateActivitySchema = createActivitySchema.partial().strict()

const statusSchema = z.object({
  status: z.enum(["draft", "active", "closed"]),
}).strict()

/** Permissão de gestão: coord ou dono da atividade (professor/funcionário). */
export function canManageActivity(user: SafeUser, activity: Activity): boolean {
  if (user.role === "coordinator") return true
  return user.role === "teacher" || user.role === "staff" ? activity.teacherId === user.id : false
}

/**
 * Permissão de leitura (2.5): coordenação vê tudo; aluno vê a turma; professor e
 * funcionário veem **só as atividades de que são responsáveis**.
 *
 * O isolamento é por DONO, não por turma: dois professores da mesma turma não
 * enxergam as atividades um do outro (é o que a listagem de `GET /` também faz,
 * e as duas coisas precisam contar a mesma história). Atentar na turma continua
 * válido para **criar** — a validação de turma está no `POST`, não aqui.
 */
export function canViewActivity(user: SafeUser, activity: Activity): boolean {
  // Soft delete (2.4): atividade excluída não é visível para NINGUÉM, nem para
  // a coordenação — quem precisa enxergar a lixeira passa por `?deleted=true`,
  // que é um outro endpoint de leitura, não uma exceção aqui. O guard recebe a
  // entidade inteira (e não o id), então precisa estar correto sozinho.
  if (activity.deletedAt) return false
  if (user.role === "coordinator") return true
  if (user.role === "student") return user.classIds.includes(activity.classId)
  // Restam `teacher` e `staff`: o dono da atividade, e só ele.
  return activity.teacherId === user.id
}

function notifyClassNewActivity(db: ReturnType<typeof getDb>, activity: Activity): void {
  const klass = findClassById(db, activity.classId)
  if (!klass) return
  const teacher = db.prepare("SELECT name FROM users WHERE id = ?").get(activity.teacherId) as
    | { name: string }
    | undefined
  for (const studentId of klass.studentIds) {
    insertNotification({
      userId: studentId,
      title: "Nova atividade publicada",
      message: `${teacher?.name ?? "Professor"} publicou '${activity.title}' para ${klass.name}. Prazo: ${activity.deadline}.`,
      type: "new_activity",
      // A notificação é sobre ESTA atividade (3.3): sem a referência, a tela do
      // aluno não consegue abrir a atividade a partir do aviso.
      relatedActivityId: activity.id,
    })
  }
}

export const activitiesRouter = Router()

/**
 * GET /api/activities — listagem por papel, com soft delete (2.4) e isolamento por
 * dono (2.5).
 *
 * Por padrão devolve só o que o app mostra (`deletedAt IS NULL`); com
 * `?deleted=true` devolve só as excluídas, para quem administra a lixeira
 * (coordenação: todas; professor/funcionário: as delas). `deletedAt`/`deletedBy`
 * viajam no objeto porque a lixeira precisa saber QUANDO e QUEM excluiu —
 * `deletedBy` é o id do autor no momento da exclusão, sem FK e sem garantia de
 * que ainda exista usuário com esse id.
 *
 * Só a lixeira ganha um campo a mais: `deletedByName` (2.6), o nome de quem
 * excluiu, resolvido por LEFT JOIN e `null` quando o autor está inativo ou não
 * existe mais. Um id sozinho não diz nada para quem lê a lixeira; o `null`
 * também é a parte honesta do contrato — quem consome mostra o id com um
 * rótulo de fallback em vez de inventar um nome.
 */
activitiesRouter.get(
  "/",
  requireAuth,
  handle((req, res) => {
    const user = requireUser(res)
    const db = getDb()
    const status = typeof req.query.status === "string" ? req.query.status : undefined
    const type = typeof req.query.type === "string" ? req.query.type : undefined
    const classId = typeof req.query.classId === "string" ? req.query.classId : undefined
    const calendar = req.query.calendar === "true"
    // Soft delete (2.4): `deleted=true` TROCA o filtro, não soma a ele — o
    // padrão (`false`) é "só as que o app mostra", e o pedido explícito é "só as
    // excluídas" (a aba da coordenação, Task 2.6). Aluno não tem lixeira: para
    // ele o parâmetro é ignorado e a listagem é sempre `deletedAt IS NULL`.
    const showDeleted = req.query.deleted === "true" && user.role !== "student"

    const where: string[] = [showDeleted ? "deletedAt IS NOT NULL" : "deletedAt IS NULL"]
    const params: string[] = []
    if (status) {
      where.push("status = ?")
      params.push(status)
    }
    if (type) {
      where.push("type = ?")
      params.push(type)
    }
    if (classId) {
      where.push("classId = ?")
      params.push(classId)
    }
    const filtro = `1=1${where.length > 0 ? " AND " + where.join(" AND ") : ""}`

    let rows: ActivityListRow[]
    const { select, from } = listagemFrom(showDeleted)
    if (user.role === "student") {
      const classPlaceholders = user.classIds.map(() => "?").join(",")
      const classFilter =
        user.classIds.length > 0
          ? ` AND classId IN (${classPlaceholders})`
          : " AND 1 = 0"
      where.push("status = 'active'")
      rows = db
        .prepare(`${select} ${from} WHERE 1=1${where.length > 0 ? " AND " + where.join(" AND ") : ""}${classFilter} ORDER BY ${DEADLINE_SORT} ASC`)
        .all(...params, ...user.classIds) as unknown as ActivityListRow[]
    } else if (user.role === "teacher" || user.role === "staff") {
      // Isolamento por dono (2.5): professor e funcionário listam só as
      // atividades de que são responsáveis — a turma NÃO entra no recorte (uma
      // atividade de terceiro na mesma turma é exatamente o que a 2.5 esconde).
      // Atentar na turma continua validado no `POST /api/activities`: os dois
      // escopos são propositalmente diferentes, porque um é o que existe e o
      // outro é o que ele pode criar.
      //
      // `filtro` já carrega o predicado de exclusão, então o ramo da lixeira
      // (`?deleted=true`) sai de graça com o mesmo `WHERE`: a lixeira do
      // professor/funcionário é a dele, como a lista de verdade.
      rows = db
        .prepare(`${select} ${from} WHERE ${filtro} AND teacherId = ? ORDER BY ${DEADLINE_SORT} ASC`)
        .all(...params, user.id) as unknown as ActivityListRow[]
    } else {
      // Coordenação vê todas — inclusive as excluídas, quando pede (`filtro` já
      // carrega o predicado de exclusão).
      rows = db
        .prepare(`${select} ${from} WHERE ${filtro} ORDER BY ${DEADLINE_SORT} ASC`)
        .all(...params) as unknown as ActivityListRow[]
    }

    // `deletedByName` só existe na lixeira: as demais leituras devolvem `Activity`
    // puro, sem campo novo para o resto do app (e para os testes) carregar.
    const activities: Array<Activity | DeletedActivity> = rows.map((row) => {
      const activity = mapActivity(row)
      return showDeleted ? { ...activity, deletedByName: row.deletedByName ?? null } : activity
    })
    if (calendar) {
      const grouped: Array<{ month: string; activities: Activity[] }> = []
      const byMonth = new Map<string, Activity[]>()
      for (const activity of activities) {
        const month = activity.deadline.slice(3)
        const list = byMonth.get(month) ?? []
        list.push(activity)
        byMonth.set(month, list)
      }
      for (const [month, list] of byMonth) grouped.push({ month, activities: list })
      grouped.sort((a, b) => a.month.localeCompare(b.month))
      sendData(res, 200, { calendar: grouped })
      return
    }
    sendData(res, 200, activities)
  }),
)

activitiesRouter.get(
  "/:id",
  requireAuth,
  handle((req, res) => {
    const user = requireUser(res)
    const db = getDb()
    const activity = findActivityById(db, req.params.id)
    if (!activity) throw notFound("Atividade não encontrada.")
    if (!canViewActivity(user, activity)) {
      forbidAndAudit(req, user, `${user.name} tentou ver atividade fora do seu escopo`)
    }
    const count = db
      .prepare("SELECT COUNT(*) AS total FROM submissions WHERE activityId = ?")
      .get(activity.id) as { total: number }
    const approved = db
      .prepare("SELECT COUNT(*) AS total FROM submissions WHERE activityId = ? AND status = 'approved'")
      .get(activity.id) as { total: number }
    sendData(res, 200, {
      ...activity,
      submissionsCount: Number(count.total),
      approvedCount: Number(approved.total),
    })
  }),
)

activitiesRouter.post(
  "/",
  requireAuth,
  requireRoles("teacher", "staff"),
  handle((req, res) => {
    const body = createActivitySchema.parse(req.body)
    const creator = requireUser(res)
    const db = getDb()

    // staff: apenas tipos operacionais (ação escolar/evento/biblioteca/suporte)
    if (creator.role === "staff" && !OPERATIONAL_TYPES.includes(body.type)) {
      throw unprocessable(
        `Funcionários só podem criar atividades de tipo operacional (${OPERATIONAL_TYPES.map((t) => ACTIVITY_TYPE_LABELS[t]).join(", ")}).`,
        "STAFF_TYPE_NOT_ALLOWED",
      )
    }
    const klass = findClassById(db, body.classId)
    if (!klass) throw notFound("Turma não encontrada.")
    if (!klass.active) throw conflict("Turma inativa.", "CLASS_INACTIVE")
    if (!isDeadlineOnOrAfterToday(body.deadline)) {
      throw unprocessable("Prazo deve ser uma data de hoje ou futura.", "DEADLINE_IN_PAST")
    }
    if (creator.role === "teacher") {
      const inClass =
        creator.classIds.includes(body.classId) || klass.teacherIds.includes(creator.id)
      if (!inClass) {
        recordAudit({
          userId: creator.id,
          action: "ACCESS_DENIED",
          entity: "Route",
          entityId: req.path,
          description: `${creator.name} tentou criar atividade em turma que não atua`,
        })
        throw forbidden("Você não atua nessa turma.", "TEACHER_NOT_IN_CLASS")
      }
    }
    const subject = findSubjectById(db, body.subjectId)
    if (!subject) throw notFound("Disciplina não encontrada.")

    const id = uuid()
    const activity: Activity = {
      id,
      title: body.title,
      description: body.description,
      subjectId: body.subjectId,
      teacherId: creator.id,
      classId: body.classId,
      points: body.points,
      deadline: body.deadline,
      lateWindowDays: body.lateWindowDays,
      type: body.type,
      status: body.status,
      createdAt: nowBR(),
      deletedAt: null, // atividade nasce visível
      deletedBy: null,
    }
    db.prepare(
      `INSERT INTO activities (id, title, description, subjectId, teacherId, classId, points, deadline, lateWindowDays, type, status, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      activity.id,
      activity.title,
      activity.description,
      activity.subjectId,
      activity.teacherId,
      activity.classId,
      activity.points,
      activity.deadline,
      activity.lateWindowDays,
      activity.type,
      activity.status,
      activity.createdAt,
    )

    recordAudit({
      userId: creator.id,
      action: "ACTIVITY_CREATED",
      entity: "Activity",
      entityId: activity.id,
      description: `${creator.name} criou atividade '${activity.title}' para ${klass.name}`,
    })
    if (activity.status === "active") {
      notifyClassNewActivity(db, activity)
      recordAudit({
        userId: creator.id,
        action: "ACTIVITY_PUBLISHED",
        entity: "Activity",
        entityId: activity.id,
        description: `${creator.name} publicou atividade '${activity.title}' para ${klass.name}`,
      })
    }
    sendData(res, 201, activity)
  }),
)

activitiesRouter.patch(
  "/:id",
  requireAuth,
  requireRoles("teacher", "staff", "coordinator"),
  handle((req, res) => {
    const body = updateActivitySchema.parse(req.body)
    const user = requireUser(res)
    const db = getDb()
    const activity = findActivityById(db, req.params.id)
    if (!activity) throw notFound("Atividade não encontrada.")
    if (!canManageActivity(user, activity)) {
      forbidAndAudit(req, user, `${user.name} tentou editar atividade de outro responsável`)
    }
    if (body.classId !== undefined) {
      const klass = findClassById(db, body.classId)
      if (!klass) throw notFound("Turma não encontrada.")
    }
    if (body.subjectId !== undefined) {
      const subject = findSubjectById(db, body.subjectId)
      if (!subject) throw notFound("Disciplina não encontrada.")
    }
    if (body.deadline !== undefined && !isDeadlineOnOrAfterToday(body.deadline)) {
      throw unprocessable("Prazo deve ser uma data de hoje ou futura.", "DEADLINE_IN_PAST")
    }

    db.prepare(
      `UPDATE activities SET title = ?, description = ?, subjectId = ?, classId = ?, points = ?, deadline = ?, lateWindowDays = ?, type = ? WHERE id = ?`,
    ).run(
      body.title ?? activity.title,
      body.description ?? activity.description,
      body.subjectId ?? activity.subjectId,
      body.classId ?? activity.classId,
      body.points ?? activity.points,
      body.deadline ?? activity.deadline,
      body.lateWindowDays ?? activity.lateWindowDays,
      body.type ?? activity.type,
      activity.id,
    )
    const updated = findActivityById(db, activity.id)
    if (!updated) throw notFound("Atividade não encontrada após atualização.")
    recordAudit({
      userId: user.id,
      action: "ACTIVITY_UPDATED",
      entity: "Activity",
      entityId: activity.id,
      description: `${user.name} atualizou atividade '${updated.title}'`,
    })
    sendData(res, 200, updated)
  }),
)

activitiesRouter.patch(
  "/:id/status",
  requireAuth,
  requireRoles("teacher", "staff", "coordinator"),
  handle((req, res) => {
    const body = statusSchema.parse(req.body)
    const user = requireUser(res)
    const db = getDb()
    const activity = findActivityById(db, req.params.id)
    if (!activity) throw notFound("Atividade não encontrada.")
    if (!canManageActivity(user, activity)) {
      forbidAndAudit(req, user, `${user.name} tentou alterar status de atividade de outro responsável`)
    }

    const ALLOWED_TRANSITIONS: Record<Activity["status"], Activity["status"][]> = {
      draft: ["active"],
      active: ["closed"],
      closed: [],
    }
    if (body.status === activity.status) {
      throw conflict("A atividade já está no status solicitado.", "STATUS_UNCHANGED")
    }
    if (!ALLOWED_TRANSITIONS[activity.status].includes(body.status)) {
      throw unprocessable(
        `Transição de status inválida: ${activity.status} → ${body.status}.`,
        "INVALID_STATUS_TRANSITION",
      )
    }

    db.prepare("UPDATE activities SET status = ? WHERE id = ?").run(body.status, activity.id)
    const updated = findActivityById(db, activity.id)
    if (!updated) throw notFound("Atividade não encontrada após atualização.")

    if (updated.status === "active") {
      notifyClassNewActivity(db, updated)
      recordAudit({
        userId: user.id,
        action: "ACTIVITY_PUBLISHED",
        entity: "Activity",
        entityId: updated.id,
        description: `${user.name} publicou atividade '${updated.title}'`,
      })
    } else if (updated.status === "closed") {
      recordAudit({
        userId: user.id,
        action: "ACTIVITY_CLOSED",
        entity: "Activity",
        entityId: updated.id,
        description: `${user.name} encerrou atividade '${updated.title}'`,
      })
    }
    sendData(res, 200, updated)
  }),
)

/**
 * DELETE /api/activities/:id — exclusão LÓGICA (2.4).
 *
 * A linha NÃO é apagada: `submissions`, `transactions` e `auditLogs` apontam
 * para ela, e perder a linha perderia entregas e o rastro de pontos já
 * creditados (o motivo de a migration 004 ter criado as colunas). A exclusão é
 * marcar `deletedAt`/`deletedBy`; a partir daí a atividade sai das listagens, do
 * detalhe e dos painéis (filtro em `findActivityById` e em `GET /`), e volta
 * apenas para quem pede `?deleted=true`.
 *
 * Quem pode: `canManageActivity` — o responsável (professor/funcionário dono) ou
 * a coordenação. Aluno e terceiro são 403 com `ACCESS_DENIED` na auditoria
 * (`requireRoles` + `forbidAndAudit`, como nas demais mutações da rota).
 *
 * Excluir de novo é 409 `ACTIVITY_ALREADY_DELETED` (mesmo formato de
 * `STATUS_UNCHANGED` na transição de status): a exclusão original é preservada —
 * data e autor — e nada é reescrito nem reauditado. Editar/status de atividade
 * excluída é 404, porque `findActivityById` (sem `includeDeleted`) não a enxerga.
 */
activitiesRouter.delete(
  "/:id",
  requireAuth,
  requireRoles("teacher", "staff", "coordinator"),
  handle((req, res) => {
    const user = requireUser(res)
    const db = getDb()
    // `includeDeleted` é o que separa "não existe" de "já excluída" — sem ele os
    // dois casos seriam o mesmo 404 e a exclusão repetida ficaria sem resposta.
    const activity = findActivityById(db, req.params.id, { includeDeleted: true })
    if (!activity) throw notFound("Atividade não encontrada.")
    if (!canManageActivity(user, activity)) {
      forbidAndAudit(req, user, `${user.name} tentou excluir atividade de outro responsável`)
    }
    if (activity.deletedAt) {
      throw conflict("Atividade já excluída.", "ACTIVITY_ALREADY_DELETED")
    }

    // Data/hora de usuário no mesmo formato pt-BR/SP do resto do servidor
    // (`nowBR`): nada de `toISOString()`/UTC, que gravaria o dia errado na
    // lixeira da coordenação.
    //
    // Marcação + auditoria numa transação só: atividade marcada sem a linha de
    // auditoria (ou o contrário) deixaria a lixeira e o rastro de quem excluiu
    // discordando entre si. `withTransaction` desfaz os dois se algum falhar.
    const deleted = withTransaction(db, () => {
      db.prepare("UPDATE activities SET deletedAt = ?, deletedBy = ? WHERE id = ?").run(
        nowBR(),
        user.id,
        activity.id,
      )
      // RN06 — o elo causal fica na auditoria com o TÍTULO no texto: o id aponta
      // para uma atividade que agora some das listagens, e é o título (com autor
      // e data na própria linha) que ainda conta o que aconteceu. O rastro de
      // pontos não passa por aqui — a transação já guarda o valor creditado na
      // aprovação (RN05) e continua apontando para `relatedActivityId`.
      recordAudit({
        userId: user.id,
        action: "ACTIVITY_DELETED",
        entity: "Activity",
        entityId: activity.id,
        description: `${user.name} excluiu atividade '${activity.title}'`,
      })
      return findActivityById(db, activity.id, { includeDeleted: true })
    })
    if (!deleted) throw notFound("Atividade não encontrada após exclusão.")

    sendData(res, 200, deleted)
  }),
)