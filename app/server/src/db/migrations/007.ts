import type { DatabaseSync } from "node:sqlite"
import { assertSqlIdentifier } from "./002"
import { hasColumn } from "./004"
import type { Migration } from "./types"

/**
 * Migração 007 — a notificação passa a dizer A QUE ATIVIDADE se refere.
 *
 * Por que a coluna existe: a notificação de "correção solicitada"
 * (`activity_revision`) é a ÚNICA obrigação que o aluno precisa cumplir depois de
 * entregar, e a regra da V3 é que ela resolva sozinha quando ele reenvia. Só dá
 * para resolver **por atividade** se a notificação disser qual é — apagar
 * `type = 'activity_revision'` do aluno inteiro levaria junto os avisos das
 * outras atividades, que ele ainda não viu.
 *
 * Por que nullable e não NOT NULL: a maior parte das notificações não é sobre
 * uma atividade — subida de nível, bônus da coordenação, sequência, resgate e o
 * aviso geral da coordenação. Inventar referência para essas seria mentir, então
 * elas nascem (e ficam) `NULL`.
 *
 * Por que `ON DELETE SET NULL`: atividade é soft delete no produto (2.4), mas o
 * banco ainda permite DELETE, e a FK não pode virar um segundo motivo de
 * recusa. Com SET NULL, perder a referência é informação; perder a notificação
 * seria perda de histórico.
 *
 * Por que NÃO precisa de `needsForeignKeysOff`: é um `ADD COLUMN` puro. O
 * SQLite recusa coluna nova com `REFERENCES` quando o default não é NULL — e o
 * default implícito desta é NULL, que é exatamente o que a regra exige. Nada
 * recria tabela, então nada precisa da janela OFF que o runner abre para os
 * rebuilds (002 e 006).
 *
 * É a SEGUNDA FK de `notifications`: a primeira é `userId TEXT NOT NULL
 * REFERENCES users(id) ON DELETE CASCADE`, criada junto com a tabela em 002
 * (a tabela nunca esteve sem `REFERENCES`). A diferença é que aquela aponta
 * para a DONA da notificação e tem CASCADE; esta aponta para o ASSUNTO dela e
 * usa SET NULL, porque notificação que perde a referência perde informação,
 * enquanto notificação sem dona é lixo (a FK já apaga). O `PRAGMA
 * foreign_key_check` que o runner roda depois desta migração fecha a conta
 * justamente para a coluna nova.
 */
export const migration007: Migration = {
  version: 7,
  name: "notification_related_activity",
  run(db: DatabaseSync) {
    if (hasColumn(db, "notifications", "relatedActivityId")) return
    db.exec(
      `ALTER TABLE ${assertSqlIdentifier("notifications")} ADD COLUMN ${assertSqlIdentifier("relatedActivityId")} TEXT REFERENCES activities(id) ON DELETE SET NULL`,
    )
  },
}
