import { Router, type NextFunction, type Request, type Response } from "express"
import { z } from "zod"
import { forbidAndAudit, requireAuth, requireRoles, requireUser } from "../auth/middleware"
import { config } from "../config"
import { getDb } from "../db/connection"
import {
  findClassById,
  findStudyContentById,
  hasStudyContentCompletions,
  listAttachmentStoredNamesForStudyContent,
  listAttachmentsForStudyContents,
  listCompletionsForStudent,
} from "../db/queries"
import { mapStudyContent, type StudyContentRow } from "../db/rows"
import { withTransaction } from "../db/transaction"
import { nowBR } from "../lib/dates"
import { conflict, forbidden, notFound, unprocessable } from "../lib/errors"
import { handle, sendData } from "../lib/http"
import { uuid } from "../lib/uuid"
import {
  cleanupUploadedFiles,
  deleteStoredFiles,
  normalizeUploadedFile,
  persistStudyContentAttachments,
  uploadAttachments,
} from "../lib/uploads"
import { recordAudit } from "../services/audit"
import { insertNotification } from "../services/notifications"
import { celebrateLevelUp, getBalance } from "../services/points"
import {
  canManageStudyContent,
  canReadStudyContent,
  canUploadStudyContentAttachment,
} from "../services/studyContents"
import type { PointsTransaction, SafeUser, StudyContent, StudyContentCompletion } from "../shared/types"

/**
 * Reforço escolar (V3, Tarefa 3.1) — CRUD com dono, conclusão com crédito único
 * e anexos de apoio.
 *
 * Regras de permissão, todas decididas no servidor:
 * - Professor: cria/edita/apaga o reforço das PRÓPRIAS turmas (as turmas em que
 *   ele consta em `Class.teacherIds`); um reforço é dele, mesmo em turma com
 *   dois professores.
 * - Coordenação: administra qualquer reforço.
 * - Funcionário: não é autor de reforço, mas sobe o material de apoio.
 * - Aluno: só conclui o reforço de uma turma em que está (e recebe os pontos uma
 *   vez só).
 */

const createContentSchema = z
  .object({
    subject: z.string().trim().min(1, "Disciplina obrigatória."),
    topic: z.string().trim().min(1, "Tópico obrigatório."),
    icon: z.string().optional().default("📖"),
    color: z.string().optional().default("blue"),
    exercises: z.number().int().min(0).optional().default(0),
    description: z.string().trim().max(2000).optional().default(""),
    content: z.string().trim().max(20000).optional().default(""),
    classIds: z
      .array(z.string().trim().min(1, "Turma inválida."))
      .min(1, "Informe ao menos uma turma destinatária.")
      .max(20, "Selecione até 20 turmas."),
    points: z
      .number()
      .int()
      .min(1, "Pontuação mínima de 1 por reforço: o +N é a recompensa de concluir.")
      .max(100, "Pontuação máxima de 100 por reforço.")
      .optional()
      .default(5),
    questions: z.array(z.string().trim().min(1).max(500)).max(20).optional().default([]),
  })
  .strict()

const updateContentSchema = createContentSchema.partial().strict()

function loadContentOr404(id: string): StudyContent {
  const content = findStudyContentById(getDb(), id)
  if (!content) throw notFound("Conteúdo de reforço não encontrado.", "CONTENT_NOT_FOUND")
  return content
}

/**
 * Toda turma precisa existir E, para o professor, ser turma dele. Turma
 * inexistente é 404 (o cliente pode ter uma lista velha); turma de outro
 * professor é 403 com `TEACHER_NOT_IN_CLASS` e auditoria — a distinção importa
 * para quem lê a auditoria depois.
 */
