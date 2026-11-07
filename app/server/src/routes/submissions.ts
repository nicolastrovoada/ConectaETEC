import fs from "node:fs"
import path from "node:path"
import { Router } from "express"
import { z } from "zod"
import { requireAuth, requireRoles, requireUser, forbidAndAudit } from "../auth/middleware"
import { config } from "../config"
import { getDb } from "../db/connection"
import {
  findActivityById,
  findSubmissionById,
  findSubmissionByActivityAndStudent,
} from "../db/queries"
import { mapSubmission, type SubmissionRow } from "../db/rows"
import { withTransaction } from "../db/transaction"
import { nowBR, isDeadlineExpired, isLateWindowOpen, isValidBRDate } from "../lib/dates"
import { badRequest, conflict, notFound, unprocessable } from "../lib/errors"
import { handle, sendData } from "../lib/http"
import {
  cleanupUploadedFiles,
  deleteStoredFiles,
  normalizeUploadedFile,
  persistAttachments,
  uploadAttachments,
} from "../lib/uploads"
import { uuid } from "../lib/uuid"
import { recordAudit } from "../services/audit"
import { insertNotification, resolveRevisionNotifications } from "../services/notifications"
import { creditForApproval } from "../services/points"
import { canManageActivity } from "./activities"
import type { Attachment, SafeUser, Submission } from "../shared/types"

const validateActionSchema = z.object({
  action: z.enum(["approve", "reject", "revision"]),
  feedback: z.string().trim().max(2000).optional().default(""),
}).strict()

const VALIDATABLE_STATUSES = new Set(["pending", "submitted", "under_review", "revision_required"])

/**
 * Dia de calendário do envio como `AAAAMMDD`, comparável lexicograficamente.
 *
 * `submittedAt` é `DD/MM/AAAA, HH:MM:SS` (o que o `nowBR()` grava), então
 * concatenar ano/mês/dia é o mesmo truque de `DEADLINE_SORT` em
 * `routes/activities.ts`. O filtro é de DIA, não de instante: a entrega das
 * 23:59 de 10/09 pertence a 10/09, e a das 00:01 de 11/09 pertence a 11/09.
 */
const SUBMITTED_DAY = "substr(s.submittedAt, 7, 4) || substr(s.submittedAt, 4, 2) || substr(s.submittedAt, 1, 2)"

/** `DD/MM/AAAA` → `AAAAMMDD`, a mesma chave que o SQL produz de `submittedAt`. */
function brDayKey(value: string): string {
  return `${value.slice(6, 10)}${value.slice(3, 5)}${value.slice(0, 2)}`
}

/** Parâmetro de query como string não vazia; ausente ou vazio = filtro desligado. */
function queryString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined
}

/**
 * Uma ponta do período (`from`/`to`) da aba de filtros (4.1).
 *
 * A entrada é `DD/MM/AAAA` — o formato que o brasileiro digita e o que o app
 * grava em toda data — e a validação é de data REAL (`isValidBRDate`), não de
 * formato: "32/13/2026" e "31/02/2026" são recusadas com 400 em vez de virar
 * data rolada. O mesmo cuidado que `new Date("01/02/2026")` exige, que o JS lê
 * como 1 de fevereiro e o brasileiro lê como 2 de janeiro: aqui não existe
 * `new Date(string)` em lugar nenhum, os campos são lidos um a um.
 */
function queryBrDay(value: unknown, param: string): string | undefined {
  const raw = queryString(value)
  if (raw === undefined) return undefined
  if (!isValidBRDate(raw)) {
    throw badRequest(
      `Período inválido: "${param}" precisa ser uma data que existe, no formato DD/MM/AAAA (recebido: ${raw}).`,
      "INVALID_PERIOD",
    )
  }
  return raw
}

function listAttachmentsBySubmissionId(submissionId: string): Attachment[] {
  const db = getDb()
  const rows = db
    .prepare("SELECT * FROM attachments WHERE submissionId = ? ORDER BY rowid ASC")
    .all(submissionId) as unknown as Array<{
    id: string
    filename: string
    storedName: string
    mimeType: string
    size: number
    uploadedAt: string
  }>
  return rows.map((r) => ({
    id: r.id,
    filename: r.filename,
    storedName: r.storedName,
    mimeType: r.mimeType,
    size: r.size,
    uploadedAt: r.uploadedAt,
  }))
}

