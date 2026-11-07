import { describe, it, expect, beforeAll, afterEach, vi } from "vitest"
import { makeApp, prepareDb, loginAgent, USERS, brDateInDays } from "./helpers"
import { getDb } from "../db/connection"
import { findActivityById } from "../db/queries"
// `brDateInDays` do `lib/dates` (e não o do helper de teste, que usa o relógio
// local da máquina): o prazo plantado precisa ser relativo ao MESMO "hoje" que o
// servidor usa para julgar a janela — senão o teste passa em São Paulo e falha
// numa máquina em outro fuso.
import { brDateInDays as brDateSP, isDeadlineExpired, isDeadlineOnOrAfterToday, isLateWindowOpen } from "../lib/dates"
import type { Express } from "express"

describe("Frente 1 — prazos reais e ordenação por deadline (1.1/1.2)", () => {
  let app: Express

  beforeAll(() => {
    prepareDb()
    app = makeApp()
  })

  it("rejeita data inexistente 31/02/2026 (validação real, não só regex)", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const res = await marcelo.post("/api/activities").send({
      title: "Data impossível",
      subjectId: "s1",
      classId: "c1",
      points: 10,
      deadline: "31/02/2026",
      type: "academic",
    })
    expect(res.status).toBe(400)
    expect(JSON.stringify(res.body.details)).toContain("data válida")
  })

  it("rejeita data inválida 99/99/9999", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const res = await marcelo.post("/api/activities").send({
      title: "Data maluca",
      subjectId: "s1",
      classId: "c1",
      points: 10,
      deadline: "99/99/9999",
      type: "academic",
    })
    expect(res.status).toBe(400)
  })

  it("rejeita prazo no passado na criação (422)", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const res = await marcelo.post("/api/activities").send({
      title: "Prazo atrasado",
      subjectId: "s1",
      classId: "c1",
      points: 10,
      deadline: brDateInDays(-1),
      type: "academic",
    })
    expect(res.status).toBe(422)
    expect(res.body.error).toContain("Prazo deve ser uma data de hoje ou futura")
  })

  it("aceita prazo de hoje (201)", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const res = await marcelo.post("/api/activities").send({
      title: "Prazo de hoje",
      subjectId: "s1",
      classId: "c1",
      points: 5,
      deadline: brDateInDays(0),
      type: "academic",
      status: "draft",
    })
    expect(res.status).toBe(201)
  })

  it("PATCH recusa prazo no passado ao alterar a atividade", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const created = await marcelo.post("/api/activities").send({
      title: "Atividade com prazo futuro",
      subjectId: "s1",
      classId: "c1",
      points: 10,
      deadline: brDateInDays(5),
      type: "academic",
      status: "draft",
    })
    expect(created.status).toBe(201)

    const res = await marcelo
      .patch(`/api/activities/${created.body.data.id as string}`)
      .send({ deadline: brDateInDays(-2) })
    expect(res.status).toBe(422)
  })

  it("entrega em atividade com prazo expirado e janela de atraso já fechada é rejeitada (422)", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const created = await marcelo.post("/api/activities").send({
      title: "Prazo expirado de propósito",
      subjectId: "s1",
      classId: "c1",
      points: 10,
      deadline: brDateInDays(5),
      type: "academic",
      status: "active",
    })
    expect(created.status).toBe(201)
    const activityId = (created.body.data as { id: string }).id
    getDb()
      .prepare("UPDATE activities SET deadline = ? WHERE id = ?")
      .run("01/01/2020", activityId)

    const ana = await loginAgent(app, USERS.ana.email)
    const res = await ana
      .post(`/api/activities/${activityId}/submissions`)
      .field("comment", "Enviando depois do prazo")
    // V3 (Fase 2): prazo vencido NÃO fecha a entrega — quem fecha é a janela de
    // atraso. 2020 está muito além dos 7 dias de tolerância, então a resposta é a
    // mesma (422), mas o motivo passou a ser o fim da janela.
    expect(res.status).toBe(422)
    expect(res.body.error).toBe("Janela de atraso encerrada.")
    expect(res.body.details).toBe("LATE_WINDOW_CLOSED")
  })

  it("lista de atividades ordenada por deadline real (não lexicográfica)", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    // Datas dinâmicas que cruzam a virada de mês: ordem cronológica correta
    // coloca a data mais próxima primeiro, mesmo quando o dia é maior (o que
    // derrubaria a ordenação lexicográfica DD/MM/AAAA).
    const earlier = await marcelo.post("/api/activities").send({
      title: "Ordem A — prazo próximo",
      subjectId: "s1",
      classId: "c1",
      points: 5,
      deadline: brDateInDays(3),
      type: "academic",
      status: "draft",
    })
    const later = await marcelo.post("/api/activities").send({
      title: "Ordem B — prazo distante",
      subjectId: "s1",
      classId: "c1",
      points: 5,
      deadline: brDateInDays(60),
      type: "academic",
      status: "draft",
    })
    expect(earlier.status).toBe(201)
    expect(later.status).toBe(201)
    const earlierId = (earlier.body.data as { id: string }).id
    const laterId = (later.body.data as { id: string }).id

    const coord = await loginAgent(app, USERS.juliana.email)
    const res = await coord.get("/api/activities")
    expect(res.status).toBe(200)
    const list = res.body.data as Array<{ id: string }>
    const iEarlier = list.findIndex((a) => a.id === earlierId)
    const iLater = list.findIndex((a) => a.id === laterId)
    expect(iEarlier).toBeGreaterThanOrEqual(0)
    expect(iLater).toBeGreaterThanOrEqual(0)
    expect(iEarlier).toBeLessThan(iLater)
  })
})