function assertWritableClasses(req: Request, user: SafeUser, classIds: string[]): void {
  const db = getDb()
  const classes = classIds.map((id) => {
    const found = findClassById(db, id)
    if (!found) throw notFound(`Turma não encontrada: ${id}.`, "CLASS_NOT_FOUND")
    return found
  })
  if (user.role === "teacher") {
    const alheia = classes.find((c) => !c.teacherIds.includes(user.id))
    if (alheia) {
      // Auditoria própria (e não `forbidAndAudit`) só para conservar o `details`
      // que explica o 403: recusar e explicar o motivo é metade do contrato.
      recordAudit({
        userId: user.id,
        action: "ACCESS_DENIED",
        entity: "Route",
        entityId: req.path,
        description: `${user.name} tentou ${req.method} ${req.path} em turma que não é sua (${alheia.name})`,
      })
      throw forbidden(
        `Você só publica reforço nas suas turmas: ${alheia.name} não é sua.`,
        "TEACHER_NOT_IN_CLASS",
      )
    }
  }
}

const INSERT_COLUMNS =
  "id, subject, topic, icon, color, exercises, description, content, teacherId, classIds, points, questions"

export const studyContentsRouter = Router()

studyContentsRouter.get(
  "/",
  requireAuth,
  handle((req, res) => {
    const db = getDb()
    const user = requireUser(res)
    const subject = typeof req.query.subject === "string" ? req.query.subject : undefined
    const rows = (
      subject
        ? db
            .prepare("SELECT * FROM studyContents WHERE subject = ? ORDER BY topic COLLATE NOCASE ASC")
            .all(subject)
        : db.prepare("SELECT * FROM studyContents ORDER BY subject COLLATE NOCASE ASC, topic COLLATE NOCASE ASC").all()
    ) as unknown as StudyContentRow[]

    // Anexos de TODOS os reforços da página em uma consulta (sem N+1): a rota de
    // entrega faz o mesmo com `listAttachmentsForSubmission`.
    const attachments = listAttachmentsForStudyContents(
      db,
      rows.map((row) => row.id),
    )
    const conteudos = rows.map((row) => mapStudyContent(row, attachments.get(row.id) ?? []))
    // Escopo de leitura pelo MESMO predicado do `GET /:id` e do `/uploads` (R28):
    // aluno só das turmas em que está, professor só o que é dele, staff e
    // coordenação tudo. O filtro vem DEPOIS do mapeamento de propósito — assim a
    // rota não tem uma segunda cópia da regra.
    const visiveis = conteudos.filter((content) => canReadStudyContent(user, content))

    // R31: só o ALUNO tem conclusão que diga respeito — a dele. A consulta entra
    // DEPOIS do filtro de escopo (o banco nem é perguntado sobre reforço que não
    // vai sair na resposta) e é UMA para a página inteira, no mesmo formato de
    // `listAttachmentsForStudyContents`. Para os demais papéis o campo é omitido
    // (`StudyContent`), porque `null` diria "ninguém concluiu" e isso a rota não
    // pode afirmar para quem nem vê o estado dos alunos.
    if (user.role !== "student") {
      sendData(res, 200, visiveis)
      return
    }
    const completedAt = listCompletionsForStudent(
      db,
      user.id,
      visiveis.map((content) => content.id),
    )
    sendData(
      res,
      200,
      visiveis.map((content) => ({ ...content, completedAt: completedAt.get(content.id) ?? null })),
    )
  }),
)

studyContentsRouter.get(
  "/:id",
  requireAuth,
  handle((req, res) => {
    const user = requireUser(res)
    const content = loadContentOr404(req.params.id)
    // Fora do escopo é 403 auditado (mesmo contrato do anexo no `/uploads`): o
    // aluno de outra turma não recebe nem a lição nem a lista de anexos.
    if (!canReadStudyContent(user, content)) {
      forbidAndAudit(req, user, `${user.name} tentou ler reforço fora do seu escopo (${content.topic})`)
    }
    // R31: a conclusão é do aluno que está lendo, e a mesma query da listagem
    // resolve (aqui com um id só, o que continua sendo uma consulta).
    if (user.role === "student") {
      const completedAt = listCompletionsForStudent(getDb(), user.id, [content.id])
      sendData(res, 200, { ...content, completedAt: completedAt.get(content.id) ?? null })
      return
    }
    sendData(res, 200, content)
  }),
)

