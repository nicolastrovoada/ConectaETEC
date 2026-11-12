import { describe, it, expect, beforeAll } from "vitest"
import request from "supertest"
import { makeApp, prepareDb, loginAgent, USERS, brDateInDays } from "./helpers"
import type { Express } from "express"
import { getDb } from "../db/connection"
import { brDateInDays as brDateInDaysSP, startOfToday } from "../lib/dates"
import { currentStreakDays } from "../services/streak"
import { createActivity, createSubmission, createTransaction } from "./fixtures"
import { toCsv } from "../services/reports"
import { levelLabel } from "../shared/types"

/**
 * Contrato de `GET /api/reports/teacher-performance` (Task 4.2), espelhado do
 * servidor para o teste ler a resposta com nome em vez de `any`.
 */
interface TeacherActivityMetric {
  activityId: string
  title: string
  subject: string
  className: string
  deadline: string
  lateWindowDays: number
  deliveries: number
  approved: number
  rejected: number
  pending: number
  late: number
  donePct: number
}

interface TeacherRankingRow {
  studentName: string
  balance: number
  level: string
  streak: number
}

interface TeacherRankingGroup {
  className: string
  course: string
  rows: TeacherRankingRow[]
}

interface TeacherPerformanceBody {
  activities: TeacherActivityMetric[]
  ranking: TeacherRankingGroup[]
}

/** Agente autenticado — o mesmo tipo devolvido por `loginAgent`, já desembrulhado. */
type Agent = Awaited<ReturnType<typeof loginAgent>>

/** Lê o relatório de desempenho do professor e devolve o corpo tipado. */
async function performance(app: Express, email: string): Promise<TeacherPerformanceBody> {
  const agent = await loginAgent(app, email)
  const res = await agent.get("/api/reports/teacher-performance")
  expect(res.status, `relatório de desempenho falhou: ${JSON.stringify(res.body)}`).toBe(200)
  return res.body.data as TeacherPerformanceBody
}

/** A linha de uma atividade do relatório; falha com mensagem se ela não vier. */
function metricOf(body: TeacherPerformanceBody, activityId: string): TeacherActivityMetric {
  const row = body.activities.find((a) => a.activityId === activityId)
  if (!row) {
    throw new Error(`Atividade ${activityId} não apareceu no relatório do professor`)
  }
  return row
}

/** Cria uma atividade pela rota real e devolve o id criado. */
async function criarAtividade(agent: Agent, payload: Record<string, unknown>): Promise<string> {
  const res = await agent.post("/api/activities").send(payload)
  expect(res.status, `criação da atividade falhou: ${JSON.stringify(res.body)}`).toBe(201)
  return res.body.data.id as string
}

/** Aluno envia a entrega pela rota real e devolve id + marca de atraso. */
async function entregar(
  agent: Agent,
  activityId: string,
  comment: string,
): Promise<{ id: string; delayed: boolean }> {
  const res = await agent.post(`/api/activities/${activityId}/submissions`).field("comment", comment)
  expect(res.status, `envio da entrega falhou: ${JSON.stringify(res.body)}`).toBe(201)
  return res.body.data as { id: string; delayed: boolean }
}

/** Professor valida a entrega pela rota real e devolve o status resultante. */
async function validar(
  agent: Agent,
  submissionId: string,
  action: "approve" | "reject" | "revision",
  feedback: string,
): Promise<{ status: string; delayed: boolean }> {
  const res = await agent.post(`/api/submissions/${submissionId}/validate`).send({ action, feedback })
  expect(res.status, `validação falhou: ${JSON.stringify(res.body)}`).toBe(200)
  return res.body.data as { status: string; delayed: boolean }
}

describe("Relatórios e auditoria (RF11, RF12, RF14)", () => {
  let app: Express

  beforeAll(() => {
    prepareDb()
    app = makeApp()
  })

  it("relatório de conclusão: professor vê suas turmas; aluno não acessa", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const res = await marcelo.get("/api/reports/completion")
    expect(res.status).toBe(200)
    const rows = res.body.data as Array<{ className: string }>
    expect(rows.length).toBeGreaterThan(0)
    // O Prof. Marcelo é professor do 1º e do 2º Ano A (o 3º é da Prof. Sandra).
    expect(rows.map((r) => r.className)).toEqual(["1º Ano A", "2º Ano A"])

    const ana = await loginAgent(app, USERS.ana.email)
    const denied = await ana.get("/api/reports/completion")
    expect(denied.status).toBe(403)
  })

  it("relatório de pontos por aluno: ordenado por saldo (coord)", async () => {
    const coord = await loginAgent(app, USERS.juliana.email)
    const res = await coord.get("/api/reports/points")
    expect(res.status).toBe(200)
    const rows = res.body.data as Array<{ balance: number; level: string }>
    expect(rows.length).toBeGreaterThanOrEqual(5)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].balance).toBeGreaterThanOrEqual(rows[i].balance)
    }
  })

  it("CSV exportável com BOM e separador ;", async () => {
    const coord = await loginAgent(app, USERS.juliana.email)
    const res = await coord.get("/api/reports/points?format=csv")
    expect(res.status).toBe(200)
    const text = res.text
    expect(text.charCodeAt(0)).toBe(0xfeff)
    expect(text).toContain("Aluno;Turma;Saldo;Nível")
    expect(text).toContain("Ana Luiza Ribeiro")
  })

  it("relatório por tipo é exclusivo da coordenação", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const denied = await marcelo.get("/api/reports/activities-by-type")
    expect(denied.status).toBe(403)

    // A V3 não semeia atividades: as 4 pedagógicas + a ação escolar do relatório
    // são criadas aqui (professor cria; leitura é da coordenação), para o
    // agrupamento por tipo ter o que contar.
    const teacher = await loginAgent(app, USERS.marcelo.email)
    const coord = await loginAgent(app, USERS.juliana.email)
    const tipos: Array<{ title: string; type: string }> = [
      { title: "Atividade pedagógica 1", type: "academic" },
      { title: "Atividade pedagógica 2", type: "academic" },
      { title: "Atividade pedagógica 3", type: "academic" },
      { title: "Atividade pedagógica 4", type: "academic" },
      { title: "Mutirão de limpeza", type: "school_action" },
    ]
    for (const [i, atividade] of tipos.entries()) {
      const res = await teacher.post("/api/activities").send({
        title: `${atividade.title} ${i}`,
        subjectId: "s1",
        classId: "c1",
        points: 10,
        deadline: brDateInDays(10),
        type: atividade.type,
        status: "draft",
      })
      expect(res.status).toBe(201)
    }

    const res = await coord.get("/api/reports/activities-by-type")
    expect(res.status).toBe(200)
    const rows = res.body.data as Array<{ label: string; count: number }>
    expect(rows.length).toBe(2)
    expect(rows.some((r) => r.label === "Pedagógica" && r.count === 4)).toBe(true)
    expect(rows.some((r) => r.label === "Ação Escolar" && r.count === 1)).toBe(true)
  })

  it("lista de auditoria aceita filtros de ação e data", async () => {
    // A V3 não semeia auditoria: uma entrega aprovada aqui gera a linha que o
    // filtro precisa encontrar (e o teste de "não-coordenação" fica na 004).
    const ana = await loginAgent(app, USERS.ana.email)
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const coord = await loginAgent(app, USERS.juliana.email)
    const created = await marcelo.post("/api/activities").send({
      title: "Atividade auditada",
      subjectId: "s1",
      classId: "c1",
      points: 10,
      deadline: brDateInDays(10),
      type: "academic",
      status: "active",
    })
    expect(created.status).toBe(201)
    const activityId = created.body.data.id as string
    const submission = await ana
      .post(`/api/activities/${activityId}/submissions`)
      .field("comment", "entrega")
    expect(submission.status).toBe(201)
    const approved = await marcelo
      .post(`/api/submissions/${submission.body.data.id as string}/validate`)
      .send({ action: "approve", feedback: "Bom trabalho." })
    expect(approved.status).toBe(200)

    const res = await coord.get("/api/audit?action=SUBMISSION_APPROVED")
    expect(res.status).toBe(200)
    const logs = res.body.data as Array<{ action: string; userName: string }>
    expect(logs.length).toBe(1)
    expect(logs.every((l) => l.action === "SUBMISSION_APPROVED")).toBe(true)
    expect(logs[0].userName).toBeTruthy()
  })

  // ── 4.2 — Desempenho do professor (métricas por atividade + ranking) ───────
  // Mora em um `describe` COM BANCO PRÓPRIO (abaixo): a suíte acima planta seis
  // atividades do MESMO professor (o relatório por tipo e o de auditoria), e a
})