function canValidateActivity(user: SafeUser, activityId: string): boolean {
  const db = getDb()
  const activity = findActivityById(db, activityId)
  if (!activity) return false
  return canManageActivity(user, activity)
}

function canViewSubmission(user: SafeUser, submission: Submission): boolean {
  const db = getDb()
  const activity = findActivityById(db, submission.activityId)
  if (!activity) return false
  // Soft delete (2.4), espelhando `canViewActivity`: atividade excluída não é
  // visível para NINGUÉM, anexo incluído. `findActivityById` já devolve `null`
  // para excluída, então esta linha é a REGRA escrita no guard — ela não depende
  // do default da query.
  if (activity.deletedAt) return false
  if (user.role === "coordinator") return true
  if (user.role === "student") return submission.studentId === user.id
  // Restam `teacher` e `staff`: só o responsável pela atividade da entrega.
  // Atender a turma não abre o arquivo de um colega — o arquivo da entrega
  // obedece o mesmo isolamento por dono da lista de entregas e de
  // `canViewActivity` (2.5). O `submission.studentId === user.id` que existia
  // aqui era um disjunto morto para professor (só o aluno é dono da própria
  // entrega, e ele sai no ramo acima).
  return activity.teacherId === user.id
}

function sendAttachmentFile(res: Parameters<typeof sendData>[0], attachment: Attachment): void {
  const filePath = path.join(config.uploadsDir, attachment.storedName)
  if (!fs.existsSync(filePath)) {
    throw notFound("Arquivo não encontrado no storage.", "FILE_MISSING")
  }
  res.setHeader("Content-Type", attachment.mimeType)
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${attachment.filename.replaceAll('"', "")}"`,
  )
  res.sendFile(filePath)
}

/**
 * Veredito da pré-validação do envio (guard, antes do multer).
 *
 * `delayed` viaja daqui até a escrita em vez de ser recalculado no serviço: o
 * upload multipart acontece entre o guard e a escrita, e uma segunda avaliação
 * depois dos bytes veria o dia de São Paulo possivelmente já virado — fecharia a
 * janela de uma entrega já aceita e gravaria `delayed = 0`, creditando a
 * pontuação integral de uma entrega feita fora da janela. Uma avaliação, uma
 * fonte de verdade.
 *
 * A reavaliação por REQUISIÇÃO continua existindo (cada envio redecide, inclusive
 * o reenvio após correção pedida) — o que não existe é a segunda leitura dentro
 * da mesma requisição.
 */
interface SubmissionGuard {
  existing: Submission | null
  /** 0 = no prazo, 1 = entrega atrasada (meia pontuação na aprovação). */
  delayed: 0 | 1
}

