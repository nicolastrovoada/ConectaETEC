import type { DatabaseSync } from "node:sqlite"
import { ForeignKeyViolationError, readForeignKeyViolations } from "./errors"
import type { Migration } from "./types"

const VERSION = 2
const NAME = "foreign_keys_and_indexes"

/**
 * Migração 002 — FKs nativas (Frente 5, item B) + índices de consulta (item D).
 *
 * SQLite não suporta `ALTER TABLE ... ADD CONSTRAINT`: para cada tabela que
 * ainda não declara FK (verifica via `PRAGMA foreign_key_list`), recria a
 * tabela com `REFERENCES`, copia os dados, dropa a antiga e renomeia. O rebuild
 * (DROP + RENAME) só é permitido com a checagem de FK desligada, então esta
 * migração é a única marcada com `needsForeignKeysOff` — o runner abre a janela
 * OFF só em volta dela (e restaura o estado original ao final).
 *
 * Política de deletes:
 * - `RESTRICT` — relações cujo delete já é bloqueado no código (turma/disciplina
 *   com atividades, reward com resgates) e referências de dono/ledger (usuário
 *   com transações, entregas, auditoria): não podem ser apagadas.
 * - `CASCADE` — filhos "descartáveis" (sessões e notificações de usuário,
 *   anexos de uma entrega).
 * - `SET NULL` — referências opcionais de ator/recurso (validado por, processado
 *   por, atividade relacionada).
 */

interface RebuildSpec {
  name: string
  columns: string
  createSql: (name: string) => string
}

const REBUILD_SPECS: RebuildSpec[] = [
  {
    name: "activities",
    columns: "id, title, description, subjectId, teacherId, classId, points, deadline, type, status, createdAt",
    createSql: (name) => `CREATE TABLE ${name} (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      subjectId TEXT NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
      teacherId TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      classId TEXT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
      points INTEGER NOT NULL,
      deadline TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','closed')),
      createdAt TEXT NOT NULL
    )`,
  },
  {
    name: "submissions",
    columns: "id, activityId, studentId, submittedAt, status, evidence, comment, validatedBy, validatedAt, feedback",
    createSql: (name) => `CREATE TABLE ${name} (
      id TEXT PRIMARY KEY,
      activityId TEXT NOT NULL REFERENCES activities(id) ON DELETE RESTRICT,
      studentId TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      submittedAt TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending','submitted','under_review','approved','rejected','revision_required')),
      evidence TEXT NOT NULL DEFAULT '',
      comment TEXT NOT NULL DEFAULT '',
      validatedBy TEXT REFERENCES users(id) ON DELETE SET NULL,
      validatedAt TEXT,
      feedback TEXT NOT NULL DEFAULT ''
    )`,
  },
  {
    name: "attachments",
    columns: "id, submissionId, filename, storedName, mimeType, size, uploadedAt",
    createSql: (name) => `CREATE TABLE ${name} (
      id TEXT PRIMARY KEY,
      submissionId TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      storedName TEXT NOT NULL UNIQUE,
      mimeType TEXT NOT NULL,
      size INTEGER NOT NULL,
      uploadedAt TEXT NOT NULL
    )`,
  },
  {
    name: "transactions",
    columns: "id, studentId, amount, type, description, relatedActivityId, createdBy, createdAt",
    createSql: (name) => `CREATE TABLE ${name} (
      id TEXT PRIMARY KEY,
      studentId TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      amount INTEGER NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('activity','bonus','streak','reward_redemption','manual_adjustment')),
      description TEXT NOT NULL,
      relatedActivityId TEXT REFERENCES activities(id) ON DELETE SET NULL,
      createdBy TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      createdAt TEXT NOT NULL
    )`,
  },
  {
    name: "redemptions",
    columns: "id, studentId, rewardId, rewardLabel, rewardIcon, points, status, redeemedAt, processedBy",
    createSql: (name) => `CREATE TABLE ${name} (
      id TEXT PRIMARY KEY,
      studentId TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      rewardId TEXT NOT NULL REFERENCES rewards(id) ON DELETE RESTRICT,
      rewardLabel TEXT NOT NULL,
      rewardIcon TEXT NOT NULL DEFAULT '',
      points INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','cancelled')),
      redeemedAt TEXT NOT NULL,
      processedBy TEXT REFERENCES users(id) ON DELETE SET NULL
    )`,
  },
  {
    name: "notifications",
    columns: "id, userId, title, message, type, read, createdAt",
    createSql: (name) => `CREATE TABLE ${name} (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    )`,
  },
  {
    name: "auditLogs",
    columns: "id, userId, action, entity, entityId, description, timestamp",
    createSql: (name) => `CREATE TABLE ${name} (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      action TEXT NOT NULL,
      entity TEXT NOT NULL DEFAULT '',
      entityId TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      timestamp TEXT NOT NULL
    )`,
  },
  {
    name: "sessions",
    columns: "token, userId, createdAt, expiresAt",
    createSql: (name) => `CREATE TABLE ${name} (
      token TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      createdAt INTEGER NOT NULL,
      expiresAt INTEGER NOT NULL
    )`,
  },
]