studyContentsRouter.post(
  "/",
  requireAuth,
  requireRoles("teacher", "coordinator"),
  handle((req, res) => {
    const body = createContentSchema.parse(req.body)
    const user = requireUser(res)
    const db = getDb()
    // Turmas validadas ANTES do insert: uma recusa não deixa conteúdo órfão.
    assertWritableClasses(req, user, body.classIds)

    const id = uuid()
    db.prepare(
      `INSERT INTO studyContents (${INSERT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      body.subject,
      body.topic,
      body.icon,
      body.color,
      body.exercises,
      body.description,
      body.content,
      user.id,
      JSON.stringify(body.classIds),
      body.points,
      JSON.stringify(body.questions),
    )
    recordAudit({
      userId: user.id,
      action: "CONTENT_CREATED",
      entity: "StudyContent",
      entityId: id,
      description: `${user.name} criou conteúdo de reforço '${body.topic}' (${body.subject}) para ${body.classIds.length} turma(s)`,
    })
    sendData(res, 201, loadContentOr404(id))
  }),
)

studyContentsRouter.patch(
  "/:id",
  requireAuth,
  requireRoles("teacher", "coordinator"),
  handle((req, res) => {
    const body = updateContentSchema.parse(req.body)
    const user = requireUser(res)
    const db = getDb()
    // Mesmo 404 do DELETE e do POST: uma linha de carregamento para as três rotas.
    const current = loadContentOr404(req.params.id)
    if (!canManageStudyContent(user, current)) {
      forbidAndAudit(req, user, `${user.name} tentou editar reforço de outro professor (${current.topic})`)
    }
    // `partial()` + os valores atuais: o corpo pode mandar só o `topic` e o resto
    // do reforço continua como estava (mesma semântica do `lateWindowDays` na 2.2).
    const classIds = body.classIds ?? current.classIds
    assertWritableClasses(req, user, classIds)

    db.prepare(
      `UPDATE studyContents SET subject = ?, topic = ?, icon = ?, color = ?, exercises = ?,
         description = ?, content = ?, classIds = ?, points = ?, questions = ?
       WHERE id = ?`,
    ).run(
      body.subject ?? current.subject,
      body.topic ?? current.topic,
      body.icon ?? current.icon,
      body.color ?? current.color,
      body.exercises ?? current.exercises,
      body.description ?? current.description,
      body.content ?? current.content,
      JSON.stringify(classIds),
      body.points ?? current.points,
      JSON.stringify(body.questions ?? current.questions),
      current.id,
    )
    const updated = loadContentOr404(current.id)
    recordAudit({
      userId: user.id,
      action: "CONTENT_UPDATED",
      entity: "StudyContent",
      entityId: current.id,
      description: `${user.name} atualizou conteúdo de reforço '${updated.topic}'`,
    })
    sendData(res, 200, updated)
  }),
)

studyContentsRouter.delete(
  "/:id",
  requireAuth,
  requireRoles("teacher", "coordinator"),
  handle((req, res) => {
    const user = requireUser(res)
    const db = getDb()
    const current = loadContentOr404(req.params.id)
    if (!canManageStudyContent(user, current)) {
      forbidAndAudit(req, user, `${user.name} tentou remover reforço de outro professor (${current.topic})`)
    }
    // Reforço concluído é histórico: os pontos já foram creditados e a conclusão é
    // a prova disso (`study_content_completions.studyContentId` é RESTRICT). Sem
    // este guarda, o DELETE estouraria a FK e o cliente veria 500.
    if (hasStudyContentCompletions(db, current.id)) {
      throw conflict(
        "Este reforço já foi concluído por alunos e não pode ser removido: os pontos já foram creditados.",
        "CONTENT_HAS_COMPLETIONS",
      )
    }

    // Os nomes são lidos ANTES do DELETE: o CASCADE apaga as linhas de metadado e
    // depois não há mais de onde saber o que está no disco. A query mora em
    // `db/queries.ts` com as outras três do reforço — é dela que a limpeza de byte
    // depende, então não fica solta na rota.
    const storedNames = listAttachmentStoredNamesForStudyContent(db, current.id)

    db.prepare("DELETE FROM studyContents WHERE id = ?").run(current.id)
    deleteStoredFiles(storedNames)
    recordAudit({
      userId: user.id,
      action: "CONTENT_DELETED",
      entity: "StudyContent",
      entityId: current.id,
      description: `${user.name} removeu conteúdo de reforço '${current.topic}'`,
    })
    sendData(res, 200, { ok: true })
  }),
)

// ─── Conclusão: o +N pontos, uma vez só ──────────────────────────────────────

/** Erro de UNIQUE do SQLite: `code = ERR_SQLITE_ERROR`, `errcode = 2067`. */
function isUniqueViolation(error: unknown): boolean {
  const err = error as { code?: string; errcode?: number } | null
  return err?.code === "ERR_SQLITE_ERROR" && err.errcode === 2067
}

interface CompletionResult {
  completion: StudyContentCompletion
  transaction: PointsTransaction
  balance: number
}

studyContentsRouter.post(
  "/:id/complete",
  requireAuth,
  requireRoles("student"),
  handle((req, res) => {
    const user = requireUser(res)
    const db = getDb()
    const content = loadContentOr404(req.params.id)
    if (!content.classIds.some((classId) => user.classIds.includes(classId))) {
      recordAudit({
        userId: user.id,
        action: "ACCESS_DENIED",
        entity: "Route",
        entityId: req.path,
        description: `${user.name} tentou concluir reforço fora das suas turmas (${content.topic})`,
      })
      throw forbidden("Este reforço não é de uma turma sua.", "NOT_IN_CLASS")
    }
    // `points` nunca pode ser 0 (o schema exige mínimo 1), mas o banco aceita
    // dado legado — e concluir um reforço de 0 ponto gravaria uma transação de
    // `amount: 0` e CONSUMIRIA o slot único da conclusão: se o professor subisse
    // para 5 depois, aquele aluno nunca receberia nada. Recusa com 422 em vez de
    // queimar o crédito.
    if (!Number.isInteger(content.points) || content.points < 1) {
      throw unprocessable(
        "Este reforço tem uma pontuação inválida. Fale com a coordenação.",
        "INVALID_CONTENT_POINTS",
      )
    }

    try {
      const result = withTransaction(db, (): CompletionResult => {
        const now = nowBR()
        // Saldo ANTES do crédito, lido na MESMA transação: é o que a celebração
        // de RF07 compara com o saldo depois para saber se a faixa virou.
        const balanceBefore = getBalance(user.id, db)
        const completion: StudyContentCompletion = {
          id: uuid(),
          studentId: user.id,
          studyContentId: content.id,
          completedAt: now,
        }
        // O UNIQUE (studentId, studyContentId) é a trava de "uma vez só" — e vem
        // ANTES de qualquer escrita de pontos: dois concludes simultâneos do mesmo
        // aluno disputam o INSERT, o perdedor estoura a constraint e a transação
        // inteira (conclusão + transação + notificação + auditoria) é revertida.
        // Um pré-check `SELECT` não daria essa garantia em concorrência real.
        db.prepare(
          `INSERT INTO study_content_completions (id, studentId, studyContentId, completedAt)
           VALUES (?, ?, ?, ?)`,
        ).run(completion.id, completion.studentId, completion.studyContentId, completion.completedAt)

        const transaction: PointsTransaction = {
          id: uuid(),
          studentId: user.id,
          amount: content.points,
          // Tipo próprio (e não `bonus`): `study_content` NÃO entra na soma do
          // teto diário de bônus da coordenação (`type = 'bonus'`), e o histórico
          // do aluno mostra que o crédito veio de concluir um reforço.
          type: "study_content",
          description: `Reforço concluído: ${content.topic}`,
          relatedActivityId: null,
          // O reforço é do professor; sem autor (reforço antigo migrado), o
          // crédito fica em nome de quem concluiu.
          createdBy: content.teacherId ?? user.id,
          createdAt: now,
        }
        db.prepare(
          `INSERT INTO transactions (id, studentId, amount, type, description, relatedActivityId, createdBy, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          transaction.id,
          transaction.studentId,
          transaction.amount,
          transaction.type,
          transaction.description,
          transaction.relatedActivityId,
          transaction.createdBy,
          transaction.createdAt,
        )

        insertNotification({
          userId: user.id,
          title: "Reforço concluído! 🎉",
          message: `Você concluiu o reforço '${content.topic}' e ganhou +${content.points} pontos.`,
          type: "system",
        })

        recordAudit({
          userId: user.id,
          action: "STUDY_CONTENT_COMPLETED",
          entity: "StudyContent",
          entityId: content.id,
          description: `${user.name} concluiu o reforço '${content.topic}' (+${content.points} pts)`,
        })

        // RF07 — o reforço é o QUARTO caminho de crédito, e também o único em que
        // quem credita é o próprio aluno: sem esta chamada, cruzar a faixa por
        // concluir reforço não gerava a notificação nem a auditoria LEVEL_UP
        // (os outros três são `creditForApproval`, `grantBonus` e `adjustPoints`).
        celebrateLevelUp(db, user.id, user.name, balanceBefore, user, transaction.id)

        // Saldo lido DENTRO da transação: já inclui o crédito recém-escrito.
        return { completion, transaction, balance: getBalance(user.id, db) }
      })
      sendData(res, 201, result)
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw conflict("Você já concluiu este reforço.", "ALREADY_COMPLETED")
      }
      throw error
    }
  }),
)

