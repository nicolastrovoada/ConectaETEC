import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

/**
 * Ambiente isolado para testes:
 * - banco SQLite em memória (:memory:) — reiniciado a cada suite
 * - pasta de uploads temporária (nunca toca server/data)
 * - porta irrelevante (app não escuta nos testes)
 */
process.env.DB_PATH = ":memory:"
process.env.UPLOAD_DIR = mkdtempSync(path.join(tmpdir(), "conecta-etec-uploads-"))
process.env.PORT = "0"
process.env.CORS_ORIGIN = "http://localhost:5173"