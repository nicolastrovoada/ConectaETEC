import type { DatabaseSync } from "node:sqlite"

/**
 * Contrato de uma migração versionada (Frente 5).
 * Cada migração roda dentro de uma transação própria e, ao concluir sem erro,
 * é registrada em `schema_migrations`. Migrações devem ser idempotentes /
 * tolerantes a re-run (CREATE ... IF NOT EXISTS, checagens tipo
 * `PRAGMA foreign_key_list`), pois o runner pode reaplicá-las se o registro de
 * versão se perder.
 */
export interface Migration {
  version: number
  name: string
  /**
   * Marque `true` quando a migração PRECISA rodar com `PRAGMA foreign_keys`
   * desligado — rebuild de tabela (DROP + RENAME) só é permitido assim.
   *
   * A pragma é no-op dentro de transação e o runner envolve cada migração em
   * transação própria, então a janela OFF só pode ser aberta entre transações.
   * O runner agrupa num único intervalo OFF apenas as migrações marcadas,
   * preservando a ordem de versão; as demais rodam com as FKs como o chamador
   * as deixou (por padrão ligadas — ver `db/connection.ts`).
   */
  needsForeignKeysOff?: boolean
  run(db: DatabaseSync): void
}