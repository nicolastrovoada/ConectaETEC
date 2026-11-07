import type { DatabaseSync } from "node:sqlite"
import { withTransaction } from "../transaction"
import { migration001 } from "./001"
import { migration002 } from "./002"
import { migration003 } from "./003"
import { migration004 } from "./004"
import { migration005 } from "./005"
import { migration006 } from "./006"
import { migration007 } from "./007"
import { ForeignKeyViolationError, readForeignKeyViolations, subtractViolations } from "./errors"
import type { Migration } from "./types"

export { ForeignKeyViolationError } from "./errors"
export type { FkViolation } from "./errors"

/** Migrações versionadas em ordem crescente (Frente 5/6, V3 Fase 1). */
export const MIGRATIONS: Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
]

/**
 * Estado atual de `PRAGMA foreign_keys` na conexão.
 *
 * Necessário porque a pragma é silenciosamente ignorada dentro de transação
 * ativa: só dá para alterná-la (e ler o resultado) entre transações.
 */
export function foreignKeysEnabled(db: DatabaseSync): boolean {
  const row = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number } | undefined
  return Number(row?.foreign_keys ?? 0) === 1
}

/**
 * Valida a fila de migrações ANTES de qualquer escrita.
 *
 * O segundo parâmetro de `runMigrations` existe como seam de teste (as migrações
 * do repositório não são injetáveis de outro jeito), mas ele também gravava a
 * fila em `schema_migrations` sem olhar versão nenhuma: uma fila duplicada
 * rodava a mesma versão duas vezes e uma fora de ordem quebrava a premissa de
 * que a ordem dos arquivos é a ordem de aplicação. Aqui a fila é rejeitada.
 */
function assertMigrationQueue(migrations: Migration[]): void {
  const seen = new Set<number>()
  let previous: number | null = null
  for (const migration of migrations) {
    if (!Number.isInteger(migration.version)) {
      throw new Error(
        `Runner de migrações: versão ${JSON.stringify(migration.version)} de "${migration.name}" não é um inteiro.`,
      )
    }
    if (seen.has(migration.version)) {
      throw new Error(`Runner de migrações: versão ${migration.version} duplicada na fila.`)
    }
    if (previous !== null && migration.version <= previous) {
      throw new Error(
        `Runner de migrações: fila fora de ordem — versão ${migration.version} depois da ${previous}.`,
      )
    }
    seen.add(migration.version)
    previous = migration.version
  }
}

/**
 * Aplica as migrações pendentes de forma idempotente:
 * - cria a tabela `schema_migrations` (version, name, appliedAt);
 * - roda cada versão pendente DENTRO de uma transação própria e a registra ao
 *   concluir com sucesso (falha → ROLLBACK completo, versão não gravada);
 * - é tolerante a "já aplicado": versões registradas são puladas e cada
 *   migração é escrita com CREATE ... IF NOT EXISTS / checagens defensivas.
 *
 * Integridade referencial: depois de CADA migração aplicada o runner roda
 * `PRAGMA foreign_key_check` e lança `ForeignKeyViolationError` se houver
 * órfão. O check vive dentro da transação da migração, então o ROLLBACK desfaz
 * também o que a migração acabou de escrever e a versão não é gravada. A 002
 * mantém o check próprio (rodar antes de recriar as tabelas é o que dá a ela a
 * garantia de não copiar cegamente); os dois convivem.
 *
 * O check varre o banco INTEIRO, então a comparação é feita contra um snapshot
 * tirado antes do laço: só a diferença (a delta) é atribuída à migration que
 * rodou. Se a delta é vazia e ainda há violação, o banco já estava sujo e a
 * mensagem diz que elas PRÉ-DATAM a migration — falha alto do mesmo jeito, mas
 * sem apontar o operador para o arquivo errado.
 *
 * Janela de FKs: `PRAGMA foreign_keys` não muda dentro de transação, então
 * migrações que precisam desligá-la (rebuild DROP + RENAME, marcadas com
 * `needsForeignKeysOff`) são agrupadas numa única janela OFF aberta entre as
 * transações. As demais rodam com as FKs como o chamador as deixou, e o estado
 * original é restaurado ao final — o runner não força `ON` em quem chegou
 * com elas desligadas.
 *
 * @param migrations Fila a aplicar. Em produção é sempre `MIGRATIONS`; o
 *   parâmetro existe para os testes injetarem migrações-sonda e é validado
 *   (versões inteiras, únicas e em ordem estritamente crescente) antes de rodar.
 *
 * O boot e os testes chamam este fluxo ANTES do seed.
 */
export function runMigrations(db: DatabaseSync, migrations: Migration[] = MIGRATIONS): void {
  assertMigrationQueue(migrations)
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      appliedAt TEXT NOT NULL
    );
  `)

  const applied = new Set(
    (db.prepare("SELECT version FROM schema_migrations").all() as Array<{ version: number }>).map((r) =>
      Number(r.version),
    ),
  )
  const pending = migrations.filter((m) => !applied.has(m.version))
  if (pending.length === 0) return

  const fkStateBefore = foreignKeysEnabled(db)
  let fkWindowOpen = false

  const openFkWindow = (): void => {
    if (fkWindowOpen) return
    db.exec("PRAGMA foreign_keys = OFF")
    fkWindowOpen = true
  }
  const closeFkWindow = (): void => {
    if (!fkWindowOpen) return
    // Restaura o estado ORIGINAL (não "força ON"): um chamador que deliberadamente
    // rodou com FKs desligadas continua assim depois das migrações.
    db.exec(fkStateBefore ? "PRAGMA foreign_keys = ON" : "PRAGMA foreign_keys = OFF")
    fkWindowOpen = false
  }

  // Integridade que JÁ existia quando a fila começou. Uma migração que passa no
  // guard não deixa violação nova para trás, então esse snapshot vale para todas
  // as iterações do laço.
  const violationsBefore = readForeignKeyViolations(db)

  try {
    for (const migration of pending) {
      // Janela OFF cobre apenas o trecho CONTÍGUO de migrações que pedem — a
      // ordem de versão das migrações é preservada (laço único, sem reordenar).
      if (migration.needsForeignKeysOff) openFkWindow()
      else closeFkWindow()

      withTransaction(db, () => {
        migration.run(db)
        const after = readForeignKeyViolations(db)
        const delta = subtractViolations(after, violationsBefore)
        if (delta.length > 0) {
          throw new ForeignKeyViolationError(migration.version, migration.name, delta)
        }
        if (after.length > 0) {
          // Nenhuma violação nova, mas o banco não fecha: a migration é
          // inocente e o operador precisa saber disso, não ler "culpa da 004".
          throw new ForeignKeyViolationError(migration.version, migration.name, after, { preExisting: true })
        }
        db.prepare("INSERT INTO schema_migrations (version, name, appliedAt) VALUES (?, ?, ?)").run(
          migration.version,
          migration.name,
          new Date().toISOString(),
        )
      })
    }
  } finally {
    closeFkWindow()
  }
}