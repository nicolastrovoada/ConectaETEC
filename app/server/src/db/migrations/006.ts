import type { DatabaseSync } from "node:sqlite"
import { assertSqlIdentifier } from "./002"
import type { Migration } from "./types"

/**
 * Migração 006 — anexos do reforço escolar (3.1) + o tipo de crédito
 * `study_content` em `transactions`.
 *
 * Duas mudanças, uma por tabela:
 *
 * 1. `study_content_attachments` — o reforço ganha material de apoio (imagem ou
 *    PDF), o mesmo par de tipos que a evidência de entrega aceita. Colunas
 *    idênticas às de `attachments`; a diferença é a chave estrangeira:
 *    `ON DELETE CASCADE` para `studyContents` (anexo é material descartável do
 *    reforço, igual ao anexo de uma entrega) e `storedName` UNIQUE (o nome no
 *    storage é o que `/uploads/:storedName` resolve, então precisa continuar
 *    único em TODA a tabela de arquivos, não só na de entregas). Índice por
 *    `studyContentId` para carregar os anexos de uma listagem sem N+1.
 *
 * 2. `transactions.type` — o CHECK gravado pela 002 (`type IN ('activity',
 *    'bonus','streak','reward_redemption','manual_adjustment')`) rejeitaria o
 *    crédito do reforço concluído. SQLite não tem `ALTER TABLE` para CHECK, então
 *    a tabela é recriada (DROP + RENAME) com o valor novo na lista — o caminho
 *    que a própria 002 usa para as FKs. É por isso que esta migração é marcada
 *    `needsForeignKeysOff`: o rebuild de tabela só é permitido com o
 *    `PRAGMA foreign_keys` desligado, e o runner abre a janela OFF só em volta
 *    dela, restaurando o estado original no fim.
 *
 * Integridade do rebuild: a cópia é coluna a coluna e a FK de `studentId`/
 * `createdBy` continua `RESTRICT`; o `PRAGMA foreign_key_check` que o runner faz
 * ao final de cada migração é o que fecha a conta (qualquer linha órfã já
 * existente faz a migração falhar e ROLLBACK, em vez de "migrar" o banco sujo).
 */

const TRANSACTIONS = "transactions"
const TRANSACTIONS_STAGED = "transactions_006"
const TRANSACTIONS_COLUMNS =
  "id, studentId, amount, type, description, relatedActivityId, createdBy, createdAt"

/** `type` aceito pela tabela recriada — os cinco antigos + o crédito do reforço. */
const TX_TYPES = "'activity','bonus','streak','reward_redemption','manual_adjustment','study_content'"

const createTransactions = (name: string): string => `CREATE TABLE ${name} (
  id TEXT PRIMARY KEY,
  studentId TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN (${TX_TYPES})),
  description TEXT NOT NULL,
  relatedActivityId TEXT REFERENCES activities(id) ON DELETE SET NULL,
  createdBy TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  createdAt TEXT NOT NULL
)`

/**
 * O CHECK já atualizado é a própria condição de idempotência: se o DDL gravado em
 * `sqlite_master` já cita `'study_content'`, não há o que recriar. É a mesma
 * estratégia estrutural da 002 (`PRAGMA foreign_key_list`) e da 004
 * (`PRAGMA table_info`) — estado do banco, não memória do processo.
 */
function transactionsAcceptStudyContent(db: DatabaseSync): boolean {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(TRANSACTIONS) as { sql: string } | undefined
  return typeof row?.sql === "string" && row.sql.includes("'study_content'")
}

function widenTransactionsType(db: DatabaseSync): void {
  if (transactionsAcceptStudyContent(db)) return
  db.exec(`DROP TABLE IF EXISTS ${assertSqlIdentifier(TRANSACTIONS_STAGED)}`)
  db.exec(createTransactions(TRANSACTIONS_STAGED))
  db.exec(
    `INSERT INTO ${TRANSACTIONS_STAGED} (${TRANSACTIONS_COLUMNS})
     SELECT ${TRANSACTIONS_COLUMNS} FROM ${TRANSACTIONS}`,
  )
  db.exec(`DROP TABLE ${TRANSACTIONS}`)
  db.exec(`ALTER TABLE ${TRANSACTIONS_STAGED} RENAME TO ${TRANSACTIONS}`)
  // O DROP da tabela antiga leva junto os índices dela: os dois são recriados.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_transactions_studentId ON transactions(studentId);
    CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
  `)
}

export const migration006: Migration = {
  version: 6,
  name: "study_content_attachments",
  needsForeignKeysOff: true,
  run(db: DatabaseSync) {
    widenTransactionsType(db)

    db.exec(`
      CREATE TABLE IF NOT EXISTS study_content_attachments (
        id TEXT PRIMARY KEY,
        studyContentId TEXT NOT NULL REFERENCES studyContents(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        storedName TEXT NOT NULL UNIQUE,
        mimeType TEXT NOT NULL,
        size INTEGER NOT NULL,
        uploadedAt TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sca_studyContentId ON study_content_attachments(studyContentId);
    `)
  },
}
