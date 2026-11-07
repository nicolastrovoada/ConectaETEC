import { describe, it, expect, beforeAll } from "vitest"
import request from "supertest"
import { makeApp, prepareDb, loginAgent, USERS } from "./helpers"
import { createActivity, createNotification, createSubmission } from "./fixtures"
import { insertNotification } from "../services/notifications"
import {
  PERSISTENT_TYPES,
  TRANSIENT_BY_TYPE,
  TRANSIENT_TYPES,
  isTransientNotificationType,
  type Notification,
  type NotificationType,
} from "../shared/types"
import type { Express } from "express"

type Agent = Awaited<ReturnType<typeof loginAgent>>

// Lacuna de cobertura: marcar notificações como lidas (RF10).
// A V3 não semeia notificações, então cada cenário cria as suas (fixture local).
describe("Notificações — leitura (RF10)", () => {
  let app: Express

  beforeAll(() => {
    prepareDb()
    app = makeApp()
  })

  /**
   * Reinicia o banco por cenário: o estado de leitura não vaza entre testes.
   * Deixa a Ana com duas notificações não lidas e uma do Marcelo (outro dono).
   *
   * As linhas do fixture local são PERSISTENTES: `createNotification` escreve
   * só as colunas da 001, então `transient` vale o DEFAULT 0 da 004. A partição
   * transitório/persistente é exercitada no describe de baixo, com o serviço
   * `insertNotification` (que deriva a coluna do tipo).
   */
  async function setupAna(): Promise<Agent> {
    const db = prepareDb()
    createNotification(db, { id: "n1", userId: "u1", title: "Correção solicitada", read: false })
    createNotification(db, { id: "n2", userId: "u1", title: "Nova atividade publicada", read: false })
    createNotification(db, { id: "n3", userId: "u1", title: "Atividade aprovada!", read: false })
    createNotification(db, { id: "n5", userId: "u6", title: "3 entregas aguardam validação" })
    return loginAgent(app, USERS.ana.email)
  }

  it("sem sessão → 401", async () => {
    const res = await request(app).patch("/api/notifications/read")
    expect(res.status).toBe(401)
  })

  it("PATCH /read marca todas as notificações do usuário como lidas", async () => {
    const ana = await setupAna()

    const before = await ana.get("/api/notifications")
    expect(before.status).toBe(200)
    expect(before.body.data.length).toBeGreaterThan(0)
    expect(before.body.data.some((n: { read: boolean }) => !n.read)).toBe(true)

    const res = await ana.patch("/api/notifications/read")
    expect(res.status).toBe(200)
    expect(res.body.data.ok).toBe(true)

    const after = await ana.get("/api/notifications")
    expect(after.body.data.length).toBe(before.body.data.length)
    expect(after.body.data.every((n: { read: boolean }) => n.read)).toBe(true)
  })

  it("PATCH /:id/read marca apenas a notificação indicada", async () => {
    const ana = await setupAna()

    // n3 é da ana (u1) e começa não lida
    const res = await ana.patch("/api/notifications/n3/read")
    expect(res.status).toBe(200)
    expect(res.body.data.ok).toBe(true)

    const list = await ana.get("/api/notifications")
    const n3 = list.body.data.find((n: { id: string }) => n.id === "n3")
    expect(n3?.read).toBe(true)

    // as demais notificações dela permanecem com o estado original
    const n1 = list.body.data.find((n: { id: string }) => n.id === "n1")
    expect(n1?.read).toBe(false)
  })

  it("404 ao marcar notificação de outro usuário (isolamento por dono)", async () => {
    const ana = await setupAna()
    // n5 pertence a u6 (marcelo)
    const res = await ana.patch("/api/notifications/n5/read")
    expect(res.status).toBe(404)
    const list = await ana.get("/api/notifications")
    expect(list.body.data.some((n: { id: string }) => n.id === "n5")).toBe(false)
  })

  it("404 para notificação inexistente", async () => {
    const ana = await setupAna()
    const res = await ana.patch("/api/notifications/nao-existe/read")
    expect(res.status).toBe(404)
  })
})

// ─── Task 3.3: transitória some sozinha, persistente fica até ler/resolver ─────

