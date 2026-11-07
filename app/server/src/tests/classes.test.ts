import { describe, it, expect, beforeAll } from "vitest"
import { makeApp, prepareDb, loginAgent, USERS } from "./helpers"
import type { Express } from "express"
import { getDb } from "../db/connection"
import { brDateInDays, startOfToday } from "../lib/dates"
import { currentStreakDays } from "../services/streak"
import { levelLabel } from "../shared/types"
import { createActivity, createSubmission, createTransaction } from "./fixtures"

type Agent = Awaited<ReturnType<typeof loginAgent>>

// Lacuna de cobertura: CRUD de turmas (RF13) — somente coordenação.
describe("CRUD de turmas (RF13)", () => {
  let app: Express

  beforeAll(() => {
    prepareDb()
    app = makeApp()
  })

  /** Cada cenário reinicia o banco e autentica a coordenação. */
  async function setupCoord(): Promise<Agent> {
    prepareDb()
    return loginAgent(app, USERS.juliana.email)
  }

  it("coordenação cria turma", async () => {
    const coord = await setupCoord()
    const res = await coord.post("/api/classes").send({
      name: "INFO-1A",
      course: "Técnico em Informática",
      year: 1,
      shift: "morning",
    })
    expect(res.status).toBe(201)
    expect(res.body.data.id).toBeDefined()
    expect(res.body.data.name).toBe("INFO-1A")
    expect(res.body.data.studentIds).toEqual([])
    expect(res.body.data.teacherIds).toEqual([])
  })

  it("coordenação lista turmas; aluno vê apenas a própria turma", async () => {
    const coord = await setupCoord()
    const all = await coord.get("/api/classes")
    expect(all.status).toBe(200)
    expect(all.body.data).toHaveLength(3) // seed c1, c2 e c3

    const ana = await loginAgent(app, USERS.ana.email)
    const studentList = await ana.get("/api/classes")
    expect(studentList.status).toBe(200)
    expect(studentList.body.data.map((c: { id: string }) => c.id)).toEqual(["c1"])
  })

  it("coordenação edita turma e persiste alteração", async () => {
    const coord = await setupCoord()
    const res = await coord.patch("/api/classes/c1").send({ name: "1º Ano A (atualizada)" })
    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe("1º Ano A (atualizada)")

    const again = await coord.get("/api/classes")
    const c1 = again.body.data.find((c: { id: string }) => c.id === "c1")
    expect(c1?.name).toBe("1º Ano A (atualizada)")
  })

  it("delete de turma com membros → 409 CLASS_HAS_MEMBERS", async () => {
    const coord = await setupCoord()
    const res = await coord.delete("/api/classes/c1") // c1 tem alunos/professores
    expect(res.status).toBe(409)
    expect(res.body.details).toBe("CLASS_HAS_MEMBERS")
  })

  it("delete de turma sem vínculos → 200 e some da listagem", async () => {
    const coord = await setupCoord()
    const created = await coord.post("/api/classes").send({
      name: "VAZIA-1A",
      course: "Curso Teste",
      year: 1,
      shift: "evening",
    })
    const id = created.body.data.id as string

    const res = await coord.delete(`/api/classes/${id}`)
    expect(res.status).toBe(200)

    const list = await coord.get("/api/classes")
    expect(list.body.data.some((c: { id: string }) => c.id === id)).toBe(false)
  })

  it("não-coordenação recebe 403 ao criar/editar/excluir turma", async () => {
    await setupCoord()

    const teacher = await loginAgent(app, USERS.marcelo.email)
    const teacherCreate = await teacher.post("/api/classes").send({
      name: "X",
      course: "Y",
      year: 1,
      shift: "morning",
    })
    expect(teacherCreate.status).toBe(403)

    const teacherEdit = await teacher.patch("/api/classes/c1").send({ name: "hack" })
    expect(teacherEdit.status).toBe(403)

    const teacherDelete = await teacher.delete("/api/classes/c1")
    expect(teacherDelete.status).toBe(403)

    const student = await loginAgent(app, USERS.ana.email)
    const studentCreate = await student.post("/api/classes").send({
      name: "X",
      course: "Y",
      year: 1,
      shift: "morning",
    })
    expect(studentCreate.status).toBe(403)
  })

  it("payload inválido na criação → 400 com details", async () => {
    const coord = await setupCoord()
    const res = await coord.post("/api/classes").send({ name: "Só o nome" })
    expect(res.status).toBe(400)
    expect(res.body.details).toBeDefined()
  })
})

