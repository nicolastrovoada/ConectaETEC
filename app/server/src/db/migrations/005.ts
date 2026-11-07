import type { DatabaseSync } from "node:sqlite"
import { assertSqlIdentifier } from "./002"
import type { Migration } from "./types"

/**
 * Tabela cuja a 003 criou e que a 005 derruba: `achievements`.
 *
 * O identificador não é interpolado de um valor externo — é um literal deste
 * arquivo — mas passa por `assertSqlIdentifier` (mesma rede contra injeção da
 * 002/004) para que o nome da tabela tenha uma única forma de ser escrito.
 */
const DROPPED_TABLE = "achievements"

/**
 * Migração 005 — remove a tabela de conquistas/badges (V3 Fase 1, poda).
 *
 * A feature saiu do código primeiro (serviço, rota, tipos, seed, auditoria e
 * testes); esta migração fecha o ciclo derrubando a tabela que a 003 criou.
 * A ordem importa: derrubar a tabela com o código ainda vivo quebraria o boot
 * com "no such table: achievements".
 *
 * Idempotente por construção — `DROP TABLE IF EXISTS` não faz nada em banco que
 * já está sem a tabela (aplicada duas vezes, ou banco que nunca rodou a 003).
 * Nenhuma FK de fora aponta para `achievements`, então o DROP não é bloqueado
 * pelo `PRAGMA foreign_keys` ligado.
 */
export const migration005: Migration = {
  version: 5,
  name: "drop_achievements",
  run(db: DatabaseSync) {
    db.exec(`DROP TABLE IF EXISTS ${assertSqlIdentifier(DROPPED_TABLE)}`)
  },
}
