import { describe, it, expect, beforeAll, beforeEach } from "vitest"
import type { Express } from "express"
import { makeApp, prepareDb, loginAgent, USERS, brDateInDays } from "./helpers"
import { getDb } from "../db/connection"
import { resetApiRateLimits } from "../auth/rateLimit"
import { brDateInDays as spDateInDays, nowBR } from "../lib/dates"
import { canViewActivity } from "../routes/activities"
import type { Activity, SafeUser } from "../shared/types"

type Agent = Awaited<ReturnType<typeof loginAgent>>

/**
 * Soft delete de atividade (V3, Tarefa 2.4).
 *
 * O que este arquivo fixa: excluir uma atividade é **marcar**, não apagar — a
 * linha continua no banco com `deletedAt`/`deletedBy`, some de TODA leitura que
 * a mostra ao usuário (listagem, detalhe, painel) e só volta a aparecer para
 * quem explicitamente pede `?deleted=true` (coordenação e o próprio professor).
 *
 * Nenhum teste aqui confia no status HTTP da rota de exclusão: todos passam por
 * uma leitura DEPOIS da exclusão (listagem, detalhe, painel, extrato do aluno),
 * porque é a leitura que decide se o filtro existe de fato.
 */
describe("Soft delete de atividade (2.4)", () => {
  let app: Express

  beforeAll(() => {
    app = makeApp()
  })

  beforeEach(() => {
    prepareDb()
    resetApiRateLimits()
  })

  /** Cria atividade por HTTP (o mesmo caminho do professor) e devolve o id. */
  async function criar(
    agent: Agent,
    over: { classId?: string; subjectId?: string; status?: "draft" | "active" | "closed"; points?: number; title?: string } = {},
  ): Promise<string> {
    const res = await agent.post("/api/activities").send({
      title: over.title ?? "Atividade de teste do soft delete",
      description: "Descricao",
      subjectId: over.subjectId ?? "s2",
      classId: over.classId ?? "c1",
      points: over.points ?? 40,
      deadline: brDateInDays(5),
      type: "academic",
      status: over.status ?? "active",
    })
    expect(res.status).toBe(201)
    return res.body.data.id as string
  }

  function listaDe(agent: Agent, query = ""): Promise<{ status: number; body: { data: Activity[] } }> {
    return agent.get(`/api/activities${query}`) as unknown as Promise<{
      status: number
      body: { data: Activity[] }
    }>
  }

  function linhaNoBanco(id: string): { deletedAt: string | null; deletedBy: string | null; title: string } {
    const row = getDb()
      .prepare("SELECT deletedAt, deletedBy, title FROM activities WHERE id = ?")
      .get(id) as { deletedAt: string | null; deletedBy: string | null; title: string } | undefined
    if (!row) throw new Error(`Fixture: atividade ${id} nao existe no banco`)
    return row
  }

  function auditoria(action: string, entityId: string): Array<{ userId: string; entity: string; description: string }> {
    return getDb()
      .prepare("SELECT userId, entity, description FROM auditLogs WHERE action = ? AND entityId = ?")
      .all(action, entityId) as unknown as Array<{ userId: string; entity: string; description: string }>
  }

  // ─── Step 1 do plano: o soft delete em si ───────────────────────────────────

  it("soft delete: atividade some da listagem mas fica no banco com deletedAt; coordenador a ve com deleted=true", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const id = await criar(marcelo, { title: "Projeto de gestão — v1" })

    const res = await marcelo.delete(`/api/activities/${id}`)
    expect(res.status).toBe(200)
    expect(res.body.data.deletedAt).toEqual(expect.any(String))
    expect(res.body.data.deletedBy).toBe(USERS.marcelo.id)

    // A linha continua no banco — soft delete, nunca purge.
    const row = linhaNoBanco(id)
    expect(row.deletedAt).toEqual(expect.any(String))
    expect(row.deletedBy).toBe(USERS.marcelo.id)

    // Listagem comum (qualquer papel): não devolve a atividade.
    const padrao = await listaDe(marcelo)
    expect(padrao.status).toBe(200)
    expect(padrao.body.data.map((a) => a.id)).not.toContain(id)

    // Coordenação asking explicitamente pelas excluídas: devolve.
    const coord = await loginAgent(app, USERS.juliana.email)
    const excluidas = await listaDe(coord, "?deleted=true")
    expect(excluidas.status).toBe(200)
    const achada = excluidas.body.data.find((a) => a.id === id)
    expect(achada).toBeDefined()
    expect(achada?.title).toBe("Projeto de gestão — v1")
    expect(achada?.deletedBy).toBe(USERS.marcelo.id)
  })

  it("a exclusão fica na auditoria (RN06) com o autor e a entidade da atividade", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const id = await criar(marcelo)
    expect(auditoria("ACTIVITY_DELETED", id)).toHaveLength(0)

    await marcelo.delete(`/api/activities/${id}`)

    const logs = auditoria("ACTIVITY_DELETED", id)
    expect(logs).toHaveLength(1)
    expect(logs[0].userId).toBe(USERS.marcelo.id)
    expect(logs[0].entity).toBe("Activity")
    // A descrição carrega o título: é o elo causal legível depois que a
    // atividade sai das listagens (o id sozinho não diz nada para quem lê).
    expect(logs[0].description).toContain("Atividade de teste do soft delete")
  })

  it("deletedAt sai em data/hora pt-BR de São Paulo (nada de ISO/UTC)", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const id = await criar(marcelo)

    await marcelo.delete(`/api/activities/${id}`)
    const deletedAt = linhaNoBanco(id).deletedAt ?? ""

    // Mesmo formato de `nowBR()` (DD/MM/AAAA, HH:MM:SS) — um `toISOString()`
    // (2026-09-28T03:20:05Z) reprovaria aqui. A janela de ±1 dia absorve a
    // virada de meia-noite em SP entre a requisição e a asserção; a prova de
    // que o helper é o de São Paulo está em `tests/dates.test.ts`.
    expect(deletedAt).toMatch(/^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}:\d{2}$/)
    expect([spDateInDays(-1), nowBR().slice(0, 10), spDateInDays(1)]).toContain(deletedAt.slice(0, 10))
  })

  // ─── Filtro nas listagens ───────────────────────────────────────────────────

  it("nenhum papel recebe a atividade excluída na listagem padrão", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const id = await criar(marcelo, { classId: "c1" })
    await marcelo.delete(`/api/activities/${id}`)

    for (const email of [USERS.ana.email, USERS.marcelo.email, USERS.carlos.email, USERS.juliana.email]) {
      const agent = await loginAgent(app, email)
      const res = await listaDe(agent)
      expect(res.status).toBe(200)
      expect(res.body.data.map((a) => a.id)).not.toContain(id)
    }
  })

  it("aluno nunca recebe a excluída, nem pedindo deleted=true", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const id = await criar(marcelo, { classId: "c1" })
    await marcelo.delete(`/api/activities/${id}`)

    const ana = await loginAgent(app, USERS.ana.email)
    for (const query of ["", "?deleted=true", "?deleted=false"]) {
      const res = await listaDe(ana, query)
      expect(res.status).toBe(200)
      expect(res.body.data.map((a) => a.id)).not.toContain(id)
    }
  })

  it("professor com deleted=true ve somente as excluidas dele", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const sandra = await loginAgent(app, USERS.sandra.email)
    const idMarcelo = await criar(marcelo, { classId: "c1", title: "A do Marcelo" })
    const idSandra = await criar(sandra, { classId: "c2", title: "A da Sandra" })
    await marcelo.delete(`/api/activities/${idMarcelo}`)
    await sandra.delete(`/api/activities/${idSandra}`)

    const doMarcelo = await listaDe(marcelo, "?deleted=true")
    expect(doMarcelo.body.data.map((a) => a.id)).toEqual([idMarcelo])

    const coord = await loginAgent(app, USERS.juliana.email)
    const daCoordenacao = await listaDe(coord, "?deleted=true")
    expect(daCoordenacao.body.data.map((a) => a.id).sort()).toEqual([idMarcelo, idSandra].sort())
  })

  it("detalhe de atividade excluída é 404 para todos os papéis", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const id = await criar(marcelo, { classId: "c1" })
    await marcelo.delete(`/api/activities/${id}`)

    for (const email of [USERS.ana.email, USERS.marcelo.email, USERS.carlos.email, USERS.juliana.email]) {
      const agent = await loginAgent(app, email)
      const res = await agent.get(`/api/activities/${id}`)
      expect(res.status).toBe(404)
    }
  })

  it("canViewActivity trata atividade excluída como não visível para nenhum papel", () => {
    const deletada: Activity = {
      id: "a-del",
      title: "Excluída",
      description: "",
      subjectId: "s2",
      teacherId: USERS.marcelo.id,
      classId: "c1",
      points: 10,
      deadline: "31/12/2026",
      lateWindowDays: 7,
      type: "academic",
      status: "active",
      createdAt: "01/09/2026, 08:00:00",
      deletedAt: "28/09/2026, 10:00:00",
      deletedBy: USERS.marcelo.id,
    }
    const users: SafeUser[] = [
      { id: USERS.ana.id, name: "Ana", email: USERS.ana.email, role: "student", active: true, avatar: "A", classIds: ["c1"], createdAt: "01/08/2026" },
      { id: USERS.marcelo.id, name: "Marcelo", email: USERS.marcelo.email, role: "teacher", active: true, avatar: "MF", classIds: ["c1", "c2", "c3"], createdAt: "01/08/2026" },
      { id: USERS.carlos.id, name: "Carlos", email: USERS.carlos.email, role: "staff", active: true, avatar: "CH", classIds: [], createdAt: "01/08/2026" },
      { id: USERS.juliana.id, name: "Juliana", email: USERS.juliana.email, role: "coordinator", active: true, avatar: "JS", classIds: [], createdAt: "01/08/2026" },
    ]
    for (const user of users) {
      expect(canViewActivity(user, deletada)).toBe(false)
    }
    // Mesma atividade sem a marca de exclusão continua visível — o guard não
    // pode ter virado "ninguém vê atividade nenhuma".
    expect(canViewActivity(users[0], { ...deletada, deletedAt: null })).toBe(true)
    expect(canViewActivity(users[3], { ...deletada, deletedAt: null })).toBe(true)
  })

  it("painéis não contam a atividade excluída (aluno, professor e coordenação)", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const ana = await loginAgent(app, USERS.ana.email)
    const coord = await loginAgent(app, USERS.juliana.email)
    const id = await criar(marcelo, { classId: "c1", status: "active" })

    const antes = {
      aluno: (await ana.get("/api/dashboard/overview")).body.data.pendingActivities as number,
      professor: (await marcelo.get("/api/dashboard/overview")).body.data.myActivities as number,
      coord: (await coord.get("/api/dashboard/overview")).body.data.activeActivities as number,
    }
    expect(antes.aluno).toBe(1)
    expect(antes.professor).toBe(1)
    expect(antes.coord).toBe(1)

    await marcelo.delete(`/api/activities/${id}`)

    expect((await ana.get("/api/dashboard/overview")).body.data.pendingActivities).toBe(0)
    expect((await marcelo.get("/api/dashboard/overview")).body.data.myActivities).toBe(0)
    const depoisCoord = (await coord.get("/api/dashboard/overview")).body.data
    expect(depoisCoord.activeActivities).toBe(0)
    expect(depoisCoord.totalActivities).toBe(0)
  })

  it("relatórios não contam a atividade excluída (conclusão por turma e por tipo)", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const coord = await loginAgent(app, USERS.juliana.email)
    const id = await criar(marcelo, { classId: "c1", status: "active" })

    // Soma em vez de casar por nome de turma: o filtro é sobre a ATIVIDADE, e o
    // nome da turma é fixtures de outro assunto.
    const conclusao = async () =>
      ((await coord.get("/api/reports/completion")).body.data as Array<{ activities: number }>).reduce(
        (total, r) => total + r.activities,
        0,
      )
    const porTipo = async () =>
      ((await coord.get("/api/reports/activities-by-type")).body.data as Array<{ count: number }>).reduce(
        (total, r) => total + r.count,
        0,
      )

    expect(await conclusao()).toBe(1)
    expect(await porTipo()).toBe(1)

    await marcelo.delete(`/api/activities/${id}`)

    expect(await conclusao()).toBe(0)
    expect(await porTipo()).toBe(0)
  })

  it("listagem da coordenação com filtro de status continua filtrando (sem SQL quebrado)", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    await criar(marcelo, { classId: "c1", status: "active", title: "Ativa" })
    await criar(marcelo, { classId: "c1", status: "draft", title: "Rascunho" })

    const coord = await loginAgent(app, USERS.juliana.email)
    const res = await listaDe(coord, "?status=active")
    expect(res.status).toBe(200)
    expect(res.body.data.map((a) => a.title)).toEqual(["Ativa"])
  })

  // ─── Estados da exclusão: repetir e editar ──────────────────────────────────

  it("excluir de novo responde 409 e preserva a exclusão original", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const id = await criar(marcelo)
    const primeiro = await marcelo.delete(`/api/activities/${id}`)
    expect(primeiro.status).toBe(200)
    const original = linhaNoBanco(id)

    const segundo = await marcelo.delete(`/api/activities/${id}`)
    expect(segundo.status).toBe(409)
    expect(segundo.body.error).toBe("Atividade já excluída.")

    // O segundo DELETE não reescreve nada: mesmo `deletedAt`, mesmo `deletedBy`
    // e nenhuma segunda linha de auditoria.
    expect(linhaNoBanco(id)).toEqual(original)
    expect(auditoria("ACTIVITY_DELETED", id)).toHaveLength(1)
  })

  it("editar ou mudar o status de atividade excluída é 404 e não ressuscita", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const id = await criar(marcelo, { title: "Título original", status: "draft" })
    await marcelo.delete(`/api/activities/${id}`)
    const original = linhaNoBanco(id)

    const patch = await marcelo.patch(`/api/activities/${id}`).send({ title: "Título ressuscitado" })
    expect(patch.status).toBe(404)

    const status = await marcelo.patch(`/api/activities/${id}/status`).send({ status: "active" })
    expect(status.status).toBe(404)

    expect(linhaNoBanco(id)).toEqual(original)
    expect(linhaNoBanco(id).title).toBe("Título original")
  })

  it("excluir atividade inexistente é 404 da própria rota", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const res = await marcelo.delete("/api/activities/nao-existe")
    expect(res.status).toBe(404)
    // A mensagem distingue o 404 da rota do 404 genérico de "rota inexistente":
    // sem a rota, o app responderia "Rota não encontrada: DELETE ...".
    expect(res.body.error).toBe("Atividade não encontrada.")
  })

  // ─── Quem pode excluir (a exclusão é mutação de coord/prof/func) ───────────

  it("aluno não exclui e outro professor não exclui atividade alheia (403 + ACCESS_DENIED)", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const id = await criar(marcelo)

    const ana = await loginAgent(app, USERS.ana.email)
    const porAluno = await ana.delete(`/api/activities/${id}`)
    expect(porAluno.status).toBe(403)

    const sandra = await loginAgent(app, USERS.sandra.email)
    const porProfessor = await sandra.delete(`/api/activities/${id}`)
    expect(porProfessor.status).toBe(403)

    // A tentativa negada fica registrada e a atividade continua visível.
    const coord = await loginAgent(app, USERS.juliana.email)
    const negadas = (
      (await coord.get("/api/audit?action=ACCESS_DENIED")).body.data as Array<{ userId: string }>
    ).filter((l) => l.userId === USERS.sandra.id)
    expect(negadas.length).toBeGreaterThan(0)
    expect(linhaNoBanco(id).deletedAt).toBeNull()
    expect((await listaDe(marcelo)).body.data.map((a) => a.id)).toContain(id)
  })

  it("coordenação exclui atividade de qualquer professor; a tentativa alheia não a apaga", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const id = await criar(marcelo, { classId: "c1" })
    const sandra = await loginAgent(app, USERS.sandra.email)
    expect((await sandra.delete(`/api/activities/${id}`)).status).toBe(403)

    const coord = await loginAgent(app, USERS.juliana.email)
    const res = await coord.delete(`/api/activities/${id}`)
    expect(res.status).toBe(200)
    expect(res.body.data.deletedBy).toBe(USERS.juliana.id)
    expect((await listaDe(marcelo)).body.data.map((a) => a.id)).not.toContain(id)
  })

  // ─── Efeito colateral: entrega e pontos ─────────────────────────────────────

  it("aluno não envia entrega para atividade excluída (404)", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const id = await criar(marcelo, { classId: "c1" })
    const ana = await loginAgent(app, USERS.ana.email)

    await marcelo.delete(`/api/activities/${id}`)
    const res = await ana.post(`/api/activities/${id}/submissions`).send({ comment: "pronto", evidence: "evidencia" })
    expect(res.status).toBe(404)
  })

  it("pontos já creditados permanecem após a exclusão (saldo e extrato intactos)", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const ana = await loginAgent(app, USERS.ana.email)
    const id = await criar(marcelo, { classId: "c1", points: 40, status: "active" })

    const enviada = await ana.post(`/api/activities/${id}/submissions`).send({ comment: "pronto", evidence: "evidencia" })
    expect(enviada.status).toBe(201)
    const validada = await marcelo
      .post(`/api/submissions/${enviada.body.data.id as string}/validate`)
      .send({ action: "approve", feedback: "Bom trabalho" })
    expect(validada.status).toBe(200)

    const extratoAntes = (await ana.get("/api/transactions")).body.data as Array<{
      id: string
      amount: number
      type: string
      relatedActivityId: string | null
    }>
    const credito = extratoAntes.find((t) => t.relatedActivityId === id)
    expect(credito?.amount).toBe(40)
    const saldoAntes = (await ana.get("/api/dashboard/overview")).body.data.balance as number
    expect(saldoAntes).toBe(40)

    const excluida = await marcelo.delete(`/api/activities/${id}`)
    expect(excluida.status).toBe(200)

    // O crédito está gravado na transação (RN05): a exclusão não o recalcula,
    // não o estorna e não mexe no extrato nem no saldo.
    const extratoDepois = (await ana.get("/api/transactions")).body.data as typeof extratoAntes
    expect(extratoDepois).toEqual(extratoAntes)
    expect((await ana.get("/api/dashboard/overview")).body.data.balance).toBe(saldoAntes)
  })

  // ─── Lixeira: quem excluiu (2.6) ───────────────────────────────────────────

  it("lixeira (?deleted=true) traz o nome de quem excluiu, junto do deletedAt", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const coord = await loginAgent(app, USERS.juliana.email)
    const id = await criar(marcelo, { title: "Ação do bazar" })
    const viva = await criar(marcelo, { title: "Atividade que continua no ar" })
    await coord.delete(`/api/activities/${id}`)

    const lixeira = await coord.get("/api/activities?deleted=true")
    expect(lixeira.status).toBe(200)
    const achada = (lixeira.body.data as Array<Activity & { deletedByName: string | null }>).find(
      (a) => a.id === id,
    )
    // `deletedBy` sozinho é um id: a lixeira da coordenação precisa do NOME para
    // dizer quem tirou a atividade (o id não diz nada para quem lê).
    expect(achada?.deletedBy).toBe(USERS.juliana.id)
    expect(achada?.deletedByName).toBe("Juliana Santos")
    expect(achada?.deletedAt).toEqual(expect.any(String))

    // O campo é da lixeira: a listagem de verdade não ganha nada com ele.
    const ativas = await listaDe(coord)
    expect(ativas.status).toBe(200)
    const naAr = ativas.body.data.find((a) => a.id === viva)
    expect(naAr).toBeDefined()
    expect(naAr as unknown as { deletedByName?: unknown }).not.toHaveProperty("deletedByName")
  })

  it("autor órfão (id sem usuário) volta sem nome e a lixeira não quebra", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const coord = await loginAgent(app, USERS.juliana.email)
    const id = await criar(marcelo)
    await marcelo.delete(`/api/activities/${id}`)

    // `deletedBy` é id SEM FK: apontamos para um usuário que não existe.
    getDb().prepare("UPDATE activities SET deletedBy = ? WHERE id = ?").run("u-fantasma", id)

    const lixeira = await coord.get("/api/activities?deleted=true")
    expect(lixeira.status).toBe(200)
    const achada = (lixeira.body.data as Array<Activity & { deletedByName: string | null }>).find(
      (a) => a.id === id,
    )
    expect(achada?.deletedBy).toBe("u-fantasma")
    expect(achada?.deletedByName).toBeNull()
  })

  it("autor desativado volta sem nome (mesmo fallback do órfão)", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const coord = await loginAgent(app, USERS.juliana.email)
    const id = await criar(marcelo)
    await marcelo.delete(`/api/activities/${id}`)
    getDb().prepare("UPDATE users SET active = 0 WHERE id = ?").run(USERS.marcelo.id)

    const lixeira = await coord.get("/api/activities?deleted=true")
    expect(lixeira.status).toBe(200)
    const achada = (lixeira.body.data as Array<Activity & { deletedByName: string | null }>).find(
      (a) => a.id === id,
    )
    expect(achada?.deletedBy).toBe(USERS.marcelo.id)
    expect(achada?.deletedByName).toBeNull()
  })
})
