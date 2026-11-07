import { describe, it, expect, beforeAll } from "vitest"
import { z } from "zod"
import { makeApp, prepareDb, loginAgent, USERS, brDateInDays } from "./helpers"
import { createActivity, createSubmission } from "./fixtures"
import { getDb } from "../db/connection"
import { hashPassword } from "../auth/password"
// Prazo relativo ao "hoje" de São Paulo (mesmo relógio do servidor) — o helper
// de teste conta dias no fuso local da máquina e serviria aqui só por acaso.
import { brDateInDays as brDateSP } from "../lib/dates"
import type { DatabaseSync } from "node:sqlite"
import type { Express } from "express"

/**
 * Aluno com nome acentuado, plantado pelo mesmo caminho do seed (ver
 * `notices.test.ts`): `submissions.studentId` tem FK para `users`, então o
 * filtro por nome precisa de um nome com acento REAL no banco — nenhum usuário
 * do seed tem. A senha é a demo (`123456`) como em todo o resto da suíte, mas
 * estes alunos não são autenticados: o que se exercita é o filtro.
 */
function inserirAluno(db: DatabaseSync, id: string, name: string): void {
  db.prepare(
    "INSERT INTO users (id, name, email, password, role, active, avatar, classIds, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    id,
    name,
    `${id}@etec.sp.gov.br`,
    hashPassword("123456"),
    "student",
    1,
    name.slice(0, 1),
    '["c1"]',
    "01/09/2026, 08:00:00",
  )
}