/**
 * Task 4.2 — desempenho do professor: métricas por atividade própria + ranking de
 * pontos das turmas dele, isolado por dono.
 *
 * Banco limpo e próprio (`prepareDb`): a suíte acima planta seis atividades do
 * MESMO professor (o relatório por tipo e o de auditoria), e o isolamento é
 * asserido por IGUALDADE DE CONJUNTO — com elas no mesmo banco o conjunto
 * esperado viraria "as doze atividades do Marcelo" e a prova perderia o sentido.
 */
describe("Desempenho do professor (Task 4.2)", () => {
  let app: Express

  beforeAll(() => {
    prepareDb()
    app = makeApp()
  })

  // O cenário é plantado UMA vez, no teste de preparação, e os testes seguintes
  // só leem. Plantar aqui (e não em cada teste) é o que permite comparar o
  // relatório antes/depois de uma exclusão sem duplicar 40 linhas de arranjo.
  let u6Isolada1: string
  let u6Isolada2: string
  let u6Metricas: string
  let u6Atrasada: string
  let u6Vazia: string
  let u6Ontem: string
  /** Atividade da Prof. Sandra (u7): não pode aparecer no relatório do u6. */
  let u7Alheia: string
  /** Prazos plantados, para o `deadline` ser conferido como foi gravado. */
  let prazoMetricas: string
  let prazoAtrasada: string

  it("prepara o cenário do relatório de desempenho do professor", async () => {
    const coord = await loginAgent(app, USERS.juliana.email)
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const sandra = await loginAgent(app, USERS.sandra.email)
    const ana = await loginAgent(app, USERS.ana.email)
    const mateus = await loginAgent(app, USERS.mateus.email)
    const beatriz = await loginAgent(app, USERS.beatriz.email)

    // O seed V3 traz DOIS alunos por turma, e a atividade de métricas precisa de
    // TRÊS entregas (aprovada, reprovada e em correção). A matrícula da 3ª aluna
    // entra pela rota real da coordenação (`PATCH /api/classes/:id`), que também
    // espelha o vínculo em `users.classIds` — é estado que a escola produz, não
    // plantado à mão. Efeito colateral aceito e usado na asserção do ranking: a
    // Beatriz passa a estar em c1 E em c2, então aparece em DOIS grupos — que é
    // o que "ranking por turma" significa (o `pointsReport` chapado resolve a
    // turma por `classIds[0]`, o que é errado para aluno em mais de uma).
    const roster = await coord.patch("/api/classes/c1").send({
      studentIds: [USERS.ana.id, USERS.mateus.id, USERS.beatriz.id],
    })
    expect(roster.status, `matrícula da 3ª aluna falhou: ${JSON.stringify(roster.body)}`).toBe(200)

    // ── Isolamento por dono: duas do Marcelo, uma da Sandra ─────────────────
    u6Isolada1 = await criarAtividade(marcelo, {
      title: "Lista de exercícios 1",
      subjectId: "s2",
      classId: "c1",
      points: 10,
      deadline: brDateInDays(10),
      type: "academic",
      status: "active",
    })
    u6Isolada2 = await criarAtividade(marcelo, {
      title: "Lista de exercícios 2",
      subjectId: "s2",
      classId: "c1",
      points: 10,
      deadline: brDateInDays(12),
      type: "academic",
      status: "active",
    })
    // A Sandra cria em c2, e não em c1 como o texto do plano pedia: `POST
    // /api/activities` recusa c1 para ela com 403 `TEACHER_NOT_IN_CLASS` (ela não
    // está em `c1.teacherIds`, que é do Marcelo). A divergência C1 é decisão de
    // produto em aberto — o isolamento por DONO que este round exige não depende
    // de a turma ser a mesma, e a 4.2 usa o mesmo recorte de 2.5.
    u7Alheia = await criarAtividade(sandra, {
      title: "Redação corporativa",
      subjectId: "s1",
      classId: "c2",
      points: 10,
      deadline: brDateInDays(9),
      type: "academic",
      status: "active",
    })

    // ── Atividade de métricas: 1 aprovada, 1 reprovada, 1 em correção ────────
    prazoMetricas = brDateInDays(10)
    u6Metricas = await criarAtividade(marcelo, {
      title: "Caderno de problemas",
      subjectId: "s2",
      classId: "c1",
      points: 10,
      deadline: prazoMetricas,
      type: "academic",
      status: "active",
    })
    const aprovada = await entregar(ana, u6Metricas, "Entrega dentro do prazo")
    expect((await validar(marcelo, aprovada.id, "approve", "Bom trabalho.")).status).toBe("approved")
    const reprovada = await entregar(mateus, u6Metricas, "Entrega incompleta")
    expect((await validar(marcelo, reprovada.id, "reject", "Faltou a segunda parte.")).status).toBe(
      "rejected",
    )
    const paraCorrigir = await entregar(beatriz, u6Metricas, "Entrega para corrigir")
    expect(
      (await validar(marcelo, paraCorrigir.id, "revision", "Ajuste os gráficos.")).status,
    ).toBe("revision_required")

    // ── Atividade com entrega ATRASADA aprovada ──────────────────────────────
    // O prazo no passado não sai por `POST /api/activities` (o guard recusa com
    // 422 `DEADLINE_IN_PAST`), então a atividade nasce pelo fixture local — que é
    // estado inicial, pelo mesmo caminho do seed. `lateWindowDays` fica no
    // DEFAULT da coluna (7 dias), então a janela AINDA está aberta e a entrega é
    // aceita: o que a marca como atrasada é o prazo, não o fim da janela.
    prazoAtrasada = brDateInDays(-3)
    u6Atrasada = createActivity(getDb(), {
      classId: "c1",
      teacherId: USERS.marcelo.id,
      subjectId: "s2",
      title: "Trabalho em grupo",
      points: 10,
      deadline: prazoAtrasada,
      status: "active",
    })
    const atrasada = await entregar(ana, u6Atrasada, "Entrega fora do prazo")
    expect(atrasada.delayed, "entrega com prazo vencido tem de ser marcada como atrasada").toBe(true)
    await validar(marcelo, atrasada.id, "approve", "Aprovado com meia pontuação.")

    // ── Atividade sem nenhuma entrega (a taxa não pode virar NaN) ───────────
    u6Vazia = await criarAtividade(marcelo, {
      title: "Revisão da matéria",
      subjectId: "s2",
      classId: "c1",
      points: 10,
      deadline: brDateInDays(15),
      type: "academic",
      status: "active",
    })

    // ── Sequência de ontem, para o `streak` do ranking ──────────────────────
    // Uma aprovação de ONTEM não é produzível por HTTP (a validação carimba o dia
    // de hoje), e é o que dá à Ana dois dias seguidos de sequência. A entrega é
    // plantada pelo fixture e NÃO gera transação de pontos: o saldo dela no
    // ranking continua sendo só o das duas aprovações reais (10 + 5).
    u6Ontem = createActivity(getDb(), {
      classId: "c1",
      teacherId: USERS.marcelo.id,
      subjectId: "s2",
      title: "Atividade de ontem",
      points: 10,
      status: "active",
    })
    createSubmission(getDb(), {
      activityId: u6Ontem,
      studentId: USERS.ana.id,
      status: "approved",
      validatedBy: USERS.marcelo.id,
      validatedAt: brDateInDaysSP(-1),
    })
  })

  it("relatório do professor contém apenas atividades próprias e métricas de atraso", async () => {
    const doMarcelo = await performance(app, USERS.marcelo.email)
    // Igualdade de conjunto, não `toContain`: o relatório do professor tem que ser
    // EXATAMENTE as atividades dele — a da Sandra (u7) não pode vazar nem um id.
    expect(doMarcelo.activities.map((a) => a.activityId).sort()).toEqual(
      [u6Isolada1, u6Isolada2, u6Metricas, u6Atrasada, u6Vazia, u6Ontem].sort(),
    )
    const daSandra = await performance(app, USERS.sandra.email)
    expect(daSandra.activities.map((a) => a.activityId)).toEqual([u7Alheia])

    // Atraso NÃO é exclusivo: a entrega atrasada e aprovada conta em `approved` E
    // em `late` ao mesmo tempo (é a que recebeu `ceil(pontos/2)` = 5), e a taxa
    // fecha em 100% porque 1 de 1 entrega foi aprovada.
    expect(metricOf(doMarcelo, u6Atrasada)).toEqual({
      activityId: u6Atrasada,
      title: "Trabalho em grupo",
      subject: "Matemática",
      className: "1º Ano A",
      // `deadline` volta CRU, exatamente como foi gravado (DD/MM/AAAA).
      deadline: prazoAtrasada,
      lateWindowDays: 7,
      deliveries: 1,
      approved: 1,
      rejected: 0,
      pending: 0,
      late: 1,
      donePct: 100,
    })
  })

  it("métricas por atividade: pendente é tudo que não foi aprovado nem reprovado", async () => {
    const body = await performance(app, USERS.marcelo.email)
    // 3 entregas = 1 aprovada + 1 reprovada + 1 em `revision_required`. As três
    // contas fecham: `pending` é o resto, não o literal `"pending"`, e por isso
    // aprovado + reprovado + pendente = entregas, sempre.
    expect(metricOf(body, u6Metricas)).toEqual({
      activityId: u6Metricas,
      title: "Caderno de problemas",
      subject: "Matemática",
      className: "1º Ano A",
      deadline: prazoMetricas,
      lateWindowDays: 7,
      deliveries: 3,
      approved: 1,
      rejected: 1,
      pending: 1,
      late: 0,
      donePct: 33,
    })
  })

  it("atividade sem entrega tem taxa 0, nunca NaN", async () => {
    const body = await performance(app, USERS.marcelo.email)
    const vazia = metricOf(body, u6Vazia)
    expect(vazia.deliveries).toBe(0)
    expect(vazia.approved).toBe(0)
    expect(vazia.rejected).toBe(0)
    expect(vazia.pending).toBe(0)
    expect(vazia.late).toBe(0)
    expect(vazia.donePct).toBe(0)
    expect(Number.isNaN(vazia.donePct)).toBe(false)
  })

  it("desempenho do professor é exclusivo do professor (coordenação, aluno e funcionário recebem 403)", async () => {
    // A coordenação tem o relatório geral da Fase 4.5; o aluno e o funcionário
    // não têm relatório de desempenho nenhum. Os três são 403.
    const naoAutorizados = [USERS.juliana.email, USERS.ana.email, USERS.carlos.email]
    for (const email of naoAutorizados) {
      const agent = await loginAgent(app, email)
      const res = await agent.get("/api/reports/teacher-performance")
      expect(res.status, `${email} não é professor e não pode ler o relatório de desempenho`).toBe(403)
    }
  })

  it("atividade excluída some do relatório sem alterar as métricas das outras", async () => {
    const antes = await performance(app, USERS.marcelo.email)
    expect(antes.activities.map((a) => a.activityId)).toContain(u6Metricas)

    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const deleted = await marcelo.delete(`/api/activities/${u6Metricas}`)
    expect(deleted.status, `exclusão falhou: ${JSON.stringify(deleted.body)}`).toBe(200)

    const depois = await performance(app, USERS.marcelo.email)
    // Some só a excluída (2.4): a lista inteira menos aquela.
    expect(depois.activities.map((a) => a.activityId).sort()).toEqual(
      antes.activities.map((a) => a.activityId).filter((id) => id !== u6Metricas).sort(),
    )
    // E as contagens das que ficaram são byte-a-byte as mesmas de antes — o que
    // prova que a exclusão não recalculou nada nas outras.
    expect(depois.activities).toEqual(
      antes.activities.filter((a) => a.activityId !== u6Metricas),
    )
  })

  it("ranking vem agrupado por turma, só com os alunos das turmas do professor", async () => {
    const body = await performance(app, USERS.marcelo.email)
    // Turmas onde o u6 está em `class.teacherIds` — o MESMO critério de
    // `pointsReport`. O 3º Ano A é da Prof. Sandra, então não aparece: é a
    // divergência C1 (o u6 atua lá pela rota de atividades, mas o relatório de
    // hoje escopa por `class.teacherIds`), preservada em vez de "consertada".
    expect(body.ranking.map((g) => g.className)).toEqual(["1º Ano A", "2º Ano A"])

    const primeiro = body.ranking[0]
    expect(primeiro.course).toBe("Técnico em Administração")
    // Igualdade de conjunto: a Fernanda (3º Ano A) não pode aparecer em nenhum
    // grupo, e a Beatriz aparece nos DOIS grupos em que é aluna.
    expect(primeiro.rows.map((r) => r.studentName).sort()).toEqual([
      "Ana Luiza Ribeiro",
      "Beatriz Souza",
      "Mateus Oliveira",
    ])
    const segundo = body.ranking[1]
    expect(segundo.rows.map((r) => r.studentName).sort()).toEqual([
      "Beatriz Souza",
      "Ricardo Lima",
    ])

    // Ordenado por saldo: a Ana é a única com pontos (10 da entrega no prazo + 5
    // da atrasada, `ceil(10/2)`), então ela lidera os dois grupos em que aparece.
    expect(primeiro.rows[0].studentName).toBe("Ana Luiza Ribeiro")
    expect(segundo.rows[0].studentName).toBe("Beatriz Souza")

    const ana = primeiro.rows.find((r) => r.studentName === "Ana Luiza Ribeiro")
    if (!ana) throw new Error("Ana ausente do ranking do 1º Ano A")
    expect(ana.balance).toBe(15)
    expect(ana.level).toContain("Bronze")

    // `streak` é o mesmo `currentStreakDays` do resto do servidor, com "hoje" em
    // São Paulo (`startOfToday`), nunca `new Date()` cru: a aprovação de hoje mais
    // a entrega plantada de ontem dão 2 dias, e a comparação é feita contra o
    // próprio helper para o contrato do serviço.
    expect(ana.streak).toBe(currentStreakDays(getDb(), USERS.ana.id, startOfToday()))
    expect(ana.streak).toBeGreaterThanOrEqual(1)
    for (const row of body.ranking.flatMap((g) => g.rows)) {
      expect(Number.isInteger(row.streak)).toBe(true)
      expect(row.streak).toBeGreaterThanOrEqual(0)
      expect(typeof row.level).toBe("string")
      expect(Number.isFinite(row.balance)).toBe(true)
    }
  })

  it("turma inativa sai do ranking do professor, sem mexer no resto do payload", async () => {
    // O recorte das turmas do ranking de desempenho é `class.teacherIds` E
    // `class.active` (`reports.ts:329`, na ordem da irmã `completionReport:42-43`).
    // Antes desta cobertura, mutar o serviço acrescentando `c.active &&` deixava a
    // suíte verde — isto é, o filtro não era testado por nada.
    const antes = await performance(app, USERS.marcelo.email)
    // O c2 é turma do Marcelo (`teacherIds` traz u6) e TEM alunos: sem isso o
    // grupo seria vazio e o teste passaria à toa.
    const grupoDesativado = antes.ranking.find((g) => g.className === "2º Ano A")
    expect(grupoDesativado?.rows.length ?? 0, "o c2 precisa ter aluno no cenário").toBeGreaterThan(0)
    expect(antes.ranking.map((g) => g.className)).toEqual(["1º Ano A", "2º Ano A"])

    // Desativação pela rota real e pelo papel real: é a coordenação que desativa
    // uma turma (`PATCH /api/classes/:id`), não um `UPDATE` no banco.
    const coord = await loginAgent(app, USERS.juliana.email)
    const desativada = await coord.patch("/api/classes/c2").send({ active: false })
    expect(desativada.status, `desativação falhou: ${JSON.stringify(desativada.body)}`).toBe(200)
    expect(desativada.body.data.active).toBe(false)

    const depois = await performance(app, USERS.marcelo.email)
    // Some o grupo INTEIRO, não as suas linhas: a turma inativa não é mais uma
    // turma do professor no relatório dele.
    expect(depois.ranking.map((g) => g.className)).toEqual(["1º Ano A"])
    // O grupo que ficou é o MESMO, byte a byte — desativar a turma não
    // recalculou saldo, nível nem sequência de ninguém.
    expect(depois.ranking).toEqual(antes.ranking.filter((g) => g.className !== "2º Ano A"))
    // E o resto do payload segue idêntico: as métricas por atividade são outro
    // recorte (por DONO da atividade, `reports.ts:239`), não por turma ativa.
    expect(depois.activities).toEqual(antes.activities)

    // Reativa no fim: o teste não pode deixar estado para os seguintes, e o
    // grupo voltar prova que o que o tirou foi a desativação, não outra coisa.
    const reativada = await coord.patch("/api/classes/c2").send({ active: true })
    expect(reativada.status, `reativação falhou: ${JSON.stringify(reativada.body)}`).toBe(200)
    expect((await performance(app, USERS.marcelo.email)).ranking).toEqual(antes.ranking)
  })

  it("?format=csv é ignorado pela rota de desempenho (CSV é da 4.3/4.5)", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const res = await marcelo.get("/api/reports/teacher-performance?format=csv")
    // A rota de 4.2 não tem ramo CSV (a spec pede CSV na MinhaTurma 4.3 e no
    // relatório da coordenação 4.5). O que acontece com `?format=csv` é o JSON
    // normal, sem erro: o parâmetro é lido só nas rotas que têm o ramo.
    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toContain("application/json")
    const body = res.body.data as TeacherPerformanceBody
    expect(Array.isArray(body.activities)).toBe(true)
    expect(Array.isArray(body.ranking)).toBe(true)
    expect(body.activities.length).toBeGreaterThan(0)
  })
})
// ----------------------------------------------------------------------------
// Task 4.5 — relatório completo da coordenação (filtros, detalhe e rankings)
// ----------------------------------------------------------------------------