/**
 * RF10 em duas metades: nem toda notificação merece estar na lista do usuário
 * amanhã, e nenhuma pode sumir antes de ser lida.
 *
 * - **transitória** (`activity_approved`, `activity_rejected`, `reward`,
 *   `system`): é um aviso de que algo ACONTECEU. O `GET` é puro e devolve
 *   sempre; quem apaga é o acuse do cliente (`PATCH /read` ou `PATCH /:id/read`),
 *   chamado DEPOIS de exibir. Se o `GET` apagasse, abrir a tela consumiria a
 *   notificação de quem não olhou.
 * - **persistente** (`new_activity`, `activity_revision`, `coord_notice`): é uma
 *   obrigação ou um aviso institucional. O acuse marca como lida e ela fica —
 *   `activity_revision` ainda sai sozinha quando o aluno REENVIA aquela
 *   atividade (Review Focus 4).
 */
describe("Notificações — transitórias x persistentes (RF10, 3.3)", () => {
  let app: Express

  beforeAll(() => {
    prepareDb()
    app = makeApp()
  })

  /** Lista as notificações do agente autenticado. */
  async function listar(agent: Agent): Promise<Notification[]> {
    const res = await agent.get("/api/notifications")
    expect(res.status).toBe(200)
    return res.body.data as Notification[]
  }

  function idsDa(notificacoes: Notification[]): string[] {
    return notificacoes.map((n) => n.id)
  }

  /** Auditoria da coordenação filtrada por ação (RN06). */
  async function auditoria(action: string): Promise<Array<{ userId: string; entityId: string; description: string }>> {
    const coord = await loginAgent(app, USERS.juliana.email)
    const res = await coord.get(`/api/audit?action=${action}`)
    expect(res.status).toBe(200)
    return res.body.data as Array<{ userId: string; entityId: string; description: string }>
  }

  // ── Review Focus 4: o GET é puro (R33) ────────────────────────────────────

  it("o GET é puro: duas leituras seguidas devolvem a transitória nas duas", async () => {
    prepareDb()
    const criada = insertNotification({
      userId: USERS.ana.id,
      title: "Bônus de sequência!",
      message: "Você atingiu 3 dias seguidos de participação. +10 pts 🎯",
      type: "system",
    })
    const ana = await loginAgent(app, USERS.ana.email)

    const primeira = await listar(ana)
    const segunda = await listar(ana)

    // Sem `PATCH` entre elas, a notificação tem que continuar lá — este é o
    // teste que impede o "auto-ack no GET" (decisão R33) de voltar.
    expect(idsDa(primeira)).toContain(criada.id)
    expect(idsDa(segunda)).toContain(criada.id)
    expect(idsDa(segunda)).toEqual(idsDa(primeira))
    expect(segunda.find((n) => n.id === criada.id)?.read).toBe(false)
  })

  // ── Review Focus 5: transitória não repete ───────────────────────────────

  it("transitória é exibida uma vez e não volta depois do PATCH /read (lista inteira)", async () => {
    prepareDb()
    const criada = insertNotification({
      userId: USERS.ana.id,
      title: "Atividade aprovada! 🎉",
      message: "Sua entrega de 'Revisão' foi aprovada. +15 pts 🎉",
      type: "activity_approved",
    })
    const ana = await loginAgent(app, USERS.ana.email)

    const antes = await listar(ana)
    expect(idsDa(antes)).toContain(criada.id)

    const ack = await ana.patch("/api/notifications/read")
    expect(ack.status).toBe(200)
    expect(ack.body.data.ok).toBe(true)

    const depois = await listar(ana)
    expect(idsDa(depois)).not.toContain(criada.id)

    // E o acuse fica registrado (RN06): a notificação sumiu do banco, e nada
    // some sem rastro.
    const logs = await auditoria("NOTIFICATIONS_ACKNOWLEDGED")
    const meu = logs.filter((l) => l.userId === USERS.ana.id)
    expect(meu.length).toBe(1)
    expect(meu[0].description).toContain("Atividade aprovada! 🎉")
  })

  it("PATCH /:id/read apaga só a transitória apontada e deixa as outras", async () => {
    prepareDb()
    const primeira = insertNotification({
      userId: USERS.ana.id,
      title: "Recompensa resgatada!",
      message: "Você resgatou 'Bônus de presença' (-50 pts). Retire na coordenação.",
      type: "reward",
    })
    const segunda = insertNotification({
      userId: USERS.ana.id,
      title: "Bônus de pontos recebido!",
      message: "Coordenação concedeu +10 pts: participação em projeto.",
      type: "system",
    })
    const persistente = insertNotification({
      userId: USERS.ana.id,
      title: "Nova atividade publicada",
      message: "Prof. Marcelo publicou 'Revisão' para 3º Ano A.",
      type: "new_activity",
    })
    const ana = await loginAgent(app, USERS.ana.email)

    expect((await ana.patch(`/api/notifications/${primeira.id}/read`)).status).toBe(200)

    const noMeio = await listar(ana)
    expect(idsDa(noMeio)).not.toContain(primeira.id)
    expect(idsDa(noMeio)).toContain(segunda.id)
    expect(noMeio.find((n) => n.id === persistente.id)?.read).toBe(false)

    expect((await ana.patch(`/api/notifications/${segunda.id}/read`)).status).toBe(200)

    const noFim = await listar(ana)
    expect(idsDa(noFim)).toEqual([persistente.id])

    // A segunda remoção também auditada, uma linha por notificação apontada.
    const logs = (await auditoria("NOTIFICATION_ACKNOWLEDGED")).filter(
      (l) => l.userId === USERS.ana.id,
    )
    expect(logs.map((l) => l.entityId).sort()).toEqual([primeira.id, segunda.id].sort())
  })

  // ── Persistente: marcar lida ≠ apagar ────────────────────────────────────

  it("PATCH /read marca a persistente como lida e ela continua na lista", async () => {
    prepareDb()
    const novaAtividade = insertNotification({
      userId: USERS.ana.id,
      title: "Nova atividade publicada",
      message: "Prof. Marcelo publicou 'Revisão' para 3º Ano A. Prazo: 10/10/2026.",
      type: "new_activity",
    })
    const aviso = insertNotification({
      userId: USERS.ana.id,
      title: "Aviso da coordenação",
      message: "Reunião de pais na sexta-feira, às 19h, no pátio.",
      type: "coord_notice",
    })

    const ana = await loginAgent(app, USERS.ana.email)
    expect((await ana.patch("/api/notifications/read")).status).toBe(200)

    const depois = await listar(ana)
    expect(idsDa(depois).sort()).toEqual([novaAtividade.id, aviso.id].sort())
    expect(depois.every((n) => n.read)).toBe(true)
  })

  // ── Isolamento: o filtro é por DONO, não por tipo ─────────────────────────

  it("o acuse da aluna não toca a transitória do professor (mesmo tipo, dono outro)", async () => {
    prepareDb()
    const daAna = insertNotification({
      userId: USERS.ana.id,
      title: "Bônus de pontos recebido!",
      message: "Coordenação concedeu +10 pts: participação.",
      type: "system",
    })
    const doMarcelo = insertNotification({
      userId: USERS.marcelo.id,
      title: "Bônus de pontos recebido!",
      message: "Coordenação concedeu +10 pts: participação.",
      type: "system",
    })

    const ana = await loginAgent(app, USERS.ana.email)
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    expect(idsDa(await listar(ana))).toEqual([daAna.id])
    expect(idsDa(await listar(marcelo))).toEqual([doMarcelo.id])

    expect((await ana.patch("/api/notifications/read")).status).toBe(200)

    // Mesmo tipo, mesmo texto: se o DELETE fosse por tipo, a notificação do
    // professor teria ido junto com a da aluna.
    expect(idsDa(await listar(ana))).toEqual([])
    expect(idsDa(await listar(marcelo))).toEqual([doMarcelo.id])
  })

  // ── Review Focus 4: a correção resolve POR ATIVIDADE (R34) ───────────────

  it("correção solicitada resolve quando o aluno reenvia — e só a DA atividade (R34)", async () => {
    const db = prepareDb()
    // A correção pendente em A e a correção pendente em B: é exatamente o caso
    // que o `DELETE ... WHERE type='activity_revision'` sem filtro resolveria
    // apagando as duas — e o aluno perderia um aviso que nunca viu.
    createActivity(db, { id: "n-a1", title: "Revisão de Língua Portuguesa", teacherId: "u6", classId: "c1" })
    createActivity(db, { id: "n-a2", title: "Relatório de Gestão Empresarial", teacherId: "u6", classId: "c1" })
    createSubmission(db, { id: "n-sub1", activityId: "n-a1", studentId: "u1", status: "revision_required" })
    createSubmission(db, { id: "n-sub2", activityId: "n-a2", studentId: "u1", status: "revision_required" })

    const marcelo = await loginAgent(app, USERS.marcelo.email)
    for (const [id, feedback] of [
      ["n-sub1", "Questão 3 está incorreta. Refaça e reenvie."],
      ["n-sub2", "Falta a referência bibliográfica. Complete e reenvie."],
    ] as const) {
      const res = await marcelo.post(`/api/submissions/${id}/validate`).send({ action: "revision", feedback })
      expect(res.status).toBe(200)
    }

    const ana = await loginAgent(app, USERS.ana.email)
    const pendentes = (await listar(ana)).filter((n) => n.type === "activity_revision")
    expect(pendentes).toHaveLength(2)
    // A notificação sabe dizer qual atividade resolve (coluna da 007).
    expect(pendentes.map((n) => n.relatedActivityId).sort()).toEqual(["n-a1", "n-a2"])

    const reenvio = await ana.post("/api/activities/n-a1/submissions").field("comment", "Refiz a questão 3.")
    expect(reenvio.status).toBe(201)

    const depois = (await listar(ana)).filter((n) => n.type === "activity_revision")
    expect(depois).toHaveLength(1)
    expect(depois[0].relatedActivityId).toBe("n-a2")
    expect(depois[0].id).toBe(pendentes.find((n) => n.relatedActivityId === "n-a2")?.id)

    // A notificação resolvida some do banco (não só da resposta).
    const sobrou = db
      .prepare("SELECT id FROM notifications WHERE id = ?")
      .get(pendentes.find((n) => n.relatedActivityId === "n-a1")?.id as string) as
      | { id: string }
      | undefined
    expect(sobrou).toBeUndefined()

    // E a resolução está na auditoria (RN06) — é a obrigação que o aluno cumpriu.
    const resolvidas = (await auditoria("REVISION_RESOLVED")).filter((l) => l.userId === USERS.ana.id)
    expect(resolvidas).toHaveLength(1)
    expect(resolvidas[0].entityId).toBe("n-sub1")
    expect(resolvidas[0].description).toContain("Revisão de Língua Portuguesa")
  })

  it("reenviar sem correção pendente não registra resolução", async () => {
    const db = prepareDb()
    createActivity(db, { id: "n-a3", title: "Lista de exercícios", teacherId: "u6", classId: "c1" })
    const ana = await loginAgent(app, USERS.ana.email)
    expect((await ana.post("/api/activities/n-a3/submissions").field("comment", "Feita.")).status).toBe(201)

    const resolvidas = (await auditoria("REVISION_RESOLVED")).filter((l) => l.userId === USERS.ana.id)
    expect(resolvidas).toEqual([])
  })

  // ── Fix round: os DOIS números da auditoria de acuse (F1) ─────────────────

  it("a auditoria do acuse em lote separa os números: 3 removida(s) e 2 marcada(s)", async () => {
    prepareDb()
    for (const [i, tipo] of (["system", "reward", "activity_approved"] as const).entries()) {
      insertNotification({ userId: USERS.ana.id, title: `Transitória ${i + 1}`, message: "msg", type: tipo })
    }
    for (const [i, tipo] of (["new_activity", "coord_notice"] as const).entries()) {
      insertNotification({
        userId: USERS.ana.id,
        title: `Persistente ${i + 1}`,
        message: "msg",
        type: tipo,
      })
    }

    const ana = await loginAgent(app, USERS.ana.email)
    expect((await ana.patch("/api/notifications/read")).status).toBe(200)

    const logs = (await auditoria("NOTIFICATIONS_ACKNOWLEDGED")).filter((l) => l.userId === USERS.ana.id)
    expect(logs).toHaveLength(1)
    // Os dois números, afirmados: 3 transitórias removidas e 2 persistentes
    // marcadas. Um `UPDATE` que contasse toda linha não lida diria "5
    // marcada(s)" — o número errado na auditoria que o F1 corrigiu.
    expect(logs[0].description).toContain("3 transitória(s) removida(s)")
    expect(logs[0].description).toContain("2 persistente(s) marcada(s) como lida(s)")
    expect(logs[0].description).not.toContain("5 persistente(s)")

    // E a lista final confirma: as 2 persistentes continuam, as 3 sumiram.
    const depois = await listar(ana)
    expect(depois).toHaveLength(2)
    expect(depois.every((n) => n.read)).toBe(true)
  })

  it("com só transitórias pendentes a auditoria do acuse ainda acontece (o markedRead vira 0)", async () => {
    prepareDb()
    for (const [i, tipo] of (["system", "reward"] as const).entries()) {
      insertNotification({ userId: USERS.ana.id, title: `Só transitória ${i + 1}`, message: "msg", type: tipo })
    }

    const ana = await loginAgent(app, USERS.ana.email)
    expect((await ana.patch("/api/notifications/read")).status).toBe(200)

    // O guard da rota é `dismissed.length > 0 || markedRead > 0`. Com o F1,
    // `markedRead` é 0 neste cenário (nada persistente), então o que segura a
    // auditoria de pé é o `dismissed` — e ele precisa continuar não-zero.
    const logs = (await auditoria("NOTIFICATIONS_ACKNOWLEDGED")).filter((l) => l.userId === USERS.ana.id)
    expect(logs).toHaveLength(1)
    expect(logs[0].description).toContain("2 transitória(s) removida(s)")
    expect(logs[0].description).toContain("0 persistente(s) marcada(s)")
    expect(await listar(ana)).toEqual([])
  })

  // ── A classificação é uma TABELA, não um `if` espalhado por call site ────

  it("os 7 tipos estão classificados como a partição decide", () => {
    const esperado: Array<[NotificationType, boolean]> = [
      ["activity_approved", true],
      ["activity_rejected", true],
      ["reward", true],
      ["system", true],
      ["new_activity", false],
      ["activity_revision", false],
      ["coord_notice", false],
    ]
    for (const [type, transitoria] of esperado) {
      expect(isTransientNotificationType(type), `classificação de ${type}`).toBe(transitoria)
    }
    // O `Record` é exaustivo: os 7 tipos, nem um a mais nem um a menos.
    expect(Object.keys(TRANSIENT_BY_TYPE).sort()).toEqual(esperado.map(([t]) => t).sort())
    // E as listas derivadas são uma partição de verdade: juntas cobrem os 7,
    // sem sobreposição.
    expect([...TRANSIENT_TYPES, ...PERSISTENT_TYPES].sort()).toEqual(esperado.map(([t]) => t).sort())
    expect(TRANSIENT_TYPES.filter((t) => PERSISTENT_TYPES.includes(t))).toEqual([])
  })

  it("cada tipo gravado pelo insertNotification nasce com a transient do tipo (não com a do call site)", () => {
    const db = prepareDb()
    const tipos: NotificationType[] = [
      "activity_approved",
      "activity_rejected",
      "reward",
      "system",
      "new_activity",
      "activity_revision",
      "coord_notice",
    ]
    for (const type of tipos) {
      insertNotification({ userId: USERS.ana.id, title: `título ${type}`, message: "msg", type })
    }
    const linhas = db.prepare("SELECT type, transient FROM notifications ORDER BY rowid").all() as Array<{
      type: string
      transient: number
    }>
    expect(linhas).toHaveLength(tipos.length)
    for (const linha of linhas) {
      expect(Number(linha.transient), `coluna transient de ${linha.type}`).toBe(
        TRANSIENT_BY_TYPE[linha.type as NotificationType] ? 1 : 0,
      )
    }
  })
})