/** Cria/atualiza a entrega e registra auditoria/anexos em transação. */
function createOrUpdateSubmission(
  activityId: string,
  studentId: string,
  input: { comment: string; evidence: string },
  files: Express.Multer.File[],
  guard: SubmissionGuard,
): Submission {
  const db = getDb()
  const { existing, delayed } = guard
  const staleAttachments = existing && files.length > 0 ? [...existing.attachments] : []
  const student = db.prepare("SELECT name FROM users WHERE id = ?").get(studentId) as
    | { name: string }
    | undefined
  const activity = findActivityById(db, activityId)
  if (!activity) throw notFound("Atividade não encontrada.")
  // `delayed` NÃO é recalculado aqui: vem do guard (ver `SubmissionGuard`).
  // O que é relido do banco são só os campos descritivos (título, responsável),
  // que não têm nada a ver com a janela.

  const result = withTransaction(db, () => {
    const now = nowBR()
    const submissionId = existing?.id ?? uuid()
    if (existing) {
      db.prepare(
        `UPDATE submissions SET submittedAt = ?, status = ?, delayed = ?, evidence = ?, comment = ?, feedback = '', validatedBy = NULL, validatedAt = NULL WHERE id = ?`,
      ).run(now, "under_review", delayed, input.evidence, input.comment, submissionId)
      if (files.length > 0) {
        // Remove anexos antigos do banco; os arquivos físicos antigos são
        // apagados do disco após o commit (ver abaixo, best-effort).
        db.prepare("DELETE FROM attachments WHERE submissionId = ?").run(submissionId)
        persistAttachments(submissionId, files)
      }
    } else {
      db.prepare(
        `INSERT INTO submissions (id, activityId, studentId, submittedAt, status, delayed, evidence, comment, validatedBy, validatedAt, feedback)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, '')`,
      ).run(
        submissionId,
        activityId,
        studentId,
        now,
        "under_review",
        delayed,
        input.evidence,
        input.comment,
      )
      if (files.length > 0) persistAttachments(submissionId, files)
    }

    const teacher = db.prepare("SELECT id FROM users WHERE id = ?").get(activity.teacherId) as
      | { id: string }
      | undefined
    if (teacher) {
      insertNotification({
        userId: teacher.id,
        title: "Nova entrega para validar",
        message: `${student?.name ?? "Aluno"} enviou conclusão de "${activity.title}".`,
        type: "system",
        relatedActivityId: activity.id,
      })
    }

    const action = existing ? "SUBMISSION_RESUBMITTED" : "SUBMISSION_SENT"
    recordAudit({
      userId: studentId,
      action,
      entity: "Submission",
      entityId: submissionId,
      description: `${student?.name ?? "Aluno"} ${existing ? "reenviou" : "enviou"} conclusão de "${activity.title}"`,
    })

    // 3.3 (Review Focus 4): reenviar É resolver a correção pedida. A notificação
    // é removida por ATIVIDADE — as correções pendentes das outras atividades do
    // mesmo aluno continuam na lista dele, porque ele não viu nenhuma das duas.
    // Fica na mesma transação do reenvio: ou os dois acontecem, ou nenhum.
    const correcoesResolvidas = resolveRevisionNotifications(studentId, activityId)
    if (correcoesResolvidas > 0) {
      recordAudit({
        userId: studentId,
        action: "REVISION_RESOLVED",
        entity: "Submission",
        entityId: submissionId,
        description: `${student?.name ?? "Aluno"} resolveu a correção pedida em "${activity.title}" ao reenviar a entrega`,
      })
    }

    const row = db.prepare("SELECT * FROM submissions WHERE id = ?").get(submissionId) as unknown as SubmissionRow
    return mapSubmission(row, listAttachmentsBySubmissionId(submissionId))
  })

  // Após o commit: exclui do disco os arquivos órfãos do envio anterior
  // (best-effort por arquivo — falha não deve derrubar a resposta). O mesmo
  // helper do DELETE do reforço: ele consulta as duas tabelas de anexo e
  // preserva o byte de um nome que ainda seja referência viva (reuso de nome
  // entre anexo de entrega e anexo do reforço).
  deleteStoredFiles(staleAttachments.map((attachment) => attachment.storedName))

  return result
}

export const submissionCreateRouter = Router()

