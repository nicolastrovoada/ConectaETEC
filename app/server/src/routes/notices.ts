import { Router } from "express"
import { z } from "zod"
import { requireAuth, requireRoles, requireUser } from "../auth/middleware"
import { handle, sendData } from "../lib/http"
import { createNotice, listNoticesPage } from "../services/notices"

/**
 * Avisos da coordenação (V3, Tarefa 3.5) — o quadro e a publicação.
 *
 * Toda a rota é `coordinator`, e a barreira é `requireRoles`, que AUDITA a
 * tentativa negada (RN06): uma chamada de aluno, professor ou funcionário neste
 * router deixa `ACCESS_DENIED` gravado com o caminho e o papel que tentou.
 *
 * A rota não resolve público, não grava e não notifica: ela valida o payload
 * (Zod, 400 pt-BR) e delega. A regra de quem recebe o aviso e a transação que
 * grava aviso + notificações + auditoria vivem em `services/notices.ts` — para
 * que nenhum outro caminho (import de script, rota futura) publique aviso com
 * regra diferente.
 *
 * Aluno, professor e funcionário NÃO leem o quadro: o aviso chega a eles por
 * `GET /api/notifications`, que já é escopado por `userId` (só a própria lista).
 * A rota de leitura de avisos é do mesmo modo deliberadamente ausente para eles —
 * o quadro é registro da coordenação, não um feed.
 */

const createNoticeSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Informe um título com ao menos 3 caracteres.")
      .max(120, "O título deve ter no máximo 120 caracteres."),
    message: z
      .string()
      .trim()
      .min(3, "Informe uma mensagem com ao menos 3 caracteres.")
      .max(1000, "A mensagem deve ter no máximo 1000 caracteres."),
    audienceType: z.enum(["all", "classes"], {
      invalid_type_error: "Escolha o público do aviso: toda a escola ou turmas específicas.",
      required_error: "Escolha o público do aviso: toda a escola ou turmas específicas.",
    }),
    classIds: z
      .array(z.string().trim().min(1, "Turma inválida."))
      .max(20, "Selecione até 20 turmas.")
      .optional()
      .default([]),
  })
  .strict()
  // `audienceType: 'classes'` sem turma é recusa de payload, não de negócio: o
  // corpo está incompleto, e a resposta é 400 com a mensagem em pt-BR. A
  // validação de "a turma existe?" é do service (422, `CLASSES_NOT_FOUND`).
  .refine((body) => body.audienceType === "all" || body.classIds.length > 0, {
    message: "Selecione ao menos uma turma destinatária.",
    path: ["classIds"],
  })

export const noticesRouter = Router()

/**
 * `?page`/`?pageSize` do quadro, com a mesma robustez de `routes/audit.ts:23-24`
 * (`Number(x) || padrão`): `Number("abc")` é `NaN`, e um `NaN` no `OFFSET` do
 * SQLite é erro de tipo no bind — a rota respondia 500 por causa de um `?page=`
 * mal digitado. Query string é entrada de usuário, não número confiável.
 *
 * A checagem aqui é `Number.isFinite`, e não o `Number(x) || padrão` de lá: o
 * `||` deixaria `NaN` passar adiante (é falsy, vira o fallback — mas `Infinity`
 * NÃO é falsy e sobreviveria). O `0`, o negativo e o teto do `pageSize` são do
 * service (`positiveInt`), que é o ponto único de verdade.
 */
function queryInt(value: unknown, fallback: number): number {
  const parsed = Number(typeof value === "string" ? value : fallback)
  return Number.isFinite(parsed) ? parsed : fallback
}

noticesRouter.get(
  "/",
  requireAuth,
  requireRoles("coordinator"),
  handle((req, res) => {
    const page = queryInt(req.query.page, 1)
    const pageSize = queryInt(req.query.pageSize, 20)
    sendData(res, 200, listNoticesPage({ page, pageSize }))
  }),
)

noticesRouter.post(
  "/",
  requireAuth,
  requireRoles("coordinator"),
  handle((req, res) => {
    const body = createNoticeSchema.parse(req.body)
    const user = requireUser(res)
    const result = createNotice(
      {
        title: body.title,
        message: body.message,
        audienceType: body.audienceType,
        classIds: body.classIds,
      },
      user,
    )
    sendData(res, 201, result)
  }),
)