interface CompletionBodyRow {
  className: string
  course: string
  students: number
  activities: number
  possible: number
  done: number
  pct: number
}

interface ActivitiesByTypeBodyRow {
  type: string
  label: string
  count: number
}

interface PointsBodyRow {
  studentName: string
  className: string
  balance: number
  level: string
}

interface ActivityDetailBodyRow {
  activityId: string
  title: string
  type: string
  subject: string
  className: string
  teacherName: string
  deadline: string
  createdAt: string
  deliveries: number
  approved: number
  rejected: number
  pending: number
  late: number
  donePct: number
}

interface ClassRankingBodyRow {
  studentName: string
  points: number
  level: string
}

interface ClassRankingBodyGroup {
  className: string
  course: string
  rows: ClassRankingBodyRow[]
}

interface SubjectRankingBodyRow {
  studentName: string
  className: string
  points: number
  level: string
}

interface SubjectRankingBodyGroup {
  subjectId: string
  subjectName: string
  icon: string
  rows: SubjectRankingBodyRow[]
}

interface TeacherSummaryBodyRow {
  teacherName: string
  activities: number
  deliveries: number
  approved: number
  late: number
  approvalPct: number
}

/** GET autenticado que exige 200 e devolve `body.data` tipado. */
async function getReport<T>(agent: Agent, path: string): Promise<T> {
  const res = await agent.get(path)
  expect(res.status, `GET ${path} falhou: ${JSON.stringify(res.body)}`).toBe(200)
  return res.body.data as T
}