submissionCreateRouter.post(
  "/:activityId/submissions",
  requireAuth,
  requireRoles("student"),
  (req, res, next) => {
    // Pré-validação ANTES do multer para não gravar arquivos órfãos em falha de regra.
    try {
      const user = requireUser(res)
      const db = getDb()
      const activity = findActivityById(db, req.params.activityId)
      if (!activity) throw notFound("Atividade não encontrada.")
      if (activity.status !== "active") {
        throw unprocessable("A atividade não está ativa para envio.", "ACTIVITY_NOT_ACTIVE")
      }
      // Fase 2 (2.2): o prazo vencido NÃO fecha a entrega — o que fecha é a
      // janela de atraso (`hoje <= prazo + lateWindowDays`, último dia inclusivo;
      // a aritmética inteira mora em `isLateWindowOpen`).
      //
      // A janela é avaliada AQUI, uma única vez por requisição, e o veredito
      // viaja em `res.locals`: o upload multipart abaixo pode levar segundos, e
      // reavaliar depois dos bytes encontraria um dia de São Paulo possivelmente
      // já virado. Ver `SubmissionGuard`.
      if (!isLateWindowOpen(activity)) {
        throw unprocessable("Janela de atraso encerrada.", "LATE_WINDOW_CLOSED")
      }
      // Janela aberta ⇒ o que decide o atraso é só o prazo. Avaliado a cada
      // requisição de envio (inclusive o reenvio após correção pedida): a entrega
      // é julgada no momento em que o aluno manda.
      const delayed: 0 | 1 = isDeadlineExpired(activity.deadline) ? 1 : 0
      if (!user.classIds.includes(activity.classId)) {
        forbidAndAudit(req, user, `${user.name} tentou enviar entrega fora da sua turma`)
      }
      const existing = findSubmissionByActivityAndStudent(db, activity.id, user.id)
      if (existing && existing.status !== "revision_required") {
        throw conflict(
          "Você já enviou esta atividade. Reenvio permitido apenas quando houver correção solicitada.",
          "ALREADY_SUBMITTED",
        )
      }
      res.locals.submissionGuard = { existing: existing as Submission | null, delayed }
      next()
    } catch (error) {
      next(error)
    }
  },
  uploadAttachments.array("attachments", config.maxAttachments),
  handle((req, res) => {
    const user = requireUser(res)
    const guard = res.locals.submissionGuard as SubmissionGuard | undefined
    if (!guard) {
      // Invariante da cadeia de middlewares: o guard acima sempre roda antes deste
      // handler. Sem o veredito não há como escolher `delayed` sem inventar um
      // valor — melhor falhar do que gravar uma entrega sem a janela avaliada.
      throw new Error("res.locals.submissionGuard ausente: a pré-validação do envio não rodou")
    }
    const files = (req.files as Express.Multer.File[] | undefined) ?? []
    try {
      // Magic bytes: valida o conteúdo REAL de cada anexo e ajusta o nome de
      // armazenamento pela extensão detectada antes de persistir metadados.
      for (const file of files) normalizeUploadedFile(file)
      const body = z
        .object({
          comment: z.string().trim().max(3000).optional().default(""),
          evidence: z.string().trim().max(3000).optional().default(""),
        })
        .parse(req.body)
      const created = createOrUpdateSubmission(
        req.params.activityId,
        user.id,
        { comment: body.comment, evidence: body.evidence },
        files,
        guard,
      )
      sendData(res, 201, created)
    } catch (error) {
      cleanupUploadedFiles(files)
      throw error
    }
  }),
)

export const submissionRouter = Router()

/**
 * GET /api/submissions — a listagem que a aba de validação filtra (4.1).
 *
 * Os filtros são TODOS combináveis por E (a ordem dos `where` não importa, a
 * ordem dos `params` sim — e os dois crescem juntos). Nenhum deles amplia o
 * escopo do papel: eles só acrescentam predicados ao `WHERE` que o ramo de
 * papel já montou, então pedir a matéria/atividade/aluno de outra pessoa
 * devolve lista vazia em vez de vazar a linha.
 *
 * | parâmetro    | efeito                                                        |
 * |--------------|---------------------------------------------------------------|
 * | `activityId` | atividade exata                                                |
 * | `status`     | um dos seis estados de RN03                                    |
 * | `subjectId`  | matéria, via `activities.subjectId`                            |
 * | `studentName`| trecho do nome do aluno (`studentId` continua existindo)       |
 * | `from`/`to`  | dia do envio, DD/MM/AAAA, **inclusivo nas duas pontas**       |
 *
 * `from` > `to` é 400 com os dois dias na mensagem, e não lista vazia: um
 * período invertido é erro de digitação, e "nenhuma entrega" é uma resposta
 * que o educador não consegue distinguir de "essa turma não entregou nada".
 */
