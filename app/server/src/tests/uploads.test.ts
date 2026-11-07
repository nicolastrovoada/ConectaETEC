import { describe, it, expect, beforeAll } from "vitest"
import { makeApp, prepareDb, loginAgent, USERS } from "./helpers"
import { createActivity } from "./fixtures"
import type { Express } from "express"

type Agent = Awaited<ReturnType<typeof loginAgent>>

describe("Upload de evidências (fase 4, RF06)", () => {
  let app: Express

  beforeAll(() => {
    prepareDb()
    app = makeApp()
  })

  // Cada cenário reinicia o banco e recria a atividade a1 (c1, do Prof. Marcelo):
  // a V3 não semeia histórico, então o envio da Ana é sempre a primeira entrega
  // e o reenvio depende do professor pedir correção dentro do próprio teste.
  async function setup(): Promise<Agent> {
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

  it("envia entrega com anexo de imagem; anexo fica listado", async () => {
    const ana = await setup()
    const res = await ana
      .post("/api/activities/a1/submissions")
      .field("comment", "Entrega com evidência em anexo")
      .field("evidence", "Lista corrigida")
      .attach(
        "attachments",
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03]),
        "evidencia.png",
      )

    expect(res.status).toBe(201)
    const attachment = res.body.data.attachments[0] as {
      filename: string
      storedName: string
      mimeType: string
    }
    expect(attachment).toBeDefined()
    expect(attachment.filename).toBe("evidencia.png")
    expect(attachment.mimeType).toBe("image/png")
    expect(attachment.storedName).toMatch(/^[a-f0-9-]+\.png$/)
  })

  it("conteúdo .exe disfarçado de .pdf é rejeitado (magic bytes)", async () => {
    const ana = await setup()
    const res = await ana
      .post("/api/activities/a1/submissions")
      .field("comment", "Executável renomeado")
      .attach("attachments", Buffer.from("MZ..."), "virus.pdf")
    expect(res.status).toBe(422)
    expect(res.body.details).toBe("INVALID_FILE_CONTENT")
  })

  it("tipo não permitido é rejeitado (422)", async () => {
    const ana = await setup()
    const res = await ana
      .post("/api/activities/a1/submissions")
      .field("comment", "Executável malicioso")
      .attach("attachments", Buffer.from("MZ..."), "virus.exe")
    expect(res.status).toBe(422)
    void expect(res.body.error).toBeDefined()
  })

  it("mais de 3 anexos é rejeitado", async () => {
    const ana = await setup()
    const req = ana.post("/api/activities/a1/submissions").field("comment", "muitos arquivos")
    for (let i = 0; i < 4; i++) {
      req.attach("attachments", Buffer.from(`img-${i}`), `foto${i}.png`)
    }
    const res = await req
    expect(res.status).toBe(422)
  })

  it("download do anexo: autor e professor acessam; aluno de outra turma não (403)", async () => {
    const ana = await setup()
    const created = await ana
      .post("/api/activities/a1/submissions")
      .field("comment", "comprovante 2")
      .attach("attachments", Buffer.from("%PDF-1.4\npdf-bytes"), "comprovante.pdf")
    expect(created.status).toBe(201)
    const submissionId = created.body.data.id as string
    const att = created.body.data.attachments[0] as { id: string }

    const asAuthor = await ana.get(`/api/submissions/${submissionId}/attachments/${att.id}`)
    expect(asAuthor.status).toBe(200)
    expect(asAuthor.body.toString("utf8")).toBe("%PDF-1.4\npdf-bytes")
    expect(asAuthor.headers["x-content-type-options"]).toBe("nosniff")

    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const asTeacher = await marcelo.get(
      `/api/submissions/${submissionId}/attachments/${att.id}`,
    )
    expect(asTeacher.status).toBe(200)

    const fernanda = await loginAgent(app, USERS.fernanda.email)
    const denied = await fernanda.get(`/api/submissions/${submissionId}/attachments/${att.id}`)
    expect(denied.status).toBe(403)
  })

  it("GET /uploads/:storedName entrega apenas para autorizado", async () => {
    const ana = await setup()
    const created = await ana
      .post("/api/activities/a1/submissions")
      .field("comment", "evidência 3")
      .attach("attachments", Buffer.from("GIF89a-conteudo-protegido"), "foto.gif")
    const att = created.body.data.attachments[0] as { storedName: string }

    const coord = await loginAgent(app, USERS.juliana.email)
    const ok = await coord.get(`/uploads/${att.storedName}`)
    expect(ok.status).toBe(200)
    expect(ok.headers["x-content-type-options"]).toBe("nosniff")

    const fernanda = await loginAgent(app, USERS.fernanda.email)
    const denied = await fernanda.get(`/uploads/${att.storedName}`)
    expect(denied.status).toBe(403)
  })
})