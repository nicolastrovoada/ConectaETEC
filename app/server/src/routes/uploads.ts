import fs from "node:fs"
import path from "node:path"
import { Router } from "express"
import { requireAuth, requireUser, forbidAndAudit } from "../auth/middleware"
import { config } from "../config"
import { getDb } from "../db/connection"
import { findStudyContentById, findSubmissionById } from "../db/queries"
import { notFound } from "../lib/errors"
import { handle } from "../lib/http"
import { avatarDir, validateStoredName } from "../lib/uploads"
import { canReadStudyContentAttachment } from "../services/studyContents"
import type { SafeUser, StudyContent } from "../shared/types"

/**
 * GET /uploads/:storedName
 * Entrega o arquivo físico SOMENTE a usuários autorizados. A rota resolve PRIMEIRO
 * de qual recurso é o arquivo (o `storedName` é único por tabela, então o mesmo
 * nome pode, em tese, estar em duas — ver `findFileOrigin`) e só depois pergunta
 * se aquele usuário pode vê-lo:
 *
 * - anexo de ENTREGA: coordenação, aluno autor, ou professor responsável pela
 *   atividade da entrega (2.5 — atender a turma não abre o arquivo de um colega);
 * - anexo de REFORÇO (3.1): coordenação, funcionário, professor AUTOR do reforço
 *   ou aluno de uma turma destinatária. Um reforço é de um professor só, então o
 *   colega que atende a mesma turma também é 403 aqui.
 */
export const uploadsRouter = Router()

interface SubmissionFile {
  kind: "submission"
  filename: string
  mimeType: string
  activityId: string
  studentId: string
}

interface StudyContentFile {
  kind: "study_content"
  filename: string
  mimeType: string
  content: StudyContent
}

/** De qual recurso é o arquivo (mutuamente exclusivos, nunca os dois). */
type FileOrigin = SubmissionFile | StudyContentFile

/**
 * De ONDE veio o arquivo, resolvido pelo `storedName`.
 *
 * `UNIQUE` de `storedName` é POR TABELA no SQLite: as duas tabelas de arquivo não
 * se enxergam, então um mesmo nome pode existir nas duas (praticamente impossível
 * — o nome é um uuid — mas o schema não impede). Nesse caso o arquivo é
 * AMBÍGUO e a rota devolve 404 em vez de escolher um dos dois: servir "o
 * primeiro que aparecer" trocaria qual arquivo é entregue conforme a ordem das
 * tabelas, e o usuário autorizado receberia o material errado.
 */
function findFileOrigin(db: ReturnType<typeof getDb>, storedName: string): FileOrigin | null {
  const submissionAttachment = db
    .prepare("SELECT submissionId, filename, mimeType FROM attachments WHERE storedName = ?")
    .get(storedName) as
    | { submissionId: string; filename: string; mimeType: string }
    | undefined
  const contentAttachment = db
    .prepare("SELECT studyContentId, filename, mimeType FROM study_content_attachments WHERE storedName = ?")
    .get(storedName) as
    | { studyContentId: string; filename: string; mimeType: string }
    | undefined
  if (submissionAttachment && contentAttachment) return null // ambíguo: 404
  if (submissionAttachment) {
    const submission = findSubmissionById(db, submissionAttachment.submissionId)
    if (!submission) return null
    return {
      kind: "submission",
      filename: submissionAttachment.filename,
      mimeType: submissionAttachment.mimeType,
      activityId: submission.activityId,
      studentId: submission.studentId,
    }
  }
  if (!contentAttachment) return null
  const content = findStudyContentById(db, contentAttachment.studyContentId)
  if (!content) return null
  return {
    kind: "study_content",
    filename: contentAttachment.filename,
    mimeType: contentAttachment.mimeType,
    content,
  }
}

