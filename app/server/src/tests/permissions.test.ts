import { describe, it, expect, beforeAll, beforeEach } from "vitest"
import { makeApp, prepareDb, loginAgent, USERS, brDateInDays } from "./helpers"
import { resetApiRateLimits } from "../auth/rateLimit"
import { getDb } from "../db/connection"
import type { Express } from "express"

describe("Matriz de permissões por papel (RF02, fase 3)", () => {
  let app: Express

  beforeAll(() => {
    prepareDb()
    app = makeApp()
  })

  it("professor cria atividade — aluno não pode", async () => {
    const student = await loginAgent(app, USERS.ana.email)
    const denied = await student.post("/api/activities").send({
      title: "Atividade inválida",
      subjectId: "s1",
      classId: "c1",
      points: 10,
      deadline: brDateInDays(10),
      type: "academic",
    })
    expect(denied.status).toBe(403)

    const teacher = await loginAgent(app, USERS.marcelo.email)
    const created = await teacher.post("/api/activities").send({
      title: "Novo Projeto de Gestão",
      description: "Apresentação final do projeto.",
      subjectId: "s3",
      classId: "c1",
      points: 30,
      deadline: brDateInDays(10),
      type: "academic",
      status: "draft",
    })
    expect(created.status).toBe(201)
    expect(created.body.data.teacherId).toBe(USERS.marcelo.id)
  })

  it("staff só cria tipos operacionais", async () => {
    const staff = await loginAgent(app, USERS.carlos.email)
    const forbidden = await staff.post("/api/activities").send({
      title: "Aula Academic Space",
      subjectId: "s1",
      classId: "c1",
      points: 10,
      deadline: brDateInDays(10),
      type: "academic",
    })
    expect(forbidden.status).toBe(422)

    const allowed = await staff.post("/api/activities").send({
      title: "Mutirão de limpeza",
      subjectId: "s6",
      classId: "c2",
      points: 10,
      deadline: brDateInDays(10),
      type: "school_action",
    })
    expect(allowed.status).toBe(201)
  })

  it("professor não edita atividade de outro professor", async () => {
    // A atividade é do Prof. Marcelo (u6); a Prof. Sandra (u7) tenta editar.
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const created = await marcelo.post("/api/activities").send({
      title: "Projeto do Marcelo",
      subjectId: "s2",
      classId: "c2",
      points: 10,
      deadline: brDateInDays(10),
      type: "academic",
      status: "draft",
    })
    expect(created.status).toBe(201)

    const sandra = await loginAgent(app, USERS.sandra.email)
    const res = await sandra
      .patch(`/api/activities/${created.body.data.id as string}`)
      .send({ title: "Mudança indevida" })
    expect(res.status).toBe(403)
  })

  it("coordenação/publicação: transição draft→active→closed permitida; backward bloqueada", async () => {
    const teacher = await loginAgent(app, USERS.marcelo.email)
    const draft = await teacher.post("/api/activities").send({
      title: "Atividade draft",
      subjectId: "s3",
      classId: "c1",
      points: 5,
      deadline: brDateInDays(11),
      type: "academic",
      status: "draft",
    })
    const id = draft.body.data.id

    const pub = await teacher.patch(`/api/activities/${id}/status`).send({ status: "active" })
    expect(pub.status).toBe(200)
    expect(pub.body.data.status).toBe("active")

    const close = await teacher.patch(`/api/activities/${id}/status`).send({ status: "closed" })
    expect(close.status).toBe(200)

    const rewind = await teacher.patch(`/api/activities/${id}/status`).send({ status: "active" })
    expect(rewind.status).toBe(422)
  })

  it("coordenação gerencia recompensas; aluno não", async () => {
    const student = await loginAgent(app, USERS.ana.email)
    const denied = await student.post("/api/rewards").send({
      label: "Prêmio Pirata",
      points: 10,
      stock: 1,
    })
    expect(denied.status).toBe(403)

    const coord = await loginAgent(app, USERS.juliana.email)
    const created = await coord.post("/api/rewards").send({
      label: "Café com coordenação",
      icon: "☕",
      points: 60,
      stock: 5,
    })
    expect(created.status).toBe(201)
  })

  it("bônus só pela coordenação", async () => {
    const student = await loginAgent(app, USERS.ana.email)
    const denied = await student.post("/api/points/bonus").send({
      studentId: USERS.ana.id,
      amount: 100,
      description: "auto-bônus",
    })
    expect(denied.status).toBe(403)

    const coord = await loginAgent(app, USERS.juliana.email)
    const ok = await coord.post("/api/points/bonus").send({
      studentId: USERS.ana.id,
      amount: 10,
      description: "Participação em feira",
    })
    expect(ok.status).toBe(201)
  })

  it("auditoria é exclusiva da coordenação; tentativa negada fica registrada (RN06)", async () => {
    const teacher = await loginAgent(app, USERS.marcelo.email)
    const denied = await teacher.get("/api/audit")
    expect(denied.status).toBe(403)

    const coord = await loginAgent(app, USERS.juliana.email)
    const res = await coord.get("/api/audit?action=ACCESS_DENIED")
    expect(res.status).toBe(200)
    const logs = res.body.data as Array<{ action: string; userId: string }>
    expect(logs.some((l) => l.action === "ACCESS_DENIED" && l.userId === USERS.marcelo.id)).toBe(true)
  })
})