submissionRouter.get(
  "/",
  requireAuth,
  handle((req, res) => {
    const user = requireUser(res)
    const db = getDb()
    const activityId = queryString(req.query.activityId)
    const studentId = queryString(req.query.studentId)
    const status = queryString(req.query.status)
    const subjectId = queryString(req.query.subjectId)
    const studentName = queryString(req.query.studentName)
    // Validação ANTES de qualquer recorte: o pedido está malformado, e a
    // resposta precisa dizer por quê em vez de devolver `[]` sem explicação.
    const from = queryBrDay(req.query.from, "from")
    const to = queryBrDay(req.query.to, "to")
    if (from && to && brDayKey(from) > brDayKey(to)) {
      throw badRequest(
        `Período inválido: "from" (${from}) é posterior a "to" (${to}).`,
        "PERIOD_REVERSED",
      )
    }

    const where: string[] = []
    const params: string[] = []
    if (activityId) {
      where.push("s.activityId = ?")
      params.push(activityId)
    }
    if (status) {
      where.push("s.status = ?")
      params.push(status)
    }
    if (subjectId) {
      // Matéria (4.1): recorte por `activities.subjectId`.
      //
      // Deliberadamente SEM `deletedAt IS NULL` aqui. Para professor e
      // funcionário o recorte de dono logo abaixo já empurra as atividades
      // excluídas para fora, e para a coordenação o C3 (branch sem escopo de
      // atividade, que preserva entrega/nota de atividade arquivada para
      // rastreabilidade) precisa continuar valendo: se o filtro de matéria
      // escondesse o que a lista sem filtro mostra, o mesmo professor teria
      // duas respostas diferentes para a pergunta "quantas entregas há?".
      where.push("s.activityId IN (SELECT id FROM activities WHERE subjectId = ?)")
      params.push(subjectId)
    }
    if (studentName) {
      // Busca por nome do aluno (4.1) — `instr` e não `LIKE`: é busca por trecho
      // SEM curinga, então "%" e "_" digitados pelo educador são literais (a mesma
      // lição do `LIKE` cru que a auditoria ainda tem).
      //
      // A comparação é sobre `namekey(...)`, a chave registrada na conexão
      // (`db/connection.ts`): minúsculas e SEM acento. Com `lower(name)` o filtro
      // era cego a acento — o `lower()` do SQLite só dobra ASCII, então "Jose" não
      // achava "José" e "Conceicao" não achava "Conceição", que é praticamente
      // todo o roster de uma escola brasileira. A chave troca SÓ a coluna
      // comparada: o `s.studentId IN (...)` continua intersectando com o escopo do
      // papel montado abaixo, então normalizar não abre nenhuma linha alheia.
      where.push("s.studentId IN (SELECT id FROM users WHERE instr(namekey(name), namekey(?)) > 0)")
      params.push(studentName)
    }
    if (from) {
      where.push(`${SUBMITTED_DAY} >= ?`)
      params.push(brDayKey(from))
    }
    if (to) {
      where.push(`${SUBMITTED_DAY} <= ?`)
      params.push(brDayKey(to))
    }

    if (user.role === "student") {
      where.push("s.studentId = ?")
      params.push(user.id)
    } else if (user.role === "teacher" || user.role === "staff") {
      // Isolamento por dono (2.5): as entregas que o responsável vê são as das
      // atividades DELE. A turma não amplia o escopo — mesmo critério de
      // `canViewActivity` e de `GET /api/activities`, para lista e detalhe não
      // contarem histórias diferentes.
      //
      // Soft delete (2.4): o escopo de "atividades visíveis" ignora as excluídas.
      // Sem este filtro, as entregas de uma atividade excluída continuariam
      // listadas aqui — e o card mostraria "Ação removida" no lugar do título.
      const doDono = db
        .prepare("SELECT id FROM activities WHERE teacherId = ? AND deletedAt IS NULL")
        .all(user.id) as unknown as Array<{ id: string }>
      const allowedIds = doDono.map((a) => a.id)
      if (allowedIds.length === 0) {
        sendData(res, 200, [])
        return
      }
      where.push(`s.activityId IN (${allowedIds.map(() => "?").join(",")})`)
      params.push(...allowedIds)
    }
    // Filtro por aluno: aluno só filtra o próprio; demais papéis filtram
    // dentro do escopo já limitado (atividades próprias) — seguro.
    if (studentId) {
      if (user.role === "student" && studentId !== user.id) {
        forbidAndAudit(req, user, `${user.name} tentou listar entregas de outro aluno`)
      }
      where.push("s.studentId = ?")
      params.push(studentId)
    }

    const rows = db
      .prepare(`SELECT s.* FROM submissions s WHERE 1=1${where.length > 0 ? " AND " + where.join(" AND ") : ""} ORDER BY s.rowid DESC`)
      .all(...params) as unknown as SubmissionRow[]
    const submissions = rows.map((r) =>
      mapSubmission(r, listAttachmentsBySubmissionId(r.id)),
    )
    sendData(res, 200, submissions)
  }),
)

submissionRouter.get(
  "/:id/attachments/:attId",
  requireAuth,
  handle((req, res) => {
    const user = requireUser(res)
    const submission = findSubmissionById(getDb(), req.params.id)
    if (!submission) throw notFound("Entrega não encontrada.")
    if (!canViewSubmission(user, submission)) {
      forbidAndAudit(req, user, `${user.name} tentou acessar anexo de entrega sem permissão`)
    }
    const attachment = submission.attachments.find((a) => a.id === req.params.attId)
    if (!attachment) throw notFound("Anexo não encontrado.")
    sendAttachmentFile(res, attachment)
  }),
)