// ─── Minha turma (4.3) ───────────────────────────────────────────────────────

/**
 * Contrato de `GET /api/classes/:id/detail`, espelhado do servidor para o teste
 * ler a resposta com nome em vez de `any` (mesma convenção de `reports.test.ts`).
 */
interface DetalheAluno {
  id: string
  name: string
  email: string
  balance: number
  level: string
  streak: number
  approved: number
}

interface DetalheMateria {
  name: string
  avg: number
}

interface DetalheBody {
  class: { id: string; name: string; course: string; active: boolean }
  students: DetalheAluno[]
  subjects: DetalheMateria[]
  stats: { students: number; avgBalance: number; total: number }
}

describe("Detalhe da turma do professor (GET /api/classes/:id/detail) — 4.3", () => {
  let app: Express

  beforeAll(() => {
    prepareDb()
    app = makeApp()
  })

  /** Cada cenário começa do seed limpo (o seed V3 é sem histórico). */
  async function setup(email: string): Promise<Agent> {
    prepareDb()
    return loginAgent(app, email)
  }

  /** Lê o detalhe de uma turma e falha com mensagem se a resposta não for 200. */
  async function detail(agent: Agent, classId: string): Promise<DetalheBody> {
    const res = await agent.get(`/api/classes/${classId}/detail`)
    expect(res.status, `detalhe falhou: ${JSON.stringify(res.body)}`).toBe(200)
    return res.body.data as DetalheBody
  }

  /** A linha de um aluno do detalhe; falha com mensagem se ele não vier. */
  function aluno(body: DetalheBody, studentId: string): DetalheAluno {
    const row = body.students.find((s) => s.id === studentId)
    if (!row) throw new Error(`Aluno ${studentId} não apareceu no detalhe da turma`)
    return row
  }

  /** Cria uma turma pela rota real (a coordenação é quem cria) e devolve o id. */
  async function criarTurma(coord: Agent, extra: Record<string, unknown> = {}): Promise<string> {
    const res = await coord.post("/api/classes").send({
      name: "1º Ano B",
      course: "Técnico em Administração",
      year: 1,
      shift: "morning",
      ...extra,
    })
    expect(res.status, `criação da turma falhou: ${JSON.stringify(res.body)}`).toBe(201)
    return res.body.data.id as string
  }

  it("professor só abre detalhe de turmas onde atua (403 + TEACHER_NOT_IN_CLASS + auditoria)", async () => {
    // c1 é do Prof. Marcelo (`teacherIds` traz u6); a Prof. Sandra (u7) só atua em
    // c2 e c3. Este é o recorte de `GET /api/classes` e o dos relatórios da 4.2.
    const sandra = await setup(USERS.sandra.email)
    const res = await sandra.get("/api/classes/c1/detail")

    expect(res.status).toBe(403)
    expect(res.body.error).toBeTruthy()
    expect(res.body.details).toBe("TEACHER_NOT_IN_CLASS")
    // E nada da turma vaza no corpo da negativa.
    expect(res.body.data).toBeUndefined()

    // A tentativa fica auditada (RN06) — e a linha diz de QUAL turma, porque um
    // `entityId` de template ("/:id/detail") seria indistinguível entre turmas.
    const coord = await loginAgent(app, USERS.juliana.email)
    const linhas = (
      await coord.get("/api/audit?action=ACCESS_DENIED")
    ).body.data as Array<{ userId: string; action: string; entityId: string; description: string }>
    const negadas = linhas.filter((l) => l.userId === USERS.sandra.id)
    expect(negadas.length).toBeGreaterThan(0)
    const daC1 = negadas.find((l) => l.entityId.includes("/c1/detail"))
    if (!daC1) throw new Error(`nenhuma linha de auditoria nomeia o detalhe do c1: ${JSON.stringify(negadas)}`)
    expect(daC1.action).toBe("ACCESS_DENIED")
    expect(daC1.description).toContain("1º Ano A")
  })

  it("aluno recebe 403 mesmo estando na studentIds da turma", async () => {
    // R2: a Ana é aluna do c1 (`studentIds` traz u1), mas a rota é do professor.
    const ana = await setup(USERS.ana.email)
    const res = await ana.get("/api/classes/c1/detail")

    expect(res.status).toBe(403)
    expect(res.body.data).toBeUndefined()
    expect(res.body.details).toBeTruthy()
    // A mesma negativa do aluno é auditada.
    const coord = await loginAgent(app, USERS.juliana.email)
    const linhas = (await coord.get("/api/audit?action=ACCESS_DENIED")).body.data as Array<{
      userId: string
    }>
    expect(linhas.some((l) => l.userId === USERS.ana.id)).toBe(true)
  })

  it("coordenação e staff abrem o detalhe de qualquer turma", async () => {
    const coord = await setup(USERS.juliana.email)
    const daCoord = await detail(coord, "c1")
    expect(daCoord.class.id).toBe("c1")
    expect(daCoord.class.name).toBe("1º Ano A")
    expect(daCoord.class.course).toBe("Técnico em Administração")
    expect(Array.isArray(daCoord.students)).toBe(true)
    // A coordenação não é aluna nem professora: o roster é o da turma, não o dela.
    expect(daCoord.students.map((s) => s.id).sort()).toEqual([USERS.ana.id, USERS.mateus.id])

    // O funcionário tem o mesmo acesso global da coordenação nesta rota.
    const carlos = await loginAgent(app, USERS.carlos.email)
    const doStaff = await detail(carlos, "c1")
    expect(doStaff.class.id).toBe("c1")
  })

  it("professor atuante vê os alunos com nome, e-mail, nível, saldo, sequência e aprovadas", async () => {
    const marcelo = await setup(USERS.marcelo.email)
    const coord = await loginAgent(app, USERS.juliana.email)

    // Turma do cenario com `studentIds` sujo de proposito: um PROFESSOR (u6, nao
    // aluno) e um aluno DESATIVADO logo abaixo. O roster tem de sair limpo pelos
    // dois motivos, e e isso que prova o filtro `role = 'student' AND active = 1`.
    const classId = await criarTurma(coord, {
      studentIds: [USERS.ana.id, USERS.mateus.id, USERS.marcelo.id],
      teacherIds: [USERS.marcelo.id],
    })
    const desativado = await coord.patch(`/api/users/${USERS.mateus.id}`).send({ active: false })
    expect(desativado.status, `desativação do aluno falhou: ${JSON.stringify(desativado.body)}`).toBe(200)

    try {
      const db = getDb()
      const atividade = createActivity(db, {
        classId,
        teacherId: USERS.marcelo.id,
        subjectId: "s2",
        title: "Revisão de matemática",
        points: 30,
      })
      // Aprovação de HOJE: é o que dá sequência >= 1 e um approved.
      createSubmission(db, {
        activityId: atividade,
        studentId: USERS.ana.id,
        status: "approved",
        validatedBy: USERS.marcelo.id,
        validatedAt: `${brDateInDays(0)} 10:00:00`,
      })
      // 30 da entrega + 100 de bônus da coordenação (SEM relatedActivityId) = 130,
      // que é Prata: um saldo de Bronze não distinguiria `level` do derivado.
      createTransaction(db, {
        studentId: USERS.ana.id,
        amount: 30,
        type: "activity",
        relatedActivityId: atividade,
      })
      createTransaction(db, { studentId: USERS.ana.id, amount: 100, type: "bonus" })

      const body = await detail(marcelo, classId)

      // O roster é o MESMO do ranking da 4.2 (`studentsOfClass`): só a Ana.
      expect(body.students.map((s) => s.id)).toEqual([USERS.ana.id])
      expect(body.students.map((s) => s.id)).not.toContain(USERS.mateus.id) // aluno desativado
      expect(body.students.map((s) => s.id)).not.toContain(USERS.marcelo.id) // professor em studentIds

      const ana = aluno(body, USERS.ana.id)
      expect(ana.name).toBe("Ana Luiza Ribeiro")
      expect(ana.email).toBe("ana@etec.sp.gov.br")
      expect(ana.balance).toBe(130)
      // `level` é RÓTULO pronto (RN04): conferido contra o derivado e contra o
      // texto, para o servidor não poder entregar o rótulo de outro saldo.
      expect(ana.level).toBe(levelLabel(130))
      expect(ana.level).toBe("🥈 Prata")
      expect(ana.approved).toBe(1)
      expect(ana.streak).toBe(currentStreakDays(getDb(), USERS.ana.id, startOfToday()))
      expect(ana.streak).toBe(1)

      // R4: os três campos de `stats` derivam da MESMA lista `students`.
      expect(body.stats).toEqual({ students: 1, avgBalance: 130, total: 130 })
      expect(body.stats.total).toBe(body.students.reduce((acc, s) => acc + s.balance, 0))
    } finally {
      await coord.patch(`/api/users/${USERS.mateus.id}`).send({ active: true })
    }
  })

  it("turma inexistente → 404 (o 404 vem antes do 403, para não vazar existência)", async () => {
    const marcelo = await setup(USERS.marcelo.email)
    const res = await marcelo.get("/api/classes/cX-nao-existe/detail")
    expect(res.status).toBe(404)
    expect(res.body.data).toBeUndefined()
  })

  it("CSV da turma: BOM, cabeçalho e uma linha por aluno", async () => {
    const marcelo = await setup(USERS.marcelo.email)
    const db = getDb()
    // Duas atividades na c1 para a matéria aparecer, e uma entrega aprovada da Ana.
    const atividade = createActivity(db, {
      classId: "c1",
      teacherId: USERS.marcelo.id,
      subjectId: "s2",
      title: "Revisão de frações",
      points: 20,
    })
    createSubmission(db, {
      activityId: atividade,
      studentId: USERS.ana.id,
      status: "approved",
      validatedBy: USERS.marcelo.id,
    })
    createTransaction(db, {
      studentId: USERS.ana.id,
      amount: 20,
      type: "activity",
      relatedActivityId: atividade,
    })

    // O número de linhas de dados é conferido contra o JSON da mesma turma: as
    // duas respostas têm de descrever a MESMA lista de alunos.
    const body = await detail(marcelo, "c1")

    const res = await marcelo.get("/api/classes/c1/detail?format=csv")
    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toContain("text/csv")
    expect(res.headers["content-disposition"]).toBe('attachment; filename="turma-c1.csv"')

    const texto = res.text as string
    // BOM para o Excel abrir em UTF-8 (mesmo `toCsv` dos relatórios).
    expect(texto.charCodeAt(0)).toBe(0xfeff)
    const linhas = texto.slice(1).split("\r\n")
    expect(linhas[0]).toBe("Aluno;E-mail;Nível;Saldo;Sequência;Aprovadas")
    expect(linhas.length - 1).toBe(body.students.length)
    // A linha da Ana é a do roster, com saldo e aprovadas do detalhe.
    const linhaAna = linhas.find((l) => l.startsWith("Ana Luiza Ribeiro;"))
    if (!linhaAna) throw new Error(`CSV sem a linha da Ana: ${JSON.stringify(linhas)}`)
    expect(linhaAna).toContain("ana@etec.sp.gov.br")
    expect(linhaAna).toContain("🥉 Bronze")
    expect(linhaAna).toContain("20")
  })

  it("RN04: o saldo é a soma das transações e nunca fica negativo", async () => {
    const marcelo = await setup(USERS.marcelo.email)
    const db = getDb()
    // Ana: 40 - 5 = 35 (soma com sinal). Mateus: 10 - 25 = -15 no banco, que
    // precisa chegar como 0 e não como -15 (RN04).
    createTransaction(db, { studentId: USERS.ana.id, amount: 40, type: "bonus" })
    createTransaction(db, { studentId: USERS.ana.id, amount: -5, type: "reward_redemption" })
    createTransaction(db, { studentId: USERS.mateus.id, amount: 10, type: "bonus" })
    createTransaction(db, { studentId: USERS.mateus.id, amount: -25, type: "reward_redemption" })

    const body = await detail(marcelo, "c1")

    const ana = aluno(body, USERS.ana.id)
    expect(ana.balance).toBe(35)
    expect(ana.level).toBe(levelLabel(35))

    const mateus = aluno(body, USERS.mateus.id)
    expect(mateus.balance).toBe(0)
    expect(mateus.balance).toBeGreaterThanOrEqual(0)
    expect(mateus.level).toBe("🥉 Bronze")
    // Nenhum saldo negativo sai da rota, nenhum.
    for (const row of body.students) expect(row.balance).toBeGreaterThanOrEqual(0)
    // E o resumo bate com as linhas (R4), inclusive com o aluno zerado.
    expect(body.stats).toEqual({ students: 2, avgBalance: 17.5, total: 35 })
  })

  it("R3: aprovadas contam só de atividade desta turma e que não foi excluída", async () => {
    const marcelo = await setup(USERS.marcelo.email)
    const db = getDb()

    const conta = createActivity(db, {
      classId: "c1",
      teacherId: USERS.marcelo.id,
      subjectId: "s2",
      title: "Atividade que conta",
      points: 10,
    })
    createSubmission(db, {
      activityId: conta,
      studentId: USERS.ana.id,
      status: "approved",
      validatedBy: USERS.marcelo.id,
    })

    const deOutraTurma = createActivity(db, {
      classId: "c2",
      teacherId: USERS.sandra.id,
      subjectId: "s2",
      title: "Atividade da outra turma",
      points: 10,
    })
    createSubmission(db, {
      activityId: deOutraTurma,
      studentId: USERS.ana.id,
      status: "approved",
      validatedBy: USERS.sandra.id,
    })

    const excluida = createActivity(db, {
      classId: "c1",
      teacherId: USERS.marcelo.id,
      subjectId: "s2",
      title: "Atividade excluída",
      points: 10,
    })
    createSubmission(db, {
      activityId: excluida,
      studentId: USERS.ana.id,
      status: "approved",
      validatedBy: USERS.marcelo.id,
    })
    // Soft delete pela rota real e pelo dono (2.4): a entrega continua no banco,
    // mas a atividade não existe mais para o app.
    const deleteRes = await marcelo.delete(`/api/activities/${excluida}`)
    expect(deleteRes.status, `exclusão falhou: ${JSON.stringify(deleteRes.body)}`).toBe(200)
    // Recarrega o db: a rota de delete abre transação própria.
    expect(
      (getDb().prepare("SELECT deletedAt FROM activities WHERE id = ?").get(excluida) as {
        deletedAt: string | null
      }).deletedAt,
      "a atividade precisa estar soft-deleted para o cenário valer",
    ).not.toBeNull()

    // Reprovada e pendente também não contam: só `approved`.
    const naoAprovada = createActivity(db, {
      classId: "c1",
      teacherId: USERS.marcelo.id,
      subjectId: "s2",
      title: "Atividade em análise",
      points: 10,
    })
    createSubmission(db, {
      activityId: naoAprovada,
      studentId: USERS.ana.id,
      status: "under_review",
    })
    createSubmission(db, {
      activityId: naoAprovada,
      studentId: USERS.ana.id,
      status: "rejected",
      validatedBy: USERS.marcelo.id,
    })

    // Bônus, ajuste, sequência e reforço NÃO são entrega: entram no saldo e
    // não podem aparecer como "aprovadas".
    createTransaction(db, { studentId: USERS.ana.id, amount: 50, type: "bonus" })
    createTransaction(db, { studentId: USERS.ana.id, amount: 20, type: "manual_adjustment" })
    createTransaction(db, { studentId: USERS.ana.id, amount: 10, type: "streak" })
    createTransaction(db, { studentId: USERS.ana.id, amount: 5, type: "study_content" })

    const body = await detail(marcelo, "c1")
    const ana = aluno(body, USERS.ana.id)

    // Só a entrega da atividade que CONTA: a da outra turma, a da excluída e as
    // não aprovadas ficam de fora.
    expect(ana.approved).toBe(1)
    expect(aluno(body, USERS.mateus.id).approved).toBe(0)
    // E o saldo leva as quatro transações — a prova de que são coisas diferentes.
    expect(ana.balance).toBe(85)
  })

  it("R5: média por matéria só traz as matérias com atividade na turma, e só o que está ligado à atividade", async () => {
    const marcelo = await setup(USERS.marcelo.email)
    const db = getDb()

    // Matemática NA c1: 60 de pontos ligados à atividade + 40 de bônus e 25 de
    // ajuste, que NÃO têm relatedActivityId e não podem entrar na média.
    const matematica = createActivity(db, {
      classId: "c1",
      teacherId: USERS.marcelo.id,
      subjectId: "s2",
      title: "Equações",
      points: 60,
    })
    createTransaction(db, {
      studentId: USERS.ana.id,
      amount: 60,
      type: "activity",
      relatedActivityId: matematica,
    })
    createTransaction(db, { studentId: USERS.mateus.id, amount: 40, type: "bonus" })
    createTransaction(db, { studentId: USERS.mateus.id, amount: 25, type: "manual_adjustment" })

    // Língua Portuguesa NA c1, com atividade e sem nenhum ponto: aparece com 0.
    createActivity(db, {
      classId: "c1",
      teacherId: USERS.marcelo.id,
      subjectId: "s1",
      title: "Crônica",
      points: 15,
    })

    // Geografia (s12) só na c2: não entra na c1, mesmo com 100 pontos ligados.
    const geografia = createActivity(db, {
      classId: "c2",
      teacherId: USERS.sandra.id,
      subjectId: "s12",
      title: "Cartografia",
      points: 100,
    })
    createTransaction(db, {
      studentId: USERS.ana.id,
      amount: 100,
      type: "activity",
      relatedActivityId: geografia,
    })

    // Física (s9) com a ÚNICA atividade da c1 excluída (2.4): atividade
    // excluída não entra em nenhuma métrica, então a matéria não aparece.
    const fisica = createActivity(db, {
      classId: "c1",
      teacherId: USERS.marcelo.id,
      subjectId: "s9",
      title: "Óptica",
      points: 50,
    })
    createTransaction(db, {
      studentId: USERS.ana.id,
      amount: 50,
      type: "activity",
      relatedActivityId: fisica,
    })
    expect((await marcelo.delete(`/api/activities/${fisica}`)).status).toBe(200)

    const body = await detail(marcelo, "c1")

    // Só duas matérias: as 16 do seed (`subjects.classIds = ["c1","c2","c3"]`)
    // NÃO podem vazar aqui, e nem as de outra turma.
    expect(body.subjects.map((s) => s.name)).toEqual(["Língua Portuguesa", "Matemática"])

    // 60 pontos ligados ÷ 2 alunos ativos da c1 (Ana e Mateus) = 30. O bônus e o
    // ajuste do Mateus (65) estão no saldo dele e NÃO entram na média.
    const mates = body.subjects.find((s) => s.name === "Matemática")
    if (!mates) throw new Error(`Matemática ausente: ${JSON.stringify(body.subjects)}`)
    expect(mates.avg).toBe(30)
    // O que PROVA a exclusão dos não ligados: com o bônus (40) e o ajuste (25)
    // do Mateus dentro da soma, a média da matéria seria (60 + 65) / 2 = 62.5.
    expect(mates.avg).not.toBe(62.5)
    // A matéria com atividade e sem ponto é 0, e não uma ausência.
    expect(body.subjects.find((s) => s.name === "Língua Portuguesa")?.avg).toBe(0)
    // Uma casa decimal, e nunca NaN.
    for (const materia of body.subjects) {
      expect(Number.isFinite(materia.avg)).toBe(true)
      expect(Math.round(materia.avg * 10) / 10).toBe(materia.avg)
    }
    // O saldo de cada aluno, ao contrário, leva TUDO — inclusive o que a média por
    // matéria não leva: é a prova de que as duas contas são diferentes. Ana tem
    // 60 (matemática da c1) + 100 (geografia da c2) + 50 (física da c1, cuja
    // atividade foi excluída depois: a transação continua no saldo) = 210.
    expect(aluno(body, USERS.ana.id).balance).toBe(210)
    expect(aluno(body, USERS.mateus.id).balance).toBe(65)
  })

  it("turma inativa continua servindo o detalhe (R7)", async () => {
    const marcelo = await setup(USERS.marcelo.email)
    const coord = await loginAgent(app, USERS.juliana.email)

    // `GET /api/classes` NÃO filtra `active`, então a turma desativada aparece na
    // lista que o professor vê; negar o clique seria pior que serving.
    const listaAntes = (await marcelo.get("/api/classes")).body.data as Array<{ id: string; active: boolean }>
    expect(listaAntes.map((c) => c.id)).toContain("c1")

    const desativada = await coord.patch("/api/classes/c1").send({ active: false })
    expect(desativada.status, `desativação falhou: ${JSON.stringify(desativada.body)}`).toBe(200)
    try {
      const listaDepois = (await marcelo.get("/api/classes")).body.data as Array<{ id: string }>
      expect(listaDepois.map((c) => c.id)).toContain("c1")

      const body = await detail(marcelo, "c1")
      expect(body.class.id).toBe("c1")
      // O campo `active` continua no payload — é assim que a tela avisa, e sem
      // nenhum campo NOVO (R7).
      expect(body.class.active).toBe(false)
      expect(body.students.map((s) => s.id).sort()).toEqual([USERS.ana.id, USERS.mateus.id])
    } finally {
      await coord.patch("/api/classes/c1").send({ active: true })
    }
  })
})