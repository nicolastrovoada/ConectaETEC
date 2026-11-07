import fs from "node:fs"
import path from "node:path"
import { config } from "./config"
import { createApp } from "./app"
import { getDb } from "./db/connection"
import { runSchema } from "./db/schema"
import { bootstrapAdminFromEnv } from "./db/bootstrap"
import { deleteExpiredSessions } from "./auth/session"

const PORT = config.port

function bootstrap(): void {
  fs.mkdirSync(config.uploadsDir, { recursive: true })

  const db = getDb()
  runSchema(db)
  // Cria o coordenador inicial somente quando o banco está vazio e as variáveis
  // BOOTSTRAP_ADMIN_* foram definidas. O seed de demonstração NÃO roda no boot:
  // `runSeed` é fixture exclusiva de teste.
  bootstrapAdminFromEnv(db)
  deleteExpiredSessions()

  const app = createApp()
  const server = app.listen(PORT, () => {
    console.log(
      `[conecta-etec-server] Conecta ETEC backend rodando em http://localhost:${PORT}`,
    )
    console.log(`  - banco: ${config.dbPath}`)
    console.log(`  - uploads: ${path.resolve(config.uploadsDir)}`)
  })

  const shutdown = (signal: string): void => {
    console.log(`[conecta-etec-server] ${signal} recebido, encerrando...`)
    server.close(() => {
      db.close()
      process.exit(0)
    })
  }
  process.on("SIGINT", () => shutdown("SIGINT"))
  process.on("SIGTERM", () => shutdown("SIGTERM"))
}

bootstrap()