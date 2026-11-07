import { Router } from "express"
import { requireAuth, requireUser } from "../auth/middleware"
import { notFound } from "../lib/errors"
import { handle, sendData } from "../lib/http"
import { recordAudit } from "../services/audit"
import {
  acknowledgeAll,
  acknowledgeNotification,
  listNotificationsForUser,
  type AcknowledgedNotification,
} from "../services/notifications"

/** Quantos títulos a linha de auditoria nomeia antes de resumir em "e mais N". */
const MAX_TITULOS_AUDITADOS = 5

/**
 * Numa lista, os primeiros títulos bastam para a coordenação saber o que saiu —
 * e a linha de auditoria não pode virar um despejo de texto quando o aluno tem
 * dez avisos transitórios acumulados.
 */
function resumirDismissidas(dismissed: AcknowledgedNotification[]): string {
  const nomes = dismissed.slice(0, MAX_TITULOS_AUDITADOS).map((n) => `'${n.title}'`)
  const resto = dismissed.length - nomes.length
  const lista = resto > 0 ? `${nomes.join(", ")} e mais ${resto}` : nomes.join(", ")
  return `${dismissed.length} transitória(s) removida(s) (${lista})`
}

export const notificationsRouter = Router()

/**
 * Lista as notificações do usuário — e só isso.
 *
 * Puro de propósito (decisão R33): este `GET` nunca apaga e nunca marca. Quem
 * consome a notificação transitória é o acuse (`PATCH /read` ou
 * `PATCH /:id/read`), que o cliente chama DEPOIS de exibir. Um `GET` que apaga
 * faria a notificação sumir para quem só abriu a tela e chegou tarde para a
 * chamada — "comida por quem não olhou".
 */
notificationsRouter.get(
  "/",
  requireAuth,
  handle((_req, res) => {
    const user = requireUser(res)
    sendData(res, 200, listNotificationsForUser(user.id))
  }),
)

/**
 * Acusa a leitura de tudo: as transitórias somem, as persistentes viram lidas
 * (RF10/3.3).
 */
notificationsRouter.patch(
  "/read",
  requireAuth,
  handle((_req, res) => {
    const user = requireUser(res)
    const { dismissed, markedRead } = acknowledgeAll(user.id)
    // RN06: notificação que some do banco sem rastro não é histórico, é
    // sumidouro. A auditoria registra O QUE saiu da lista, e só quando houve
    // remoção ou marcação — um "marcar tudo como lido" sem nada pendente não
    // polui a tela da coordenação.
    //
    // O `||` é obrigatório: com o F1, `markedRead` é 0 quando o usuário só tem
    // transitórias pendentes, e é o `dismissed` que segura a auditoria de pé
    // nesse caso. Trocar por `markedRead > 0` só apagaria o registro das
    // remoções.
    if (dismissed.length > 0 || markedRead > 0) {
      recordAudit({
        userId: user.id,
        action: "NOTIFICATIONS_ACKNOWLEDGED",
        entity: "Notification",
        entityId: "",
        description: `${user.name} confirmou a leitura: ${resumirDismissidas(dismissed)} e ${markedRead} persistente(s) marcada(s) como lida(s)`,
      })
    }
    sendData(res, 200, { ok: true })
  }),
)

/**
 * Acusa a leitura de UMA notificação: a transitória some, a persistente vira
 * lida. 404 quando ela não existe ou é de outro usuário (mesmo comportamento
 * para os dois casos, como no resto da API).
 */
notificationsRouter.patch(
  "/:id/read",
  requireAuth,
  handle((req, res) => {
    const user = requireUser(res)
    const result = acknowledgeNotification(user.id, req.params.id)
    if (!result) throw notFound("Notificação não encontrada.")
    if (result.transient || result.markedRead > 0) {
      recordAudit({
        userId: user.id,
        action: "NOTIFICATION_ACKNOWLEDGED",
        entity: "Notification",
        entityId: result.id,
        description: result.transient
          ? `${user.name} leu a notificação transitória '${result.title}' (${result.type}), que saiu da lista`
          : `${user.name} leu a notificação persistente '${result.title}' (${result.type})`,
      })
    }
    sendData(res, 200, { ok: true })
  }),
)
