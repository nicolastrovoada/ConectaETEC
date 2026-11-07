import { describe, it, expect, beforeAll } from "vitest"
import { makeApp, prepareDb, loginAgent, USERS, brDateInDays } from "./helpers"
import type { Express } from "express"
import { getDb } from "../db/connection"
import { brDateInDays as brDateInDaysSP, startOfToday } from "../lib/dates"
import { currentStreakDays } from "../services/streak"
import { createActivity, createSubmission } from "./fixtures"

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