/**
 * Banco limpo e próprio: o cenário abaixo planta atividades com datas
 * históricas, entregas e transações para exercitar período, filtros e os dois
 * rankings. Nenhum describe anterior pode vazar estado para cá.
 */
describe("Relatórios completos da coordenação (Task 4.5)", () => {
  let app: Express
  let coord: Agent
  let marcelo: Agent
  let ana: Agent
  let claraId: string

  /** Atividades do cenário. `aDraft` fica fora de completion/activity-detail. */
  let a1: string
  let a2: string
  let a3: string
  let a4: string
  let a5: string
  let a6: string
  let aDraft: string

  beforeAll(async () => {
    prepareDb()
    app = makeApp()
    coord = await loginAgent(app, USERS.juliana.email)
    marcelo = await loginAgent(app, USERS.marcelo.email)
    ana = await loginAgent(app, USERS.ana.email)

    // Terceiro aluno da c1: a atividade a1 precisa de 3 entregas (aprovada,
    // reprovada e pendente) sem inventar matrícula fora do roster.
    const clara = await coord.post("/api/users").send({
      name: "Clara Nunes",
      email: "clara@etec.sp.gov.br",
      password: "123456",
      role: "student",
      classId: "c1",
    })
    expect(clara.status, `criação da aluna falhou: ${JSON.stringify(clara.body)}`).toBe(201)
    claraId = clara.body.data.id as string

    const db = getDb()
    a1 = createActivity(db, {
      classId: "c1",
      teacherId: USERS.marcelo.id,
      subjectId: "s2",
      title: "Matemática c1",
      deadline: "10/09/2026",
      status: "active",
      createdAt: "10/03/2026, 08:00:00",
    })
    a2 = createActivity(db, {
      classId: "c1",
      teacherId: USERS.marcelo.id,
      subjectId: "s2",
      title: "Matemática c1 2",
      deadline: "11/09/2026",
      status: "active",
      createdAt: "20/03/2026, 08:00:00",
    })
    a3 = createActivity(db, {
      classId: "c2",
      teacherId: USERS.marcelo.id,
      subjectId: "s2",
      title: "Matemática c2",
      deadline: "09/09/2026",
      status: "active",
      createdAt: "10/03/2026, 08:00:00",
    })
    a4 = createActivity(db, {
      classId: "c2",
      teacherId: USERS.sandra.id,
      subjectId: "s1",
      title: "Português c2",
      deadline: "12/09/2026",
      status: "active",
      createdAt: "12/03/2026, 08:00:00",
    })
    a5 = createActivity(db, {
      classId: "c3",
      teacherId: USERS.marcelo.id,
      subjectId: "s2",
      title: "Matemática c3",
      deadline: "13/09/2026",
      status: "active",
      createdAt: "10/03/2026, 08:00:00",
    })
    a6 = createActivity(db, {
      classId: "c1",
      teacherId: USERS.marcelo.id,
      subjectId: "s1",
      title: "Ação escolar c1",
      type: "school_action",
      deadline: "14/09/2026",
      status: "active",
      createdAt: "10/03/2026, 08:00:00",
    })
    aDraft = createActivity(db, {
      classId: "c1",
      teacherId: USERS.marcelo.id,
      subjectId: "s2",
      title: "Rascunho c1",
      deadline: "15/09/2026",
      status: "draft",
      createdAt: "11/03/2026, 08:00:00",
    })

    // -- Entregas: a1 concentra aprovada/reprovada/pendente/atrasada ---------
    createSubmission(db, {
      activityId: a1,
      studentId: USERS.ana.id,
      status: "approved",
      submittedAt: "10/03/2026, 09:00:00",
      validatedBy: USERS.marcelo.id,
      validatedAt: "10/03/2026, 10:00:00",
    })
    createSubmission(db, {
      activityId: a1,
      studentId: USERS.mateus.id,
      status: "rejected",
      submittedAt: "11/03/2026, 09:00:00",
      validatedBy: USERS.marcelo.id,
      validatedAt: "11/03/2026, 10:00:00",
    })
    createSubmission(db, {
      activityId: a1,
      studentId: claraId,
      status: "under_review",
      submittedAt: "12/03/2026, 09:00:00",
      delayed: true,
    })
    createSubmission(db, {
      activityId: a2,
      studentId: USERS.ana.id,
      status: "approved",
      submittedAt: "20/03/2026, 09:00:00",
      validatedBy: USERS.marcelo.id,
      validatedAt: "20/03/2026, 10:00:00",
    })
    createSubmission(db, {
      activityId: a3,
      studentId: USERS.beatriz.id,
      status: "approved",
      submittedAt: "15/03/2026, 09:00:00",
      validatedBy: USERS.marcelo.id,
      validatedAt: "15/03/2026, 10:00:00",
    })
    createSubmission(db, {
      activityId: a4,
      studentId: USERS.ricardo.id,
      status: "approved",
      submittedAt: "10/03/2026, 09:00:00",
      validatedBy: USERS.sandra.id,
      validatedAt: "10/03/2026, 10:00:00",
    })
    createSubmission(db, {
      activityId: a5,
      studentId: USERS.fernanda.id,
      status: "approved",
      submittedAt: "10/03/2026, 09:00:00",
      validatedBy: USERS.marcelo.id,
      validatedAt: "10/03/2026, 10:00:00",
    })
    createSubmission(db, {
      activityId: a6,
      studentId: USERS.mateus.id,
      status: "approved",
      submittedAt: "11/03/2026, 09:00:00",
      validatedBy: USERS.marcelo.id,
      validatedAt: "11/03/2026, 10:00:00",
    })

    // -- Transações para os rankings -----------------------------------------
    createTransaction(db, {
      studentId: USERS.ana.id,
      amount: 10,
      type: "activity",
      relatedActivityId: a1,
      createdBy: USERS.marcelo.id,
      createdAt: "10/03/2026, 12:00:00",
    })
    createTransaction(db, {
      studentId: USERS.ana.id,
      amount: 5,
      type: "bonus",
      createdBy: USERS.juliana.id,
      createdAt: "10/03/2026, 12:00:00",
    })
    createTransaction(db, {
      studentId: USERS.ana.id,
      amount: 7,
      type: "activity",
      relatedActivityId: a2,
      createdBy: USERS.marcelo.id,
      createdAt: "20/03/2026, 12:00:00",
    })
    createTransaction(db, {
      studentId: USERS.mateus.id,
      amount: 20,
      type: "activity",
      relatedActivityId: a1,
      createdBy: USERS.marcelo.id,
      createdAt: "10/03/2026, 12:00:00",
    })
    createTransaction(db, {
      studentId: USERS.beatriz.id,
      amount: 30,
      type: "activity",
      relatedActivityId: a3,
      createdBy: USERS.marcelo.id,
      createdAt: "15/03/2026, 12:00:00",
    })
    createTransaction(db, {
      studentId: USERS.beatriz.id,
      amount: -5,
      type: "reward_redemption",
      createdBy: USERS.beatriz.id,
      createdAt: "15/03/2026, 12:00:00",
    })
    createTransaction(db, {
      studentId: USERS.ricardo.id,
      amount: 40,
      type: "activity",
      relatedActivityId: a4,
      createdBy: USERS.sandra.id,
      createdAt: "10/03/2026, 12:00:00",
    })
    createTransaction(db, {
      studentId: USERS.fernanda.id,
      amount: 50,
      type: "activity",
      relatedActivityId: a5,
      createdBy: USERS.marcelo.id,
      createdAt: "10/03/2026, 12:00:00",
    })
  })

  it("completion: alunos ativos × atividades ativas, com filtros de turma/matéria/professor", async () => {
    const todas = await getReport<CompletionBodyRow[]>(coord, "/api/reports/completion")
    expect(todas).toEqual([
      { className: "1º Ano A", course: "Técnico em Administração", students: 3, activities: 3, possible: 9, done: 3, pct: 33 },
      { className: "2º Ano A", course: "Técnico em Administração", students: 2, activities: 2, possible: 4, done: 2, pct: 50 },
      { className: "3º Ano A", course: "Técnico em Administração", students: 1, activities: 1, possible: 1, done: 1, pct: 100 },
    ])

    const soC1 = await getReport<CompletionBodyRow[]>(coord, "/api/reports/completion?classId=c1")
    expect(soC1.map((r) => r.className)).toEqual(["1º Ano A"])

    // s2: c1 tem a1/a2 (2), c2 tem a3 (1), c3 tem a5 (1).
    const matematica = await getReport<CompletionBodyRow[]>(coord, "/api/reports/completion?subjectId=s2")
    expect(matematica.find((r) => r.className === "1º Ano A")?.activities).toBe(2)
    expect(matematica.find((r) => r.className === "2º Ano A")?.activities).toBe(1)

    // u7 só tem a4 (c2); professor continua restrito às próprias turmas.
    const daSandra = await getReport<CompletionBodyRow[]>(coord, "/api/reports/completion?teacherId=u7")
    expect(daSandra.find((r) => r.className === "2º Ano A")?.possible).toBe(2)
    expect(daSandra.find((r) => r.className === "2º Ano A")?.done).toBe(1)
    expect(daSandra.find((r) => r.className === "1º Ano A")?.activities).toBe(0)

    // Professor NÃO consulta agregados de outro professor: `teacherId` é
    // IGNORADO para o papel teacher, então o recorte tem de ser idêntico ao sem
    // filtro — inclusive as atividades da Sandra nas turmas compartilhadas (c2).
    const semTeacherId = await getReport<CompletionBodyRow[]>(marcelo, "/api/reports/completion")
    const doMarcelo = await getReport<CompletionBodyRow[]>(marcelo, "/api/reports/completion?teacherId=u7")
    expect(doMarcelo).toEqual(semTeacherId)
    expect(doMarcelo.map((r) => r.className)).toEqual(["1º Ano A", "2º Ano A"])
    expect(doMarcelo.find((r) => r.className === "2º Ano A")?.activities).toBe(2)
    const foraDoEscopo = await getReport<CompletionBodyRow[]>(marcelo, "/api/reports/completion?classId=c3")
    expect(foraDoEscopo).toEqual([])
  })

  it("completion: período é sobre submittedAt e inclui as duas pontas", async () => {
    const dia10 = await getReport<CompletionBodyRow[]>(coord, "/api/reports/completion?from=2026-03-10&to=2026-03-10")
    expect(dia10.find((r) => r.className === "1º Ano A")?.done).toBe(1)
    expect(dia10.find((r) => r.className === "2º Ano A")?.done).toBe(1)
    expect(dia10.find((r) => r.className === "3º Ano A")?.done).toBe(1)

    // to=11 inclui a entrega de a6 em 11/03 (limite superior inclusivo).
    const ate11 = await getReport<CompletionBodyRow[]>(coord, "/api/reports/completion?from=2026-03-10&to=2026-03-11")
    expect(ate11.find((r) => r.className === "1º Ano A")?.done).toBe(2)
    // A de 20/03 (a2) continua fora.
    expect(ate11.find((r) => r.className === "1º Ano A")?.pct).toBe(22)

    // Data inexistente é ignorada em vez de esvaziar o relatório.
    const invalida = await getReport<CompletionBodyRow[]>(
      coord,
      "/api/reports/completion?from=2026-02-31&to=2026-03-11",
    )
    expect(invalida.find((r) => r.className === "1º Ano A")?.done).toBe(2)
  })

  it("points: filtros de período, turma, matéria e professor", async () => {
    const todas = await getReport<PointsBodyRow[]>(coord, "/api/reports/points")
    expect(todas.find((r) => r.studentName === "Ana Luiza Ribeiro")?.balance).toBe(22)
    expect(todas.find((r) => r.studentName === "Beatriz Souza")?.balance).toBe(25)

    // Período 10–10: só as transações do dia; o bônus de 10/03 entra.
    const dia10 = await getReport<PointsBodyRow[]>(
      coord,
      "/api/reports/points?from=2026-03-10&to=2026-03-10",
    )
    expect(dia10.find((r) => r.studentName === "Ana Luiza Ribeiro")?.balance).toBe(15)
    expect(dia10.find((r) => r.studentName === "Beatriz Souza")?.balance).toBe(0)
    expect(dia10.find((r) => r.studentName === "Ricardo Lima")?.balance).toBe(40)

    // Turma: só o roster da c1, com o nome da turma filtrada.
    const c1 = await getReport<PointsBodyRow[]>(coord, "/api/reports/points?classId=c1")
    expect(c1.map((r) => r.studentName).sort()).toEqual([
      "Ana Luiza Ribeiro",
      "Clara Nunes",
      "Mateus Oliveira",
    ])
    expect(c1.every((r) => r.className === "1º Ano A")).toBe(true)

    // Matéria: só transações de atividades de s2; o bônus da Ana (sem vínculo) sai.
    const s2 = await getReport<PointsBodyRow[]>(coord, "/api/reports/points?subjectId=s2")
    expect(s2.find((r) => r.studentName === "Ana Luiza Ribeiro")?.balance).toBe(17)
    expect(s2.find((r) => r.studentName === "Ricardo Lima")?.balance).toBe(0)

    // Professor: só a transação de a4 (Sandra).
    const daSandra = await getReport<PointsBodyRow[]>(coord, "/api/reports/points?teacherId=u7")
    expect(daSandra.find((r) => r.studentName === "Ricardo Lima")?.balance).toBe(40)
    expect(daSandra.find((r) => r.studentName === "Ana Luiza Ribeiro")?.balance).toBe(0)

    // Professor NÃO amplia o escopo via query e `teacherId` alheio é ignorado:
    // o resultado é o mesmo de sem filtro (roster c1+c2), então a Fernanda (c3)
    // não aparece e o classId fora do escopo devolve vazio.
    const pontosSemTeacherId = await getReport<PointsBodyRow[]>(marcelo, "/api/reports/points")
    const doMarcelo = await getReport<PointsBodyRow[]>(marcelo, "/api/reports/points?teacherId=u7")
    expect(doMarcelo).toEqual(pontosSemTeacherId)
    expect(doMarcelo.map((r) => r.studentName)).not.toContain("Fernanda Costa")
    expect(await getReport<PointsBodyRow[]>(marcelo, "/api/reports/points?classId=c3")).toEqual([])
  })

  it("activities-by-type: filtros e período sobre createdAt, com limite superior inclusivo", async () => {
    const todas = await getReport<ActivitiesByTypeBodyRow[]>(coord, "/api/reports/activities-by-type")
    expect(todas).toEqual([
      { type: "academic", label: "Pedagógica", count: 6 },
      { type: "school_action", label: "Ação Escolar", count: 1 },
    ])

    // 10–11/03: a1, a3, a5 e o rascunho (11/03) são acadêmicas; a6 é ação escolar.
    const periodo = await getReport<ActivitiesByTypeBodyRow[]>(
      coord,
      "/api/reports/activities-by-type?from=2026-03-10&to=2026-03-11",
    )
    expect(periodo).toEqual([
      { type: "academic", label: "Pedagógica", count: 4 },
      { type: "school_action", label: "Ação Escolar", count: 1 },
    ])

    const c1 = await getReport<ActivitiesByTypeBodyRow[]>(
      coord,
      "/api/reports/activities-by-type?classId=c1&from=2026-03-10&to=2026-03-11",
    )
    expect(c1).toEqual([
      { type: "academic", label: "Pedagógica", count: 2 },
      { type: "school_action", label: "Ação Escolar", count: 1 },
    ])

    const s2 = await getReport<ActivitiesByTypeBodyRow[]>(
      coord,
      "/api/reports/activities-by-type?subjectId=s2&from=2026-03-10&to=2026-03-11",
    )
    expect(s2).toEqual([{ type: "academic", label: "Pedagógica", count: 4 }])

    const daSandra = await getReport<ActivitiesByTypeBodyRow[]>(coord, "/api/reports/activities-by-type?teacherId=u7")
    expect(daSandra).toEqual([{ type: "academic", label: "Pedagógica", count: 1 }])
  })

  it("activity-detail: contagens de RN03, atraso, donePct e teacherName", async () => {
    const linhas = await getReport<ActivityDetailBodyRow[]>(coord, "/api/reports/activity-detail")
    // Só atividades ativas (o rascunho sai) e ordenadas por prazo.
    expect(linhas.map((r) => r.activityId)).toEqual([a3, a1, a2, a4, a5, a6])

    const linhaA1 = linhas.find((r) => r.activityId === a1)
    expect(linhaA1).toEqual({
      activityId: a1,
      title: "Matemática c1",
      type: "academic",
      subject: "Matemática",
      className: "1º Ano A",
      teacherName: "Prof. Marcelo Ferreira",
      deadline: "10/09/2026",
      createdAt: "10/03/2026, 08:00:00",
      deliveries: 3,
      approved: 1,
      rejected: 1,
      pending: 1,
      late: 1,
      donePct: 33,
    })

    // A Sandra: o nome vem do JOIN com users.
    expect(linhas.find((r) => r.activityId === a4)?.teacherName).toBe("Prof. Sandra Alves")

    // Período 10–10: só a entrega da Ana em a1; a reprovada (11/03) e a
    // pendente (12/03) ficam de fora.
    const dia10 = await getReport<ActivityDetailBodyRow[]>(
      coord,
      "/api/reports/activity-detail?from=2026-03-10&to=2026-03-10",
    )
    expect(dia10.find((r) => r.activityId === a1)).toMatchObject({
      deliveries: 1,
      approved: 1,
      rejected: 0,
      pending: 0,
      late: 0,
      donePct: 100,
    })
    expect(dia10.find((r) => r.activityId === a6)?.deliveries).toBe(0)

    // to=11 inclui a reprovada (limite superior inclusivo).
    const ate11 = await getReport<ActivityDetailBodyRow[]>(
      coord,
      "/api/reports/activity-detail?from=2026-03-10&to=2026-03-11",
    )
    expect(ate11.find((r) => r.activityId === a1)).toMatchObject({
      deliveries: 2,
      approved: 1,
      rejected: 1,
      pending: 0,
      late: 0,
      donePct: 50,
    })
    expect(ate11.find((r) => r.activityId === a6)?.deliveries).toBe(1)
  })

  it("activity-detail: filtros de turma, matéria e professor", async () => {
    const c2 = await getReport<ActivityDetailBodyRow[]>(coord, "/api/reports/activity-detail?classId=c2")
    expect(c2.map((r) => r.activityId)).toEqual([a3, a4])

    const portugues = await getReport<ActivityDetailBodyRow[]>(coord, "/api/reports/activity-detail?subjectId=s1")
    expect(portugues.map((r) => r.activityId)).toEqual([a4, a6])

    const daSandra = await getReport<ActivityDetailBodyRow[]>(coord, "/api/reports/activity-detail?teacherId=u7")
    expect(daSandra.map((r) => r.activityId)).toEqual([a4])
  })

  it("rankings/classes: escopo, ordenação, filtros e período", async () => {
    const grupos = await getReport<ClassRankingBodyGroup[]>(coord, "/api/reports/rankings/classes")
    expect(grupos.map((g) => g.className)).toEqual(["1º Ano A", "2º Ano A", "3º Ano A"])
    expect(grupos[0].rows).toEqual([
      { studentName: "Ana Luiza Ribeiro", points: 22, level: levelLabel(22) },
      { studentName: "Mateus Oliveira", points: 20, level: levelLabel(20) },
      { studentName: "Clara Nunes", points: 0, level: levelLabel(0) },
    ])
    expect(grupos[1].rows).toEqual([
      { studentName: "Ricardo Lima", points: 40, level: levelLabel(40) },
      { studentName: "Beatriz Souza", points: 25, level: levelLabel(25) },
    ])
    expect(grupos[2].rows).toEqual([
      { studentName: "Fernanda Costa", points: 50, level: levelLabel(50) },
    ])

    // Período 10–10: a transação de 15/03 da Beatriz sai; o bônus de 10/03 entra
    // no saldo sem filtro de matéria/professor.
    const dia10 = await getReport<ClassRankingBodyGroup[]>(
      coord,
      "/api/reports/rankings/classes?from=2026-03-10&to=2026-03-10",
    )
    expect(dia10[0].rows).toEqual([
      { studentName: "Mateus Oliveira", points: 20, level: levelLabel(20) },
      { studentName: "Ana Luiza Ribeiro", points: 15, level: levelLabel(15) },
      { studentName: "Clara Nunes", points: 0, level: levelLabel(0) },
    ])
    expect(dia10[1].rows.find((r) => r.studentName === "Beatriz Souza")?.points).toBe(0)

    // Limite superior inclusivo: 15/03 entra quando to=15.
    const ate15 = await getReport<ClassRankingBodyGroup[]>(
      coord,
      "/api/reports/rankings/classes?from=2026-03-10&to=2026-03-15",
    )
    expect(ate15[1].rows.find((r) => r.studentName === "Beatriz Souza")?.points).toBe(25)

    // subjectId=s2: só transações de atividades da matéria; o bônus da Ana sai.
    const matematica = await getReport<ClassRankingBodyGroup[]>(
      coord,
      "/api/reports/rankings/classes?subjectId=s2",
    )
    expect(matematica[0].rows).toEqual([
      { studentName: "Mateus Oliveira", points: 20, level: levelLabel(20) },
      { studentName: "Ana Luiza Ribeiro", points: 17, level: levelLabel(17) },
      { studentName: "Clara Nunes", points: 0, level: levelLabel(0) },
    ])
    expect(matematica[1].rows).toEqual([
      { studentName: "Beatriz Souza", points: 30, level: levelLabel(30) },
      { studentName: "Ricardo Lima", points: 0, level: levelLabel(0) },
    ])

    // teacherId=u7: só a transação de a4 (Português, c2).
    const daSandra = await getReport<ClassRankingBodyGroup[]>(
      coord,
      "/api/reports/rankings/classes?teacherId=u7",
    )
    expect(daSandra[1].rows).toEqual([
      { studentName: "Ricardo Lima", points: 40, level: levelLabel(40) },
      { studentName: "Beatriz Souza", points: 0, level: levelLabel(0) },
    ])
    expect(daSandra[0].rows.every((r) => r.points === 0)).toBe(true)

    const soC3 = await getReport<ClassRankingBodyGroup[]>(coord, "/api/reports/rankings/classes?classId=c3")
    expect(soC3.map((g) => g.className)).toEqual(["3º Ano A"])
  })

  it("rankings/subjects: escopo, ordenação, filtros e período", async () => {
    const grupos = await getReport<SubjectRankingBodyGroup[]>(coord, "/api/reports/rankings/subjects")
    expect(grupos.map((g) => g.subjectId)).toEqual(["s1", "s2"])
    expect(grupos[0].subjectName).toBe("Língua Portuguesa")
    expect(grupos[0].rows).toEqual([
      { studentName: "Ricardo Lima", className: "2º Ano A", points: 40, level: levelLabel(40) },
    ])
    expect(grupos[1].rows).toEqual([
      { studentName: "Fernanda Costa", className: "3º Ano A", points: 50, level: levelLabel(50) },
      { studentName: "Beatriz Souza", className: "2º Ano A", points: 30, level: levelLabel(30) },
      { studentName: "Mateus Oliveira", className: "1º Ano A", points: 20, level: levelLabel(20) },
      { studentName: "Ana Luiza Ribeiro", className: "1º Ano A", points: 17, level: levelLabel(17) },
    ])

    const soS2 = await getReport<SubjectRankingBodyGroup[]>(coord, "/api/reports/rankings/subjects?subjectId=s2")
    expect(soS2.map((g) => g.subjectId)).toEqual(["s2"])

    const c1 = await getReport<SubjectRankingBodyGroup[]>(coord, "/api/reports/rankings/subjects?classId=c1")
    expect(c1.map((g) => g.subjectId)).toEqual(["s2"])
    expect(c1[0].rows).toEqual([
      { studentName: "Mateus Oliveira", className: "1º Ano A", points: 20, level: levelLabel(20) },
      { studentName: "Ana Luiza Ribeiro", className: "1º Ano A", points: 17, level: levelLabel(17) },
    ])

    const daSandra = await getReport<SubjectRankingBodyGroup[]>(
      coord,
      "/api/reports/rankings/subjects?teacherId=u7",
    )
    expect(daSandra.map((g) => g.subjectId)).toEqual(["s1"])
    expect(daSandra[0].rows[0].studentName).toBe("Ricardo Lima")

    // Período 10–10: a transação de 15/03 da Beatriz fica de fora.
    const dia10 = await getReport<SubjectRankingBodyGroup[]>(
      coord,
      "/api/reports/rankings/subjects?from=2026-03-10&to=2026-03-10",
    )
    expect(dia10[0].rows).toEqual([
      { studentName: "Ricardo Lima", className: "2º Ano A", points: 40, level: levelLabel(40) },
    ])
    expect(dia10[1].rows).toEqual([
      { studentName: "Fernanda Costa", className: "3º Ano A", points: 50, level: levelLabel(50) },
      { studentName: "Mateus Oliveira", className: "1º Ano A", points: 20, level: levelLabel(20) },
      { studentName: "Ana Luiza Ribeiro", className: "1º Ano A", points: 10, level: levelLabel(10) },
    ])

    // Limite superior inclusivo: 15/03 entra quando to=15.
    const ate15 = await getReport<SubjectRankingBodyGroup[]>(
      coord,
      "/api/reports/rankings/subjects?from=2026-03-10&to=2026-03-15",
    )
    expect(ate15[1].rows.find((r) => r.studentName === "Beatriz Souza")?.points).toBe(30)
  })

  it("CSV dos relatórios: BOM, separador ;, cabeçalho e nome do arquivo", async () => {
    const casos: Array<{ path: string; header: string; filename: string; contem: string }> = [
      {
        path: "/api/reports/completion?format=csv&classId=c1",
        header: "Turma;Curso;Alunos;Atividades;Possíveis;Concluídas;%",
        filename: "relatorio-conclusao.csv",
        contem: "1º Ano A",
      },
      {
        path: "/api/reports/activities-by-type?format=csv&teacherId=u7",
        header: "Tipo;Quantidade",
        filename: "relatorio-atividades-tipo.csv",
        contem: "Pedagógica;1",
      },
      {
        path: "/api/reports/activity-detail?format=csv&classId=c1",
        header:
          "Atividade;Tipo;Matéria;Turma;Professor;Prazo;Entregas;Aprovadas;Reprovadas;Pendentes;Atrasadas;Aprovação",
        filename: "relatorio-atividades.csv",
        contem: "Matemática c1",
      },
      {
        path: "/api/reports/teacher-summary?format=csv&teacherId=u7",
        header: "Professor;Atividades;Entregas;Aprovadas;Atrasadas;Aprovação %",
        filename: "relatorio-professores.csv",
        contem: "Prof. Sandra Alves",
      },
      {
        path: "/api/reports/rankings/classes?format=csv&classId=c1",
        header: "Turma;Curso;Aluno;Pontos;Nível",
        filename: "relatorio-ranking-turmas.csv",
        contem: "Ana Luiza Ribeiro",
      },
      {
        path: "/api/reports/rankings/subjects?format=csv&subjectId=s2",
        header: "Matéria;Aluno;Turma;Pontos;Nível",
        filename: "relatorio-ranking-materias.csv",
        contem: "Fernanda Costa",
      },
    ]

    for (const caso of casos) {
      const res = await coord.get(caso.path)
      expect(res.status, `CSV ${caso.path} falhou`).toBe(200)
      expect(res.text.charCodeAt(0), `BOM ausente em ${caso.path}`).toBe(0xfeff)
      expect(res.text, `cabeçalho ausente em ${caso.path}`).toContain(caso.header)
      expect(res.text, `conteúdo ausente em ${caso.path}`).toContain(caso.contem)
      expect(res.headers["content-type"], `content-type de ${caso.path}`).toContain("text/csv")
      expect(res.headers["content-disposition"]).toContain(caso.filename)
    }
  })

  it("rotas novas são exclusivas da coordenação; professor e aluno recebem 403", async () => {
    const rotas = [
      "/api/reports/activity-detail",
      "/api/reports/teacher-summary",
      "/api/reports/rankings/classes",
      "/api/reports/rankings/subjects",
    ]
    for (const rota of rotas) {
      expect((await marcelo.get(rota)).status, `professor em ${rota}`).toBe(403)
      expect((await ana.get(rota)).status, `aluno em ${rota}`).toBe(403)
      expect((await coord.get(rota)).status, `coordenação em ${rota}`).toBe(200)
    }
  })

  it("relatório sem sessão é 401 e staff em rota coordinator-only é 403", async () => {
    // Sem cookie `sid`, `requireAuth` responde 401 — a regressão que um teste só
    // de 403 (sessão válida de papel errado) não pega.
    const semSessao = await request(app).get("/api/reports/completion")
    expect(semSessao.status).toBe(401)

    const carlos = await loginAgent(app, USERS.carlos.email)
    expect((await carlos.get("/api/reports/activity-detail")).status).toBe(403)
    expect((await carlos.get("/api/reports/teacher-summary")).status).toBe(403)
  })

  it("teacher-summary: agrega conclusão e atraso por professor, com filtros", async () => {
    const resumo = await getReport<TeacherSummaryBodyRow[]>(coord, "/api/reports/teacher-summary")
    // Marcelo: a1,a2,a3,a5,a6 = 5 atividades; 7 entregas (3+1+1+1+1), 5
    // aprovadas e 1 atrasada (a de `under_review` em a1). 5/7 = 71%.
    // Sandra: só a4, 1 entrega aprovada, sem atraso.
    expect(resumo).toEqual([
      {
        teacherName: "Prof. Marcelo Ferreira",
        activities: 5,
        deliveries: 7,
        approved: 5,
        late: 1,
        approvalPct: 71,
      },
      {
        teacherName: "Prof. Sandra Alves",
        activities: 1,
        deliveries: 1,
        approved: 1,
        late: 0,
        approvalPct: 100,
      },
    ])

    const c1 = await getReport<TeacherSummaryBodyRow[]>(
      coord,
      "/api/reports/teacher-summary?classId=c1",
    )
    expect(c1).toEqual([
      {
        teacherName: "Prof. Marcelo Ferreira",
        activities: 3,
        deliveries: 5,
        approved: 3,
        late: 1,
        approvalPct: 60,
      },
    ])

    const daSandra = await getReport<TeacherSummaryBodyRow[]>(
      coord,
      "/api/reports/teacher-summary?teacherId=u7",
    )
    expect(daSandra).toEqual([
      {
        teacherName: "Prof. Sandra Alves",
        activities: 1,
        deliveries: 1,
        approved: 1,
        late: 0,
        approvalPct: 100,
      },
    ])
  })

  it("completion: aluno aprovado que é desativado sai de done; pct nunca passa de 100", async () => {
    const antes = await getReport<CompletionBodyRow[]>(coord, "/api/reports/completion?classId=c1")
    expect(antes[0]).toMatchObject({ students: 3, activities: 3, possible: 9, done: 3, pct: 33 })

    const desativado = await coord.patch(`/api/users/${USERS.mateus.id}`).send({ active: false })
    expect(desativado.status, `desativação falhou: ${JSON.stringify(desativado.body)}`).toBe(200)

    const depois = await getReport<CompletionBodyRow[]>(coord, "/api/reports/completion?classId=c1")
    // Roster ativo cai para 2 (Ana e Clara). A aprovação do Mateus em a6 deixa de
    // contar JUNTO com o aluno: sem o corte no roster, done ficaria 3 com
    // possible 6 (50%) e a métrica seguiria furada.
    expect(depois[0]).toMatchObject({ students: 2, activities: 3, possible: 6, done: 2, pct: 33 })
    expect(depois[0].done).toBeLessThanOrEqual(depois[0].possible)
    expect(depois[0].pct).toBeLessThanOrEqual(100)

    const reativado = await coord.patch(`/api/users/${USERS.mateus.id}`).send({ active: true })
    expect(reativado.status, `reativação falhou: ${JSON.stringify(reativado.body)}`).toBe(200)
    expect(await getReport<CompletionBodyRow[]>(coord, "/api/reports/completion?classId=c1")).toEqual(antes)
  })

  it("rankings/subjects: aluno e turma inativos saem do ranking", async () => {
    const antes = await getReport<SubjectRankingBodyGroup[]>(coord, "/api/reports/rankings/subjects")
    expect(
      antes.find((g) => g.subjectId === "s2")?.rows.map((r) => r.studentName),
    ).toContain("Fernanda Costa")

    const turmaDesativada = await coord.patch("/api/classes/c3").send({ active: false })
    expect(turmaDesativada.status, `desativação da turma falhou: ${JSON.stringify(turmaDesativada.body)}`).toBe(200)
    const semC3 = await getReport<SubjectRankingBodyGroup[]>(coord, "/api/reports/rankings/subjects")
    expect(semC3.find((g) => g.subjectId === "s2")?.rows.map((r) => r.studentName)).not.toContain(
      "Fernanda Costa",
    )
    const turmaReativada = await coord.patch("/api/classes/c3").send({ active: true })
    expect(turmaReativada.status, `reativação da turma falhou: ${JSON.stringify(turmaReativada.body)}`).toBe(200)

    const alunoDesativado = await coord.patch(`/api/users/${USERS.beatriz.id}`).send({ active: false })
    expect(alunoDesativado.status, `desativação do aluno falhou: ${JSON.stringify(alunoDesativado.body)}`).toBe(200)
    const semBeatriz = await getReport<SubjectRankingBodyGroup[]>(coord, "/api/reports/rankings/subjects")
    expect(semBeatriz.find((g) => g.subjectId === "s2")?.rows.map((r) => r.studentName)).not.toContain(
      "Beatriz Souza",
    )
    const alunoReativado = await coord.patch(`/api/users/${USERS.beatriz.id}`).send({ active: true })
    expect(alunoReativado.status, `reativação do aluno falhou: ${JSON.stringify(alunoReativado.body)}`).toBe(200)

    expect(await getReport<SubjectRankingBodyGroup[]>(coord, "/api/reports/rankings/subjects")).toEqual(antes)
  })

  it("points/rankings: pontos de atividade soft-deleted continuam contando (decisão 3)", async () => {
    const db = getDb()
    const atividadeExcluida = createActivity(db, {
      classId: "c3",
      teacherId: USERS.marcelo.id,
      subjectId: "s2",
      title: "Atividade excluída depois da aprovação",
      deadline: "13/09/2026",
      status: "active",
      createdAt: "10/03/2026, 08:00:00",
    })
    createTransaction(db, {
      studentId: USERS.fernanda.id,
      amount: 25,
      type: "activity",
      relatedActivityId: atividadeExcluida,
      createdBy: USERS.marcelo.id,
      createdAt: "10/03/2026, 12:00:00",
    })

    const saldoFernanda = async (path: string) =>
      (await getReport<PointsBodyRow[]>(coord, path)).find((r) => r.studentName === "Fernanda Costa")
        ?.balance
    // Antes: 50 (a5, s2/u6) + 25 da atividade nova.
    expect(await saldoFernanda("/api/reports/points")).toBe(75)
    expect(await saldoFernanda("/api/reports/points?subjectId=s2")).toBe(75)
    expect(await saldoFernanda("/api/reports/points?teacherId=u6")).toBe(75)

    const deleted = await marcelo.delete(`/api/activities/${atividadeExcluida}`)
    expect(deleted.status, `exclusão falhou: ${JSON.stringify(deleted.body)}`).toBe(200)

    // Decisão 3: a exclusão não estorna pontos. O saldo e os recortes por
    // matéria/professor continuam com os mesmos 75, e o ranking por matéria idem.
    expect(await saldoFernanda("/api/reports/points")).toBe(75)
    expect(await saldoFernanda("/api/reports/points?subjectId=s2")).toBe(75)
    expect(await saldoFernanda("/api/reports/points?teacherId=u6")).toBe(75)
    const ranking = await getReport<SubjectRankingBodyGroup[]>(coord, "/api/reports/rankings/subjects")
    expect(
      ranking.find((g) => g.subjectId === "s2")?.rows.find((r) => r.studentName === "Fernanda Costa")
        ?.points,
    ).toBe(75)
  })

  it("toCsv: BOM no início e escaping de ;, aspas e quebra de linha", () => {
    const csv = toCsv(
      ["Nome", "Observação"],
      [["Ana; Beatriz", 'Ele disse "oi"\ne tchau']],
    )
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toBe('\uFEFFNome;Observação\r\n"Ana; Beatriz";"Ele disse ""oi""\ne tchau"')
  })
})