submissionRouter.post(
  "/:id/validate",
  requireAuth,
  requireRoles("teacher", "staff", "coordinator"),
  handle((req, res) => {
    const body = validateActionSchema.parse(req.body)
    const user = requireUser(res)
    const db = getDb()
    const submission = findSubmissionById(db, req.params.id)
    if (!submission) throw notFound("Entrega não encontrada.")
    const activity = findActivityById(db, submission.activityId)
    if (!activity) throw notFound("Atividade não encontrada.")
    if (!canManageActivity(user, activity)) {
      forbidAndAudit(req, user, `${user.name} tentou validar entrega fora do seu escopo`)
    }
    if (!VALIDATABLE_STATUSES.has(submission.status)) {
      throw conflict("Entrega já validada.", "SUBMISSION_ALREADY_VALIDATED")
    }

    if (body.action !== "approve" && !body.feedback.trim()) {
      throw unprocessable("Feedback obrigatório para reprovar ou solicitar correção.", "FEEDBACK_REQUIRED")
    }

    const student = db.prepare("SELECT * FROM users WHERE id = ?").get(submission.studentId) as
      | { name: string }
      | undefined

    withTransaction(db, () => {
      // RN05 — idempotência: revalidação dentro da transação; uma entrega já
      // validada (approved/rejected/revision_required) não pode voltar a gerar
      // pontos/streak. Este guard espelha o check externo (defesa em profundidade).
      const fresh = db.prepare("SELECT status FROM submissions WHERE id = ?").get(submission.id) as
        | { status: string }
        | undefined
      if (!fresh || !VALIDATABLE_STATUSES.has(fresh.status)) {
        throw conflict("Entrega já validada.", "SUBMISSION_ALREADY_VALIDATED")
      }

      const nextStatus = body.action === "approve" ? "approved" : body.action === "reject" ? "rejected" : "revision_required"
      const validatedAt = nowBR()
      db.prepare(
        `UPDATE submissions SET status = ?, validatedBy = ?, validatedAt = ?, feedback = ? WHERE id = ?`,
      ).run(nextStatus, user.id, validatedAt, body.feedback ?? "", submission.id)

      if (body.action === "approve") {
        // Fase 2 (2.2): entrega atrasada vale MEIA pontuação, arredondada para
        // cima (15 → 8, 7 → 4, 1 → 1). A política fica aqui, no chamador; o
        // serviço recebe o valor e o aplica em transação, notificação e
        // auditoria. `undefined` = o serviço credita a pontuação integral.
        const pointsToCredit = submission.delayed ? Math.ceil(activity.points / 2) : undefined
        creditForApproval(
          activity,
          { ...submission, status: "approved" },
          user,
          validatedAt,
          pointsToCredit,
        )
      } else if (body.action === "reject") {
        insertNotification({
          userId: submission.studentId,
          title: "Atividade não aprovada",
          message: `Sua entrega de '${activity.title}' não foi aprovada. Feedback: ${body.feedback.trim()}`,
          type: "activity_rejected",
          relatedActivityId: activity.id,
        })
        recordAudit({
          userId: user.id,
          action: "SUBMISSION_REJECTED",
          entity: "Submission",
          entityId: submission.id,
          description: `${user.name} reprovou atividade '${activity.title}' de ${student?.name ?? submission.studentId}`,
        })
      } else {
        insertNotification({
          userId: submission.studentId,
          title: "Correção solicitada",
          message: `Sua entrega de '${activity.title}' precisa de correção. Feedback: ${body.feedback.trim()}`,
          type: "activity_revision",
          // A referência que faz a notificação resolver por atividade (3.3):
          // sem ela, o reenvio do aluno não sabe qual aviso encerrar.
          relatedActivityId: activity.id,
        })
        recordAudit({
          userId: user.id,
          action: "REVISION_REQUIRED",
          entity: "Submission",
          entityId: submission.id,
          description: `${user.name} solicitou correção em '${activity.title}' de ${student?.name ?? submission.studentId}`,
        })
      }
    })

    const updated = findSubmissionById(db, submission.id)
    if (!updated) throw notFound("Entrega não encontrada após validação.")
    sendData(res, 200, updated)
  }),
)