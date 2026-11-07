import { getDb } from "../db/connection"
import { withTransaction } from "../db/transaction"
import { mapNotification, type NotificationRow } from "../db/rows"
import { nowBR } from "../lib/dates"
import { uuid } from "../lib/uuid"
import { isTransientNotificationType } from "../shared/types"
import type { Notification, NotificationType } from "../shared/types"

export interface NotificationInput {
  userId: string
  title: string
  message: string
  type: NotificationType
  /**
   * Atividade à qual a notificação se refere, quando existe.
   *
   * `null`/omitido para o que não é sobre uma atividade (nível, bônus,
   * sequência, resgate, aviso da coordenação). A COLUNA `transient` NÃO é
   * parâmetro: ela é derivada do `type` em `TRANSIENT_BY_TYPE` (shared/types),
   * justamente para os ~20 call sites não terem como divergir entre si.
   */
  relatedActivityId?: string | null
}

/**
 * Cria uma notificação persistida (RF10).
 *
 * `transient` e `relatedActivityId` saem daqui — nunca da call site: a
 * classificação é derivada do tipo, e a referência de atividade é a que o
 * chamador tem em mãos.
 */
export function insertNotification(input: NotificationInput): Notification {
  const db = getDb()
  const entry: Notification = {
    id: uuid(),
    userId: input.userId,
    title: input.title,
    message: input.message,
    type: input.type,
    read: false,
    transient: isTransientNotificationType(input.type),
    relatedActivityId: input.relatedActivityId ?? null,
    createdAt: nowBR(),
  }
  db.prepare(
    `INSERT INTO notifications (id, userId, title, message, type, read, transient, relatedActivityId, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.id,
    entry.userId,
    entry.title,
    entry.message,
    entry.type,
    entry.read ? 1 : 0,
    entry.transient ? 1 : 0,
    entry.relatedActivityId,
    entry.createdAt,
  )
  return entry
}

/** Lista as notificações do usuário, mais recente primeiro. NUNCA apaga nada. */
export function listNotificationsForUser(userId: string): Notification[] {
  const db = getDb()
  const rows = db
    .prepare("SELECT * FROM notifications WHERE userId = ? ORDER BY rowid DESC")
    .all(userId) as unknown as NotificationRow[]
  return rows.map(mapNotification)
}

/**
 * Cria a MESMA notificação para vários destinatários (3.5 — aviso da coordenação).
 *
 * Existe para que o chamador não abra um laço chamando `insertNotification`: o
 * aviso da coordenação é o único caso do produto em que um evento vira N
 * notificações, e um laço à mão tem duas formas de divergir do resto do código —
 * passar `transient` na mão (que é derivado do `type`, não paramétrico) ou
 * esquecer um destinatário. Aqui as duas coisas são impossíveis: a derivação
 * continua vindo de `insertNotification`, e a lista de destinatários é o
 * ÚNICO lugar onde a seleção acontece.
 *
 * Não abre transação: quem chama decide o escopo transacional, porque em geral
 * o aviso precisa ser gravado junto com a notificação e a auditoria na MESMA
 * transação (ou nenhuma das três existe). Os ids de `userIds` são usados como
 * estão — a filtragem de quem é destinatário válido é do service que montou a
 * lista, não deste helper.
 */
export function insertNotificationsForUsers(
  userIds: string[],
  notification: Omit<NotificationInput, "userId">,
): Notification[] {
  return userIds.map((userId) => insertNotification({ ...notification, userId }))
}

/** O que um acuse de leitura fez com as notificações do usuário. */
export interface AcknowledgedNotification {
  id: string
  title: string
  type: NotificationType
}

export interface AcknowledgeResult {
  /**
   * Transitórias removidas do banco (já foram exibidas). São devolvidas
   * inteiras, não só a contagem: quem audita (RN06) precisa saber O QUE saiu da
   * lista do usuário, e um número não diz nada disso.
   */
  dismissed: AcknowledgedNotification[]
  /**
   * Quantas PERSISTENTES foram marcadas como lidas (continuam na lista).
   *
   * Não conta as transitórias: elas são removidas logo abaixo, e somá-las aqui
   * fazia a auditoria dizer "5 persistentes" num caso de 3 transitórias + 2
   * persistentes (F1).
   */
  markedRead: number
}

/**
 * Acusa a leitura de TUDO do usuário: transitórias somem, persistentes viram
 * lidas (RF10/3.3).
 *
 * O `GET` é puro de propósito (decisão R33): quem apaga é este acuse, que o
 * cliente chama DEPOIS de exibir. Um `GET` que apaga transformaria a notificação
 * em "comida por quem não olhou" — a tela pode nem estar montada no momento da
 * chamada, e o cliente faz `GET` ao ABRIR a tela.
 *
 * As três escritas ficam na mesma transação: não existe estado intermediário em
 * que a notificação está lida mas ainda presente (nem o contrário).
 */
export function acknowledgeAll(userId: string): AcknowledgeResult {
  const db = getDb()
  return withTransaction(db, () => {
    // Primeiro marca TUDO como lido (resposta estável para quem ainda está com
    // a lista na tela), depois remove as transitórias. A ordem é o que garante
    // que "o que a tela viu" e "o que o banco removeu" sejam o mesmo conjunto.
    //
    // O `AND transient = 0` NÃO muda o que o UPDATE faz (as transitórias saem
    // na linha seguinte) — muda o que ele CONTA. Sem ele, `markedRead` somava
    // as transitórias junto e a auditoria gravava "5 persistentes marcadas"
    // quando eram 2: número errado gravado no histórico (F1).
    const markedRead = Number(
      db
        .prepare("UPDATE notifications SET read = 1 WHERE userId = ? AND read = 0 AND transient = 0")
        .run(userId).changes,
    )
    const dismissed = (
      db
        .prepare("SELECT id, title, type FROM notifications WHERE userId = ? AND transient = 1")
        .all(userId) as unknown as Array<{ id: string; title: string; type: string }>
    ).map((row) => ({ id: row.id, title: row.title, type: row.type as NotificationType }))
    db.prepare("DELETE FROM notifications WHERE userId = ? AND transient = 1").run(userId)
    return { dismissed, markedRead }
  })
}

/** Detalhe de uma notificação pontual, para o acuse por id. */
export interface SingleAcknowledgeResult extends AcknowledgedNotification {
  transient: boolean
  markedRead: number
}

/**
 * Acusa a leitura de UMA notificação: a transitória some, a persistente vira
 * lida. `null` quando ela não existe ou não é do usuário — a rota traduz isso
 * em 404, porque o comportamento é o mesmo e a mensagem também.
 */
export function acknowledgeNotification(
  userId: string,
  notificationId: string,
): SingleAcknowledgeResult | null {
  const db = getDb()
  const row = db
    .prepare("SELECT id, userId, title, type, read, transient FROM notifications WHERE id = ?")
    .get(notificationId) as
    | { id: string; userId: string; title: string; type: string; read: number; transient: number }
    | undefined
  if (!row || row.userId !== userId) return null

  const transient = row.transient === 1
  if (transient) {
    db.prepare("DELETE FROM notifications WHERE id = ? AND userId = ?").run(row.id, userId)
  } else {
    db.prepare("UPDATE notifications SET read = 1 WHERE id = ? AND userId = ?").run(row.id, userId)
  }
  return {
    id: row.id,
    type: row.type as NotificationType,
    title: row.title,
    transient,
    markedRead: transient ? 0 : Number(row.read === 0 ? 1 : 0),
  }
}

/**
 * Resolve as correções solicitadas do aluno NAQUELA atividade (Review Focus 4).
 *
 * O filtro por `relatedActivityId` é o ponto inteiro: apagar só por
 * `userId + type` levaria junto as correções pendentes das OUTRAS atividades do
 * mesmo aluno — avisos que ele precisa ver e que ninguém pediu para remover.
 * Chamar com `activityId` nulo é erro de programador, não caso de uso: não há
 * caminho no produto em que uma notificação exista sem atividade de referência
 * para ser resolvida.
 */
export function resolveRevisionNotifications(userId: string, activityId: string): number {
  const db = getDb()
  if (!activityId) {
    throw new Error("resolveRevisionNotifications: atividade é obrigatória (a correção é POR atividade)")
  }
  return Number(
    db
      .prepare(
        `DELETE FROM notifications
         WHERE userId = ? AND type = 'activity_revision' AND relatedActivityId = ?`,
      )
      .run(userId, activityId).changes,
  )
}