// ─── Anexos do reforço (material de apoio do professor) ──────────────────────

interface AttachmentGuard {
  content: StudyContent
}

/**
 * Guarda ANTES do multer: conteúdo inexistente é 404 e reforço de outro
 * professor é 403 sem que o arquivo chegue a ser gravado no disco.
 */
function attachmentGuard(req: Request, res: Response, next: NextFunction): void {
  try {
    const user = requireUser(res)
    const content = loadContentOr404(req.params.id)
    if (!canUploadStudyContentAttachment(user, content)) {
      forbidAndAudit(
        req,
        user,
        `${user.name} tentou anexar material a um reforço de outro professor (${content.topic})`,
      )
    }
    res.locals.studyContentGuard = { content } satisfies AttachmentGuard
    next()
  } catch (error) {
    next(error)
  }
}

studyContentsRouter.post(
  "/:id/attachments",
  requireAuth,
  requireRoles("teacher", "staff", "coordinator"),
  attachmentGuard,
  uploadAttachments.array("attachments", config.maxAttachments),
  handle((req, res) => {
    const user = requireUser(res)
    const guard = res.locals.studyContentGuard as AttachmentGuard | undefined
    if (!guard) {
      throw new Error("res.locals.studyContentGuard ausente: a validação do anexo não rodou")
    }
    const files = (req.files as Express.Multer.File[] | undefined) ?? []
    try {
      // Magic bytes antes de qualquer metadado: um arquivo que não é imagem/PDF
      // de verdade faz o lote inteiro falhar (422) e nada fica gravado.
      for (const file of files) normalizeUploadedFile(file)
      const stored = persistStudyContentAttachments(guard.content.id, files)
      recordAudit({
        userId: user.id,
        action: "ATTACHMENT_UPLOADED",
        entity: "StudyContent",
        entityId: guard.content.id,
        description: `${user.name} anexou ${stored.length} arquivo(s) ao reforço '${guard.content.topic}'`,
      })
      sendData(res, 201, stored)
    } catch (error) {
      cleanupUploadedFiles(files)
      throw error
    }
  }),
)
