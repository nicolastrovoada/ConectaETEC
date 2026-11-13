import fs from "node:fs"
import path from "node:path"
import { describe, it, expect, beforeAll } from "vitest"
import request from "supertest"
import { makeApp, prepareDb, loginAgent, USERS } from "./helpers"
import { config } from "../config"
import { avatarDir, ensureUploadsDir } from "../lib/uploads"
import type { Express } from "express"

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
function pngFile(payload: string): Buffer {
  return Buffer.concat([PNG_SIGNATURE, Buffer.from(payload)])
}

describe("Usuários (RF02, RF13)", () => {
  let app: Express

  beforeAll(() => {
    prepareDb()
    // O teste de PDF lê `avatarDir()`: rodando sozinho (`-t "PDF"`) a pasta
    // ainda não existe, porque nenhum teste de upload anterior a criou.
    ensureUploadsDir()
    app = makeApp()
  })

  it("cadastro restrito à coordenação — aluno recebe 403", async () => {
    const agent = await loginAgent(app, USERS.ana.email)
    const res = await agent.post("/api/users").send({
      name: "Aluno Invasor",
      email: "invasor@etec.sp.gov.br",
      password: "123456",
      role: "student",
    })
    expect(res.status).toBe(403)
  })

  it("coordenação cria aluno com vínculo de turma → 201 e turma atualizada", async () => {
    const agent = await loginAgent(app, USERS.juliana.email)
    const res = await agent.post("/api/users").send({
      name: "Nova Aluna",
      email: "n.aluna@etec.sp.gov.br",
      password: "123456",
      role: "student",
      classId: "c2",
    })
    expect(res.status).toBe(201)
    expect(res.body.data).not.toHaveProperty("password")
    expect(res.body.data.classIds).toEqual(["c2"])

    const classes = await agent.get("/api/classes")
    const c2 = classes.body.data.find((c: { id: string }) => c.id === "c2")
    expect(c2.studentIds).toContain(res.body.data.id)
  })

  it("e-mail duplicado → 409", async () => {
    const agent = await loginAgent(app, USERS.juliana.email)
    const res = await agent.post("/api/users").send({
      name: "Ana Duplicada",
      email: USERS.ana.email,
      password: "123456",
      role: "student",
    })
    expect(res.status).toBe(409)
  })

  it("coordenação desativa usuário — RN01 bloqueia login depois", async () => {
    const agent = await loginAgent(app, USERS.juliana.email)
    const res = await agent.patch("/api/users/u2").send({ active: false })
    expect(res.status).toBe(200)
    expect(res.body.data.active).toBe(false)

    const login = await request(app).post("/api/auth/login").send({
      email: USERS.mateus.email,
      password: USERS.mateus.password,
    })
    expect(login.status).toBe(401)
  })

  it("lista usuários é restrita à coordenação", async () => {
    const student = await loginAgent(app, USERS.ana.email)
    const denied = await student.get("/api/users")
    expect(denied.status).toBe(403)

    const coord = await loginAgent(app, USERS.juliana.email)
    const res = await coord.get("/api/users?role=student")
    expect(res.status).toBe(200)
    const students = res.body.data as Array<{ id: string }>
    expect(students.length).toBeGreaterThanOrEqual(5)
  })

  it("GET /users/:id/points — aluno vê os próprios, outro papel não", async () => {
    const ana = await loginAgent(app, USERS.ana.email)
    const own = await ana.get("/api/users/u1/points")
    expect(own.status).toBe(200)
    expect(own.body.data.balance).toBe(0) // banco de demonstração nasce sem histórico
    expect(Array.isArray(own.body.data.transactions)).toBe(true)

    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const forbidden = await marcelo.get("/api/users/u1/points")
    expect(forbidden.status).toBe(403)

    const coord = await loginAgent(app, USERS.juliana.email)
    const any = await coord.get("/api/users/u3/points")
    expect(any.status).toBe(200)
    expect(any.body.data.balance).toBe(0)
  })

  it("PATCH /me atualiza o próprio nome sem passar pela rota de coordenação", async () => {
    const ana = await loginAgent(app, USERS.ana.email)
    const res = await ana.patch("/api/users/me").send({ name: "Ana Clara Souza" })
    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe("Ana Clara Souza")
    expect(res.body.data).not.toHaveProperty("password")
  })

  it("PATCH /me é .strict(): papel, turmas, situação, e-mail e avatar são 400", async () => {
    const ana = await loginAgent(app, USERS.ana.email)
    const invalidos = [
      { role: "coordinator" },
      { classIds: ["c2"] },
      { active: false },
      { email: "outra@etec.sp.gov.br" },
      { avatar: "X" },
    ]
    for (const payload of invalidos) {
      const res = await ana.patch("/api/users/me").send(payload)
      expect(res.status, JSON.stringify(payload)).toBe(400)
    }
  })

  it("PATCH /me sem alterações → 400 NO_CHANGES", async () => {
    const ana = await loginAgent(app, USERS.ana.email)
    const vazio = await ana.patch("/api/users/me").send({})
    expect(vazio.status).toBe(400)
    expect(vazio.body.details).toBe("NO_CHANGES")

    // Só `currentPassword`, sem `newPassword`, também não altera nada.
    const soSenhaAtual = await ana.patch("/api/users/me").send({ currentPassword: "123456" })
    expect(soSenhaAtual.status).toBe(400)
    expect(soSenhaAtual.body.details).toBe("NO_CHANGES")
  })

  it("PATCH /me com currentPassword errada → 400 e senha intacta", async () => {
    const ana = await loginAgent(app, USERS.ana.email)
    const res = await ana.patch("/api/users/me").send({
      currentPassword: "senha-errada",
      newPassword: "novaSenha9",
    })
    expect(res.status).toBe(400)
    expect(res.body.details).toBe("INVALID_CURRENT_PASSWORD")

    const login = await request(app).post("/api/auth/login").send({
      email: USERS.ana.email,
      password: USERS.ana.password,
    })
    expect(login.status).toBe(200)
  })

  it("upload de avatar salva a imagem, troca a antiga e só serve autenticado", async () => {
    const ana = await loginAgent(app, USERS.ana.email)
    const res = await ana
      .post("/api/users/me/avatar")
      .attach("avatar", pngFile("foto-1"), { filename: "foto.png", contentType: "image/png" })

    expect(res.status).toBe(200)
    const avatar = res.body.data.avatar as string
    expect(avatar).toMatch(/^\/uploads\/avatars\/.+\.png$/)
    const storedName = path.basename(avatar)
    expect(fs.existsSync(path.join(avatarDir(), storedName))).toBe(true)

    const file = await ana.get(avatar)
    expect(file.status).toBe(200)
    expect(file.headers["content-type"]).toBe("image/png")
    expect(file.headers["x-content-type-options"]).toBe("nosniff")

    const anonymous = await request(app).get(avatar)
    expect(anonymous.status).toBe(401)

    // Trocar a foto apaga o arquivo anterior do disco.
    const troca = await ana
      .post("/api/users/me/avatar")
      .attach("avatar", pngFile("foto-2"), { filename: "foto2.png", contentType: "image/png" })
    expect(troca.status).toBe(200)
    expect(troca.body.data.avatar).not.toBe(avatar)
    expect(fs.existsSync(path.join(avatarDir(), storedName))).toBe(false)
  })

  it("avatar com conteúdo PDF disfarçado de PNG → 422 e nada fica no disco", async () => {
    const ana = await loginAgent(app, USERS.ana.email)
    const before = fs.readdirSync(avatarDir()).sort()
    const res = await ana
      .post("/api/users/me/avatar")
      .attach("avatar", Buffer.from("%PDF-1.4\nconteudo-pdf"), {
        filename: "foto.png",
        contentType: "image/png",
      })
    expect(res.status).toBe(422)
    expect(res.body.details).toBe("INVALID_FILE_CONTENT")
    expect(fs.readdirSync(avatarDir()).sort()).toEqual(before)
  })

  it("avatar acima de 2 MB → 422 LIMIT_FILE_SIZE e nada fica no disco", async () => {
    const ana = await loginAgent(app, USERS.ana.email)
    const before = fs.readdirSync(avatarDir()).sort()
    const grande = Buffer.alloc(config.maxAvatarBytes + 1)
    PNG_SIGNATURE.copy(grande)

    const res = await ana
      .post("/api/users/me/avatar")
      .attach("avatar", grande, { filename: "grande.png", contentType: "image/png" })

    expect(res.status).toBe(422)
    expect(res.body.details).toBe("LIMIT_FILE_SIZE")
    expect(fs.readdirSync(avatarDir()).sort()).toEqual(before)
  })

  it("avatar inexistente e nome inválido respondem 404 uniforme", async () => {
    const ana = await loginAgent(app, USERS.ana.email)

    const inexistente = await ana.get("/uploads/avatars/nao-existe.png")
    expect(inexistente.status).toBe(404)
    expect(inexistente.body.details).toBe("FILE_MISSING")

    // Path traversal percent-encoded: o param chega decodificado ao guard.
    const traversal = await ana.get("/uploads/avatars/%2e%2e%2fsegredo.png")
    expect(traversal.status).toBe(404)
  })

  it("coordenação edita usuário com foto sem apagar o avatar", async () => {
    const beatriz = await loginAgent(app, USERS.beatriz.email)
    const upload = await beatriz
      .post("/api/users/me/avatar")
      .attach("avatar", pngFile("foto-beatriz"), { filename: "beatriz.png", contentType: "image/png" })
    expect(upload.status).toBe(200)
    const avatar = upload.body.data.avatar as string
    expect(avatar).toMatch(/^\/uploads\/avatars\/.+\.png$/)
    const storedName = path.basename(avatar)
    expect(fs.existsSync(path.join(avatarDir(), storedName))).toBe(true)

    // O modal da coordenação manda `name` em toda edição; o avatar de foto
    // precisa sobreviver à mudança de nome/papel/situação.
    const coord = await loginAgent(app, USERS.juliana.email)
    const res = await coord.patch(`/api/users/${USERS.beatriz.id}`).send({
      name: "Beatriz Almeida Lima",
      role: "teacher",
      active: true,
      classIds: ["c2"],
    })
    expect(res.status).toBe(200)
    expect(res.body.data.avatar).toBe(avatar)
    expect(res.body.data.name).toBe("Beatriz Almeida Lima")

    const me = await beatriz.get("/api/auth/me")
    expect(me.status).toBe(200)
    expect(me.body.data.avatar).toBe(avatar)
    expect(fs.existsSync(path.join(avatarDir(), storedName))).toBe(true)
  })

  it("auditoria registra USER_UPDATED para nome e foto do próprio perfil", async () => {
    const ana = await loginAgent(app, USERS.ana.email)
    const novoNome = "Ana Auditoria"
    const nome = await ana.patch("/api/users/me").send({ name: novoNome })
    expect(nome.status).toBe(200)

    const foto = await ana
      .post("/api/users/me/avatar")
      .attach("avatar", pngFile("foto-auditoria"), { filename: "auditoria.png", contentType: "image/png" })
    expect(foto.status).toBe(200)

    const coord = await loginAgent(app, USERS.juliana.email)
    const logs = (await coord.get("/api/audit?action=USER_UPDATED")).body.data as Array<{
      userId: string
      description: string
    }>
    expect(
      logs.some((l) => l.userId === USERS.ana.id && l.description.includes(`nome → ${novoNome}`)),
    ).toBe(true)
    expect(
      logs.some((l) => l.userId === USERS.ana.id && l.description.includes("foto de perfil")),
    ).toBe(true)
  })

  it("troca de senha própria revoga outras sessões e mantém a atual", async () => {
    const atual = await loginAgent(app, USERS.ana.email)
    const outra = await loginAgent(app, USERS.ana.email)

    const res = await atual.patch("/api/users/me").send({
      currentPassword: USERS.ana.password,
      newPassword: "novaSenha9",
    })
    expect(res.status).toBe(200)
    expect(res.body.data).not.toHaveProperty("password")

    // A sessão que fez a troca continua válida...
    const ainda = await atual.get("/api/auth/me")
    expect(ainda.status).toBe(200)
    // ...e a outra caiu.
    const revogada = await outra.get("/api/auth/me")
    expect(revogada.status).toBe(401)

    const antiga = await request(app).post("/api/auth/login").send({
      email: USERS.ana.email,
      password: USERS.ana.password,
    })
    expect(antiga.status).toBe(401)

    const nova = await request(app).post("/api/auth/login").send({
      email: USERS.ana.email,
      password: "novaSenha9",
    })
    expect(nova.status).toBe(200)
  })
})