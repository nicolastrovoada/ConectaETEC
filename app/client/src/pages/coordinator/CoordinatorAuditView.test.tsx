// Testes da auditoria da coordenação (V3, 4.4).
// Mesma pilha dos demais testes de client: Testing Library + MSW sobre o wrapper
// real `src/lib/api.ts`. O que se fixa é o comportamento VISÍVEL: os filtros
// montam a query certa (papel, período, busca e paginação), a busca só sai no
// submit, a página volta para 1 ao filtrar e a coluna "Quando" mostra a hora
// COM segundos — duas ações no mesmo minuto precisam ser ordenáveis.
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import type { AuditLog, Role } from "@shared/types"
import { CoordinatorAuditView } from "./CoordinatorAuditView"

type AuditLogRow = AuditLog & { userName: string; userRole: Role }

const server = setupServer()

function log(over: Partial<AuditLogRow> & Pick<AuditLogRow, "id" | "userName" | "userRole">): AuditLogRow {
  return {
    userId: `u-${over.id}`,
    action: "LOGIN",
    entity: "user",
    entityId: `u-${over.id}`,
    description: "Entrada na plataforma",
    timestamp: "29/09/2026, 14:23:45",
    ...over,
  }
}

const LOGIN_ALUNO = log({
  id: "l1",
  userName: "Ana Beatriz",
  userRole: "student",
  action: "LOGIN",
  description: "Entrada na plataforma",
  timestamp: "29/09/2026, 14:23:45",
})
const APROVACAO_PROFESSOR = log({
  id: "l2",
  userName: "Marcelo Ferreira",
  userRole: "teacher",
  action: "SUBMISSION_APPROVED",
  description: "Entrega aprovada",
  timestamp: "28/09/2026, 09:05:07",
})
const RESGATE_ALUNO = log({
  id: "l3",
  userName: "Ana Beatriz",
  userRole: "student",
  action: "REWARD_REDEEMED",
  description: "Resgate de recompensa",
  timestamp: "20/08/2026, 16:40:02",
})

let todos: AuditLogRow[] = []
/** URLs pedidas na rede, na ordem — é o contrato observável com o servidor. */
let pedidos: string[] = []

function diaDoTimestamp(timestamp: string): string {
  return `${timestamp.slice(6, 10)}-${timestamp.slice(3, 5)}-${timestamp.slice(0, 2)}`
}

function filtrar(url: URL): AuditLogRow[] {
  let rows = todos
  const role = url.searchParams.get("role")
  if (role) rows = rows.filter((row) => row.userRole === role)

  const from = url.searchParams.get("from")
  if (from) rows = rows.filter((row) => diaDoTimestamp(row.timestamp) >= from)

  const to = url.searchParams.get("to")
  if (to) rows = rows.filter((row) => diaDoTimestamp(row.timestamp) <= to)

  const search = url.searchParams.get("search")?.toLowerCase()
  if (search) {
    rows = rows.filter((row) =>
      [row.userName, row.action, row.description].some((value) => value.toLowerCase().includes(search)),
    )
  }
  return rows
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))

beforeEach(() => {
  todos = [LOGIN_ALUNO, APROVACAO_PROFESSOR, RESGATE_ALUNO]
  pedidos = []
  server.use(
    http.get("/api/audit", ({ request }) => {
      const url = new URL(request.url)
      pedidos.push(`${url.pathname}${url.search}`)
      const items = filtrar(url)
      const page = Number(url.searchParams.get("page")) || 1
      const pageSize = Number(url.searchParams.get("pageSize")) || 15
      return HttpResponse.json({ data: { items, total: items.length, page, pageSize } })
    }),
  )
})

afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function renderView() {
  return render(<CoordinatorAuditView />)
}

