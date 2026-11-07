import express, { type Express, type ErrorRequestHandler } from "express"
import cookieParser from "cookie-parser"
import cors from "cors"
import multer from "multer"
import { ZodError } from "zod"
import { config } from "./config"
import { AppError, notFound } from "./lib/errors"
import { authRouter } from "./routes/auth"
import { usersRouter } from "./routes/users"
import { classesRouter } from "./routes/classes"
import { subjectsRouter } from "./routes/subjects"
import { activitiesRouter } from "./routes/activities"
import { submissionCreateRouter, submissionRouter } from "./routes/submissions"
import { uploadsRouter } from "./routes/uploads"
import { rewardsRouter } from "./routes/rewards"
import { redemptionsRouter } from "./routes/redemptions"
import { transactionsRouter, pointsRouter } from "./routes/transactions"
import { notificationsRouter } from "./routes/notifications"
import { noticesRouter } from "./routes/notices"
import { studyContentsRouter } from "./routes/studyContents"
import { dashboardRouter } from "./routes/dashboard"
import { reportsRouter } from "./routes/reports"
import { auditRouter } from "./routes/audit"

export function createApp(): Express {
  const app = express()
  app.disable("x-powered-by")

  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
    }),
  )
  app.use(express.json({ limit: "1mb" }))
  app.use(cookieParser())

  // Health check público
  app.get("/api/health", (_req, res) => {
    res.json({ data: { ok: true, service: "conecta-etec-server" } })
  })

  app.use("/api/auth", authRouter)
  app.use("/api/users", usersRouter)
  app.use("/api/classes", classesRouter)
  app.use("/api/subjects", subjectsRouter)
  app.use("/api/activities", activitiesRouter)
  app.use("/api/activities", submissionCreateRouter)
  app.use("/api/submissions", submissionRouter)
  app.use("/uploads", uploadsRouter)
  app.use("/api/rewards", rewardsRouter)
  app.use("/api/redemptions", redemptionsRouter)
  app.use("/api/transactions", transactionsRouter)
  app.use("/api/points", pointsRouter)
  app.use("/api/notifications", notificationsRouter)
  app.use("/api/notices", noticesRouter)
  app.use("/api/study-contents", studyContentsRouter)
  app.use("/api/dashboard", dashboardRouter)
  app.use("/api/reports", reportsRouter)
  app.use("/api/audit", auditRouter)

  // 404 padrão para rotas não existentes
  app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    next(notFound(`Rota não encontrada: ${req.method} ${req.path}`, "ROUTE_NOT_FOUND"))
  })

  // Error handler central — normaliza exceções para o contrato de erro
  const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
    void req
    if (error instanceof AppError) {
      res.status(error.status).json({ error: error.message, details: error.details })
      return
    }
    if (error instanceof ZodError) {
      res.status(400).json({
        error: "Payload inválido.",
        details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      })
      return
    }
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        res.status(422).json({ error: "Arquivo excede o limite de 5 MB.", details: error.code })
        return
      }
      res.status(422).json({ error: `Falha no upload: ${error.message}`, details: error.code })
      return
    }
    const err = error as Error & { statusCode?: number; code?: string; errcode?: number }
    if (typeof err.errcode === "number" && err.errcode === 787) {
      // FKs nativas (Frente 5): node:sqlite expõe violação de foreign key com
      // code=ERR_SQLITE_ERROR + errcode=787 (SQLITE_CONSTRAINT_FOREIGNKEY).
      // Os guards de código disparam 409 antes, mas a FK é a defesa em
      // profundidade — nunca expor 500 aqui.
      res.status(409).json({ error: "Conflito com dados existentes.", details: "FOREIGN KEY constraint failed" })
      return
    }
    if (err && typeof err.statusCode === "number") {
      // Erros de biblioteca (ex.: body-parser) podem expor detalhes internos na
      // mensagem — respondemos com texto genérico e logamos o original.
      console.error("[conecta-etec-server] erro com statusCode:", error)
      res.status(err.statusCode).json({ error: "Erro na requisição.", details: err.code })
      return
    }
    // Backup de segurança: códigos de erro do node:sqlite viram 409 (violação de constraint)
    if (err && typeof err === "object" && "code" in err) {
      const sqliteCode = String((err as { code: unknown }).code)
      // SQLITE_BUSY: outro processo/requisição segura o write lock — retry do client,
      // nunca 500 genérico (Frente 2 — corrida multi-processo em resgates).
      if (sqliteCode === "SQLITE_BUSY") {
        res.status(503).json({
          error: "Banco de dados ocupado — tente novamente em instantes.",
          details: sqliteCode,
        })
        return
      }
      if (sqliteCode.startsWith("SQLITE_CONSTRAINT")) {
        res.status(409).json({ error: "Conflito com dados existentes.", details: sqliteCode })
        return
      }
    }
    console.error("[conecta-etec-server] erro não tratado:", error)
    res.status(500).json({ error: "Erro interno do servidor." })
  }
  app.use(errorHandler)

  return app
}