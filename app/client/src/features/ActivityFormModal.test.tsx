// Testes do formulário de atividade — campo "Tolerância de entrega (dias)" (V3, 2.3).
// Mesma pilha dos demais testes de client: Testing Library + MSW sobre o wrapper real
// `src/lib/api.ts`. As asserções olham o que o usuário vê (rotulo, valor,_bounds,
// mensagem de erro) e o corpo da requisição — não a forma das props.
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import type { Activity, Class, Subject } from "@shared/types"
import { ActivityFormModal } from "./ActivityFormModal"

const server = setupServer()

/** Corpos capturados na rede: é o contrato com o servidor que o teste quer fixar. */
let criados: Array<Record<string, unknown>> = []
let editados: Array<Record<string, unknown>> = []

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => {
  server.resetHandlers()
  criados = []
  editados = []
})
afterAll(() => server.close())

function mockCreate() {
  server.use(
    http.post("/api/activities", async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>
      criados.push(body)
      return HttpResponse.json({ data: { ...ATIVIDADE, ...body, id: "a-nova" } })
    }),
  )
}

function mockUpdate(id: string) {
  server.use(
    http.patch(`/api/activities/${id}`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>
      editados.push(body)
      return HttpResponse.json({ data: { ...ATIVIDADE, ...body, id } })
    }),
  )
}

const CLASSES: Class[] = [
  {
    id: "c1",
    name: "3º Info A",
    course: "Informática",
    year: 3,
    shift: "morning",
    active: true,
    studentIds: ["a1"],
    teacherIds: ["u-prof"],
  },
]

const SUBJECTS: Subject[] = [
  { id: "m1", name: "Matemática", icon: "📐", teacherIds: ["u-prof"], classIds: ["c1"] },
]

const ATIVIDADE: Activity = {
  id: "a1",
  title: "Lista de juros compostos",
  description: "",
  subjectId: "m1",
  teacherId: "u-prof",
  classId: "c1",
  points: 20,
  deadline: "15/10/2026",
  lateWindowDays: 7,
  type: "academic",
  status: "active",
  createdAt: "01/09/2026 08:00",
  deletedAt: null,
  deletedBy: null,
}

function renderForm(initial: Activity | null = null) {
  const onSaved = vi.fn()
  const onError = vi.fn()
  render(
    <ActivityFormModal
      open
      onClose={() => {}}
      onSaved={onSaved}
      onError={onError}
      initial={initial}
      role="teacher"
      classes={CLASSES}
      subjects={SUBJECTS}
    />,
  )
  return { onSaved, onError }
}

const campoTolerancia = () =>
  screen.getByRole<HTMLInputElement>("spinbutton", { name: /Tolerância de entrega \(dias\)/ })

/** Preenche o que o formulário exige para ficar válido (create). */
async function preencherObrigatorios(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Título da atividade/), "Revisão de juros compostos")
  fireEvent.change(screen.getByLabelText(/Prazo de entrega/), { target: { value: "2026-10-15" } })
}

