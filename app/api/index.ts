import fs from "node:fs"
import { createApp } from "../server/src/app"
import { config } from "../server/src/config"
import { getDb } from "../server/src/db/connection"
import { runSchema } from "../server/src/db/schema"
import { bootstrapAdminFromEnv } from "../server/src/db/bootstrap"
import { deleteExpiredSessions } from "../server/src/auth/session"

fs.mkdirSync(config.uploadsDir, { recursive: true })

const db = getDb()
runSchema(db)
bootstrapAdminFromEnv(db)
deleteExpiredSessions()

export default createApp()
