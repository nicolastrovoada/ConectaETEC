import type { DatabaseSync } from "node:sqlite"
import { assertSqlIdentifier } from "./002"
import type { Migration } from "./types"

/**
 * Colunas novas, declaradas como lista para que a guarda de idempotência seja
 * estrutural (todo `ADD COLUMN` passa por `hasColumn`) e não uma sequência de
 * `if` que alguém pode esquecer ao adicionar a próxima coluna.
 *
 * A lista é a fonte do SQL: nomes e defaults ficam visíveis num lugar só.
 */
interface AddedColumn {
  table: string
  column: string
  /** Tipo + default, exatamente o que vai depois de `ADD COLUMN`. */
  definition: string
}

/**
 * `activities`: janela de atraso (`lateWindowDays`, padrão 7 dias) e soft
 * delete (`deletedAt`/`deletedBy`) — apagar atividade não pode perder entrega
 * nem pontos já creditados, então a remoção vira marcação.
 *
 * `submissions.delayed`: entrega feita dentro da janela de atraso — o sinal de
 * que o prazo estourou, gravado na própria entrega para o histórico não mudar
 * quando o prazo da atividade mudar.
 *
 * `notifications.transient`: notificação que se apaga sozinha (ex.: contagem
 * regressiva de prazo). Padrão 0 = notificação normal, então o histórico
 * existente continua permanente.
 *
 * `studyContents`: reforço de verdade (descrição, conteúdo, professor, turmas,
 * pontos e `questions` em JSON) sobre a tabela de tópicos que existia só com
 * `exercises`.
 */
const ADDED_COLUMNS: readonly AddedColumn[] = [
  // M-5 (decisão aceita no review): `deletedBy` e `teacherId` ficam sem FK de
  // propósito — o soft delete preserva a autoria mesmo sem usuário, e o reforço
  // sobrevive ao professor que saiu da escola. As duas colunas continuam TEXT.
  { table: "activities", column: "lateWindowDays", definition: "INTEGER NOT NULL DEFAULT 7" },
  { table: "activities", column: "deletedAt", definition: "TEXT" },
  { table: "activities", column: "deletedBy", definition: "TEXT" },
  { table: "submissions", column: "delayed", definition: "INTEGER NOT NULL DEFAULT 0" },
  { table: "notifications", column: "transient", definition: "INTEGER NOT NULL DEFAULT 0" },
  { table: "studyContents", column: "description", definition: "TEXT NOT NULL DEFAULT ''" },
  { table: "studyContents", column: "content", definition: "TEXT NOT NULL DEFAULT ''" },
  { table: "studyContents", column: "teacherId", definition: "TEXT" },
  { table: "studyContents", column: "classIds", definition: "TEXT NOT NULL DEFAULT '[]'" },
  { table: "studyContents", column: "points", definition: "INTEGER NOT NULL DEFAULT 5" },
  { table: "studyContents", column: "questions", definition: "TEXT NOT NULL DEFAULT '[]'" },
]

/**
 * `PRAGMA` não aceita bind parameter — o nome da tabela é interpolado. Reusa a
 * guarda de identificador da 002: os nomes aqui são literais deste arquivo,
 * mas a mesma rede contra injeção vale para qualquer uso futuro.
 *
 * Exportada porque a 007 também é um `ADD COLUMN` e precisa da MESMA guarda
 * (duplicar o `PRAGMA table_info` em dois arquivos é o tipo de coisa que os
 * dois copies divergem depois). O comentário original dizia que ela não devia
 * ser exportada sem consumidor; a 007 é o consumidor.
 */
export function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${assertSqlIdentifier(table)})`).all() as Array<{ name: string }>
  return rows.some((r) => r.name === column)
}

/**
 * Migração 004 — base de schema da V3 (Fase 1).
 *
 * Só `ADD COLUMN`, `CREATE TABLE IF NOT EXISTS` e `CREATE INDEX IF NOT EXISTS`:
 * segura tanto em banco novo (001–003 acabaram de rodar) quanto em banco que já
 * a aplicou ou no meio de uma aplicação interrompida.
 *
 * A remoção da tabela `achievements` NÃO é feita aqui: na data desta migração o
 * serviço e a rota de conquistas ainda dependiam dela, e derrubar a tabela com
 * o código vivo quebraria o boot. O `DROP TABLE IF EXISTS` entrou na 005, depois
 * que o código saiu (a 004 continua sendo estritamente aditiva).
 */
export const migration004: Migration = {
  version: 4,
  name: "v3_features",
  run(db) {
    for (const { table, column, definition } of ADDED_COLUMNS) {
      if (hasColumn(db, table, column)) continue
      db.exec(
        `ALTER TABLE ${assertSqlIdentifier(table)} ADD COLUMN ${assertSqlIdentifier(column)} ${definition}`,
      )
    }

    // Avisos da coordenação: público amplo ('all') ou turmas específicas.
    db.exec(`
      CREATE TABLE IF NOT EXISTS notices (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        audienceType TEXT NOT NULL DEFAULT 'all', -- 'all' | 'classes'
        classIds TEXT NOT NULL DEFAULT '[]',
        createdBy TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_notices_createdAt ON notices(createdAt);
    `)

    // Conclusão do reforço escolar: o UNIQUE (aluno, reforço) é o que garante os
    // +5 pts uma vez só, mesmo com duas requisições simultâneas do mesmo aluno.
    db.exec(`
      CREATE TABLE IF NOT EXISTS study_content_completions (
        id TEXT PRIMARY KEY,
        studentId TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        studyContentId TEXT NOT NULL REFERENCES studyContents(id) ON DELETE RESTRICT,
        completedAt TEXT NOT NULL,
        UNIQUE (studentId, studyContentId)
      );
      CREATE INDEX IF NOT EXISTS idx_scc_studentId ON study_content_completions(studentId);
      CREATE INDEX IF NOT EXISTS idx_scc_contentId ON study_content_completions(studyContentId);
    `)
  },
}