/**
 * V3 Fase 2 · Tarefa 2.2 — janela de atraso.
 *
 * A regra central: prazo vencido NÃO impede a entrega; a entrega continua
 * válida dentro da janela de tolerância que o professor definiu, e é marcada
 * como `delayed` (vale meia pontuação na aprovação). A janela é INCLUSIVA no
 * último dia: `hoje <= prazo + lateWindowDays`.
 */
describe("Fase 2 · janela de atraso e meia pontuação (2.2)", () => {
  let app: Express

  beforeAll(() => {
    prepareDb()
    app = makeApp()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /**
   * Fixa o relógio apenas no `Date` (os timers reais continuam vivos, senão o
   * supertest trava esperando a resposta) e posiciona São Paulo no dia pedido.
   * `2026-09-17T02:30:00Z` é 16/09 23:30 em SP — a virada do dia que separa a
   * implementação certa da que lê o dia em UTC.
   */
  function setSpDay(iso: string) {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(iso))
  }

  /** Cria atividade e devolve o id, com o prazo movido para `days` atrás de hoje. */
  async function createActivity(
    title: string,
    opts: { points?: number; window?: number; deadlineDays?: number } = {},
  ): Promise<string> {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const created = await marcelo.post("/api/activities").send({
      title,
      subjectId: "s1",
      classId: "c1",
      points: opts.points ?? 10,
      deadline: brDateSP(5),
      type: "academic",
      status: "active",
      lateWindowDays: opts.window ?? 7,
    })
    expect(created.status, `criação de "${title}"`).toBe(201)
    const id = (created.body.data as { id: string }).id
    // A rota recusa prazo no passado; para exercitar a janela o prazo é movido
    // direto no banco (mesmo truque do teste de prazo expirado acima).
    getDb()
      .prepare("UPDATE activities SET deadline = ? WHERE id = ?")
      .run(brDateSP(opts.deadlineDays ?? -1), id)
    return id
  }

  it("fronteira da janela: envio no último dia ok, depois bloqueado", async () => {
    const ultimoDia = await createActivity("Último dia da janela", {
      window: 7,
      deadlineDays: -7,
    })
    const depoisDaJanela = await createActivity("Depois da janela", {
      window: 7,
      deadlineDays: -8,
    })

    const ana = await loginAgent(app, USERS.ana.email)
    const dentro = await ana
      .post(`/api/activities/${ultimoDia}/submissions`)
      .field("comment", "Entregue no último dia da janela")
    expect(dentro.status, "último dia da janela ainda entra").toBe(201)
    expect(dentro.body.data.delayed, "entra como entrega atrasada").toBe(true)

    const fora = await ana
      .post(`/api/activities/${depoisDaJanela}/submissions`)
      .field("comment", "Um dia depois do fim da janela")
    expect(fora.status, "dia seguinte ao último já está bloqueado").toBe(422)
    expect(fora.body.details).toBe("LATE_WINDOW_CLOSED")
  })

  it("janela 0 = sem tolerância: o dia do prazo vale, o dia seguinte não", async () => {
    const noPrazo = await createActivity("Prazo de hoje sem tolerância", {
      window: 0,
      deadlineDays: 0,
    })
    const depoisDoPrazo = await createActivity("Ontem sem tolerância", {
      window: 0,
      deadlineDays: -1,
    })

    const ana = await loginAgent(app, USERS.ana.email)
    const hoje = await ana
      .post(`/api/activities/${noPrazo}/submissions`)
      .field("comment", "Dentro do prazo")
    expect(hoje.status).toBe(201)
    expect(hoje.body.data.delayed, "no prazo não é atraso").toBe(false)

    const ontem = await ana
      .post(`/api/activities/${depoisDoPrazo}/submissions`)
      .field("comment", "Depois do prazo, sem tolerância")
    expect(ontem.status).toBe(422)
    expect(ontem.body.details).toBe("LATE_WINDOW_CLOSED")
  })

  it("helper isLateWindowOpen: a janela é inclusiva no último dia e `hoje` é o dia de SP", () => {
    // O prazo é lido como DATA DE CALENDÁRIO: com o relógio em SP, 16/09 23:30
    // ainda é o dia 16 (o mesmo dia do prazo com janela 0), mesmo sendo 17/09 em
    // UTC. Uma implementação que lesse o dia em UTC fecharia a janela aqui.
    setSpDay("2026-09-17T02:30:00Z") // SP: 16/09 23:30
    expect(isLateWindowOpen({ deadline: "16/09/2026", lateWindowDays: 0 })).toBe(true)

    setSpDay("2026-09-17T03:00:00Z") // SP: 17/09 00:00 — virou o dia
    expect(isLateWindowOpen({ deadline: "16/09/2026", lateWindowDays: 0 })).toBe(false)

    // Mesma fronteira com a janela padrão de 7 dias: 10/09 + 7 = 17/09 é o
    // último dia (aberta); 18/09 já passou (fechada).
    setSpDay("2026-09-17T12:00:00Z")
    expect(isLateWindowOpen({ deadline: "10/09/2026", lateWindowDays: 7 })).toBe(true)
    setSpDay("2026-09-18T12:00:00Z")
    expect(isLateWindowOpen({ deadline: "10/09/2026", lateWindowDays: 7 })).toBe(false)
  })

  it("isDeadlineOnOrAfterToday compara o dia de SP, não o instante (fuso do servidor ≠ SP)", () => {
    // 17/09/2026 02:30Z é 16/09 23:30 em São Paulo e 17/09 11:30 em Tóquio.
    setSpDay("2026-09-17T02:30:00Z")
    const tzOriginal = process.env.TZ
    try {
      // Tóquio (+09:00) está 12 h à frente de SP, e é por isso que este teste
      // discrimina: num host fora de SP, `parseBRDate` resolve "16/09/2026" para
      // 15/09 15:00Z, e o critério por INSTANTES (meia-noite local do prazo ×
      // meia-noite de SP de hoje = 16/09 03:00Z) diria que um prazo que é HOJE em
      // São Paulo já passou — a criação/edição de atividade recusaria o prazo de
      // hoje e uma entrega no prazo sairia marcada como atraso. O critério por DIA
      // DE CALENDÁRIO não olha o fuso do servidor, e é isso que este teste fixa.
      process.env.TZ = "Asia/Tokyo"
      expect(isDeadlineOnOrAfterToday("16/09/2026"), "prazo de hoje (SP) é aceito").toBe(true)
      expect(isDeadlineOnOrAfterToday("15/09/2026"), "ontem (SP) é recusado").toBe(false)
      // Contraparte da mesma régua: `delayed` nasce de `isDeadlineExpired`, então
      // um prazo de hoje não pode sair "vencido" só porque o host não está em SP.
      expect(isDeadlineExpired("16/09/2026"), "prazo de hoje não está vencido").toBe(false)
    } finally {
      if (tzOriginal === undefined) delete process.env.TZ
      else process.env.TZ = tzOriginal
    }
  })

  it("isLateWindowOpen falha fechado: dado corrompido nunca amplia a janela", () => {
    // 17/09 09:00 em SP: com o prazo em 10/09, a janela de 7 dias é a última
    // possível (10 + 7 = 17). Qualquer valor fora do esperado tem de cair para
    // 0 dias — senão um dado corrompido abriria uma janela até 180/200/90 dias.
    setSpDay("2026-09-17T12:00:00Z")
    expect(
      isLateWindowOpen({ deadline: "10/09/2026", lateWindowDays: 7 }),
      "controle: com 7 dias a janela ainda está aberta",
    ).toBe(true)

    const corrompidos: Array<[string, number]> = [
      // Prazo ilegível: sem data-base não há janela, por mais tolerante que seja
      // o valor (`parseBRDate` rejeita 31/02 — data que existe só no calendário
      // de quem escreve o teste).
      ["31/02/2026", 90],
      // Janela negativa, fracionária, NaN ou ausente caem para 0 dias.
      ["10/09/2026", -5],
      ["10/09/2026", 1.5],
      ["10/09/2026", Number.NaN],
      ["10/09/2026", undefined as unknown as number],
    ]
    for (const [deadline, lateWindowDays] of corrompidos) {
      expect(
        isLateWindowOpen({ deadline, lateWindowDays }),
        `deadline=${deadline} lateWindowDays=${String(lateWindowDays)}`,
      ).toBe(false)
    }
  })

  it("helper isLateWindowOpen: funciona com a atividade real vinda do banco", async () => {
    const id = await createActivity("Atividade real com janela", { window: 7, deadlineDays: -3 })
    const activity = findActivityById(getDb(), id)
    if (!activity) throw new Error("Atividade não encontrada para o teste da janela.")
    // -3 dias com janela 7 → ainda dentro (aActivity.lateWindowDays chega do banco)
    expect(activity.lateWindowDays).toBe(7)
    expect(isLateWindowOpen(activity)).toBe(true)
  })

  it("janela de atraso: criada, editada e rejeitada fora de 0..90", async () => {
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const base = {
      subjectId: "s1",
      classId: "c1",
      points: 10,
      type: "academic",
      status: "active" as const,
    }

    const zero = await marcelo
      .post("/api/activities")
      .send({ ...base, title: "Sem tolerância nenhuma", deadline: brDateSP(3), lateWindowDays: 0 })
    expect(zero.status).toBe(201)
    expect(zero.body.data.lateWindowDays).toBe(0)
    const zeroId = (zero.body.data as { id: string }).id
    // O INSERT precisa GRAVAR a coluna — devolvê-la no JSON sem persistir seria
    // um insert fantasma (o valor do banco viria do DEFAULT 7 na leitura seguinte).
    const row = getDb().prepare("SELECT lateWindowDays FROM activities WHERE id = ?").get(zeroId) as {
      lateWindowDays: number
    }
    expect(Number(row.lateWindowDays), "coluna gravada no INSERT").toBe(0)

    const semCampo = await marcelo
      .post("/api/activities")
      .send({ ...base, title: "Janela padrão do banco", deadline: brDateSP(3) })
    expect(semCampo.status).toBe(201)
    expect(semCampo.body.data.lateWindowDays, "padrão de 7 dias").toBe(7)

    const editado = await marcelo
      .patch(`/api/activities/${zeroId}`)
      .send({ lateWindowDays: 21 })
    expect(editado.status).toBe(200)
    expect(editado.body.data.lateWindowDays).toBe(21)

    // Editar OUTRO campo não pode sobrescrever a janela com o padrão do schema.
    const semJanela = await marcelo
      .patch(`/api/activities/${zeroId}`)
      .send({ title: "Sem tolerância nenhuma (renomeada)" })
    expect(semJanela.status).toBe(200)
    expect(semJanela.body.data.lateWindowDays, "janela preservada no PATCH").toBe(21)

    for (const invalido of [-1, 91, 1.5, "7"]) {
      const res = await marcelo
        .post("/api/activities")
        .send({ ...base, title: "Janela inválida", deadline: brDateSP(3), lateWindowDays: invalido })
      expect(res.status, `lateWindowDays=${JSON.stringify(invalido)}`).toBe(400)
      expect(JSON.stringify(res.body.details)).toContain("atraso")
    }
  })
})