/**
 * Isolamento por dono nas listagens (V3, Tarefa 2.5).
 *
 * Antes da 2.5 a lista do professor era `teacherId = user.id OR classId IN (...)`:
 * dois professores da MESMA turma enxergavam as atividades um do outro (e as
 * entregas delas). A regra do produto é isolamento por dono — professor e
 * funcionário veem só o que criaram; a coordenação vê tudo; o aluno continua
 * vendo as da própria turma.
 *
 * Cada teste monta o cenário pela HTTP (inclusive a exclusão lógica) e afirma
 * sobre a RESPOSTA, não sobre a query: quem aparece, quem não aparece e o que a
 * lixeira (`?deleted=true`) devolve para cada papel — o filtro de exclusão da 2.4
 * precisa sobreviver a este estreitamento (R5).
 */
describe("Isolamento por dono nas listagens (2.5)", () => {
  let app: Express
  type Agent = Awaited<ReturnType<typeof loginAgent>>

  beforeEach(() => {
    prepareDb()
    resetApiRateLimits()
    app = makeApp()
  })

  /** Cria atividade pela rota de criação e devolve o id. */
  async function criar(
    agent: Agent,
    over: {
      title: string
      classId?: string
      subjectId?: string
      type?: "academic" | "school_action"
      status?: "draft" | "active"
    },
  ): Promise<string> {
    const res = await agent.post("/api/activities").send({
      title: over.title,
      description: "Atividade do cenário de isolamento",
      subjectId: over.subjectId ?? "s2",
      classId: over.classId ?? "c2",
      points: 10,
      deadline: brDateInDays(10),
      type: over.type ?? "academic",
      status: over.status ?? "active",
    })
    expect(res.status, `criação de "${over.title}"`).toBe(201)
    return res.body.data.id as string
  }

  const ids = (body: unknown): string[] =>
    (body as { data: Array<{ id: string }> }).data.map((item) => item.id)

  // ─── Atividades ──────────────────────────────────────────────────────────────

  it("professor não vê atividades de outro professor na mesma turma, mas vê as próprias", async () => {
    // c2 é turma dos DOIS (u6 e u7 estão em teacherIds): o isolamento não pode
    // depender de eles estarem em turmas diferentes.
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const sandra = await loginAgent(app, USERS.sandra.email)
    const doMarcelo = await criar(marcelo, { title: "Balanço patrimonial — Marcelo" })
    const daSandra = await criar(sandra, { title: "Redação empresarial — Sandra" })

    const listaDaSandra = await sandra.get("/api/activities")
    expect(listaDaSandra.status).toBe(200)
    expect(ids(listaDaSandra.body), "atividade alheia da mesma turma fica invisível").not.toContain(doMarcelo)
    expect(ids(listaDaSandra.body), "a própria continua visível").toContain(daSandra)

    const listaDoMarcelo = await marcelo.get("/api/activities")
    expect(ids(listaDoMarcelo.body)).toContain(doMarcelo)
    expect(ids(listaDoMarcelo.body)).not.toContain(daSandra)

    // A coordenação é o papel de auditoria: enxerga as duas.
    const coord = await loginAgent(app, USERS.juliana.email)
    const listaDaCoord = await coord.get("/api/activities")
    expect(ids(listaDaCoord.body)).toEqual(expect.arrayContaining([doMarcelo, daSandra]))
  })

  it("detalhe de atividade de outro professor é 403 e fica na auditoria (RN06)", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const doMarcelo = await criar(marcelo, { title: "Projeto sigiloso do Marcelo" })

    const sandra = await loginAgent(app, USERS.sandra.email)
    const res = await sandra.get(`/api/activities/${doMarcelo}`)
    expect(res.status).toBe(403)

    const coord = await loginAgent(app, USERS.juliana.email)
    const negadas = (await coord.get("/api/audit?action=ACCESS_DENIED")).body.data as Array<{
      userId: string
      entity: string
      entityId: string
      description: string
    }>
    // `forbidAndAudit` grava a rota como entidade (o id da atividade fica no
    // caminho), então é o caminho + o autor que identificam a tentativa.
    const tentativa = negadas.find(
      (l) => l.userId === USERS.sandra.id && l.entityId.endsWith(doMarcelo),
    )
    expect(tentativa, "a tentativa negada fica registrada na auditoria").toBeDefined()
    expect(tentativa?.entity).toBe("Route")

    // O dono continua enxergando a própria atividade — o guard não pode ter
    // virado "ninguém vê atividade nenhuma".
    expect((await marcelo.get(`/api/activities/${doMarcelo}`)).status).toBe(200)
  })

  it("professor continua vendo as próprias atividades em qualquer turma em que atua", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    // O u6 atua nas três turmas (c1, c2, c3): a lista é o conjunto inteiro do
    // que ele criou, não o recorte de uma turma.
    const naC1 = await criar(marcelo, { title: "Revisão de Matemática — c1", classId: "c1" })
    const naC2 = await criar(marcelo, { title: "Contabilidade — c2", classId: "c2" })
    const naC3 = await criar(marcelo, { title: "Projeto integrador — c3", classId: "c3" })

    const lista = await marcelo.get("/api/activities")
    expect(ids(lista.body)).toEqual(expect.arrayContaining([naC1, naC2, naC3]))
  })

  it("funcionário vê só as próprias atividades; a coordenação vê as de todos", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const carlos = await loginAgent(app, USERS.carlos.email)
    const doProfessor = await criar(marcelo, { title: "Lista de exercícios", classId: "c1" })
    const daStaff = await criar(carlos, {
      title: "Mutirão de limpeza",
      classId: "c1",
      type: "school_action",
    })

    const listaDoStaff = await carlos.get("/api/activities")
    expect(listaDoStaff.status).toBe(200)
    expect(ids(listaDoStaff.body), "a própria ação escolar aparece").toContain(daStaff)
    expect(ids(listaDoStaff.body), "atividade do professor não aparece para o funcionário").not.toContain(doProfessor)

    // Detalhe segue a mesma regra: o funcionário não abre atividade alheia.
    expect((await carlos.get(`/api/activities/${doProfessor}`)).status).toBe(403)
    expect((await carlos.get(`/api/activities/${daStaff}`)).status).toBe(200)

    const coord = await loginAgent(app, USERS.juliana.email)
    const listaDaCoord = await coord.get("/api/activities")
    expect(ids(listaDaCoord.body)).toEqual(expect.arrayContaining([doProfessor, daStaff]))
  })

  it("aluno continua vendo as atividades da própria turma, de qualquer professor", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const naC1 = await criar(marcelo, { title: "Atividade da c1", classId: "c1" })
    const naC2 = await criar(marcelo, { title: "Atividade da c2", classId: "c2" })

    const ana = await loginAgent(app, USERS.ana.email)
    const lista = await ana.get("/api/activities")
    expect(lista.status).toBe(200)
    expect(ids(lista.body)).toContain(naC1)
    expect(ids(lista.body), "aluno não recebe atividade de outra turma").not.toContain(naC2)
  })

  // ─── Entregas ────────────────────────────────────────────────────────────────

  it("professor não lista as entregas de atividade de outro professor na mesma turma", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const sandra = await loginAgent(app, USERS.sandra.email)
    // Atividade do Marcelo na c2 (turma da Sandra), com entrega da Beatriz.
    const atividade = await criar(marcelo, { title: "Exercícios de Contabilidade", classId: "c2" })
    const beatriz = await loginAgent(app, USERS.beatriz.email)
    const enviada = await beatriz
      .post(`/api/activities/${atividade}/submissions`)
      .field("comment", "Contas do exercício 4")
    expect(enviada.status).toBe(201)
    const entregaId = enviada.body.data.id as string

    const listaDaSandra = await sandra.get("/api/submissions")
    expect(listaDaSandra.status).toBe(200)
    expect(ids(listaDaSandra.body), "entrega de atividade alheia não entra na lista").not.toContain(entregaId)

    // O dono enxerga; a coordenação (papel de auditoria) também.
    expect(ids((await marcelo.get("/api/submissions")).body)).toContain(entregaId)
    const coord = await loginAgent(app, USERS.juliana.email)
    expect(ids((await coord.get("/api/submissions")).body)).toContain(entregaId)

    // E a aluna continua enxergando a própria entrega.
    expect(ids((await beatriz.get("/api/submissions")).body)).toContain(entregaId)
  })

  it("funcionário lista só as entregas das próprias atividades", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const carlos = await loginAgent(app, USERS.carlos.email)
    const ana = await loginAgent(app, USERS.ana.email)

    const doProfessor = await criar(marcelo, { title: "Revisão de Biologia", classId: "c1" })
    const daStaff = await criar(carlos, {
      title: "Feira de Ciências",
      classId: "c1",
      type: "school_action",
    })
    const doProfessorRes = await ana
      .post(`/api/activities/${doProfessor}/submissions`)
      .field("comment", "entrega na atividade do professor")
    expect(doProfessorRes.status).toBe(201)
    const daStaffRes = await ana
      .post(`/api/activities/${daStaff}/submissions`)
      .field("comment", "entrega na ação escolar")
    expect(daStaffRes.status).toBe(201)
    const entregaDoProfessor = doProfessorRes.body.data.id as string
    const entregaDaStaff = daStaffRes.body.data.id as string

    const listaDoStaff = await carlos.get("/api/submissions")
    expect(listaDoStaff.status).toBe(200)
    expect(ids(listaDoStaff.body), "a entrega da ação escolar dele aparece").toContain(entregaDaStaff)
    expect(ids(listaDoStaff.body), "entrega de atividade do professor não aparece").not.toContain(
      entregaDoProfessor,
    )
  })

  // ─── O arquivo da entrega obeye o mesmo isolamento da lista ─────────────────

  it("anexo de entrega de outro professor é 403 para o colega da mesma turma e fica na auditoria (RN06)", async () => {
    // Ler a ENTREGA e ler o ARQUIVO dela têm de contar a mesma história: se a
    // entrega some da lista do professor da mesma turma (teste acima), o anexo
    // dela também não pode ser baixado por ele. O cenário é o mesmo: c2 é turma
    // dos dois (u6 e u7), atividade do u6 com entrega da u3.
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const sandra = await loginAgent(app, USERS.sandra.email)
    const beatriz = await loginAgent(app, USERS.beatriz.email)
    const atividade = await criar(marcelo, { title: "Balanço com anexo", classId: "c2" })
    const enviada = await beatriz
      .post(`/api/activities/${atividade}/submissions`)
      .field("comment", "Balanço anexado")
      .attach("attachments", Buffer.from("%PDF-1.4\nbalanco"), "balanco.pdf")
    expect(enviada.status).toBe(201)
    const entregaId = enviada.body.data.id as string
    const anexo = enviada.body.data.attachments[0] as { id: string; storedName: string }

    // O dono da atividade baixa; a aluna autora baixa a própria evidência.
    expect((await marcelo.get(`/api/submissions/${entregaId}/attachments/${anexo.id}`)).status).toBe(200)
    expect((await beatriz.get(`/api/submissions/${entregaId}/attachments/${anexo.id}`)).status).toBe(200)

    // O colega da mesma turma, não: nem a entrega nem o arquivo.
    const doColega = await sandra.get(`/api/submissions/${entregaId}/attachments/${anexo.id}`)
    expect(doColega.status).toBe(403)

    const coord = await loginAgent(app, USERS.juliana.email)
    const negadas = (await coord.get("/api/audit?action=ACCESS_DENIED")).body.data as Array<{
      userId: string
      entity: string
      entityId: string
    }>
    // `forbidAndAudit` grava a rota como entidade: o caminho carrega a entrega.
    const tentativa = negadas.find(
      (l) => l.userId === USERS.sandra.id && l.entityId.includes(entregaId),
    )
    expect(tentativa, "a tentativa negada fica registrada na auditoria").toBeDefined()
    expect(tentativa?.entity).toBe("Route")
  })

  it("download por /uploads/:storedName nega o colega da mesma turma também", async () => {
    // O mesmo arquivo é servido por DUAS rotas: `GET /api/submissions/:id/attachments/:attId`
    // e `GET /uploads/:storedName`. Se só a primeira for isolada, a segunda
    // continua sendo a porta dos fundos do mesmo dado.
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const sandra = await loginAgent(app, USERS.sandra.email)
    const beatriz = await loginAgent(app, USERS.beatriz.email)
    const atividade = await criar(marcelo, { title: "Demonstração com anexo", classId: "c2" })
    const enviada = await beatriz
      .post(`/api/activities/${atividade}/submissions`)
      .field("comment", "Demonstração anexada")
      .attach("attachments", Buffer.from("GIF89a-demostracao"), "demostracao.gif")
    expect(enviada.status).toBe(201)
    const anexo = enviada.body.data.attachments[0] as { storedName: string }

    expect((await marcelo.get(`/uploads/${anexo.storedName}`)).status).toBe(200)
    expect((await beatriz.get(`/uploads/${anexo.storedName}`)).status).toBe(200)
    const doColega = await sandra.get(`/uploads/${anexo.storedName}`)
    expect(doColega.status).toBe(403)

    // A coordenação continua auditando o material.
    const coord = await loginAgent(app, USERS.juliana.email)
    expect((await coord.get(`/uploads/${anexo.storedName}`)).status).toBe(200)
  })

  // ─── O filtro de exclusão da 2.4 sobrevive ao estreitamento (R5) ─────────────

  it("atividade excluída some da lista isolada e a lixeira só devolve as do dono", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const sandra = await loginAgent(app, USERS.sandra.email)
    const carlos = await loginAgent(app, USERS.carlos.email)

    const doMarcelo = await criar(marcelo, { title: "Atividade a excluir do Marcelo" })
    const outraDoMarcelo = await criar(marcelo, { title: "Outra do Marcelo" })
    const daSandra = await criar(sandra, { title: "Atividade da Sandra" })
    const daStaff = await criar(carlos, { title: "Ação escolar do Carlos", classId: "c1", type: "school_action" })

    expect((await marcelo.delete(`/api/activities/${doMarcelo}`)).status).toBe(200)
    expect((await carlos.delete(`/api/activities/${daStaff}`)).status).toBe(200)

    // Lista padrão: a excluída some, a alheia nunca entrou.
    const padraoDoMarcelo = await marcelo.get("/api/activities")
    expect(ids(padraoDoMarcelo.body)).not.toContain(doMarcelo)
    expect(ids(padraoDoMarcelo.body)).toContain(outraDoMarcelo)
    expect(ids(padraoDoMarcelo.body)).not.toContain(daSandra)

    // Lixeira do dono: só a dele — nem a do colega, nem a do funcionário.
    const lixeiraDoMarcelo = await marcelo.get("/api/activities?deleted=true")
    expect(lixeiraDoMarcelo.status).toBe(200)
    expect(ids(lixeiraDoMarcelo.body)).toEqual([doMarcelo])

    const lixeiraDaSandra = await sandra.get("/api/activities?deleted=true")
    expect(ids(lixeiraDaSandra.body), "a lixeira alheia não é do professor").toEqual([])

    const lixeiraDoStaff = await carlos.get("/api/activities?deleted=true")
    expect(ids(lixeiraDoStaff.body), "funcionário tem a própria lixeira").toEqual([daStaff])

    // A coordenação continua enxergando todas as excluídas.
    const lixeiraDaCoord = await loginAgent(app, USERS.juliana.email)
    expect(ids((await lixeiraDaCoord.get("/api/activities?deleted=true")).body).sort()).toEqual(
      [doMarcelo, daStaff].sort(),
    )
  })

  it("excluir atividade de terceiro some das entregas do dono e não ressuscita na lista", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const sandra = await loginAgent(app, USERS.sandra.email)
    const beatriz = await loginAgent(app, USERS.beatriz.email)

    const doMarcelo = await criar(marcelo, { title: "Atividade com entrega" })
    const enviada = await beatriz
      .post(`/api/activities/${doMarcelo}/submissions`)
      .field("comment", "Pronta para validar")
    expect(enviada.status).toBe(201)
    const entregaId = enviada.body.data.id as string
    expect(ids((await marcelo.get("/api/submissions")).body)).toContain(entregaId)

    // A coordenação exclui: o filtro de exclusão da 2.4 vale para a lista de
    // entregas do responsável, que é escopada por atividade.
    const coord = await loginAgent(app, USERS.juliana.email)
    expect((await coord.delete(`/api/activities/${doMarcelo}`)).status).toBe(200)

    expect(ids((await marcelo.get("/api/submissions")).body)).not.toContain(entregaId)
    expect(ids((await sandra.get("/api/submissions")).body)).not.toContain(entregaId)
    expect(ids((await marcelo.get("/api/activities")).body)).not.toContain(doMarcelo)
    // A entrega continua no banco — o que sai é só das leituras do app, como o
    // resto do combinado da 2.4 (nada de purge).
    const linha = getDb()
      .prepare("SELECT COUNT(*) AS total FROM submissions WHERE id = ?")
      .get(entregaId) as { total: number }
    expect(Number(linha.total)).toBe(1)
  })
})
