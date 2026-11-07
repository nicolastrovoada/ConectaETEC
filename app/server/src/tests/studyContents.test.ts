import { describe, it, expect, beforeEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { makeApp, prepareDb, loginAgent, USERS, count } from "./helpers"
import { createActivity, createSubmission } from "./fixtures"
import { listAttachmentStoredNamesForStudyContent } from "../db/queries"
import { resetApiRateLimits } from "../auth/rateLimit"
import { config } from "../config"
import { getDb } from "../db/connection"
import type { Express } from "express"
import type { StudyContent, StudentStudyContent } from "../shared/types"

/**
 * Reforço escolar com lição de verdade (V3, Tarefa 3.1).
 *
 * O que esta suíte prende, além do CRUD:
 * - o +N pontos da conclusão acontece UMA vez só (UNIQUE no banco, não pré-check);
 * - a conclusão é do tipo `study_content`, que NÃO consome o teto diário de bônus
 *   da coordenação (`BONUS_MAX_DAILY` soma só `type = 'bonus'`);
 * - professor só cria/edita/apaga o reforço das PRÓPRIAS turmas, e o conteúdo
 *   sobrevive ao professor (sem FK em `teacherId`);
 * - anexo do reforço não é a porta dos fundos do anexo de entrega: professor
 *   colega de turma é 403, aluno da turma baixa, aluno de fora não;
 * - DELETE de reforço já concluído é 409 explained, nunca 500 (a FK
 *   `study_content_completions.studyContentId` é RESTRICT); sem conclusão, o
 *   reforço e o byte do anexo saem juntos (CASCADE + unlink).
 */

type Agent = Awaited<ReturnType<typeof loginAgent>>

/** Bytes com assinatura válida (magic bytes) — o mesmo par usado em uploads.test.ts. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03])
const PDF = Buffer.from("%PDF-1.4\nreforco-escolar")

describe("Reforço escolar — StudyContent real (3.1)", () => {
  let app: Express

  beforeEach(() => {
    prepareDb()
    resetApiRateLimits()
    app = makeApp()
  })

  /** Cria um reforço pela rota e devolve o id (default: Prof. Marcelo, c1). */
  async function criarReforco(
    agent: Agent,
    over: { topic?: string; classIds?: string[]; points?: number; exercises?: number } = {},
  ): Promise<string> {
    const res = await agent.post("/api/study-contents").send({
      subject: "Matemática",
      topic: over.topic ?? "Frações",
      icon: "➕",
      description: "Revisão de frações equivalentes.",
      content: "Aula 1: 1/2 = 2/4.",
      classIds: over.classIds ?? ["c1"],
      points: over.points ?? 5,
      exercises: over.exercises ?? 3,
      questions: ["Quanto é 1/2 + 1/2?"],
    })
    expect(res.status, `criação do reforço: ${JSON.stringify(res.body)}`).toBe(201)
    return res.body.data.id as string
  }

  const saldoDe = async (agent: Agent, userId: string): Promise<number> => {
    const res = await agent.get(`/api/users/${userId}/points`)
    return (res.body as { data: { balance: number } }).data.balance
  }

  // ─── Passo 1 do brief: o +5 pontos uma vez só ───────────────────────────────

  it("concluir reforço dá +5 pts apenas uma vez", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const ana = await loginAgent(app, USERS.ana.email)
    const id = await criarReforco(marcelo, { points: 5 })
    const before = await saldoDe(ana, USERS.ana.id)

    const res = await ana.post(`/api/study-contents/${id}/complete`)
    expect(res.status).toBe(201)
    expect(res.body.data.transaction.type).toBe("study_content")
    expect(res.body.data.transaction.amount).toBe(5)
    expect(res.body.data.transaction.description).toBe("Reforço concluído: Frações")
    expect(res.body.data.transaction.relatedActivityId).toBeNull()
    expect(res.body.data.transaction.createdBy).toBe(USERS.marcelo.id)
    expect(res.body.data.balance).toBe(before + 5)
    expect(await saldoDe(ana, USERS.ana.id)).toBe(before + 5)

    // Conclusão registrada (UNIQUE aluno/reforço) + notificação + auditoria.
    const db = getDb()
    const completions = db
      .prepare("SELECT COUNT(*) AS total FROM study_content_completions WHERE studyContentId = ?")
      .get(id) as { total: number }
    expect(Number(completions.total)).toBe(1)

    const notifications = (await ana.get("/api/notifications")).body.data as Array<{
      title: string
      message: string
    }>
    const aviso = notifications.find((n) => n.title === "Reforço concluído! 🎉")
    expect(aviso?.message).toBe("Você concluiu o reforço 'Frações' e ganhou +5 pontos.")

    const coord = await loginAgent(app, USERS.juliana.email)
    const audit = (await coord.get("/api/audit?action=STUDY_CONTENT_COMPLETED")).body.data as Array<{
      entity: string
      entityId: string
      userId: string
    }>
    expect(audit.some((l) => l.entity === "StudyContent" && l.entityId === id)).toBe(true)
    expect(audit.some((l) => l.userId === USERS.ana.id)).toBe(true)

    // Concluir de novo: 409 explicado, saldo intacto, sem segunda transação.
    const again = await ana.post(`/api/study-contents/${id}/complete`)
    expect(again.status).toBe(409)
    expect(again.body.details).toBe("ALREADY_COMPLETED")

    expect(await saldoDe(ana, USERS.ana.id)).toBe(before + 5)
    const txs = (await ana.get("/api/transactions")).body.data as Array<{ type: string; amount: number }>
    expect(txs.filter((t) => t.type === "study_content" && t.amount === 5)).toHaveLength(1)
  })

  it("o crédito do reforço NÃO consome o teto diário de bônus da coordenação", async () => {
    // Se a conclusão usasse `type = 'bonus'`, os +5 do aluno entrariam na soma
    // diária de `grantBonus` (BONUS_MAX_DAILY = 500) e a coordenação perderia teto
    // que era dela. O tipo novo é o que mantém as duas contas separadas.
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const ana = await loginAgent(app, USERS.ana.email)
    const coord = await loginAgent(app, USERS.juliana.email)
    const id = await criarReforco(marcelo, { points: 40 })

    expect((await ana.post(`/api/study-contents/${id}/complete`)).status).toBe(201)

    const bonus = await coord.post("/api/points/bonus").send({
      studentId: USERS.ana.id,
      amount: 500,
      description: "Teto diário de bônus",
    })
    expect(bonus.status, "o teto diário de bônus foi consumido pelo reforço do aluno").toBe(201)
  })

  it("corrida: dois concludes simultâneos creditam uma vez só (UNIQUE no banco)", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const ana = await loginAgent(app, USERS.ana.email)
    const id = await criarReforco(marcelo, { points: 5 })
    const before = await saldoDe(ana, USERS.ana.id)

    const statuses = await Promise.all([
      ana.post(`/api/study-contents/${id}/complete`).then((r) => r.status),
      ana.post(`/api/study-contents/${id}/complete`).then((r) => r.status),
    ])
    expect(statuses.sort()).toEqual([201, 409])

    const db = getDb()
    expect(await saldoDe(ana, USERS.ana.id)).toBe(before + 5)
    expect(
      count(db, "study_content_completions"),
      "a corrida criou duas conclusões para o mesmo aluno/reforço",
    ).toBe(1)
    const txs = db
      .prepare("SELECT COUNT(*) AS total FROM transactions WHERE type = 'study_content'")
      .get() as { total: number }
    expect(Number(txs.total), "a corrida creditou duas vezes").toBe(1)
  })

  // ─── Criação: dono é o autor e só entra nas turmas em que atua ─────────────

  it("professor cria reforço nas próprias turmas; turma alheia é 403 + auditoria", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    // u6 é professor de c1 (teacherIds = [u6]) e de c2 ([u6, u7]).
    const naC1 = await criarReforco(marcelo, { classIds: ["c1"] })
    const naC2 = await criarReforco(marcelo, { classIds: ["c2"], topic: "Juros simples" })
    expect(naC1, "os dois reforços são o mesmo registro").not.toBe(naC2)

    // A Prof. Sandra (u7) não atua na c1 — a dele é a c2/c3.
    const sandra = await loginAgent(app, USERS.sandra.email)
    const denied = await sandra.post("/api/study-contents").send({
      subject: "Matemática",
      topic: "Reforço indevido",
      classIds: ["c1"],
    })
    expect(denied.status).toBe(403)
    expect(denied.body.details).toBe("TEACHER_NOT_IN_CLASS")

    const coord = await loginAgent(app, USERS.juliana.email)
    const negadas = (await coord.get("/api/audit?action=ACCESS_DENIED")).body.data as Array<{
      userId: string
      entity: string
    }>
    expect(negadas.some((l) => l.userId === USERS.sandra.id && l.entity === "Route")).toBe(true)

    // Nenhum reforço da recusa foi gravado.
    const contents = (await coord.get("/api/study-contents")).body.data as Array<{ topic: string }>
    expect(contents.map((c) => c.topic)).not.toContain("Reforço indevido")
  })

  it("coordenação cria reforço em qualquer turma; aluno e funcionário não criam", async () => {
    const coord = await loginAgent(app, USERS.juliana.email)
    const created = await coord.post("/api/study-contents").send({
      subject: "História",
      topic: "Revolução Industrial",
      classIds: ["c3"],
      points: 10,
    })
    expect(created.status).toBe(201)
    expect(created.body.data.teacherId).toBe(USERS.juliana.id)
    expect(created.body.data.classIds).toEqual(["c3"])
    // RN06: a criação entra na auditoria com o reforço como entidade.
    const cria = (await coord.get("/api/audit?action=CONTENT_CREATED")).body.data as Array<{
      entity: string
      entityId: string
      userId: string
    }>
    expect(
      cria.some((l) => l.entity === "StudyContent" && l.entityId === created.body.data.id),
      "a criação do reforço não foi auditada",
    ).toBe(true)

    const ana = await loginAgent(app, USERS.ana.email)
    expect((await ana.post("/api/study-contents").send({ subject: "x", topic: "y" })).status).toBe(403)

    const carlos = await loginAgent(app, USERS.carlos.email)
    expect((await carlos.post("/api/study-contents").send({ subject: "x", topic: "y" })).status).toBe(403)
  })

  it("turma inexistente é 404 e professor sem turma informada é recusado", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const ghost = await marcelo
      .post("/api/study-contents")
      .send({ subject: "Matemática", topic: "Reforço fantasma", classIds: ["cX"] })
    expect(ghost.status).toBe(404)
    expect(ghost.body.details).toBe("CLASS_NOT_FOUND")

    // Sem `classIds` o payload nem passa no schema (erro de validação do Zod é
    // 400 em toda a API — ver errorHandler): um reforço sem turma destinatária
    // não existe, senão ele apareceria para todo mundo e não valeria para ninguém.
    const semTurma = await marcelo.post("/api/study-contents").send({ subject: "Matemática", topic: "Sem turma" })
    expect(semTurma.status).toBe(400)
    expect((semTurma.body.details as Array<{ path: string }>)[0].path).toBe("classIds")

    const turmaVazia = await marcelo
      .post("/api/study-contents")
      .send({ subject: "Matemática", topic: "Turma vazia", classIds: [] })
    expect(turmaVazia.status).toBe(400)
  })

  it("o reforço sobrevive ao professor desativado (teacherId é só referência, sem FK)", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const coord = await loginAgent(app, USERS.juliana.email)
    const id = await criarReforco(marcelo, { classIds: ["c1"], topic: "Revolução Franceza" })
    await marcelo
      .post(`/api/study-contents/${id}/attachments`)
      .attach("attachments", PNG, "cronologia.png")

    // O professor sai da escola: `active = 0` (RN01 — ele nem entra mais).
    getDb().prepare("UPDATE users SET active = 0 WHERE id = ?").run(USERS.marcelo.id)

    const res = await coord.get(`/api/study-contents/${id}`)
    expect(res.status).toBe(200)
    expect(res.body.data.teacherId, "o reforço perdeu o autor").toBe(USERS.marcelo.id)
    expect(res.body.data.attachments).toHaveLength(1)
    // E a coordenação ainda consegue apagar o reforço de quem não está mais.
    expect((await coord.delete(`/api/study-contents/${id}`)).status).toBe(200)
  })

  // ─── Edição e exclusão: só o dono (coordenação, qualquer um) ───────────────

  it("PATCH: o dono edita, o colega de turma não, a coordenação edita qualquer um", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const sandra = await loginAgent(app, USERS.sandra.email)
    const coord = await loginAgent(app, USERS.juliana.email)
    const id = await criarReforco(marcelo, { classIds: ["c2"], topic: "Probabilidade" })

    const denied = await sandra.patch(`/api/study-contents/${id}`).send({ topic: "Título roubado" })
    expect(denied.status).toBe(403)
    expect(
      ((await coord.get("/api/study-contents")).body.data as Array<{ topic: string }>).map((c) => c.topic),
    ).toContain("Probabilidade")

    const edited = await marcelo
      .patch(`/api/study-contents/${id}`)
      .send({ topic: "Probabilidade II", points: 8, questions: ["Dado duplo sorteia 2 bolas."] })
    expect(edited.status).toBe(200)
    expect(edited.body.data.topic).toBe("Probabilidade II")
    expect(edited.body.data.points).toBe(8)
    // O `.partial()` preserva o que não veio no corpo (mesma semântica do
    // `lateWindowDays` na 2.2).
    expect(edited.body.data.content).toBe("Aula 1: 1/2 = 2/4.")
    expect(edited.body.data.questions).toEqual(["Dado duplo sorteia 2 bolas."])
    expect(edited.body.data.teacherId).toBe(USERS.marcelo.id)

    const byCoord = await coord.patch(`/api/study-contents/${id}`).send({ exercises: 9 })
    expect(byCoord.status).toBe(200)
    expect(byCoord.body.data.exercises).toBe(9)
    expect(byCoord.body.data.points).toBe(8) // preservado

    // Campo fora do contrato é recusado (`.strict()`).
    expect((await marcelo.patch(`/api/study-contents/${id}`).send({ author: "x" })).status).toBe(400)
  })

  it("DELETE sem conclusão remove (anexos em cascata); com conclusão é 409, nunca 500", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const ana = await loginAgent(app, USERS.ana.email)
    const coord = await loginAgent(app, USERS.juliana.email)
    const id = await criarReforco(marcelo, { classIds: ["c1"] })

    const upload = await marcelo
      .post(`/api/study-contents/${id}/attachments`)
      .attach("attachments", PNG, "figura.png")
    expect(upload.status).toBe(201)
    expect(count(getDb(), "study_content_attachments")).toBe(1)
    const storedDaBloqueada = (upload.body.data[0] as { storedName: string }).storedName

    // Concluído: remover tiraria de baixo dos pontos já creditados.
    expect((await ana.post(`/api/study-contents/${id}/complete`)).status).toBe(201)
    const blocked = await marcelo.delete(`/api/study-contents/${id}`)
    expect(blocked.status).toBe(409)
    expect(blocked.body.details).toBe("CONTENT_HAS_COMPLETIONS")
    expect(blocked.body.error).toContain("já foi concluído")
    // A linha continua lá (o 409 não remove nada por baixo dos panos).
    expect(
      ((await coord.get("/api/study-contents")).body.data as Array<{ id: string }>).map((c) => c.id),
    ).toContain(id)
    expect(
      fs.existsSync(path.join(config.uploadsDir, storedDaBloqueada)),
      "o 409 não pode apagar o material do reforço",
    ).toBe(true)

    // Sem conclusão: some de verdade, e o anexo vai junto (ON DELETE CASCADE).
    const outra = await criarReforco(marcelo, { classIds: ["c1"], topic: "Geometria" })
    const anexo = await marcelo
      .post(`/api/study-contents/${outra}/attachments`)
      .attach("attachments", PDF, "aula.pdf")
    expect(anexo.status).toBe(201)
    const storedRemovido = (anexo.body.data[0] as { storedName: string }).storedName
    const removido = await marcelo.delete(`/api/study-contents/${outra}`)
    expect(removido.status).toBe(200)
    expect(removido.body.data).toEqual({ ok: true })

    const db = getDb()
    expect(
      ((await coord.get("/api/study-contents")).body.data as Array<{ id: string }>).map((c) => c.id),
    ).not.toContain(outra)
    const restantes = db
      .prepare("SELECT studyContentId FROM study_content_attachments")
      .all() as Array<{ studyContentId: string }>
    expect(restantes.map((r) => r.studyContentId)).toEqual([id])
    // O byte some junto com o metadado: sem linha e sem arquivo, nada fica órfão
    // em `uploadsDir` (e sem metadado o `/uploads/:storedName` já daria 404).
    expect(
      fs.existsSync(path.join(config.uploadsDir, storedRemovido)),
      "o arquivo do reforço removido ficou no disco",
    ).toBe(false)

    const audit = (await coord.get("/api/audit?action=CONTENT_DELETED")).body.data as Array<{
      entityId: string
    }>
    expect(audit.some((l) => l.entityId === outra)).toBe(true)
  })

  it("apagar o reforço não leva o byte de um anexo de ENTREGA com o mesmo nome", async () => {
    // Colisão entre tabelas: o UNIQUE de `storedName` é POR TABELA, então o mesmo
    // nome pode ser anexo de entrega e anexo de reforço ao mesmo tempo (o
    // `/uploads` trata esse estado como 404 para todo mundo). Apagar o reforço
    // NÃO pode apagar o byte de uma evidência viva — perda irreversível.
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const id = await criarReforco(marcelo, { classIds: ["c1"] })
    const upload = await marcelo
      .post(`/api/study-contents/${id}/attachments`)
      .attach("attachments", PNG, "compartilhado.png")
    expect(upload.status).toBe(201)
    const storedName = (upload.body.data[0] as { storedName: string }).storedName

    // Mesma evidência referenciada por uma entrega viva da Ana (plantada sobre
    // atividade/entrega reais — as duas tabelas têm FK).
    const db = getDb()
    createActivity(db, {
      id: "a-colide",
      title: "Atividade da colisão",
      classId: "c1",
      teacherId: USERS.marcelo.id,
    })
    createSubmission(db, {
      id: "sub-colide",
      activityId: "a-colide",
      studentId: USERS.ana.id,
      status: "submitted",
    })
    db.prepare(
      `INSERT INTO attachments (id, submissionId, filename, storedName, mimeType, size, uploadedAt)
       VALUES ('att-colide', 'sub-colide', 'compartilhado.png', ?, 'image/png', 12, '01/09/2026')`,
    ).run(storedName)

    const removido = await marcelo.delete(`/api/study-contents/${id}`)
    expect(removido.status).toBe(200)
    // O metadado do reforço foi (CASCADE)…
    expect(count(db, "study_content_attachments"), "metadado do reforço sobrou").toBe(0)
    // …o da entrega continua…
    expect(count(db, "attachments"), "a evidência da entrega foi apagada junto").toBe(1)
    // …e o byte NÃO some, porque ainda é referência viva.
    expect(
      fs.existsSync(path.join(config.uploadsDir, storedName)),
      "apagar o reforço destruiu a evidência de uma entrega viva",
    ).toBe(true)
  })

  it("reenvio de entrega não apaga o byte de um anexo do REFORÇO com o mesmo nome", async () => {
    // O caminho espelho: agora é a remoção do anexo antigo da entrega (reenvio
    // depois de correção pedida) que roda o unlink. Mesmo com o nome ocupado
    // pelo material do reforço, o byte do reforço sobrevive.
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const ana = await loginAgent(app, USERS.ana.email)
    const db = getDb()
    const id = await criarReforco(marcelo, { classIds: ["c1"] })
    const upload = await marcelo
      .post(`/api/study-contents/${id}/attachments`)
      .attach("attachments", PNG, "material.png")
    expect(upload.status).toBe(201)
    const storedName = (upload.body.data[0] as { storedName: string }).storedName

    createActivity(db, {
      id: "a-reuso",
      title: "Atividade do reuso",
      classId: "c1",
      teacherId: USERS.marcelo.id,
    })
    const sub = createSubmission(db, {
      id: "sub-reuso",
      activityId: "a-reuso",
      studentId: USERS.ana.id,
      status: "revision_required",
      feedback: "reenvie com o arquivo certo",
    })
    db.prepare(
      `INSERT INTO attachments (id, submissionId, filename, storedName, mimeType, size, uploadedAt)
       VALUES ('att-reuso', ?, 'evidencia.png', ?, 'image/png', 12, '01/09/2026')`,
    ).run(sub, storedName)

    const reenvio = await ana
      .post("/api/activities/a-reuso/submissions")
      .field("comment", "versão 2")
      .attach("attachments", PNG, "nova.png")
    expect(reenvio.status).toBe(201)
    // O anexo antigo saiu do banco…
    expect(count(db, "attachments")).toBe(1)
    // …e o material do reforço, que ocupa o mesmo nome, continua no disco — e,
    // com a linha da entrega já removida, o nome deixou de ser ambíguo: o dono
    // volta a conseguir baixar o material.
    expect(
      fs.existsSync(path.join(config.uploadsDir, storedName)),
      "o reenvio apagou o material do reforço",
    ).toBe(true)
    expect(
      (await marcelo.get(`/uploads/${storedName}`)).status,
      "o material do reforço preservado ficou ilegível para o dono",
    ).toBe(200)
  })

  it("DELETE por terceiro é 403; conteúdo inexistente é 404", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const sandra = await loginAgent(app, USERS.sandra.email)
    const id = await criarReforco(marcelo, { classIds: ["c2"] })
    expect((await sandra.delete(`/api/study-contents/${id}`)).status).toBe(403)
    expect((await marcelo.delete("/api/study-contents/sc-inexistente")).status).toBe(404)
    // PATCH e DELETE passam pelo MESMO `loadContentOr404` (item 2 da revisão):
    // o 404 do PATCH é o mesmo contrato, não uma cópia só do DELETE.
    expect((await marcelo.patch("/api/study-contents/sc-inexistente").send({ topic: "x" })).status).toBe(404)
    expect((await sandra.patch(`/api/study-contents/${id}`).send({ topic: "x" })).status).toBe(403)
  })

  // ─── Pertinência da conclusão ─────────────────────────────────────────────

  it("aluno de fora das turmas do reforço não conclui (403 + auditoria)", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const fernanda = await loginAgent(app, USERS.fernanda.email) // c3
    const coord = await loginAgent(app, USERS.juliana.email)
    const id = await criarReforco(marcelo, { classIds: ["c1"], points: 5 })

    const denied = await fernanda.post(`/api/study-contents/${id}/complete`)
    expect(denied.status).toBe(403)
    expect(denied.body.details).toBe("NOT_IN_CLASS")
    expect(count(getDb(), "study_content_completions")).toBe(0)

    const negadas = (await coord.get("/api/audit?action=ACCESS_DENIED")).body.data as Array<{
      userId: string
      entityId: string
    }>
    expect(negadas.some((l) => l.userId === USERS.fernanda.id && l.entityId.includes(id))).toBe(true)
  })

  it("só aluno conclui: professor,staff e coordenação recebem 403", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const id = await criarReforco(marcelo, { classIds: ["c1"] })
    for (const user of [USERS.marcelo, USERS.carlos, USERS.juliana]) {
      const agent = await loginAgent(app, user.email)
      expect((await agent.post(`/api/study-contents/${id}/complete`)).status, `papel ${user.role}`).toBe(403)
    }
    expect(count(getDb(), "study_content_completions")).toBe(0)
  })

  it("pontuação zero não existe: recusada no schema e na conclusão de reforço legado", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const ana = await loginAgent(app, USERS.ana.email)
    // 1) Criar com 0 pontos é recusado (Zod → 400) e nada é gravado.
    const criado = await marcelo
      .post("/api/study-contents")
      .send({ subject: "Matemática", topic: "Reforço de 0", classIds: ["c1"], points: 0 })
    expect(criado.status).toBe(400)
    expect(count(getDb(), "studyContents")).toBe(0)

    const id = await criarReforco(marcelo, { classIds: ["c1"] })
    // 2) PATCH com 0 também é recusado.
    expect((await marcelo.patch(`/api/study-contents/${id}`).send({ points: 0 })).status).toBe(400)

    // 3) Reforço legado com 0 pontos (plantado direto no banco, como a 004
    // plantou): a conclusão é 422 e — o que importa — NÃO consome o slot único
    // da conclusão, que hoje travaria o crédito se o professor subisse para 5.
    getDb().prepare("UPDATE studyContents SET points = 0 WHERE id = ?").run(id)
    const res = await ana.post(`/api/study-contents/${id}/complete`)
    expect(res.status).toBe(422)
    expect(res.body.details).toBe("INVALID_CONTENT_POINTS")
    expect(count(getDb(), "study_content_completions"), "conclusão com 0 pontos foi gravada").toBe(0)
    expect(count(getDb(), "transactions"), "transação de amount 0 foi gravada").toBe(0)

    // 4) Corrigido para 5, o mesmo aluno recebe o crédito: o slot segue livre.
    getDb().prepare("UPDATE studyContents SET points = 5 WHERE id = ?").run(id)
    expect((await ana.post(`/api/study-contents/${id}/complete`)).status).toBe(201)
    expect(await saldoDe(ana, USERS.ana.id)).toBe(5)
  })

  it("concluir reforço que cruza a faixa de nível celebra (RF07: LEVEL_UP + notificação)", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const ana = await loginAgent(app, USERS.ana.email) // Bronze, saldo 0
    const coord = await loginAgent(app, USERS.juliana.email)
    const id = await criarReforco(marcelo, { classIds: ["c1"], points: 100 })
    expect(await saldoDe(ana, USERS.ana.id)).toBe(0)

    const res = await ana.post(`/api/study-contents/${id}/complete`)
    expect(res.status).toBe(201)
    expect(await saldoDe(ana, USERS.ana.id)).toBe(100)

    const notificacoes = (await ana.get("/api/notifications")).body.data as Array<{ title: string }>
    expect(
      notificacoes.some((n) => n.title.includes("Você subiu para") && n.title.includes("Prata")),
      `notificação de LEVEL_UP ausente: ${JSON.stringify(notificacoes.map((n) => n.title))}`,
    ).toBe(true)
    const audit = (await coord.get("/api/audit?action=LEVEL_UP")).body.data as Array<{ description: string }>
    expect(audit.some((l) => l.description.includes("Ana")), "auditoria LEVEL_UP ausente").toBe(true)
  })

  // ─── Anexos do reforço (R27/R28) ──────────────────────────────────────────

  it("upload de anexo do reforço: só o dono, staff e coordenação", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const sandra = await loginAgent(app, USERS.sandra.email)
    const ana = await loginAgent(app, USERS.ana.email)
    const carlos = await loginAgent(app, USERS.carlos.email)
    const coord = await loginAgent(app, USERS.juliana.email)
    const id = await criarReforco(marcelo, { classIds: ["c2"] })

    const doDono = await marcelo
      .post(`/api/study-contents/${id}/attachments`)
      .attach("attachments", PNG, "figura.png")
    expect(doDono.status).toBe(201)
    const anexo = doDono.body.data[0] as { id: string; filename: string; mimeType: string }
    expect(anexo.filename).toBe("figura.png")
    expect(anexo.mimeType).toBe("image/png") // mime VERIFICADO por magic bytes

    // PDF entra com o mime verificado também.
    const coordUpload = await coord
      .post(`/api/study-contents/${id}/attachments`)
      .attach("attachments", PDF, "aula.pdf")
    expect(coordUpload.status).toBe(201)
    expect((coordUpload.body.data[0] as { mimeType: string }).mimeType).toBe("application/pdf")

    // A tabela nova é a de anexo do reforço (R28), e o conteúdo carrega os dois.
    // A lista é indexada pelo ID, não por posição: a ordem/`[0]` depende de qual
    // reforço de Matemática existe no banco e quebra por motivo errado.
    expect(count(getDb(), "attachments")).toBe(0)
    const listagem = (await marcelo.get("/api/study-contents?subject=Matemática")).body.data as Array<{
      id: string
      attachments: Array<{ id: string }>
    }>
    const proprio = listagem.find((c) => c.id === id)
    expect(proprio, `reforço ${id} não apareceu na listagem do dono`).toBeDefined()
    expect(proprio?.attachments.map((a) => a.id)).toEqual([
      anexo.id,
      (coordUpload.body.data[0] as { id: string }).id,
    ])

    // Aluno nunca anexa; colega de turma também não.
    expect(
      (await ana.post(`/api/study-contents/${id}/attachments`).attach("attachments", PNG, "chega.png")).status,
    ).toBe(403)
    expect(
      (await sandra.post(`/api/study-contents/${id}/attachments`).attach("attachments", PNG, "chega.png")).status,
    ).toBe(403)
    // Funcionário prepara material de qualquer reforço (decisão explícita, ver relatório).
    expect(
      (await carlos.post(`/api/study-contents/${id}/attachments`).attach("attachments", PNG, "funcao.png")).status,
    ).toBe(201)
    // Conteúdo inexistente: 404 antes de gravar qualquer arquivo.
    expect(
      (await marcelo.post("/api/study-contents/sc-nao-existe/attachments").attach("attachments", PNG, "x.png")).status,
    ).toBe(404)
  })

  it("arquivo do reforço: aluno da turma e o dono baixam; colega e aluno de fora, 403", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const sandra = await loginAgent(app, USERS.sandra.email)
    const ana = await loginAgent(app, USERS.ana.email) // c1
    const fernanda = await loginAgent(app, USERS.fernanda.email) // c3
    const carlos = await loginAgent(app, USERS.carlos.email)
    const coord = await loginAgent(app, USERS.juliana.email)
    // c2 é turma dos DOIS (u6 e u7 em teacherIds) — o cenário que a 2.5 montou
    // para o anexo de entrega e que aqui não pode vazar.
    const id = await criarReforco(marcelo, { classIds: ["c2"], topic: "Estatística" })
    const upload = await marcelo
      .post(`/api/study-contents/${id}/attachments`)
      .attach("attachments", PDF, "apostila.pdf")
    expect(upload.status).toBe(201)
    const storedName = (upload.body.data[0] as { storedName: string }).storedName

    const doDono = await marcelo.get(`/uploads/${storedName}`)
    expect(doDono.status).toBe(200)
    expect(doDono.body.toString("utf8")).toBe("%PDF-1.4\nreforco-escolar")
    expect(doDono.headers["x-content-type-options"]).toBe("nosniff")

    // Aluno da turma (c2 = Beatriz/Ricardo) baixa; aluna de outra turma, não.
    const beatriz = await loginAgent(app, USERS.beatriz.email)
    expect((await beatriz.get(`/uploads/${storedName}`)).status).toBe(200)
    expect((await ana.get(`/uploads/${storedName}`)).status).toBe(403)
    expect((await fernanda.get(`/uploads/${storedName}`)).status).toBe(403)

    // O colega de turma NÃO baixa: é o mesmo isolamento por dono da 2.5.
    expect((await sandra.get(`/uploads/${storedName}`)).status).toBe(403)
    // Staff e coordenação sim.
    expect((await carlos.get(`/uploads/${storedName}`)).status).toBe(200)
    expect((await coord.get(`/uploads/${storedName}`)).status).toBe(200)

    const negadas = (await coord.get("/api/audit?action=ACCESS_DENIED")).body.data as Array<{
      userId: string
    }>
    expect(negadas.some((l) => l.userId === USERS.sandra.id)).toBe(true)
  })

  it("anexo do reforço respeita o limite de arquivos e o tipo real do conteúdo", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const id = await criarReforco(marcelo, { classIds: ["c1"] })
    const arquivosAntes = fs.readdirSync(config.uploadsDir)

    // 4 anexos: o `limits.files` do multer aborta DEPOIS de gravar o 3º no
    // `uploadsDir` e o `handle` da rota não roda nesse caminho — o `cleanup`
    // dele não pode ser o responsável por deixar a pasta como estava.
    const muitos = marcelo.post(`/api/study-contents/${id}/attachments`)
    for (let i = 0; i < 4; i++) muitos.attach("attachments", PNG, `f${i}.png`)
    expect((await muitos).status).toBe(422)
    expect(fs.readdirSync(config.uploadsDir), "byte órfão do lote acima do limite").toEqual(arquivosAntes)

    const disfarce = await marcelo
      .post(`/api/study-contents/${id}/attachments`)
      .attach("attachments", Buffer.from("MZ..."), "virus.pdf")
    expect(disfarce.status).toBe(422)
    expect(disfarce.body.details).toBe("INVALID_FILE_CONTENT")
    expect(count(getDb(), "study_content_attachments")).toBe(0)
    expect(fs.readdirSync(config.uploadsDir), "byte órfão do disfarce").toEqual(arquivosAntes)
  })

  it("anexo rejeitado no meio do lote não deixa metadados nem arquivo órfão", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const id = await criarReforco(marcelo, { classIds: ["c1"] })
    const antes = count(getDb(), "study_content_attachments")
    // A pasta de uploads é a do arquivo de teste (`setup-env.ts` cria um tmpdir
    // por worker), então contar arquivos aqui não é misturado com outro teste.
    const arquivosAntes = fs.readdirSync(config.uploadsDir)

    const res = await marcelo
      .post(`/api/study-contents/${id}/attachments`)
      .attach("attachments", PNG, "boa.png")
      .attach("attachments", Buffer.from("nao-e-imagem"), "ruim.png")

    expect(res.status).toBe(422)
    expect(count(getDb(), "study_content_attachments"), "metadado órfão no banco").toBe(antes)
    expect(fs.readdirSync(config.uploadsDir), "byte órfão no storage").toEqual(arquivosAntes)
  })

  // ─── Leitura ─────────────────────────────────────────────────────────────

  it("GET /:id entrega o reforço com os anexos na ordem do upload; id desconhecido é 404", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const ana = await loginAgent(app, USERS.ana.email)
    const id = await criarReforco(marcelo, { classIds: ["c1"], topic: "Potências" })
    await marcelo
      .post(`/api/study-contents/${id}/attachments`)
      .attach("attachments", PNG, "quadro.png")
    await marcelo
      .post(`/api/study-contents/${id}/attachments`)
      .attach("attachments", PDF, "gabarito.pdf")

    const res = await ana.get(`/api/study-contents/${id}`)
    expect(res.status).toBe(200)
    expect(res.body.data.topic).toBe("Potências")
    expect(
      (res.body.data.attachments as Array<{ filename: string; mimeType: string }>).map((a) => [
        a.filename,
        a.mimeType,
      ]),
    ).toEqual([
      ["quadro.png", "image/png"],
      ["gabarito.pdf", "application/pdf"],
    ])

    const sumido = await ana.get("/api/study-contents/sc-nao-existe")
    expect(sumido.status).toBe(404)
    expect(sumido.body.details).toBe("CONTENT_NOT_FOUND")
  })

  it("storedName ambíguo (mesmo nome em anexo de entrega e de reforço) é 404 para todo mundo", async () => {
    // O UNIQUE de `storedName` é por tabela: com os dois lados ocupados, a rota
    // recusa o arquivo em vez de servir o primeiro que aparecer.
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const ana = await loginAgent(app, USERS.ana.email)
    const coord = await loginAgent(app, USERS.juliana.email)
    const id = await criarReforco(marcelo, { classIds: ["c1"] })
    const upload = await marcelo
      .post(`/api/study-contents/${id}/attachments`)
      .attach("attachments", PNG, "ambiguo.png")
    expect(upload.status).toBe(201)
    const storedName = (upload.body.data[0] as { storedName: string }).storedName

    // Injeção de falha: o mesmo nome de storage em uma entrega (a tabela de
    // entrega permite — o UNIQUE dela não vê a tabela do reforço).
    //
    // A entrega é plantada pelos fixtures locais sobre uma atividade REAL: com
    // `PRAGMA foreign_keys` ligado (o padrão do banco de teste), `submissions
    // .activityId` é FK para `activities(id)` e uma atividade inventada seria
    // recusada no INSERT — antes de o teste chegar à asserção.
    //
    // A conclusão da Ana também é plantada: o 404 do arquivo ambíguo não pode
    // depender do estado do reforço (concluído ou não), então o cenário é o
    // mais carregado possível dos dois lados.
    const db = getDb()
    db.prepare(
      `INSERT INTO study_content_completions (id, studentId, studyContentId, completedAt) VALUES (?, ?, ?, ?)`,
    ).run("scc-amb", USERS.ana.id, id, "01/09/2026")
    createActivity(db, {
      id: "a-amb",
      title: "Revisão que rende o anexo ambíguo",
      classId: "c1",
      teacherId: USERS.marcelo.id,
    })
    createSubmission(db, {
      id: "sub-amb",
      activityId: "a-amb",
      studentId: USERS.ana.id,
      status: "submitted",
    })
    db.prepare(
      `INSERT INTO attachments (id, submissionId, filename, storedName, mimeType, size, uploadedAt)
       VALUES ('att-amb', 'sub-amb', 'ambiguo.png', ?, 'image/png', 10, '01/09/2026')`,
    ).run(storedName)

    // Autorizado dos dois lados (ana é aluna da c1 e autora da entrega) e ainda
    // assim 404: arquivo ambíguo não é servido para ninguém.
    expect((await ana.get(`/uploads/${storedName}`)).status).toBe(404)
    expect((await coord.get(`/uploads/${storedName}`)).status).toBe(404)
  })

  it("a query de anexo do reforço devolve só os nomes DELE (seam do DELETE)", async () => {
    // A limpeza de byte depende desta query: se ela devolvesse os nomes de
    // qualquer reforço, o DELETE de um conteúdo passaria aafé mexer no material
    // dos outros (o teste de DELETE não pegaria, porque a guarda de colisão
    // protegeria o arquivo vizinho por outro motivo).
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const primeiro = await criarReforco(marcelo, { classIds: ["c1"], topic: "Álgebra" })
    const segundo = await criarReforco(marcelo, { classIds: ["c1"], topic: "Geometria" })
    const doPrimeiro = await marcelo
      .post(`/api/study-contents/${primeiro}/attachments`)
      .attach("attachments", PNG, "um.png")
    const doSegundo = await marcelo
      .post(`/api/study-contents/${segundo}/attachments`)
      .attach("attachments", PDF, "dois.pdf")
    expect(doPrimeiro.status).toBe(201)
    expect(doSegundo.status).toBe(201)
    const nome1 = (doPrimeiro.body.data[0] as { storedName: string }).storedName
    const nome2 = (doSegundo.body.data[0] as { storedName: string }).storedName

    const db = getDb()
    expect(listAttachmentStoredNamesForStudyContent(db, primeiro)).toEqual([nome1])
    expect(listAttachmentStoredNamesForStudyContent(db, segundo)).toEqual([nome2])
    expect(listAttachmentStoredNamesForStudyContent(db, "sc-inexistente")).toEqual([])
  })

  it("GET / e GET /:id são escopados: aluno só das turmas dele, professor só o dele, coordenação tudo", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const sandra = await loginAgent(app, USERS.sandra.email)
    const ana = await loginAgent(app, USERS.ana.email) // c1
    const fernanda = await loginAgent(app, USERS.fernanda.email) // c3
    const coord = await loginAgent(app, USERS.juliana.email)
    const matematica = await criarReforco(marcelo, { classIds: ["c1"], topic: "Geometria plana" })
    const historia = await sandra.post("/api/study-contents").send({
      subject: "História",
      topic: "Era Vargas",
      classIds: ["c3"],
    })
    expect(historia.status).toBe(201)
    const historiaId = historia.body.data.id as string
    await marcelo
      .post(`/api/study-contents/${matematica}/attachments`)
      .attach("attachments", PNG, "triangulo.png")

    interface Listagem {
      id: string
      topic: string
      attachments: Array<{ filename: string; mimeType: string }>
    }
    const topicos = async (agent: Agent): Promise<string[]> =>
      ((await agent.get("/api/study-contents")).body.data as Listagem[]).map((c) => c.topic).sort()

    // Aluno da c1: o reforço da c1 vem COM o anexo (mime verificado)…
    const daAna = (await ana.get("/api/study-contents")).body.data as Listagem[]
    expect(daAna.map((c) => c.topic), "a aluna da c1 não pode ver o reforço da c3").toEqual([
      "Geometria plana",
    ])
    expect(daAna[0].attachments.map((a) => [a.filename, a.mimeType])).toEqual([["triangulo.png", "image/png"]])

    // …e o da c3 NÃO aparece — nem na listagem, nem por `?subject`, nem no
    // `GET /:id` (que entregaria a lição inteira e a lista de anexos).
    expect(await topicos(fernanda), "a aluna da c3 vê o próprio e não o da c1").toEqual(["Era Vargas"])
    expect((await ana.get("/api/study-contents?subject=História")).body.data).toEqual([])
    const negado = await ana.get(`/api/study-contents/${historiaId}`)
    expect(negado.status, "GET /:id escopado por turma").toBe(403)

    // Professor: só o próprio. Coordenação: todos (a lista global que ela usa na
    // lixeira/admin continua igual).
    expect(await topicos(marcelo)).toEqual(["Geometria plana"])
    expect(await topicos(sandra)).toEqual(["Era Vargas"])
    expect(await topicos(coord)).toEqual(["Era Vargas", "Geometria plana"])
    // A aluna da c1 enxerga o `GET /:id` do reforço dela (o filtro não pode
    // trancar o conteúdo que é dela).
    expect((await ana.get(`/api/study-contents/${matematica}`)).status).toBe(200)

    // A negação do `GET /:id` fica auditada (RN06).
    const negadas = (await coord.get("/api/audit?action=ACCESS_DENIED")).body.data as Array<{
      userId: string
      entityId: string
    }>
    expect(negadas.some((l) => l.userId === USERS.ana.id && l.entityId.includes(historiaId))).toBe(true)
  })

  it("GET filtra por disciplina e devolve o reforço sem anexo com a lista vazia", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const ana = await loginAgent(app, USERS.ana.email)
    const matematica = await criarReforco(marcelo, { classIds: ["c1"], topic: "Geometria plana" })
    await marcelo
      .post(`/api/study-contents/${matematica}/attachments`)
      .attach("attachments", PNG, "triangulo.png")

    const filtradas = (await ana.get("/api/study-contents?subject=Matemática")).body.data as Array<{
      topic: string
      attachments: Array<{ filename: string; mimeType: string }>
    }>
    expect(filtradas).toHaveLength(1)
    const comAnexo = filtradas.find((c) => c.topic === "Geometria plana")
    expect(comAnexo?.attachments.map((a) => a.filename)).toEqual(["triangulo.png"])
    // Disciplina que não é da aluna: lista vazia, e nunca um item sem o campo.
    expect((await ana.get("/api/study-contents?subject=Geografia")).body.data).toEqual([])
  })

  // ─── R31: o estado de conclusão na LEITURA (quem já concluiu, sem clicar) ────

  /**
   * Antes do R31 a leitura não dizia nada sobre conclusão: o cliente só descobria
   * que já tinha concluído clicando e levando 409. Estes testes plantam a linha de
   * `study_content_completions` (ou usam o `POST /complete` de outro aluno) SEM
   * passar pela tela — é assim que a lacuna aparece depois de um F5.
   */
  function plantarConclusao(
    studentId: string,
    studyContentId: string,
    completedAt = "28/09/2026, 20:15:00",
  ): void {
    getDb()
      .prepare(
        "INSERT INTO study_content_completions (id, studentId, studyContentId, completedAt) VALUES (?, ?, ?, ?)",
      )
      .run(`scc-${studentId}-${studyContentId}`, studentId, studyContentId, completedAt)
  }

  const listagemDaAna = async (agent: Agent) =>
    (await agent.get("/api/study-contents")).body.data as StudentStudyContent[]

  it("leitura do aluno traz a conclusão DELE, plantada antes do load (nenhum POST)", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const ana = await loginAgent(app, USERS.ana.email)
    const id = await criarReforco(marcelo, { classIds: ["c1"] })
    plantarConclusao(USERS.ana.id, id)
    const saldoAntes = await saldoDe(ana, USERS.ana.id)

    // A lista…
    const lista = await listagemDaAna(ana)
    expect(lista.find((c) => c.id === id)?.completedAt, "a listagem não traz a conclusão da aluna").toBe(
      "28/09/2026, 20:15:00",
    )
    // …e o detalhe, que é a outra leitura de reforço.
    const detalhe = (await ana.get(`/api/study-contents/${id}`)).body.data as StudentStudyContent
    expect(detalhe.completedAt).toBe("28/09/2026, 20:15:00")

    // Ler não é concluir: nenhum ponto novo (o crédito foi do POST, do dia 28).
    expect(await saldoDe(ana, USERS.ana.id)).toBe(saldoAntes)
  })

  it("reforço não concluído pelo aluno vem com completedAt: null (o campo existe)", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const ana = await loginAgent(app, USERS.ana.email)
    const id = await criarReforco(marcelo, { classIds: ["c1"] })

    const proprio = (await listagemDaAna(ana)).find((c) => c.id === id)
    expect(proprio, "o reforço sumiu da listagem").toBeDefined()
    // `null` e não "campo ausente": o client é obrigado a tratar os dois casos.
    expect(Object.prototype.hasOwnProperty.call(proprio, "completedAt")).toBe(true)
    expect(proprio?.completedAt).toBeNull()
  })

  it("a conclusão de um aluno NÃO vaza para o colega de turma", async () => {
    // Ana e Mateus estão os dois na c1 e veem o MESMO reforço: o estado é por
    // aluno, então o que a Ana concluiu é invisible para o Mateus (e vice-versa).
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const ana = await loginAgent(app, USERS.ana.email)
    const mateus = await loginAgent(app, USERS.mateus.email)
    const id = await criarReforco(marcelo, { classIds: ["c1"] })

    expect((await ana.post(`/api/study-contents/${id}/complete`)).status).toBe(201)

    const daAna = await listagemDaAna(ana)
    const doMateus = await listagemDaAna(mateus)
    expect(daAna.find((c) => c.id === id)?.completedAt).not.toBeNull()
    expect(doMateus.find((c) => c.id === id)?.completedAt, "o Mateus viu a conclusão da Ana").toBeNull()

    const detalheDoMateus = (await mateus.get(`/api/study-contents/${id}`)).body.data as StudentStudyContent
    expect(detalheDoMateus.completedAt).toBeNull()
  })

  it("a listagem resolve o estado de TODOS os reforços da página numa consulta só (sem N+1)", async () => {
    // Três reforços na mesma turma, dois já concluídos pela Ana em sessões
    // diferentes: é o caso em que uma query-por-reforço que só funciona com um
    // item passa despercebida, então a contagem de queries é aferida também.
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const ana = await loginAgent(app, USERS.ana.email)
    const primeiro = await criarReforco(marcelo, { classIds: ["c1"], topic: "Álgebra" })
    const segundo = await criarReforco(marcelo, { classIds: ["c1"], topic: "Geometria" })
    const terceiro = await criarReforco(marcelo, { classIds: ["c1"], topic: "Estatística" })

    expect((await ana.post(`/api/study-contents/${primeiro}/complete`)).status).toBe(201)
    plantarConclusao(USERS.ana.id, segundo, "20/09/2026, 08:30:00")

    const db = getDb()
    const prepareOriginal = db.prepare
    let consultas = 0
    db.prepare = ((sql: string) => {
      if (sql.includes("study_content_completions")) consultas += 1
      return prepareOriginal.call(db, sql)
    }) as typeof db.prepare

    let lista: StudentStudyContent[]
    try {
      lista = await listagemDaAna(ana)
    } finally {
      db.prepare = prepareOriginal
    }

    const estado = (topic: string) => lista.find((c) => c.topic === topic)?.completedAt
    expect(lista, "a Ana não vê os três reforços da c1").toHaveLength(3)
    expect(estado("Álgebra"), "conclusão do POST /complete não apareceu").not.toBeNull()
    expect(estado("Geometria"), "conclusão plantada do segundo reforço não apareceu").toBe("20/09/2026, 08:30:00")
    expect(estado("Estatística"), "reforço não concluído veio como concluído").toBeNull()
    expect(consultas, "a listagem abriu uma consulta por reforço (N+1)").toBe(1)
  })

  it("professor, funcionário e coordenação recebem o reforço SEM o campo de conclusão", async () => {
    // Para quem não conclui, o campo não tem significado: `null` seria lido como
    // "ninguém concluiu", que é afirmação que a rota não pode fazer. O campo é
    // omitido — e o tipo compartilhado diz isso (StudyContent sem `completedAt`).
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const ana = await loginAgent(app, USERS.ana.email)
    const carlos = await loginAgent(app, USERS.carlos.email)
    const coord = await loginAgent(app, USERS.juliana.email)
    const id = await criarReforco(marcelo, { classIds: ["c1"] })
    expect((await ana.post(`/api/study-contents/${id}/complete`)).status).toBe(201)

    for (const [papel, agent] of [
      ["professor", marcelo],
      ["funcionário", carlos],
      ["coordenação", coord],
    ] as const) {
      const lista = (await agent.get("/api/study-contents")).body.data as StudyContent[]
      const proprio = lista.find((c) => c.id === id)
      expect(proprio, `${papel}: o reforço sumiu da listagem`).toBeDefined()
      expect(
        Object.prototype.hasOwnProperty.call(proprio, "completedAt"),
        `${papel}: o campo de conclusão de terceiro não pode vir no payload`,
      ).toBe(false)

      const detalhe = (await agent.get(`/api/study-contents/${id}`)).body.data as StudyContent
      expect(Object.prototype.hasOwnProperty.call(detalhe, "completedAt"), `${papel}: detalhe com o campo`).toBe(
        false,
      )
    }
  })
})