describe("ActivityFormModal — tolerância de entrega (2.3)", () => {
  it("renderiza o campo com rótulo associado, default 7 e limites 0–90", () => {
    renderForm()

    const input = campoTolerancia()
    expect(input).toHaveValue(7)
    expect(input).toHaveAttribute("type", "number")
    expect(input).toHaveAttribute("min", "0")
    expect(input).toHaveAttribute("max", "90")
    expect(input).toBeRequired()
    expect(input).toBeValid()
  })

  it("a ajuda explica que 0 ainda aceita o dia do prazo e bloqueia no dia seguinte", () => {
    renderForm()

    // A descrição acessível é o texto lido por leitor de tela; é nele que 0 precisa
    // ser inequívoco: "sem tolerância" não pode soar como "o prazo não vale".
    const input = campoTolerancia()
    expect(input).toHaveAccessibleDescription(/0.*dia do prazo continua valendo.*dia seguinte.*bloqueado/i)
    expect(input).toHaveAccessibleDescription(/padrão: 7/i)
    expect(input).toHaveAccessibleDescription(/máximo: 90/i)
  })

  it("cria com a tolerância default (7) no payload", async () => {
    const user = userEvent.setup()
    mockCreate()
    const { onSaved } = renderForm()

    await preencherObrigatorios(user)
    await user.click(screen.getByRole("button", { name: "Salvar rascunho" }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(criados).toHaveLength(1)
    expect(criados[0].lateWindowDays).toBe(7)
  })

  it.each([3, 90])("cria com a tolerância digitada (%i) no payload", async (dias) => {
    const user = userEvent.setup()
    mockCreate()
    const { onSaved } = renderForm()

    await preencherObrigatorios(user)
    const input = campoTolerancia()
    await user.clear(input)
    await user.type(input, String(dias))
    await user.click(screen.getByRole("button", { name: "Salvar rascunho" }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(criados[0].lateWindowDays).toBe(dias)
  })

  it("0 = sem tolerância: o valor 0 vai explícito no payload (não some por omissão)", async () => {
    const user = userEvent.setup()
    mockCreate()
    const { onSaved } = renderForm()

    await preencherObrigatorios(user)
    const input = campoTolerancia()
    await user.clear(input)
    await user.type(input, "0")
    expect(input).toHaveValue(0)
    expect(input).toBeValid()
    await user.click(screen.getByRole("button", { name: "Salvar rascunho" }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(criados[0]).toHaveProperty("lateWindowDays", 0)
  })

  it.each([
    ["91", "rangeOverflow"],
    ["1.5", "stepMismatch"],
    ["-1", "rangeUnderflow"],
  ] as const)("valor inválido (%s) é recusado antes de enviar (%s)", async (digitado, invalidity) => {
    const user = userEvent.setup()
    mockCreate()
    const { onSaved, onError } = renderForm()

    await preencherObrigatorios(user)
    const input = campoTolerancia()
    await user.clear(input)
    await user.type(input, digitado)
    expect(input).toBeInvalid()
    expect(input.validity[invalidity]).toBe(true)

    await user.click(screen.getByRole("button", { name: "Salvar rascunho" }))

    expect(criados).toHaveLength(0)
    expect(onSaved).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it("campo vazio é recusado e a validação pt-BR do formulário é anunciada", async () => {
    const user = userEvent.setup()
    mockCreate()
    const { onSaved } = renderForm()

    await preencherObrigatorios(user)
    const input = campoTolerancia()
    await user.clear(input)
    expect(input).toBeInvalid()

    // `fireEvent.submit` ignora a validação nativa (que já barra o clique, como no
    // navegador) e exercita a segunda camada: a mensagem pt-BR do próprio formulário.
    // Sem ela, um campo vazio viraria `Number("") === 0` e sairia como "sem tolerância".
    fireEvent.submit(document.querySelector("form") as HTMLFormElement)

    const alerta = await screen.findByRole("alert")
    expect(alerta).toHaveTextContent(/Tolerância de entrega deve ser um número inteiro de 0 a 90 dias\./)
    expect(criados).toHaveLength(0)
    expect(onSaved).not.toHaveBeenCalled()
  })

  it.each([0, 21])("edição abre com a tolerância armazenada (%i) e a reenvia sem alterar", async (armazenado) => {
    const user = userEvent.setup()
    mockUpdate("a1")
    const { onSaved } = renderForm({ ...ATIVIDADE, lateWindowDays: armazenado })

    expect(campoTolerancia()).toHaveValue(armazenado)

    await user.click(screen.getByRole("button", { name: "Salvar alterações" }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(editados).toHaveLength(1)
    expect(editados[0].lateWindowDays).toBe(armazenado)
  })

  it("edição: alterar a tolerância envia o novo valor no PATCH", async () => {
    const user = userEvent.setup()
    mockUpdate("a1")
    const { onSaved } = renderForm({ ...ATIVIDADE, lateWindowDays: 7 })

    const input = campoTolerancia()
    await user.clear(input)
    await user.type(input, "0")
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(editados[0].lateWindowDays).toBe(0)
  })
})
