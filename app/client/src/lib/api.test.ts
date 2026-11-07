// Testes do wrapper de API (client/src/lib/api.ts).
// buildQuery/ApiError são lógica pura; o parsing de resposta usa fetch stubado.
import { describe, it, expect, afterEach, vi } from "vitest"
import { api, ApiError, buildQuery } from "./api"

function paramsOf(qs: string): URLSearchParams {
  return new URLSearchParams(qs.replace(/^\?/, ""))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Fake minimalista de Response do fetch. */
function mockFetchOk(status: number, json: unknown, contentType = "application/json") {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => (name.toLowerCase() === "content-type" ? contentType : null),
    },
    json: async () => json,
  })
}

describe("buildQuery", () => {
  it("vazio/null/undefined não entram na query", () => {
    expect(buildQuery({})).toBe("")
    expect(buildQuery({ a: null, b: undefined })).toBe("")
    expect(buildQuery({ busca: "x", vazio: undefined, nada: null })).toBe("?busca=x")
  })

  it("parametriza primitivos, booleanos e arrays", () => {
    const p = paramsOf(buildQuery({ status: "active", page: 2, ativo: true, turmas: ["c1", "c2"] }))
    expect(p.get("status")).toBe("active")
    expect(p.get("page")).toBe("2")
    expect(p.get("ativo")).toBe("true")
    expect(p.getAll("turmas")).toEqual(["c1", "c2"])
  })

  it("codifica valores com acento/espaço", () => {
    const p = paramsOf(buildQuery({ q: "olá mundo" }))
    expect(p.get("q")).toBe("olá mundo")
  })
})

describe("ApiError", () => {
  it("carrega status, message e details", () => {
    const err = new ApiError("Erro genérico", 400, { campo: "x" })
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe("ApiError")
    expect(err.message).toBe("Erro genérico")
    expect(err.status).toBe(400)
    expect(err.details).toEqual({ campo: "x" })
  })

  it("details é opcional", () => {
    const err = new ApiError("Erro", 500)
    expect(err.details).toBeUndefined()
  })
})

describe("parsing do contrato {data} vs {error}", () => {
  it("sucesso devolve apenas o payload de `data`", async () => {
    vi.stubGlobal("fetch", mockFetchOk(200, { data: { id: "u1" } }))
    await expect(api.get<{ id: string }>("/api/auth/me")).resolves.toEqual({ id: "u1" })
  })

  it("erro com corpo {error, details} vira ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchOk(404, { error: "Não encontrado.", details: "CLASS_HAS_MEMBERS" }),
    )
    await expect(api.get("/api/not-implemented")).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      message: "Não encontrado.",
      details: "CLASS_HAS_MEMBERS",
    })
  })

  it("erro sem corpo JSON usa mensagem padrão", async () => {
    vi.stubGlobal("fetch", mockFetchOk(500, null, "text/plain"))
    await expect(api.get("/api/x")).rejects.toMatchObject({
      name: "ApiError",
      status: 500,
      message: "Falha na requisição (500).",
    })
  })

  it("resposta 200 sem JSON → undefined", async () => {
    vi.stubGlobal("fetch", mockFetchOk(200, null, "text/plain"))
    await expect(api.get("/api/plain")).resolves.toBeUndefined()
  })
})

describe("api.get com parâmetros", () => {
  it("constrói a URL com a query e usa credentials include", async () => {
    const fetchMock = mockFetchOk(200, { data: [] })
    vi.stubGlobal("fetch", fetchMock)
    await api.get("/api/activities", { status: "active", classId: ["c1", "c2"] })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/activities?")
    const p = paramsOf(url.split("?")[1])
    expect(p.get("status")).toBe("active")
    expect(p.getAll("classId")).toEqual(["c1", "c2"])
    expect(init.method).toBe("GET")
    expect(init.credentials).toBe("include")
  })
})

describe("api.post / postForm", () => {
  it("POST serializa corpo como JSON com Content-Type", async () => {
    const fetchMock = mockFetchOk(201, { data: { ok: true } })
    vi.stubGlobal("fetch", fetchMock)
    await api.post("/api/classes", { name: "INFO-1A" })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { body: unknown }]
    expect(url).toBe("/api/classes")
    expect(init.method).toBe("POST")
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json")
    expect(init.body).toBe('{"name":"INFO-1A"}')
  })

  it("postForm envia FormData sem Content-Type manual", async () => {
    const fetchMock = mockFetchOk(201, { data: {} })
    vi.stubGlobal("fetch", fetchMock)
    const form = new FormData()
    form.append("comment", "ok")
    await api.postForm("/api/activities/a1/submissions", form)

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit & { body: unknown }]
    expect(init.method).toBe("POST")
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined()
  })
})