/**
 * `PRAGMA` não aceita bind parameter e `DROP`/`CREATE`/`ALTER` também não —
 * o nome da tabela tem de ser interpolado no SQL. Todos os nomes usados aqui
 * saem de `REBUILD_SPECS` (literais hardcoded deste arquivo, nunca entrada de
 * usuário), mas interpolação é um convite a alguém plugar uma string de fora
 * depois: este assert é a rede que impede isso de virar injeção.
 */
const SQL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Exportado para teste da guarda de interpolação de identificador. */
export function assertSqlIdentifier(name: string): string {
  if (!SQL_IDENTIFIER.test(name)) {
    throw new Error(
      `Migração 002: identificador de tabela inválido ${JSON.stringify(name)} — só é aceito /^[A-Za-z_][A-Za-z0-9_]*$/ (PRAGMA/DDL exigem interpolação).`,
    )
  }
  return name
}

function hasForeignKeys(db: DatabaseSync, table: string): boolean {
  const rows = db.prepare(`PRAGMA foreign_key_list(${assertSqlIdentifier(table)})`).all()
  return rows.length > 0
}

function rebuildTable(db: DatabaseSync, spec: RebuildSpec): void {
  assertSqlIdentifier(spec.name)
  if (hasForeignKeys(db, spec.name)) return
  const tmp = assertSqlIdentifier(`${spec.name}_v2`)
  db.exec(`DROP TABLE IF EXISTS ${tmp}`)
  db.exec(spec.createSql(tmp))
  db.exec(`INSERT INTO ${tmp} (${spec.columns}) SELECT ${spec.columns} FROM ${spec.name}`)
  db.exec(`DROP TABLE ${spec.name}`)
  db.exec(`ALTER TABLE ${tmp} RENAME TO ${spec.name}`)
}

export const migration002: Migration = {
  version: VERSION,
  name: NAME,
  needsForeignKeysOff: true,
  run(db) {
    for (const spec of REBUILD_SPECS) rebuildTable(db, spec)

    // A 002 existe para ESTABELECER integridade referencial, e o rebuild copia
    // as linhas cegamente (`INSERT INTO tmp SELECT ... FROM tabela`). Sem esta
    // checagem, um banco legado com órfãos seria "migrado" com sucesso: a
    // versão 2 seria gravada em `schema_migrations` (e nunca mais rodaria),
    // deixando a inconsistência permanente e invisível. Checamos e falhamos —
    // o `withTransaction` do runner faz ROLLBACK e não grava a versão, então o
    // boot quebra alto e o operador vê as violações.
    const violations = readForeignKeyViolations(db)
    if (violations.length > 0) throw new ForeignKeyViolationError(VERSION, NAME, violations)

    // Índices de consulta (Frente 5, item D). Reaplicamos também os índices da
    // migração 001 porque a recriação de tabela (DROP + RENAME) descarta os
    // índices associados à tabela antiga.
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_transactions_studentId ON transactions(studentId);
      CREATE INDEX IF NOT EXISTS idx_submissions_studentId ON submissions(studentId);
      CREATE INDEX IF NOT EXISTS idx_submissions_activityId ON submissions(activityId);
      CREATE INDEX IF NOT EXISTS idx_notifications_userId ON notifications(userId);
      CREATE INDEX IF NOT EXISTS idx_attachments_submissionId ON attachments(submissionId);
      CREATE INDEX IF NOT EXISTS idx_attachments_storedName ON attachments(storedName);
      CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions(userId);

      CREATE INDEX IF NOT EXISTS idx_activities_classId ON activities(classId);
      CREATE INDEX IF NOT EXISTS idx_activities_teacherId_status ON activities(teacherId, status);
      CREATE INDEX IF NOT EXISTS idx_activities_deadline ON activities(deadline);
      CREATE INDEX IF NOT EXISTS idx_auditLogs_timestamp ON auditLogs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_auditLogs_userId ON auditLogs(userId);
      CREATE INDEX IF NOT EXISTS idx_redemptions_studentId ON redemptions(studentId);
      CREATE INDEX IF NOT EXISTS idx_redemptions_rewardId ON redemptions(rewardId);
      CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
      CREATE INDEX IF NOT EXISTS idx_notifications_userId_read ON notifications(userId, read);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    `)
  },
}