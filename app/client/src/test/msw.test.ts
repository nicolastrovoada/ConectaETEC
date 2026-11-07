// Exercita o MSW (`msw/node`) com o wrapper real `src/lib/api.ts`, validando a
// pilha completa de bootstrap: jsdom + fetch do Node + MSW + contrato da API.
//
// O shim de URL relativa em setup.ts resolve "/api/..." contra a origem do
// jsdom (mesmo comportamento do navegador); o MSW então intercepta e responde.
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { api, ApiError } from "../lib/api"

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe("MSW + api — contrato real do servidor ({data} / {error, details})", () => {
  it("GET com dados → api.get resolve somente o .data", async () => {
    server.use(
      http.get("/api/points/balance", () => HttpResponse.json({ data: { total: 120, txCount: 3 } })),
    )
    const res = await api.get<{ total: number; txCount: number }>("/api/points/balance")
    expect(res).toEqual({ total: 120, txCount: 3 })
  })

  it("404 com erro JSON → ApiError com mensagem do servidor", async () => {
    server.use(
      http.get("/api/activities/nao-existe", () =>
        HttpResponse.json({ error: "Atividade não encontrada." }, { status: 404 }),
      ),
    )
    try {
      await api.get("/api/activities/nao-existe")
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).status).toBe(404)
      expect((error as ApiError).message).toBe("Atividade não encontrada.")
    }
  })

  it("422 de upload → ApiError carrega details LIMIT_FILE_SIZE", async () => {
    server.use(
      http.post("/api/activities/a1/submissions", () =>
        HttpResponse.json(
          { error: "Arquivo acima de 5 MB.", details: "LIMIT_FILE_SIZE" },
          { status: 422 },
        ),
      ),
    )
    try {
      await api.post("/api/activities/a1/submissions", { comment: "x" })
      expect.unreachable()
    } catch (error) {
      expect((error as ApiError).status).toBe(422)
      expect((error as ApiError).details).toBe("LIMIT_FILE_SIZE")
    }
  })

  it("500 sem corpo JSON → mensagem padrão de falha", async () => {
    server.use(
      http.get("/api/reports/students", () =>
        HttpResponse.text("Internal Server Error", { status: 500 }),
      ),
    )
    try {
      await api.get("/api/reports/students")
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).message).toBe("Falha na requisição (500).")
    }
  })

  it("query string gerada pelo buildQuery chega ao handler do MSW", async () => {
    let received: URL | null = null
    server.use(
      http.get("/api/activities", ({ request }) => {
        received = new URL(request.url)
        return HttpResponse.json({ data: [] })
      }),
    )
    await api.get("/api/activities", {
      classId: "c1",
      status: ["active", "draft"],
      page: 1,
      empty: null,
      skip: undefined,
    })
    expect(received!.pathname).toBe("/api/activities")
    expect(received!.searchParams.getAll("status")).toEqual(["active", "draft"])
    expect(received!.searchParams.get("classId")).toBe("c1")
    expect(received!.searchParams.get("page")).toBe("1")
    expect(received!.searchParams.has("empty")).toBe(false)
    expect(received!.searchParams.has("skip")).toBe(false)
  })

  it("requisição para endpoint não registrado → MSW falha (onUnhandledRequest)", async () => {
    await expect(api.get("/api/endpoint-sem-handler")).rejects.toThrow()
  })
})