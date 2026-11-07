import type { DatabaseSync } from "node:sqlite"
import type { Migration } from "./types"

/**
 * Migração 001 — schema inicial idempotente (equivale ao DDL antigo do
 * protótipo). Não contém FKs nativas: elas chegam na migração 002 (que recria
 * as tabelas com `REFERENCES` e preserva os dados).
 */
export const migration001: Migration = {
  version: 1,
  name: "initial_schema",
  run(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('student','teacher','staff','coordinator')),
        active INTEGER NOT NULL DEFAULT 1,
        avatar TEXT NOT NULL DEFAULT '',
        classIds TEXT NOT NULL DEFAULT '[]',
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS classes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        course TEXT NOT NULL,
        year INTEGER NOT NULL,
        shift TEXT NOT NULL CHECK (shift IN ('morning','afternoon','evening')),
        active INTEGER NOT NULL DEFAULT 1,
        studentIds TEXT NOT NULL DEFAULT '[]',
        teacherIds TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS subjects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT '',
        teacherIds TEXT NOT NULL DEFAULT '[]',
        classIds TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        subjectId TEXT NOT NULL,
        teacherId TEXT NOT NULL,
        classId TEXT NOT NULL,
        points INTEGER NOT NULL,
        deadline TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','closed')),
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS submissions (
        id TEXT PRIMARY KEY,
        activityId TEXT NOT NULL,
        studentId TEXT NOT NULL,
        submittedAt TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending','submitted','under_review','approved','rejected','revision_required')),
        evidence TEXT NOT NULL DEFAULT '',
        comment TEXT NOT NULL DEFAULT '',
        validatedBy TEXT,
        validatedAt TEXT,
        feedback TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        submissionId TEXT NOT NULL,
        filename TEXT NOT NULL,
        storedName TEXT NOT NULL UNIQUE,
        mimeType TEXT NOT NULL,
        size INTEGER NOT NULL,
        uploadedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        studentId TEXT NOT NULL,
        amount INTEGER NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('activity','bonus','streak','reward_redemption','manual_adjustment')),
        description TEXT NOT NULL,
        relatedActivityId TEXT,
        createdBy TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS rewards (
        id TEXT PRIMARY KEY,
        icon TEXT NOT NULL DEFAULT '',
        label TEXT NOT NULL,
        points INTEGER NOT NULL,
        stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0)
      );

      CREATE TABLE IF NOT EXISTS redemptions (
        id TEXT PRIMARY KEY,
        studentId TEXT NOT NULL,
        rewardId TEXT NOT NULL,
        rewardLabel TEXT NOT NULL,
        rewardIcon TEXT NOT NULL DEFAULT '',
        points INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','cancelled')),
        redeemedAt TEXT NOT NULL,
        processedBy TEXT
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT NOT NULL,
        read INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS auditLogs (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        action TEXT NOT NULL,
        entity TEXT NOT NULL DEFAULT '',
        entityId TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        timestamp TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS studyContents (
        id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        topic TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT 'blue',
        exercises INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        expiresAt INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_transactions_studentId ON transactions(studentId);
      CREATE INDEX IF NOT EXISTS idx_submissions_studentId ON submissions(studentId);
      CREATE INDEX IF NOT EXISTS idx_submissions_activityId ON submissions(activityId);
      CREATE INDEX IF NOT EXISTS idx_notifications_userId ON notifications(userId);
      CREATE INDEX IF NOT EXISTS idx_attachments_submissionId ON attachments(submissionId);
      CREATE INDEX IF NOT EXISTS idx_attachments_storedName ON attachments(storedName);
      CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions(userId);
    `)

    // Migração idempotente (Frente 2): o status 'cancelled' foi adicionado ao
    // CHECK de redemptions. SQLite não permite ALTER TABLE CHECK — para bancos
    // criados com o CHECK antigo, recria a tabela copiando os dados. Na migração
    // 002 a redemptions é recriada de novo, agora com FKs nativas e keep do CHECK.
    const redemptionsDef = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'redemptions'")
      .get() as { sql: string } | undefined
    if (redemptionsDef && !/'cancelled'/.test(redemptionsDef.sql)) {
      db.exec(`
        -- Tabela temporária: o DROP evita que um redemptions_v2 órfão de uma
        -- run anterior abortada faça o CREATE falhar e a migração travar aqui.
        DROP TABLE IF EXISTS redemptions_v2;
        CREATE TABLE redemptions_v2 (
          id TEXT PRIMARY KEY,
          studentId TEXT NOT NULL,
          rewardId TEXT NOT NULL,
          rewardLabel TEXT NOT NULL,
          rewardIcon TEXT NOT NULL DEFAULT '',
          points INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','cancelled')),
          redeemedAt TEXT NOT NULL,
          processedBy TEXT
        );
        INSERT INTO redemptions_v2 (id, studentId, rewardId, rewardLabel, rewardIcon, points, status, redeemedAt, processedBy)
          SELECT id, studentId, rewardId, rewardLabel, rewardIcon, points, status, redeemedAt, processedBy FROM redemptions;
        DROP TABLE redemptions;
        ALTER TABLE redemptions_v2 RENAME TO redemptions;
      `)
    }
  },
}