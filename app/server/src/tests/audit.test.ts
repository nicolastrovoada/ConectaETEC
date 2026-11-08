import { describe, it, expect, beforeAll } from "vitest"
import type { Express } from "express"
import type { DatabaseSync } from "node:sqlite"
import { loginAgent, makeApp, prepareDb, USERS } from "./helpers"
import { uuid } from "../lib/uuid"

/**
 * Task 4.4 — filtros de período (`from`/`to`) e busca (`search`) na auditoria.
 *
 * Os logs são gravados com timestamp CONTROLADO (`DD/MM/AAAA, HH:mm:ss`, o mesmo
 * formato de `nowBR()`), porque o intervalo inclusivo só pode ser verificado com
 * datas fixas. O login do agente de coordenação também gera um AuditLog com a
 * data de HOJE; os períodos usados aqui ficam em 2020 para que o log do login
 * nunca entre nas asserções de período.
 */
function insertAudit(
  db: DatabaseSync,
  fixture: {
    id?: string
    userId: string
    action: string
    description: string
    timestamp: string
    entity?: string
    entityId?: string
  },
): string {
  const id = fixture.id ?? `fx-audit-${uuid().slice(0, 8)}`
  db.prepare(
    `INSERT INTO auditLogs (id, userId, action, entity, entityId, description, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    fixture.userId,
    fixture.action,
    fixture.entity ?? "Activity",
    fixture.entityId ?? "",
    fixture.description,
    fixture.timestamp,
  )
  return id
}

interface PageData<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

interface AuditItem {
  id: string
  action: string
  description: string
  timestamp: string
  userId: string
  userName: string
}

const IDS = {
  boundaryFrom: "audit-from-2020-09-01",
  midSeptember: "audit-mid-2020-09-15",
  boundaryTo: "audit-to-2020-09-29",
  afterTo: "audit-after-2020-09-30",
  october: "audit-october-2020-10-10",
  otherSeptember: "audit-other-2020-09-15",
} as const

/**
 * Fixtures de novembro/2020 — fora do período de setembro usado nos testes de
 * `from`/`to`, para não alterar as contagens já fixadas.
 */
const NOV = {
  joseUser: "fx-user-jose",
  joseAudit: "audit-jose-2020-11-05",
  percent: "audit-percent-2020-11-20",
  percentLookalike: "audit-percent-lookalike-2020-11-20",
  underscore: "audit-underscore-2020-11-21",
  underscoreLookalike: "audit-underscore-lookalike-2020-11-21",
  orderA: "audit-order-a-2020-11-15",
  orderB: "audit-order-b-2020-11-10",
  orderC: "audit-order-c-2020-11-25",
  orderTieFirst: "audit-order-tie-first",
  orderTieSecond: "audit-order-tie-second",
} as const

describe("Auditoria — filtros de período e busca (Task 4.4)", () => {
  let app: Express
  let coord: Awaited<ReturnType<typeof loginAgent>>

  beforeAll(() => {
    const db = prepareDb()

    // Limites e vizinhos do intervalo 2020-09-01 .. 2020-09-29.
    insertAudit(db, {
      id: IDS.boundaryFrom,
      userId: USERS.ana.id, // student
      action: "LOGIN",
      description: "Acesso ao sistema",
      timestamp: "01/09/2020, 00:00:00", // primeiro instante do from
    })
    insertAudit(db, {
      id: IDS.midSeptember,
      userId: USERS.ana.id, // student
      action: "SUBMISSION_SENT",
      description: "Entrega enviada de matemática",
      timestamp: "15/09/2020, 12:00:00",
    })
    insertAudit(db, {
      id: IDS.otherSeptember,
      userId: USERS.juliana.id, // coordinator
      action: "REWARD_CREATED",
      description: "Nova recompensa cadastrada",
      timestamp: "15/09/2020, 10:00:00",
    })
    insertAudit(db, {
      id: IDS.boundaryTo,
      userId: USERS.marcelo.id, // teacher
      action: "SUBMISSION_APPROVED",
      description: "Entrega aprovada pela professora",
      timestamp: "29/09/2020, 23:59:59", // último instante do to
    })
    insertAudit(db, {
      id: IDS.afterTo,
      userId: USERS.juliana.id, // coordinator
      action: "POINTS_ADJUSTED",
      description: "Ajuste manual de pontos",
      timestamp: "30/09/2020, 00:00:00", // primeiro instante fora do to
    })
    insertAudit(db, {
      id: IDS.october,
      userId: USERS.mateus.id, // student
      action: "SUBMISSION_REJECTED",
      description: "Evidência incompatível",
      timestamp: "10/10/2020, 09:30:00",
    })

    // Usuário com acento para a busca `namekey` (nome é a única fonte do termo:
    // a descrição não contém "José").
    db.prepare(
      `INSERT INTO users (id, name, email, password, role, active, avatar, classIds, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      NOV.joseUser,
      "José Antônio",
      "jose.fixture@etec.sp.gov.br",
      "hash-de-teste",
      "student",
      1,
      "J",
      '["c1"]',
      "01/01/2020, 00:00:00",
    )
    insertAudit(db, {
      id: NOV.joseAudit,
      userId: NOV.joseUser,
      action: "LOGIN",
      description: "Cadastro inicial",
      timestamp: "05/11/2020, 08:00:00",
    })

    // `%` e `_` literais: os "sósias" existem para provar que o banco NÃO os
    // interpreta como curinga (LIKE faria ambos casarem).
    insertAudit(db, {
      id: NOV.percent,
      userId: USERS.ana.id,
      action: "LOGIN",
      description: "Conclusão 100% da atividade",
      timestamp: "20/11/2020, 09:00:00",
    })
    insertAudit(db, {
      id: NOV.percentLookalike,
      userId: USERS.ana.id,
      action: "LOGIN",
      description: "Conclusão 100X da atividade",
      timestamp: "20/11/2020, 09:30:00",
    })
    insertAudit(db, {
      id: NOV.underscore,
      userId: USERS.ana.id,
      action: "LOGIN",
      description: "arquivo_evidencia.pdf",
      timestamp: "21/11/2020, 10:00:00",
    })
    insertAudit(db, {
      id: NOV.underscoreLookalike,
      userId: USERS.ana.id,
      action: "LOGIN",
      description: "arquivoXevidencia.pdf",
      timestamp: "21/11/2020, 10:30:00",
    })

    // Inseridos FORA de ordem cronológica: a listagem deve ordenar pelo
    // timestamp (dia+hora) e usar rowid só no empate dos dois últimos.
    insertAudit(db, {
      id: NOV.orderA,
      userId: USERS.ana.id,
      action: "LOGIN",
      description: "ordem-teste A",
      timestamp: "15/11/2020, 08:00:00",
    })
    insertAudit(db, {
      id: NOV.orderB,
      userId: USERS.ana.id,
      action: "LOGIN",
      description: "ordem-teste B",
      timestamp: "10/11/2020, 09:00:00",
    })
    insertAudit(db, {
      id: NOV.orderC,
      userId: USERS.ana.id,
      action: "LOGIN",
      description: "ordem-teste C",
      timestamp: "25/11/2020, 07:30:00",
    })
    insertAudit(db, {
      id: NOV.orderTieFirst,
      userId: USERS.ana.id,
      action: "LOGIN",
      description: "ordem-teste empate 1",
      timestamp: "12/11/2020, 12:00:00",
    })
    insertAudit(db, {
      id: NOV.orderTieSecond,
      userId: USERS.ana.id,
      action: "LOGIN",
      description: "ordem-teste empate 2",
      timestamp: "12/11/2020, 12:00:00",
    })

    app = makeApp()
  })

  beforeAll(async () => {
    coord = await loginAgent(app, USERS.juliana.email)
  })

  function ids(items: AuditItem[]): string[] {
    return items.map((item) => item.id)
  }

  async function page(query: string): Promise<PageData<AuditItem>> {
    const res = await coord.get(`/api/audit?${query}`)
    expect(res.status).toBe(200)
    return res.body.data as PageData<AuditItem>
  }

  async function legacy(query: string): Promise<AuditItem[]> {
    const res = await coord.get(`/api/audit?${query}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    return res.body.data as AuditItem[]
  }

  it("from/to são inclusivos e filtram pelo dia do timestamp (limites incluídos)", async () => {
    const data = await page("from=2020-09-01&to=2020-09-29&page=1&pageSize=50")
    const got = ids(data.items)

    expect(got).toContain(IDS.boundaryFrom) // 01/09 00:00:00 — limite inferior
    expect(got).toContain(IDS.boundaryTo) // 29/09 23:59:59 — limite superior
    expect(got).toContain(IDS.midSeptember)
    expect(got).toContain(IDS.otherSeptember)
    expect(got).not.toContain(IDS.afterTo) // 30/09 — depois do to
    expect(got).not.toContain(IDS.october) // 10/10 — depois do to
    expect(data.total).toBe(4)
  })

  it("from/to aceitam o mesmo dia nos dois lados (intervalo de um único dia)", async () => {
    const data = await page("from=2020-09-15&to=2020-09-15&page=1&pageSize=50")
    expect(ids(data.items).sort()).toEqual([IDS.midSeptember, IDS.otherSeptember].sort())
    expect(data.total).toBe(2)
  })

  it("to sozinho também é inclusivo", async () => {
    const data = await page("to=2020-09-15&page=1&pageSize=50")
    const got = ids(data.items)
    expect(got).toEqual(expect.arrayContaining([IDS.boundaryFrom, IDS.midSeptember, IDS.otherSeptember]))
    expect(got).not.toContain(IDS.boundaryTo)
    expect(data.total).toBe(3)
  })

  it("combina período + papel + busca", async () => {
    const data = await page("from=2020-09-01&to=2020-09-29&role=teacher&search=aprovada&page=1&pageSize=50")
    expect(ids(data.items)).toEqual([IDS.boundaryTo])
    expect(data.total).toBe(1)
  })

  it("search encontra pelo nome do usuário", async () => {
    // "Ribeiro" é exclusivo da Ana ("Juliana" também contém "ana").
    const data = await page("from=2020-09-01&to=2020-09-29&search=Ribeiro&page=1&pageSize=50")
    expect(ids(data.items).sort()).toEqual([IDS.boundaryFrom, IDS.midSeptember].sort())
    expect(data.total).toBe(2)
  })

  it("search encontra pela ação", async () => {
    const data = await page("from=2020-09-01&to=2020-09-29&search=APPROVED&page=1&pageSize=50")
    expect(ids(data.items)).toEqual([IDS.boundaryTo])
    expect(data.total).toBe(1)
  })

  it("search encontra pela descrição", async () => {
    const data = await page("search=incompatível&page=1&pageSize=50")
    expect(ids(data.items)).toEqual([IDS.october])
    expect(data.total).toBe(1)
  })

  it("paginação mantém o total filtrado (não o total geral)", async () => {
    const first = await page("from=2020-09-01&to=2020-09-29&page=1&pageSize=2")
    expect(first.total).toBe(4)
    expect(first.page).toBe(1)
    expect(first.pageSize).toBe(2)
    expect(first.items).toHaveLength(2)

    const second = await page("from=2020-09-01&to=2020-09-29&page=2&pageSize=2")
    expect(second.total).toBe(4)
    expect(second.page).toBe(2)
    expect(second.items).toHaveLength(2)

    const all = [...first.items, ...second.items]
    expect(new Set(ids(all)).size).toBe(4)
    for (const item of all) {
      expect(item.id).not.toBe(IDS.afterTo)
      expect(item.id).not.toBe(IDS.october)
    }
  })

  it("formato legado (array) também aplica período e busca", async () => {
    const data = await legacy("from=2020-09-01&to=2020-09-29&search=entrega")
    expect(data).toHaveLength(2)
    expect(ids(data).sort()).toEqual([IDS.boundaryTo, IDS.midSeptember].sort())
    for (const item of data) {
      expect(item.timestamp).toMatch(/^\d{2}\/09\/2020, /)
    }
  })

  it("from/to inválidos são ignorados e não quebram a rota", async () => {
    const data = await legacy("from=2020-9-1&to=banana")
    const got = ids(data)
    for (const id of Object.values(IDS)) expect(got).toContain(id)
  })

  it("from/to com formato certo mas data inexistente são ignorados", async () => {
    // 2020-13-01 (mês 13) e 2020-02-31 (dia inexistente) passam no regex, mas
    // não são datas de calendário: devem ser ignorados, não filtrar.
    for (const query of [
      "from=2020-13-01",
      "to=2020-13-01",
      "from=2020-02-31",
      "to=2020-02-31",
      "from=2020-13-01&to=2020-02-31",
    ]) {
      const data = await page(`${query}&page=1&pageSize=200`)
      expect(data.total).toBeGreaterThan(0)
      const got = ids(data.items)
      for (const id of Object.values(IDS)) expect(got).toContain(id)
    }
  })

  it("busca por nome é accent-insensitive nos dois sentidos", async () => {
    const withoutAccent = await page("search=jose&page=1&pageSize=50")
    expect(ids(withoutAccent.items)).toContain(NOV.joseAudit)

    const upperWithAccent = await page(
      `search=${encodeURIComponent("JOSÉ")}&page=1&pageSize=50`,
    )
    expect(ids(upperWithAccent.items)).toContain(NOV.joseAudit)
  })

  it("% e _ são literais na busca (não são curinga de LIKE)", async () => {
    const percent = await page(
      "search=%25&from=2020-11-20&to=2020-11-20&page=1&pageSize=50",
    )
    expect(ids(percent.items)).toEqual([NOV.percent])

    const underscore = await page(
      "search=_&from=2020-11-21&to=2020-11-21&page=1&pageSize=50",
    )
    expect(ids(underscore.items)).toEqual([NOV.underscore])
  })

  it("termo de busca só com espaços é ignorado", async () => {
    const data = await page(
      `search=${encodeURIComponent("   ")}&from=2020-09-01&to=2020-09-29&page=1&pageSize=50`,
    )
    expect(data.total).toBe(4)
  })

  it("parâmetros de paginação não finitos não retornam 500", async () => {
    for (const query of [
      "page=Infinity",
      "page=1e21",
      "pageSize=1e21",
      "page=Infinity&pageSize=Infinity",
      "page=NaN&pageSize=abc",
    ]) {
      const data = await page(query)
      expect(data.total).toBeGreaterThan(0)
      expect(Number.isFinite(data.page)).toBe(true)
      expect(Number.isFinite(data.pageSize)).toBe(true)
      expect(data.page).toBeGreaterThanOrEqual(1)
      expect(data.pageSize).toBeGreaterThanOrEqual(1)
      expect(data.pageSize).toBeLessThanOrEqual(200)
    }

    const legacyInfinity = await legacy("limit=Infinity")
    expect(legacyInfinity.length).toBeGreaterThan(0)
    const legacyHuge = await legacy("limit=1e21")
    expect(legacyHuge.length).toBeGreaterThan(0)
  })

  it("ordena por timestamp (dia+hora), com rowid como desempate", async () => {
    // Inseridos fora de ordem; a resposta deve vir do mais recente para o mais
    // antigo, e os dois empatados em 12/11 12:00:00 saem na ordem inversa de
    // inserção (rowid DESC).
    const data = await page("search=ordem-teste&page=1&pageSize=50")
    expect(ids(data.items)).toEqual([
      NOV.orderC,
      NOV.orderA,
      NOV.orderTieSecond,
      NOV.orderTieFirst,
      NOV.orderB,
    ])
  })
})