describe("Coordenação — auditoria (4.4)", () => {
  it("pede a primeira página e mostra o timestamp com segundos", async () => {
    renderView()

    expect(await screen.findByText("Marcelo Ferreira")).toBeInTheDocument()
    expect(pedidos[0]).toBe("/api/audit?page=1&pageSize=15")
    // A hora exata do servidor, não a versão sem segundos da tela antiga.
    expect(screen.getByText(/29\/09\/2026[,\s]*14:23:45/)).toBeInTheDocument()
    expect(screen.getByText(/28\/09\/2026[,\s]*09:05:07/)).toBeInTheDocument()
  })

  it("filtra por papel e volta para a primeira página", async () => {
    const user = userEvent.setup({ delay: null })
    renderView()
    await screen.findByText("Marcelo Ferreira")
    pedidos = []

    await user.selectOptions(screen.getByLabelText("Papel"), "teacher")

    await waitFor(() =>
      expect(pedidos).toContain("/api/audit?role=teacher&page=1&pageSize=15"),
    )
    expect(await screen.findByText("Marcelo Ferreira")).toBeInTheDocument()
    expect(screen.queryAllByText("Ana Beatriz")).toHaveLength(0)
  })

  it("trocar o papel na página 2 reinicia a paginação na página 1", async () => {
    const user = userEvent.setup({ delay: null })
    server.use(
      http.get("/api/audit", ({ request }) => {
        const url = new URL(request.url)
        pedidos.push(`${url.pathname}${url.search}`)
        const page = Number(url.searchParams.get("page")) || 1
        const pageSize = Number(url.searchParams.get("pageSize")) || 15
        return HttpResponse.json({ data: { items: [LOGIN_ALUNO], total: 40, page, pageSize } })
      }),
    )
    renderView()
    await screen.findByText("Ana Beatriz")

    await user.click(screen.getByRole("button", { name: "2" }))
    await waitFor(() => expect(pedidos).toContain("/api/audit?page=2&pageSize=15"))
    pedidos = []

    await user.selectOptions(screen.getByLabelText("Papel"), "teacher")

    await waitFor(() =>
      expect(pedidos).toContain("/api/audit?role=teacher&page=1&pageSize=15"),
    )
    expect(pedidos.some((url) => url.includes("page=2"))).toBe(false)
  })

  it("associa o hint da busca ao campo para leitores de tela", async () => {
    renderView()
    await screen.findByText("Marcelo Ferreira")

    const busca = screen.getByLabelText("Busca")
    expect(busca).toHaveAttribute("aria-describedby", "audit-search-hint")
    expect(busca).toHaveAccessibleDescription("Nome do usuário, ação ou descrição.")
  })

  it("envia o período De/Até no formato YYYY-MM-DD", async () => {
    renderView()
    await screen.findByText("Marcelo Ferreira")
    pedidos = []

    fireEvent.change(screen.getByLabelText("De"), { target: { value: "2026-09-01" } })
    await waitFor(() =>
      expect(pedidos).toContain("/api/audit?from=2026-09-01&page=1&pageSize=15"),
    )

    fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2026-09-30" } })
    await waitFor(() =>
      expect(pedidos).toContain(
        "/api/audit?from=2026-09-01&to=2026-09-30&page=1&pageSize=15",
      ),
    )

    // O resgate é de agosto e sai do período; as ações de setembro continuam.
    expect(await screen.findByText("Marcelo Ferreira")).toBeInTheDocument()
    expect(screen.queryByText("Resgate de recompensa")).not.toBeInTheDocument()
  })

  it("não busca a cada tecla: a busca só sai no submit", async () => {
    const user = userEvent.setup({ delay: null })
    renderView()
    await screen.findByText("Marcelo Ferreira")
    pedidos = []

    await user.type(screen.getByLabelText("Busca"), "resgate")
    expect(pedidos).toHaveLength(0)

    await user.click(screen.getByRole("button", { name: "Buscar" }))

    await waitFor(() =>
      expect(pedidos).toContain("/api/audit?search=resgate&page=1&pageSize=15"),
    )
    expect(await screen.findByText("Resgate de recompensa")).toBeInTheDocument()
    expect(screen.queryByText("Entrega aprovada")).not.toBeInTheDocument()
  })

  it("buscar a partir da página 2 volta para a página 1", async () => {
    const user = userEvent.setup({ delay: null })
    server.use(
      http.get("/api/audit", ({ request }) => {
        const url = new URL(request.url)
        pedidos.push(`${url.pathname}${url.search}`)
        const page = Number(url.searchParams.get("page")) || 1
        const pageSize = Number(url.searchParams.get("pageSize")) || 15
        return HttpResponse.json({ data: { items: [LOGIN_ALUNO], total: 40, page, pageSize } })
      }),
    )
    renderView()
    await screen.findByText("Ana Beatriz")
    pedidos = []

    await user.click(screen.getByRole("button", { name: "2" }))
    await waitFor(() => expect(pedidos).toContain("/api/audit?page=2&pageSize=15"))

    pedidos = []
    await user.type(screen.getByLabelText("Busca"), "ana")
    await user.click(screen.getByRole("button", { name: "Buscar" }))

    await waitFor(() =>
      expect(pedidos).toContain("/api/audit?search=ana&page=1&pageSize=15"),
    )
  })

  it("estado vazio com filtros pede ajuste ou limpeza dos filtros", async () => {
    const user = userEvent.setup({ delay: null })
    renderView()
    await screen.findByText("Marcelo Ferreira")

    await user.type(screen.getByLabelText("Busca"), "inexistente")
    await user.click(screen.getByRole("button", { name: "Buscar" }))

    expect(await screen.findByText("Nenhum registro corresponde aos filtros")).toBeInTheDocument()
    expect(screen.getByText("Ajuste ou limpe os filtros para ver mais resultados.")).toBeInTheDocument()
  })

  it("limpar filtros volta ao estado inicial e busca de novo sem filtros", async () => {
    const user = userEvent.setup({ delay: null })
    renderView()
    await screen.findByText("Marcelo Ferreira")

    await user.selectOptions(screen.getByLabelText("Papel"), "teacher")
    fireEvent.change(screen.getByLabelText("De"), { target: { value: "2026-09-01" } })
    await user.type(screen.getByLabelText("Busca"), "marcelo")
    await user.click(screen.getByRole("button", { name: "Buscar" }))
    await waitFor(() =>
      expect(pedidos.some((url) => url.includes("search=marcelo"))).toBe(true),
    )
    pedidos = []

    await user.click(screen.getByRole("button", { name: "Limpar filtros" }))

    await waitFor(() => expect(pedidos).toContain("/api/audit?page=1&pageSize=15"))
    expect(screen.getByLabelText("Papel")).toHaveValue("all")
    expect(screen.getByLabelText("De")).toHaveValue("")
    expect(screen.getByLabelText("Até")).toHaveValue("")
    expect(screen.getByLabelText("Busca")).toHaveValue("")
  })
})