describe("Fluxo entrega → validação → pontos (RF05, RN03, RN05)", () => {
  let app: Express

  beforeAll(() => {
    const db = prepareDb()
    // Cenário montado aqui porque a V3 não semeia histórico: a1 e a5 são
    // atividades do Prof. Marcelo na c1 e a entrega da Ana em a1 começa
    // `revision_required` — o estado exato de onde a entrega pode ser reenviada.
    createActivity(db, { id: "a1", title: "Revisão de Língua Portuguesa", subjectId: "s1", teacherId: "u6", classId: "c1", points: 15 })
    createActivity(db, { id: "a5", title: "Relatório de Gestão Empresarial", subjectId: "s3", teacherId: "u6", classId: "c1", points: 18 })
    // Atividade do Marcelo na c2, turma da Prof. Sandra: ela enxerga a entrega
    // (é da turma dela) mas não é a dona da atividade e não pode validar.
    createActivity(db, { id: "a-c2", title: "Exercícios de Contabilidade", subjectId: "s14", teacherId: "u6", classId: "c2", points: 12 })
    createSubmission(db, { id: "sub1", activityId: "a1", studentId: "u1", status: "revision_required", feedback: "Questões 3 e 7 estão incorretas. Refaça e reenvie." })
    createSubmission(db, { id: "sub-c2", activityId: "a-c2", studentId: "u3", status: "approved", validatedBy: "u6" })
    app = makeApp()
  })

  it("aluno reenvia em revision_required → 201 (RN03)", async () => {
    const ana = await loginAgent(app, USERS.ana.email)
    const res = await ana
      .post("/api/activities/a1/submissions")
      .field("comment", "Refiz as questões 3 e 7.")
      .field("evidence", "Foto da lista corrigida")
    expect(res.status).toBe(201)
    expect(res.body.data.status).toBe("under_review")
    expect(res.body.data.activityId).toBe("a1")
  })

  it("aluno de outra turma é bloqueado (403) e fica na auditoria", async () => {
    const ricardo = await loginAgent(app, USERS.ricardo.email)
    const res = await ricardo
      .post("/api/activities/a1/submissions")
      .field("comment", "Tentando entrar na turma errada")
    expect(res.status).toBe(403)

    const coord = await loginAgent(app, USERS.juliana.email)
    const audit = await coord.get("/api/audit?action=ACCESS_DENIED&user=Ricardo")
    expect(audit.status).toBe(200)
    const logs = audit.body.data as Array<{ userId: string }>
    expect(logs.some((l) => l.userId === USERS.ricardo.id)).toBe(true)
  })

  it("atividade não ativa não aceita entrega", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const draft = await marcelo.post("/api/activities").send({
      title: "Rascunho sigiloso",
      subjectId: "s1",
      classId: "c1",
      points: 5,
      deadline: brDateInDays(10),
      type: "academic",
      status: "draft",
    })
    const ana = await loginAgent(app, USERS.ana.email)
    const res = await ana
      .post(`/api/activities/${draft.body.data.id}/submissions`)
      .field("comment", "Teste")
    expect(res.status).toBe(422)
  })

  it("duplicidade de entrega é bloqueada (409)", async () => {
    const ana = await loginAgent(app, USERS.ana.email)
    const first = await ana
      .post("/api/activities/a5/submissions")
      .field("comment", "Primeira entrega")
      .field("evidence", "Relatório A")
    expect(first.status).toBe(201)

    const second = await ana
      .post("/api/activities/a5/submissions")
      .field("comment", "Duplicata")
    expect(second.status).toBe(409)
  })

  it("aprovação credita pontos, notifica aluno e registra auditoria (RN05)", async () => {
    const ana = await loginAgent(app, USERS.ana.email)
    const before = await ana.get("/api/users/u1/points")
    const balanceBefore = before.body.data.balance as number

    // localiza a entrega de a1 da Ana
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const list = await marcelo.get("/api/submissions?activityId=a1&studentId=u1")
    const pending = (list.body.data as Array<{ id: string; status: string }>).find(
      (s) => s.status === "under_review",
    )
    expect(pending).toBeDefined()

    const approve = await marcelo
      .post(`/api/submissions/${(pending as { id: string }).id}/validate`)
      .send({ action: "approve", feedback: "Correções ok! Aprovada." })
    expect(approve.status).toBe(200)
    expect(approve.body.data.status).toBe("approved")

    const after = await ana.get("/api/users/u1/points")
    expect(after.body.data.balance).toBe(balanceBefore + 15) // a1 vale 15 pts

    const notifications = await ana.get("/api/notifications")
    const hasApproved = (notifications.body.data as Array<{ type: string }>).some(
      (n) => n.type === "activity_approved",
    )
    expect(hasApproved).toBe(true)

    const coord = await loginAgent(app, USERS.juliana.email)
    const audit = await coord.get("/api/audit?action=SUBMISSION_APPROVED")
    const approvedLog = (audit.body.data as Array<{ entityId: string }>).find(
      (l) => l.entityId === (pending as { id: string }).id,
    )
    expect(approvedLog).toBeDefined()
  })

  it("entrega já validada não pode ser validada de novo (409)", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const list = await marcelo.get("/api/submissions?activityId=a1&studentId=u1")
    const approved = (list.body.data as Array<{ id: string; status: string }>).find(
      (s) => s.status === "approved",
    )
    expect(approved).toBeDefined()
    const res = await marcelo
      .post(`/api/submissions/${(approved as { id: string }).id}/validate`)
      .send({ action: "approve", feedback: "De novo?" })
    expect(res.status).toBe(409)
  })

  it("professor que não é da atividade não a lista e não valida (403)", async () => {
    // A Prof. Sandra atua na c2, então a entrega da Beatriz em a-c2 é de uma turma
    // dela — mas a atividade é do Marcelo. Desde a 2.5 o escopo da lista é o DONO
    // da atividade, não a turma: a entrega nem aparece para ela, e a tentativa de
    // validar por id é recusada antes de qualquer regra de estado.
    const sandra = await loginAgent(app, USERS.sandra.email)
    const list = await sandra.get("/api/submissions?activityId=a-c2&studentId=u3")
    expect(list.status).toBe(200)
    expect(list.body.data, "entrega de atividade alheia não entra na lista").toEqual([])

    const res = await sandra
      .post("/api/submissions/sub-c2/validate")
      .send({ action: "approve", feedback: "Eu não posso" })
    expect(res.status).toBe(403)

    // A negativa é de permissão, não de efeito: a entrega continua aprovada e
    // visível para quem é dono.
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const doDono = (await marcelo.get("/api/submissions?activityId=a-c2&studentId=u3")).body
      .data as Array<{ id: string; status: string; validatedBy: string | null }>
    expect(doDono.map((s) => ({ id: s.id, status: s.status, validatedBy: s.validatedBy }))).toEqual([
      { id: "sub-c2", status: "approved", validatedBy: "u6" },
    ])
  })

  // ─── V3 Fase 2 · Tarefa 2.4 (rodada 1 de correção) ─────────────────────────
  // O escopo de `GET /api/submissions` do professor e do funcionário é o conjunto
  // `allowedIds`, montado a partir de `activities`. A 2.4 corrigiu três consultas
  // que não filtravam `deletedAt IS NULL`; a 2.5 fundiu professor e funcionário no
  // mesmo ramo (o escopo passou a ser só o dono, sem as atividades da turma), e as
  // três viraram UMA consulta — hoje este filtro é o que segura a lista, e ele
  // precisa continuar segurando. Sem ele, as entregas de uma atividade excluída
  // voltariam a ser listadas e o client as desenharia degradadas: "Ação removida"
  // no lugar do título (`StaffHistoryView.tsx:109`) ou o uuid da atividade no lugar
  // do nome (`SubmissionDetailModal.tsx:66`). Restos de um recurso que não existe
  // mais.

  it("lista de entregas do professor e do funcionário omite atividade excluída (sem ?activityId)", async () => {
    const db = getDb()
    // Duas atividades com entrega: uma do professor (u6) e uma do funcionário
    // (u8). A do u8 é o que dá sentido ao ramo `staff` da rota, cujo escopo é
    // apenas `teacherId = user.id` — sem uma atividade do próprio u8 a lista
    // dele viria vazia e o teste passaria sem provar nada.
    const doProfessor = createActivity(db, {
      id: "a-del-u6",
      title: "Atividade excluída do professor",
      subjectId: "s1",
      teacherId: "u6",
      classId: "c1",
      points: 10,
    })
    const daStaff = createActivity(db, {
      id: "a-del-u8",
      title: "Ação escolar excluída",
      subjectId: "s1",
      teacherId: "u8",
      classId: "c1",
      // `school_action` porque o fixture de funcionário usa tipo operacional, o
      // mesmo que a rota de criação aceitaria de um staff.
      type: "school_action",
      points: 10,
    })
    const subDoProfessor = createSubmission(db, {
      id: "sub-del-u6",
      activityId: doProfessor,
      studentId: "u1",
      status: "approved",
      validatedBy: "u6",
    })
    const subDaStaff = createSubmission(db, {
      id: "sub-del-u8",
      activityId: daStaff,
      studentId: "u1",
      status: "approved",
      validatedBy: "u8",
    })

    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const carlos = await loginAgent(app, USERS.carlos.email)
    const ids = (body: unknown): string[] =>
      ((body as { data: Array<{ id: string }> }).data).map((s) => s.id)

    // Antes: as duas entregas aparecem — o filtro não pode quebrar a lista.
    expect(ids((await marcelo.get("/api/submissions")).body)).toContain(subDoProfessor)
    expect(ids((await carlos.get("/api/submissions")).body)).toContain(subDaStaff)

    expect((await marcelo.delete(`/api/activities/${doProfessor}`)).status).toBe(200)
    expect((await carlos.delete(`/api/activities/${daStaff}`)).status).toBe(200)

    // Depois: somem das duas listas.
    const listaProfessor = await marcelo.get("/api/submissions")
    expect(listaProfessor.status).toBe(200)
    expect(ids(listaProfessor.body)).not.toContain(subDoProfessor)
    const listaStaff = await carlos.get("/api/submissions")
    expect(listaStaff.status).toBe(200)
    expect(ids(listaStaff.body)).not.toContain(subDaStaff)

    // E somem só da tela: as entregas continuam no banco, como os pontos já
    // creditados (o combinado do soft delete de 2.4).
    const restantes = db
      .prepare("SELECT COUNT(*) AS total FROM submissions WHERE activityId IN (?, ?)")
      .get(doProfessor, daStaff) as { total: number }
    expect(Number(restantes.total)).toBe(2)
  })

  it("reprovação e correção exigem feedback (422)", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    // solicita nova entrega na a5 da Ana (que está under_review após envio acima)
    const list = await marcelo.get("/api/submissions?activityId=a5&studentId=u1")
    const pending = (list.body.data as Array<{ id: string; status: string }>).find(
      (s) => s.status === "under_review",
    )
    expect(pending).toBeDefined()

    const noFeedback = await marcelo
      .post(`/api/submissions/${(pending as { id: string }).id}/validate`)
      .send({ action: "revision" })
    expect(noFeedback.status).toBe(422)

    const withFeedback = await marcelo
      .post(`/api/submissions/${(pending as { id: string }).id}/validate`)
      .send({ action: "revision", feedback: "Refaça a introdução." })
    expect(withFeedback.status).toBe(200)
    expect(withFeedback.body.data.status).toBe("revision_required")
  })

  it("aluno não pode validar entregas (403)", async () => {
    const ana = await loginAgent(app, USERS.ana.email)
    const list = await ana.get("/api/submissions?activityId=a5&studentId=u1")
    const pending = (list.body.data as Array<{ id: string; status: string }>).find(
      (s) => s.status === "revision_required",
    )
    expect(pending).toBeDefined()
    const res = await ana
      .post(`/api/submissions/${(pending as { id: string }).id}/validate`)
      .send({ action: "approve", feedback: "autoaprovo" })
    expect(res.status).toBe(403)
  })

  // ─── V3 Fase 2 · Tarefa 2.2: entrega atrasada vale meia pontuação ───────────
  // A entrega feita dentro da janela de atraso é aceita e marcada `delayed`; na
  // aprovação ela vale `Math.ceil(activity.points / 2)`. Tudo aqui passa pela
  // rota (nada de chamar o serviço direto): a metade tem de ser decidida pelo
  // validador, não pelo cliente.
  //
  // Usam o Mateus (u2) e atividades próprias para não mexer no saldo da Ana (u1),
  // que os testes acima comparam com o valor lido na hora.

  /** Atividade ativa do Marcelo na c1, com o prazo movido para `deadlineDays`. */
  async function createLateActivity(
    title: string,
    points: number,
    deadlineDays: number,
  ): Promise<string> {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const created = await marcelo.post("/api/activities").send({
      title,
      subjectId: "s1",
      classId: "c1",
      points,
      deadline: brDateSP(5),
      type: "academic",
      status: "active",
    })
    expect(created.status, `criação de "${title}"`).toBe(201)
    const id = (created.body.data as { id: string }).id
    getDb()
      .prepare("UPDATE activities SET deadline = ? WHERE id = ?")
      .run(brDateSP(deadlineDays), id)
    return id
  }

  it("entrega atrasada aprovada credita ceil(points/2) e registra o atraso na auditoria", async () => {
    const activityId = await createLateActivity("Dissertação de Sociologia", 15, -1)
    const mateus = await loginAgent(app, USERS.mateus.email)
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const balanceBefore = (await mateus.get(`/api/users/${USERS.mateus.id}/points`)).body.data
      .balance as number

    const sent = await mateus
      .post(`/api/activities/${activityId}/submissions`)
      .field("comment", "Dissertação entregue com um dia de atraso")
    expect(sent.status).toBe(201)
    expect(sent.body.data.delayed, "entrega dentro da janela é marcada como atrasada").toBe(true)
    const submissionId = (sent.body.data as { id: string }).id

    const approved = await marcelo
      .post(`/api/submissions/${submissionId}/validate`)
      .send({ action: "approve", feedback: "Bom texto, enviado com atraso." })
    expect(approved.status).toBe(200)
    expect(approved.body.data.status).toBe("approved")

    // RN04: o saldo é derivado das transações — 15 pts de atividade viram 8.
    const transactions = (await mateus.get("/api/transactions")).body.data as Array<{
      type: string
      amount: number
      relatedActivityId: string | null
    }>
    const credit = transactions.find((t) => t.relatedActivityId === activityId)
    expect(credit?.type).toBe("activity")
    expect(credit?.amount, "15 pts de atividade → 8 creditados").toBe(8)
    const after = (await mateus.get(`/api/users/${USERS.mateus.id}/points`)).body.data
      .balance as number
    expect(after).toBe(balanceBefore + 8)

    // O que o aluno vê precisa ser o valor creditado (não o da atividade).
    const notifications = (await mateus.get("/api/notifications")).body.data as Array<{
      message: string
    }>
    const aviso = notifications.find((n) => n.message.includes("Dissertação de Sociologia"))
    expect(aviso?.message).toContain("+8 pts")
    expect(aviso?.message).not.toContain("+15 pts")

    // RN06: a auditoria diz o valor creditado E que a entrega foi em atraso.
    const coord = await loginAgent(app, USERS.juliana.email)
    const audit = await coord.get("/api/audit?action=SUBMISSION_APPROVED")
    const log = (audit.body.data as Array<{ entityId: string; description: string }>).find(
      (l) => l.entityId === submissionId,
    )
    expect(log?.description).toContain("+8 pts")
    expect(log?.description, "auditoria registra a entrega em atraso").toContain(
      "entregue em atraso",
    )
  })

  it("meia pontuação arredonda para cima: 7 → 4 e 1 → 1", async () => {
    const mateus = await loginAgent(app, USERS.mateus.email)
    const marcelo = await loginAgent(app, USERS.marcelo.email)

    for (const [pontos, esperado] of [
      [7, 4],
      [1, 1],
    ] as const) {
      const activityId = await createLateActivity(`Atividade de ${pontos} pts`, pontos, -2)
      const sent = await mateus
        .post(`/api/activities/${activityId}/submissions`)
        .field("comment", `Entrega atrasada de ${pontos} pts`)
      expect(sent.status, `envio de "${pontos} pts"`).toBe(201)
      expect(sent.body.data.delayed).toBe(true)

      const approved = await marcelo
        .post(`/api/submissions/${(sent.body.data as { id: string }).id}/validate`)
        .send({ action: "approve", feedback: "Aprovada com atraso." })
      expect(approved.status, `aprovação de "${pontos} pts"`).toBe(200)

      const transactions = (await mateus.get("/api/transactions")).body.data as Array<{
        amount: number
        relatedActivityId: string | null
      }>
      const credit = transactions.find((t) => t.relatedActivityId === activityId)
      expect(credit?.amount, `ceil(${pontos}/2)`).toBe(esperado)
    }
  })

  it("entrega no prazo não é atraso: credita a pontuação integral", async () => {
    // A metade não se aplica onde ela não vale: prazo de hoje, dentro da janela,
    // mas sem atraso → os 15 pts inteiros.
    const activityId = await createLateActivity("Resumo de História no prazo", 15, 0)
    const mateus = await loginAgent(app, USERS.mateus.email)
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const balanceBefore = (await mateus.get(`/api/users/${USERS.mateus.id}/points`)).body.data
      .balance as number

    const sent = await mateus
      .post(`/api/activities/${activityId}/submissions`)
      .field("comment", "Entregue no prazo")
    expect(sent.status).toBe(201)
    expect(sent.body.data.delayed, "no prazo não é atraso").toBe(false)

    const approved = await marcelo
      .post(`/api/submissions/${(sent.body.data as { id: string }).id}/validate`)
      .send({ action: "approve", feedback: "No prazo, aprovada." })
    expect(approved.status).toBe(200)

    const transactions = (await mateus.get("/api/transactions")).body.data as Array<{
      amount: number
      relatedActivityId: string | null
    }>
    const credit = transactions.find((t) => t.relatedActivityId === activityId)
    expect(credit?.amount, "crédito integral").toBe(15)
    const after = (await mateus.get(`/api/users/${USERS.mateus.id}/points`)).body.data
      .balance as number
    expect(after).toBe(balanceBefore + 15)
  })

  it("reenvio depois do prazo passa a constar como entrega atrasada", async () => {
    // O caminho do UPDATE (correção pedida → reenvio) também grava `delayed`:
    // a entrega é reavaliada no momento em que o aluno manda de novo.
    const db = getDb()
    const activityId = await createLateActivity("Relatório com correção", 10, -1)
    createSubmission(db, {
      id: "sub-reenvio-atraso",
      activityId,
      studentId: USERS.ana.id,
      status: "revision_required",
      feedback: "Faltou a conclusão.",
    })

    const ana = await loginAgent(app, USERS.ana.email)
    const res = await ana
      .post(`/api/activities/${activityId}/submissions`)
      .field("comment", "Conclusão incluída")
    expect(res.status).toBe(201)
    expect(res.body.data.delayed, "reenvio tardio é atraso").toBe(true)
    expect(res.body.data.status).toBe("under_review")
  })

  it("reenvio com prazo adiado deixa de ser atraso (política declarada)", async () => {
    // Política de produto, fixada aqui para não ser invertida em silêncio: o
    // `delayed` é reavaliado a CADA envio, inclusive o reenvio depois da correção
    // pedida. Como o prazo é editável, se o professor adiar o prazo no meio do
    // fluxo, a entrega reenviada é julgada no prazo novo e vale a pontuação
    // INTEGRAL. Ou seja: adiar o prazo depois do envio atrasado "promove" a
    // entrega de meia para integral. É defensável (o professor controla o prazo)
    // e o relatório da 2.2 registra como decisão a revisar — o que este teste
    // protege é que ninguém mude o comportamento sem decidir.
    const activityId = await createLateActivity("Artigo com prazo adiado", 15, -1)
    const ana = await loginAgent(app, USERS.ana.email)
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const balanceBefore = (await ana.get(`/api/users/${USERS.ana.id}/points`)).body.data
      .balance as number

    // 1ª entrega: fora do prazo, dentro da janela → atraso.
    const primeira = await ana
      .post(`/api/activities/${activityId}/submissions`)
      .field("comment", "Primeira versão")
    expect(primeira.status).toBe(201)
    expect(primeira.body.data.delayed, "primeira entrega é atraso").toBe(true)
    const submissionId = (primeira.body.data as { id: string }).id

    // O professor pede correção e adia o prazo para depois de amanhã.
    const revision = await marcelo
      .post(`/api/submissions/${submissionId}/validate`)
      .send({ action: "revision", feedback: "Ajuste a conclusão." })
    expect(revision.status).toBe(200)
    const adiado = await marcelo
      .patch(`/api/activities/${activityId}`)
      .send({ deadline: brDateSP(2) })
    expect(adiado.status).toBe(200)
    expect(adiado.body.data.deadline).toBe(brDateSP(2))

    // Reenvio: julgado pelo prazo NOVO → não é mais atraso.
    const segunda = await ana
      .post(`/api/activities/${activityId}/submissions`)
      .field("comment", "Versão final")
    expect(segunda.status).toBe(201)
    expect(segunda.body.data.delayed, "com o prazo adiado, o reenvio não é atraso").toBe(false)

    // Consequência de pontos: integral, não metade.
    const approved = await marcelo
      .post(`/api/submissions/${submissionId}/validate`)
      .send({ action: "approve", feedback: "Aprovada." })
    expect(approved.status).toBe(200)
    const transactions = (await ana.get("/api/transactions")).body.data as Array<{
      amount: number
      relatedActivityId: string | null
    }>
    const credit = transactions.find((t) => t.relatedActivityId === activityId)
    expect(credit?.amount, "15 pts integrais depois do prazo adiado").toBe(15)
    const after = (await ana.get(`/api/users/${USERS.ana.id}/points`)).body.data
      .balance as number
    expect(after).toBe(balanceBefore + 15)
  })
})