function canReadSubmissionFile(
  user: SafeUser,
  db: ReturnType<typeof getDb>,
  origin: SubmissionFile,
): boolean {
  // Atividade excluída (soft delete) é invisível — e o anexo de uma entrega
  // dela também. A consulta vem ANTES dos branches de papel de propósito:
  // coordenação e aluno autor recebem o mesmo 403 (o call site audita), porque
  // o recurso excluído sai do ar para todos. A coordenação continua vendo a
  // atividade na aba "Excluídas" e, se restaurá-la, o anexo volta a ser servido.
  const activity = db
    .prepare("SELECT teacherId, deletedAt FROM activities WHERE id = ?")
    .get(origin.activityId) as { teacherId: string; deletedAt: string | null } | undefined
  if (!activity || activity.deletedAt !== null) return false

  if (user.role === "coordinator") return true
  if (user.role === "student") return origin.studentId === user.id
  // Professor e funcionário: só o responsável pela atividade da entrega — é o
  // mesmo isolamento por dono de `canViewSubmission` e das listagens (2.5):
  // atender a turma não abre o arquivo de um colega.
  return activity.teacherId === user.id
}

/**
 * GET /uploads/avatars/:storedName — foto de perfil.
 *
 * Rota PRÓPRIA (registrada antes de `/:storedName`): um avatar não tem linha em
 * `attachments`/`study_content_attachments`, então a rota genérica o trataria
 * como inexistente. A autorização é a existência de um usuário apontando para
 * aquele arquivo; qualquer sessão autenticada pode ver a foto (elas aparecem em
 * listas e no header), mas nunca sem cookie. Nome inválido, linha ausente e
 * arquivo ausente respondem o MESMO 404 — não vazamos existência.
 */
const AVATAR_CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
}

uploadsRouter.get(
  "/avatars/:storedName",
  requireAuth,
  handle((req, res) => {
    const storedName = req.params.storedName
    if (!validateStoredName(storedName)) throw notFound("Arquivo não encontrado.", "FILE_MISSING")

    const db = getDb()
    const row = db
      .prepare("SELECT 1 AS found FROM users WHERE avatar = ? LIMIT 1")
      .get(`/uploads/avatars/${storedName}`)
    if (!row) throw notFound("Arquivo não encontrado.", "FILE_MISSING")

    const contentType = AVATAR_CONTENT_TYPES[path.extname(storedName).toLowerCase()]
    const filePath = path.join(avatarDir(), storedName)
    if (!contentType || !fs.existsSync(filePath)) {
      throw notFound("Arquivo não encontrado.", "FILE_MISSING")
    }

    res.setHeader("Content-Type", contentType)
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader("Cache-Control", "private, max-age=300")
    res.sendFile(filePath)
  }),
)

uploadsRouter.get(
  "/:storedName",
  requireAuth,
  handle((req, res) => {
    const user = requireUser(res)
    const storedName = req.params.storedName
    if (!validateStoredName(storedName)) throw notFound("Arquivo não encontrado.", "FILE_MISSING")

    const db = getDb()
    const origin = findFileOrigin(db, storedName)
    if (!origin) throw notFound("Arquivo não encontrado.", "FILE_MISSING")

    // Destino órfão (a FK é CASCADE e o dono sumiu) nunca é servido: `findFileOrigin`
    // devolveu `null` e o 404 acima é indistinguível de "arquivo inexistente".
    const allowed =
      origin.kind === "submission"
        ? canReadSubmissionFile(user, db, origin)
        : canReadStudyContentAttachment(user, origin.content)

    if (!allowed) {
      forbidAndAudit(req, user, `${user.name} tentou baixar anexo sem permissão (${origin.filename})`)
    }

    const filePath = path.join(config.uploadsDir, storedName)
    if (!fs.existsSync(filePath)) throw notFound("Arquivo ausente no storage.", "FILE_MISSING")
    res.setHeader("Content-Type", origin.mimeType)
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader("Content-Disposition", `attachment; filename="${origin.filename.replaceAll('"', "")}"`)
    res.sendFile(filePath)
  }),
)
