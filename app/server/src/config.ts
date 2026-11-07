// O import precisa vir antes da leitura de `process.env` abaixo. O módulo
// `./env` carrega `.env` (quando existir) de forma síncrona, sem sobrescrever
// variáveis já definidas no ambiente.
import "./env"
import path from "node:path"

function resolveDbPath(): string {
  if (process.env.DB_PATH) return process.env.DB_PATH
  return path.resolve(process.cwd(), "data", "conectaetec.db")
}

/**
 * Configuração central do servidor.
 * Valores lidos de variáveis de ambiente para permitir testes (DB_PATH=":memory:")
 * e isolamento de storage (UPLOAD_DIR/DATA_DIR).
 */
export const config = {
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  cookieName: "sid",
  secureCookies: process.env.NODE_ENV === "production",
  sessionTtlMs: 8 * 60 * 60 * 1000, // ~8h
  dataDir: process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.resolve(process.cwd(), "data"),
  dbPath: resolveDbPath(),
  uploadsDir: process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.resolve(process.cwd(), "data", "uploads"),
  bcryptRounds: 10,
  maxAttachments: 3,
  maxAttachmentBytes: 5 * 1024 * 1024, // 5 MB
} as const

export const ALLOWED_UPLOAD_MIME_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
])

export const ALLOWED_UPLOAD_EXTENSIONS: ReadonlySet<string> = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".pdf",
])