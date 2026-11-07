import fs from "node:fs"
import path from "node:path"
import { describe, it, expect, beforeAll } from "vitest"
import { makeApp, prepareDb, loginAgent, USERS } from "./helpers"
import { createActivity } from "./fixtures"
import { config } from "../config"
import { validateStoredName, buildStoredName } from "../lib/uploads"
import type { Express } from "express"

type Agent = Awaited<ReturnType<typeof loginAgent>>

const OVER_5MB = 5 * 1024 * 1024 + 1

// A validação de upload agora inclui magic bytes (detectFileType): enviamos
// conteúdo REAL de PNG em todos os anexos. Isso mantém o teste válido tanto
// para a validação antiga (mimetype+extensão) quanto para a nova (conteúdo).
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
function pngFile(payload: string): Buffer {
  return Buffer.concat([PNG_SIGNATURE, Buffer.from(payload)])
}

// Lacuna de cobertura: bordas do upload — limite de tamanho, validação de
// storedName (traversal) e substituição de anexo antigo no reenvio.
describe("Upload de evidências — casos de borda", () => {
  let app: Express

  beforeAll(() => {
    prepareDb()
    app = makeApp()
  })

  /** A1 é ativa com prazo futuro e pertence ao Prof. Marcelo (c1), recriada por cenário. */
  async function setupAna(): Promise<Agent> {
    const db = prepareDb()
    createActivity(db, {
      id: "a1",
      title: "Revisão de Língua Portuguesa",
      subjectId: "s1",
      teacherId: USERS.marcelo.id,
      classId: "c1",
      points: 15,
    })
    return loginAgent(app, USERS.ana.email)
  }

  it("arquivo acima de 5 MB → 422 LIMIT_FILE_SIZE", async () => {
    const ana = await setupAna()
    // O `limits.fileSize` do multer aborta DEPOIS de gravar o arquivo no
    // `uploadsDir`, e nesse caminho o `handle` da rota não roda — então o
    // `cleanupUploadedFiles` (que mora dentro dele) não pode ser o responsável.
    const arquivosAntes = fs.readdirSync(config.uploadsDir)
    const res = await ana
      .post("/api/activities/a1/submissions")
      .field("comment", "mega arquivo")
      .attach("attachments", Buffer.alloc(OVER_5MB, 1), {
        filename: "grande.png",
        contentType: "image/png",
      })
    expect(res.status).toBe(422)
    expect(res.body.error).toContain("5 MB")
    expect(res.body.details).toBe("LIMIT_FILE_SIZE")
    expect(fs.readdirSync(config.uploadsDir), "byte órfão do arquivo acima do limite").toEqual(
      arquivosAntes,
    )
  })

  it("4 anexos numa entrega → 422 sem deixar byte no disco", async () => {
    const ana = await setupAna()
    const arquivosAntes = fs.readdirSync(config.uploadsDir)
    const muitos = ana.post("/api/activities/a1/submissions").field("comment", "lote grande")
    for (let i = 0; i < 4; i++) muitos.attach("attachments", pngFile(`f${i}`), `f${i}.png`)
    const res = await muitos
    expect(res.status).toBe(422)
    expect(fs.readdirSync(config.uploadsDir), "byte órfão do lote acima do limite").toEqual(arquivosAntes)
  })

  it("validateStoredName rejeita traversal e caminhos", () => {
    // válidos
    expect(validateStoredName("abc-123_def.2026.png")).toBe(true)
    expect(validateStoredName("foto.png")).toBe(true)
    // inválidos: separadores de caminho, absolutos, vazios, espaços
    expect(validateStoredName("../evil.png")).toBe(false)
    expect(validateStoredName("..\\evil.png")).toBe(false)
    expect(validateStoredName("a/b.png")).toBe(false)
    expect(validateStoredName("/etc/passwd")).toBe(false)
    expect(validateStoredName("")).toBe(false)
    expect(validateStoredName("arquivo com espaço.png")).toBe(false)
  })

  it("buildStoredName preserva a extensão e usa nome único", () => {
    prepareDb()
    const a = buildStoredName("FOTO.JPG")
    const b = buildStoredName("FOTO.JPG")
    expect(a).toMatch(/^[a-f0-9-]+\.jpg$/)
    expect(b).toMatch(/^[a-f0-9-]+\.jpg$/)
    expect(a).not.toBe(b)
  })

  it("rota /uploads rejeita traversal na URL (404 FILE_MISSING)", async () => {
    const ana = await setupAna()
    const traversal = await ana.get("/uploads/%2e%2e%2fsecret.png")
    expect(traversal.status).toBe(404)
    expect(traversal.body.details).toBe("FILE_MISSING")
    const nonExistent = await ana.get("/uploads/nao-existe.png")
    expect(nonExistent.status).toBe(404)
    expect(nonExistent.body.details).toBe("FILE_MISSING")
  })

  it("reenvio substitui o anexo antigo (banco e disco)", async () => {
    const ana = await setupAna()
    const marcelo = await loginAgent(app, USERS.marcelo.email)

    // 1) Ana envia v1.png (conteúdo PNG real — passa na checagem de magic bytes)
    const first = await ana
      .post("/api/activities/a1/submissions")
      .field("comment", "versão 1")
      .attach("attachments", pngFile("v1-bytes"), "v1.png")
    expect(first.status).toBe(201)
    const firstAtt = first.body.data.attachments[0] as { storedName: string }
    expect(firstAtt).toBeDefined()

    // 2) Marcelo devolve para correção → reenvio volta a ser permitido
    const revision = await marcelo
      .post(`/api/submissions/${first.body.data.id}/validate`)
      .send({ action: "revision", feedback: "refaça com o arquivo certo" })
    expect(revision.status).toBe(200)

    // 3) Ana reenvia com v2.png → anexo antigo é removido
    const second = await ana
      .post("/api/activities/a1/submissions")
      .field("comment", "versão 2")
      .attach("attachments", pngFile("v2-bytes"), "v2.png")
    expect(second.status).toBe(201)
    expect(second.body.data.attachments).toHaveLength(1)
    const secondAtt = second.body.data.attachments[0] as { storedName: string }
    expect(secondAtt.storedName).not.toBe(firstAtt.storedName)

    // 4) Disco: arquivo antigo removido, novo presente
    expect(fs.existsSync(path.join(config.uploadsDir, secondAtt.storedName))).toBe(true)
    expect(fs.existsSync(path.join(config.uploadsDir, firstAtt.storedName))).toBe(false)
  })

  it("reenvio SEM anexo mantém os anexos existentes", async () => {
    const ana = await setupAna()
    const marcelo = await loginAgent(app, USERS.marcelo.email)

    const first = await ana
      .post("/api/activities/a1/submissions")
      .field("comment", "com anexo")
      .attach("attachments", pngFile("mantido"), "mantido.png")
    expect(first.status).toBe(201)
    const storedOriginal = first.body.data.attachments[0].storedName as string

    await marcelo
      .post(`/api/submissions/${first.body.data.id}/validate`)
      .send({ action: "revision", feedback: "pequeno ajuste" })

    // sem attach → os anexos antigos permanecem
    const resub = await ana
      .post("/api/activities/a1/submissions")
      .field("comment", "sem novo arquivo")
    expect(resub.status).toBe(201)
    expect(resub.body.data.attachments).toHaveLength(1)
    expect(resub.body.data.attachments[0].storedName).toBe(storedOriginal)
    expect(fs.existsSync(path.join(config.uploadsDir, storedOriginal))).toBe(true)
  })
})