// ─── V3 Fase 4 · Tarefa 4.1 — filtros da aba oculta de validação ──────────────
// A spec (decisão nº 14) pede a aba oculta com Matéria + Atividade + Status +
// Aluno + Período. `activityId` e `status` já existiam; esta task acrescenta
// `subjectId` (junção com `activities`), `from`/`to` (período de envio) e
// `studentName` (busca por nome do aluno — sem ele, o filtro de Aluno só
// funcionaria para a coordenação, o único papel que enxerga nome de aluno).
//
// O cenário é ADVERSARIAL de propósito: duas atividades da MESMA matéria em
// donos diferentes (u6 e u7 em s1; u6 e u8 em s10) e entregas em dias distintos.
// Sem essa repetição, um filtro de matéria aplicado fora do escopo do papel
// passaria nos testes — o professor veria a entrega do colega de matéria.
describe("Filtros da validação — matéria, período e busca por aluno (4.1)", () => {
  let app: Express

  beforeAll(() => {
    const db = prepareDb()
    // Duas atividades do Marcelo na MESMA matéria (s1) e uma terceira em outra
    // (s10) — é a repetição que faz o filtro de matéria ter o que recortar.
    createActivity(db, {
      id: "f4-port",
      title: "Revisão de Língua Portuguesa",
      subjectId: "s1",
      teacherId: "u6",
      classId: "c1",
      points: 15,
    })
    createActivity(db, {
      id: "f4-cronica",
      title: "Crônica da feira cultural",
      subjectId: "s1",
      teacherId: "u6",
      classId: "c1",
      points: 10,
    })
    createActivity(db, {
      id: "f4-quimica",
      title: "Roteiro de laboratório",
      subjectId: "s10",
      teacherId: "u6",
      classId: "c1",
      points: 20,
    })
    // Atividade da Prof. Sandra na MESMA matéria (s1) do f4-port: o teste
    // adversarial depende desta repetição.
    createActivity(db, {
      id: "f4-sandra",
      title: "Ensaio sobre máquinas de estado",
      subjectId: "s1",
      teacherId: "u7",
      classId: "c2",
      points: 15,
    })
    // Atividade do FUNCIONÁRIO na mesma matéria do f4-quimica (s10): o escopo
    // do `staff` é o dono, não a matéria nem a turma.
    createActivity(db, {
      id: "f4-feira",
      title: "Organização da feira de ciências",
      subjectId: "s10",
      teacherId: "u8",
      classId: "c1",
      type: "school_action",
      points: 5,
    })

    createSubmission(db, {
      id: "f4-sub-port",
      activityId: "f4-port",
      studentId: "u1",
      status: "approved",
      validatedBy: "u6",
      submittedAt: "10/09/2026, 08:00:00",
    })
    createSubmission(db, {
      id: "f4-sub-cronica",
      activityId: "f4-cronica",
      studentId: "u1",
      status: "approved",
      validatedBy: "u6",
      submittedAt: "13/09/2026, 08:00:00",
    })
    createSubmission(db, {
      id: "f4-sub-quimica",
      activityId: "f4-quimica",
      studentId: "u2",
      status: "submitted",
      submittedAt: "12/09/2026, 08:00:00",
    })
    createSubmission(db, {
      id: "f4-sub-sandra",
      activityId: "f4-sandra",
      studentId: "u3",
      status: "approved",
      validatedBy: "u7",
      submittedAt: "11/09/2026, 08:00:00",
    })
    createSubmission(db, {
      id: "f4-sub-feira",
      activityId: "f4-feira",
      studentId: "u1",
      status: "submitted",
      submittedAt: "11/09/2026, 09:00:00",
    })
    app = makeApp()
  })

  /** Ids da resposta, lidos com zod: o teste confirma o formato E os ids. */
  const ids = (body: unknown): string[] => {
    const resposta = z.object({ data: z.array(z.object({ id: z.string() })) }).safeParse(body)
    if (!resposta.success) throw new Error(`resposta inesperada: ${resposta.error.message}`)
    return resposta.data.data.map((item) => item.id)
  }

  // `%2F` é a barra escapada — é o que `URLSearchParams` produz no client real
  // (`api.get` monta a query com ele), então é o que o professor manda.
  it("combina matéria + período + status no mesmo pedido (são E, não OU)", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)

    // Controle: sem filtro, o professor vê as três entregas das atividades dele.
    // Se a lista de controle viesse vazia, todo o resto deste teste seria vacuoso.
    const escopo = await marcelo.get("/api/submissions")
    expect(escopo.status).toBe(200)
    expect(ids(escopo.body).sort()).toEqual(["f4-sub-cronica", "f4-sub-port", "f4-sub-quimica"].sort())

    const soMateria = await marcelo.get("/api/submissions?subjectId=s1")
    expect(soMateria.status).toBe(200)
    expect(ids(soMateria.body).sort()).toEqual(["f4-sub-cronica", "f4-sub-port"].sort())

    // Três filtros juntos: a entrega de 13/09 cai fora do período e a de 12/09
    // é de outra matéria — sobra exatamente a de 10/09.
    const combinado = await marcelo.get(
      "/api/submissions?subjectId=s1&from=01%2F09%2F2026&to=12%2F09%2F2026&status=approved",
    )
    expect(combinado.status).toBe(200)
    expect(ids(combinado.body), "matéria E período E status").toEqual(["f4-sub-port"])

    // A mesma matéria com outro período/status traz a outra linha — o período e
    // o status entram mesmo no cálculo, não são decorativos.
    const outroCorte = await marcelo.get(
      "/api/submissions?subjectId=s1&from=12%2F09%2F2026&to=31%2F12%2F2026&status=approved",
    )
    expect(ids(outroCorte.body)).toEqual(["f4-sub-cronica"])

    // Matéria + período + status, agora em outra matéria.
    const quimica = await marcelo.get(
      "/api/submissions?subjectId=s10&from=10%2F09%2F2026&to=12%2F09%2F2026&status=submitted",
    )
    expect(ids(quimica.body)).toEqual(["f4-sub-quimica"])

    // `activityId` continua combinando com os filtros novos (não é excludente).
    const comAtividade = await marcelo.get(
      "/api/submissions?subjectId=s1&activityId=f4-cronica&from=10%2F09%2F2026&to=12%2F09%2F2026",
    )
    expect(ids(comAtividade.body)).toEqual([])
  })

  it("período é inclusivo nas duas pontas e filtra pelo dia do envio", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)

    // `from` no dia exato da entrega entra (o dia do prazo conta).
    expect(ids((await marcelo.get("/api/submissions?from=10%2F09%2F2026")).body)).toContain("f4-sub-port")
    expect(
      ids((await marcelo.get("/api/submissions?from=11%2F09%2F2026")).body),
      "a entrega de 10/09 está fora de um período que começa em 11/09",
    ).not.toContain("f4-sub-port")

    // `to` no dia exato também entra — o filtro é de DIA, não de instante, então
    // a entrega das 23:59 de 10/09 é do dia 10/09.
    expect(ids((await marcelo.get("/api/submissions?to=10%2F09%2F2026")).body)).toEqual(["f4-sub-port"])
    // `from` no dia exato também entra (13/09 tem entrega; 12/09 não tem nada
    // depois dele porque a de 12/09 é a única no dia e a de 13/09 é a seguinte).
    expect(ids((await marcelo.get("/api/submissions?from=13%2F09%2F2026")).body)).toEqual(["f4-sub-cronica"])
    expect(ids((await marcelo.get("/api/submissions?from=12%2F09%2F2026")).body).sort()).toEqual(["f4-sub-cronica", "f4-sub-quimica"].sort())

    // Só as três do professor: o período não amplia o escopo do papel.
    const carlos = await loginAgent(app, USERS.carlos.email)
    const listaDoStaff = await carlos.get("/api/submissions?from=01%2F01%2F2020&to=31%2F12%2F2030")
    expect(listaDoStaff.status).toBe(200)
    expect(ids(listaDoStaff.body)).toEqual(["f4-sub-feira"])
  })

  it("matéria de fora do escopo vira lista vazia, nunca linha de outro dono", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const sandra = await loginAgent(app, USERS.sandra.email)
    const carlos = await loginAgent(app, USERS.carlos.email)
    const coord = await loginAgent(app, USERS.juliana.email)

    // s1 é matéria do Marcelo E da Sandra: o filtro tem de respeitar o dono.
    const s1DoMarcelo = await marcelo.get("/api/submissions?subjectId=s1")
    expect(s1DoMarcelo.status).toBe(200)
    expect(ids(s1DoMarcelo.body)).toContain("f4-sub-port")
    expect(
      ids(s1DoMarcelo.body),
      "entrega da Prof. Sandra é da mesma matéria, mas não é do Marcelo",
    ).not.toContain("f4-sub-sandra")

    // A coordenação vê as duas — mesmo filtro, escopo diferente.
    expect(ids((await sandra.get("/api/submissions?subjectId=s1")).body)).toEqual(["f4-sub-sandra"])
    expect(
      ids((await coord.get("/api/submissions?subjectId=s1")).body).sort(),
      "a coordenação não tem escopo de atividade (C3): vê as duas",
    ).toEqual(["f4-sub-cronica", "f4-sub-port", "f4-sub-sandra"].sort())

    // s10 é do Marcelo E do funcionário: o `staff` só enxerga a dele.
    expect(ids((await carlos.get("/api/submissions?subjectId=s10")).body)).toEqual(["f4-sub-feira"])

    // Atividade da Sandra + a matéria do Marcelo: par impossível ⇒ lista vazia,
    // e nunca a entrega da Sandra (o `subjectId` não escapa do `activityId`).
    const cruzada = await marcelo.get("/api/submissions?subjectId=s10&activityId=f4-sandra")
    expect(cruzada.status).toBe(200)
    expect(ids(cruzada.body)).toEqual([])
  })

  it("busca por nome do aluno recorta dentro do escopo, sem 403", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const coord = await loginAgent(app, USERS.juliana.email)

    const ana = await marcelo.get("/api/submissions?studentName=Ana")
    expect(ana.status).toBe(200)
    expect(ids(ana.body).sort()).toEqual(["f4-sub-cronica", "f4-sub-port"].sort())

    // Minúsculas e nome parcial funcionam (o filtro é por trecho de nome).
    const parcial = await marcelo.get("/api/submissions?studentName=mat")
    expect(ids(parcial.body)).toEqual(["f4-sub-quimica"])

    // Aluno que só entrega para outro professor: lista vazia, NÃO 403 — o
    // `studentId` alheio já é recusado com 403, e o filtro por nome não pode
    // virar um caminho de leitura fora do escopo.
    const beatriz = await marcelo.get("/api/submissions?studentName=Beatriz")
    expect(beatriz.status).toBe(200)
    expect(ids(beatriz.body)).toEqual([])
    // A coordenação, que tem as entregas de todo mundo, acha a mesma aluna.
    expect(ids((await coord.get("/api/submissions?studentName=Beatriz")).body)).toEqual(["f4-sub-sandra"])

    // `%` e `_` digitados são literais: sem curinga, "100%" não traz metade da
    // lista. É o que separa esta busca de um `LIKE` cru.
    expect(ids((await coord.get("/api/submissions?studentName=%25")).body)).toEqual([])
  })

  // Important 2 da revisão da 4.1: `instr(lower(name), lower(?))` é cego a
  // acento, porque o `lower()` do SQLite só dobra ASCII. Em uma lista de
  // nomeação pt-BR — "José", "Antônio", "Conceição" — o filtro por aluno não
  // encontrava quase ninguém, e o hint da tela promete busca por trecho.
  //
  // Este teste planta o cenário que prova os dois lados da correção: o mesmo
  // nome acentuado é encontrado por "Jose", por "José" e por "CONCEIÇÃO" (a
  // chave de busca normaliza acento e caixa), e continua preso ao escopo do
  // papel (os DOIS professores têm entrega desse aluno, cada um no seu
  // recorte) — normalizar não pode virar atalho de papel.
  it("busca por nome acha acento e caixa, sem virar atalho de papel", async () => {
    const db = getDb()
    // Mesmo caminho do seed (ver `notices.test.ts`): o aluno precisa EXISTIR
    // por causa da FK de `submissions.studentId`, e ele não entra por
    // cadastro porque o filtro não depende de turma nem de senha.
    inserirAluno(db, "u-acc", "José Antônio Conceição")
    const linhaC1 = db.prepare("SELECT studentIds FROM classes WHERE id = ?").get("c1") as {
      studentIds: string
    }
    const alunosDaC1 = z.array(z.string()).parse(JSON.parse(linhaC1.studentIds))
    db.prepare("UPDATE classes SET studentIds = ? WHERE id = ?").run(
      JSON.stringify([...alunosDaC1, "u-acc"]),
      "c1",
    )
    // Uma entrega na atividade do Marcelo (u6) e outra na da Sandra (u7): o
    // mesmo nome, dois escopos — é o que separa "achou o aluno" de "achou a
    // linha que este papel pode ver".
    createSubmission(db, {
      id: "f4-sub-acc-6",
      activityId: "f4-cronica",
      studentId: "u-acc",
      status: "submitted",
      submittedAt: "14/09/2026, 08:00:00",
    })
    createSubmission(db, {
      id: "f4-sub-acc-7",
      activityId: "f4-sandra",
      studentId: "u-acc",
      status: "approved",
      validatedBy: "u7",
      submittedAt: "14/09/2026, 08:00:00",
    })

    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const sandra = await loginAgent(app, USERS.sandra.email)
    const coord = await loginAgent(app, USERS.juliana.email)
    const busca = (agente: Awaited<ReturnType<typeof loginAgent>>, termo: string) =>
      agente.get(`/api/submissions?studentName=${termo}`)

    // ASCII sem acento — é assim que o educador digita quando desiste do
    // acento do teclado, e é o que NÃO achava "José" antes.
    expect(ids((await busca(marcelo, "Jose")).body)).toEqual(["f4-sub-acc-6"])
    // Com acento e em caixa alta: as duas pontas da normalização.
    expect(ids((await busca(marcelo, "Jos%C3%A9")).body)).toEqual(["f4-sub-acc-6"])
    expect(ids((await busca(marcelo, "JOSE")).body)).toEqual(["f4-sub-acc-6"])
    // Trecho no meio do nome, com e sem acento: "Antônio"/"Antonio".
    expect(ids((await busca(marcelo, "Antonio")).body)).toEqual(["f4-sub-acc-6"])
    expect(ids((await busca(marcelo, "ANT%C3%94NIO")).body)).toEqual(["f4-sub-acc-6"])
    // Ç e ã viram "c" e "a" na chave.
    expect(ids((await busca(marcelo, "Conceicao")).body)).toEqual(["f4-sub-acc-6"])
    expect(ids((await busca(marcelo, "concei%C3%A7%C3%A3o")).body)).toEqual(["f4-sub-acc-6"])
    // A chave não pode alargar o nome: "Jo" continua sendo trecho válido (o
    // nome é "José Antônio Conceição"), mas um sobrenome que não existe traz
    // lista vazia — e "Jose" não traz a Ana nem o Mateus.
    expect(ids((await busca(marcelo, "Jo")).body)).toEqual(["f4-sub-acc-6"])
    expect(ids((await busca(marcelo, "Concei%C3%A7%C3%A3o%20Silva")).body)).toEqual([])
    expect(ids((await busca(marcelo, "Jose")).body)).not.toContain("f4-sub-port")

    // Escopo: a MESMA chave acha a entrega da Sandra, e cada professor só vê a
    // sua. Se a normalização tivesse virado bypass, o Marcelo veria a entrega
    // da atividade da Sandra.
    expect(ids((await busca(sandra, "Jose")).body)).toEqual(["f4-sub-acc-7"])
    expect(ids((await busca(sandra, "Jose")).body)).not.toContain("f4-sub-acc-6")
    // A coordenação (sem escopo de atividade, C3) vê as duas — como antes.
    expect(ids((await busca(coord, "Jose")).body).sort()).toEqual(
      ["f4-sub-acc-6", "f4-sub-acc-7"].sort(),
    )
    // E a curinga continua literal: normalizar não virou "trazer qualquer um".
    expect(ids((await busca(coord, "%25")).body)).toEqual([])
  })

  it("período que não existe ou é invertido é recusado com 400", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    for (const query of [
      "from=32%2F13%2F2026", // mês 13, dia 32
      "to=31%2F02%2F2026", // 31 de fevereiro
      "from=2026-09-10", // ISO em vez de DD/MM/AAAA
      "to=10%2F09%2F2026%2000%3A00", // o filtro é de dia, não de instante
      "from=1%2F9%2F2026", // dois dígitos em cada campo
    ]) {
      const res = await marcelo.get(`/api/submissions?${query}`)
      expect(res.status, `${query} deve ser recusado`).toBe(400)
      expect(res.body.error).toBeTruthy()
    }

    const invertido = await marcelo.get(
      "/api/submissions?from=12%2F09%2F2026&to=10%2F09%2F2026",
    )
    expect(invertido.status).toBe(400)
    expect(String(invertido.body.error)).toContain("10/09/2026")

    // Data válida não derruba a listagem: o 200 normal continua de pé.
    expect((await marcelo.get("/api/submissions?from=10%2F09%2F2026")).status).toBe(200)
  })

  it("filtro de matéria não ressuscita entrega de atividade excluída (2.4 intacto)", async () => {
    // Atividade e entrega próprias deste teste: o arquivo tem ordem de execução
    // e os testes acima dependem das linhas do cenário-base.
    const db = prepareDb()
    createActivity(db, {
      id: "f4-lixo",
      title: "Atividade excluída do filtro",
      subjectId: "s1",
      teacherId: "u6",
      classId: "c1",
      points: 10,
    })
    createSubmission(db, {
      id: "f4-sub-lixo",
      activityId: "f4-lixo",
      studentId: "u1",
      status: "submitted",
    })
    const appFiltros = makeApp()
    const marcelo = await loginAgent(appFiltros, USERS.marcelo.email)

    expect(ids((await marcelo.get("/api/submissions?subjectId=s1")).body)).toContain("f4-sub-lixo")

    expect((await marcelo.delete("/api/activities/f4-lixo")).status).toBe(200)

    const depois = await marcelo.get("/api/submissions?subjectId=s1")
    expect(depois.status).toBe(200)
    expect(
      ids(depois.body),
      "excluir a atividade esconde a entrega também quando o filtro é por matéria",
    ).not.toContain("f4-sub-lixo")

    // Soft delete: a entrega continua no banco (a entrega e a nota são o registro
    // da auditoria — decisão nº 3 da spec, pontos preservados).
    const noBanco = db.prepare("SELECT COUNT(*) AS total FROM submissions WHERE id = ?").get("f4-sub-lixo") as {
      total: number
    }
    expect(Number(noBanco.total)).toBe(1)
  })
})
