import type { DatabaseSync } from "node:sqlite"
import type { Migration } from "./types"

/**
 * Migração 003 — tabela de conquistas/badges (Frente 6).
 *
 * `achievements` registra as conquistas já desbloqueadas por cada aluno.
 * - `studentId` aponta para users com ON DELETE RESTRICT (aluno com conquistas
 *   não pode ser apagado — mesmo critério de transações/entregas).
 * - Índice UNIQUE (studentId, code): idempotência da concessão — o serviço
 *   avalia e insere, e a constraint impede duplicidade mesmo em corrida.
 * - `label`/`description` são um snapshot no momento da concessão (o catálogo
 *   vive em app/shared/types.ts e pode evoluir sem reescrever o histórico).
 */
export const migration003: Migration = {
  version: 3,
  name: "achievements",
  run(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS achievements (
        id TEXT PRIMARY KEY,
        studentId TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        code TEXT NOT NULL,
        label TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        earnedAt TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_achievements_studentId_code ON achievements(studentId, code);
      CREATE INDEX IF NOT EXISTS idx_achievements_studentId ON achievements(studentId);
    `)
  },
}