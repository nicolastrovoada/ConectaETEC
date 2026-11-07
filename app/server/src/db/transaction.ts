import type { DatabaseSync } from "node:sqlite"

/**
 * Executa `fn` dentro de uma transação SQLite.
 * Em erro, faz ROLLBACK e propaga a exceção — nada é persistido parcialmente.
 */
export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE")
  try {
    const result = fn()
    db.exec("COMMIT")
    return result
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
}