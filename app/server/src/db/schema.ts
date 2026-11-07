import type { DatabaseSync } from "node:sqlite"
import { runMigrations } from "./migrations"

/**
 * Aplica todas as migrações versionadas pendentes (Frente 5).
 *
 * Mantém o nome `runSchema` por compatibilidade com o boot (`index.ts`) e com
 * os helpers de teste (`helpers.ts`), mas o DDL agora vive em
 * `server/src/db/migrations/` — aplicado ANTES do seed, de forma idempotente.
 */
export function runSchema(db: DatabaseSync): void {
  runMigrations(db)
}