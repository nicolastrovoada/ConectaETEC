// Testes do quadro de avisos da coordenação (V3, 3.5).
// Mesma pilha dos demais testes de client: Testing Library + MSW sobre o wrapper
// real `src/lib/api.ts`. O que se fixa é o VISÍVEL: o formulário monta o payload
// público certo (a contagem de notificados vem da resposta do servidor, não da
// tela), o quadro mostra título/mensagem/público/autor e a data com SEGUNDOS,
// e os estados de carregamento/erro/vazio não quebram a tela.
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import type { Class, CoordinatorNotice, CoordinatorNoticePage } from "@shared/types"
import { CoordinatorNoticesView } from "./CoordinatorNoticesView"
import { ToastProvider } from "../../context/ToastContext"
import { ToastHost } from "../../components/ui/Toast"

const server = setupServer()

function aviso(over: Partial<CoordinatorNotice> & Pick<CoordinatorNotice, "id" | "title">): CoordinatorNotice {
  return {
    message: "Mensagem do aviso.",
    audienceType: "all",
    classIds: [],
    createdBy: "u-coord",
    createdByName: "Juliana Santos",
    createdAt: "29/09/2026, 14:23:45",
    ...over,
  }
}

const AVISO_TURMA = aviso({
  id: "n-1",
  title: "Reunião de pais",
  message: "Sexta-feira, 19h, na biblioteca.",
  audienceType: "classes",
  classIds: ["c1"],
  createdAt: "29/09/2026, 14:23:45",
})
const AVISO_GERAL = aviso({
  id: "n-2",
  title: "Feriado municipal",
  message: "Aula suspensa na sexta.",
  createdAt: "28/09/2026, 08:00:07",
})
/** Autor removido/desativado: o quadro mostra o fallback, não some com o aviso. */
const AVISO_ORFAO = aviso({
  id: "n-3",
  title: "Aviso de quem saiu",
  message: "O autor foi desativado depois.",
  createdBy: "u-fantasma",
  createdByName: null,
})

const CLASSES: Class[] = [
  {
    id: "c1",
    name: "1º Ano A",
    course: "Técnico em Administração",
    year: 1,
    shift: "morning",
    active: true,
    studentIds: ["u1", "u2"],
    teacherIds: ["u6"],
  },
  {
    id: "c2",
    name: "2º Ano A",
    course: "Técnico em Administração",
    year: 2,
    shift: "afternoon",
    active: true,
    studentIds: ["u3"],
    teacherIds: ["u7"],
  },
  {
    // Turma fora do ar: não pode ser oferecida como destinatária.
    id: "c9",
    name: "Turma desativada",
    course: "Técnico em Administração",
    year: 3,
    shift: "evening",
    active: false,
    studentIds: [],
    teacherIds: [],
  },
]

let pagina: CoordinatorNoticePage = {
  items: [AVISO_TURMA, AVISO_GERAL, AVISO_ORFAO],
  total: 3,
  page: 1,
  pageSize: 10,
}
/** Payloads que chegaram no POST, na ordem. */
let publicados: Array<Record<string, unknown>> = []
/** Quem a resposta do POST diz que foi notificado (a regra vive no servidor). */
let notificados: string[] = ["u1", "u2", "u6"]

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))

beforeEach(() => {
  pagina = { items: [AVISO_TURMA, AVISO_GERAL, AVISO_ORFAO], total: 3, page: 1, pageSize: 10 }
  publicados = []
  notificados = ["u1", "u2", "u6"]
  server.use(
    http.get("/api/notices", () => HttpResponse.json({ data: pagina })),
    http.get("/api/classes", () => HttpResponse.json({ data: CLASSES })),
    http.post("/api/notices", async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>
      publicados.push(body)
      const criado = aviso({ id: "novo", title: String(body.title), message: String(body.message) })
      return HttpResponse.json({ data: { notice: criado, notifiedUserIds: notificados } })
    }),
  )
})

afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function renderView() {
  return render(
    <ToastProvider>
      <CoordinatorNoticesView />
      {/* o app real monta o ToastHost ao lado da tela (App.tsx) */}
      <ToastHost />
    </ToastProvider>,
  )
}

const quadro = () => screen.getByRole("list")

describe("Coordenação — quadro de avisos (3.5)", () => {
  it("lista título, mensagem, público, autor e data/hora com segundos", async () => {
    renderView()

    const cartao = (await screen.findByText("Reunião de pais")).closest("li") as HTMLElement
    expect(cartao).toBeInTheDocument()
    expect(within(cartao).getByText("Sexta-feira, 19h, na biblioteca.")).toBeInTheDocument()
    // O público é lido do aviso, com a contagem de turmas do próprio registro.
    expect(within(cartao).getByText("1 turma(s)")).toBeInTheDocument()
    // A hora é a do servidor (pt-BR) e COM segundos: duas comunicações no mesmo
    // minuto precisam ser ordenáveis por quem e quando.
    expect(within(cartao).getByText(/Publicado em 29\/09\/2026[,\s]*14:23:45/)).toBeInTheDocument()
    expect(within(cartao).getByText(/Juliana Santos/)).toBeInTheDocument()

    // Aviso de público amplo e aviso de autor removido não quebram o cartão.
    const geral = (await screen.findByText("Feriado municipal")).closest("li") as HTMLElement
    expect(within(geral).getByText("Toda a escola")).toBeInTheDocument()
    const orfao = (await screen.findByText("Aviso de quem saiu")).closest("li") as HTMLElement
    expect(within(orfao).getByText(/Coordenação \(usuário removido\)/)).toBeInTheDocument()

    expect(quadro()).toBeInTheDocument()
    expect(within(quadro()).getAllByRole("listitem")).toHaveLength(3)
  })

  it("publica para toda a escola sem mandar turmas, e mostra quantos foram avisados", async () => {
    const user = userEvent.setup()
    notificados = ["u1", "u2", "u3", "u4", "u5", "u6", "u7"]
    renderView()
    await screen.findByText("Reunião de pais")

    await user.type(screen.getByLabelText(/Título do aviso/), "Semana de provas")
    await user.type(screen.getByLabelText(/^Mensagem/), "Atenção ao calendário.")
    // Marca uma turma, volta para o público amplo e publica: a turma marcada é
    // resíduo de um rascunho e NÃO pode descrever o aviso ("toda a escola").
    await user.selectOptions(screen.getByLabelText(/Quem recebe/), "classes")
    await user.click(screen.getByLabelText("2º Ano A"))
    await user.selectOptions(screen.getByLabelText(/Quem recebe/), "all")
    expect(screen.queryByLabelText("2º Ano A")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Publicar aviso" }))

    expect(publicados).toHaveLength(1)
    expect(publicados[0]).toMatchObject({
      title: "Semana de provas",
      message: "Atenção ao calendário.",
      audienceType: "all",
      // Público amplo não manda turma: mandar diria ao servidor o que o aviso não é.
      classIds: [],
    })
    // A quantidade vem da RESPOSTA do servidor (a regra do público mora lá).
    expect(await screen.findByText("Aviso publicado: 7 pessoas notificadas.")).toBeInTheDocument()
    // O formulário esvazia para o próximo aviso não reaproveitar o texto.
    expect(screen.getByLabelText(/Título do aviso/)).toHaveValue("")
    expect(screen.getByLabelText(/^Mensagem/)).toHaveValue("")
  })

  it("publica para turmas escolhidas e manda exatamente as turmas marcadas", async () => {
    const user = userEvent.setup()
    renderView()
    await screen.findByText("Reunião de pais")

    await user.type(screen.getByLabelText(/Título do aviso/), "Reunião de entrega")
    await user.type(screen.getByLabelText(/^Mensagem/), "Alunos do 1º ano.")
    await user.selectOptions(screen.getByLabelText(/Quem recebe/), "classes")

    // A turma desativada nem aparece como opção.
    expect(screen.queryByLabelText("Turma desativada")).not.toBeInTheDocument()
    await user.click(screen.getByLabelText("2º Ano A"))
    await user.click(screen.getByRole("button", { name: "Publicar aviso" }))

    expect(publicados[0]).toMatchObject({ audienceType: "classes", classIds: ["c2"] })
  })

  it("não deixa publicar aviso de turma sem nenhuma turma marcada", async () => {
    const user = userEvent.setup()
    renderView()
    await screen.findByText("Reunião de pais")

    await user.type(screen.getByLabelText(/Título do aviso/), "Aviso sem turma")
    await user.type(screen.getByLabelText(/^Mensagem/), "Escolhi turmas e não escolhi.")
    await user.selectOptions(screen.getByLabelText(/Quem recebe/), "classes")
    await user.click(screen.getByRole("button", { name: "Publicar aviso" }))

    // Nada foi para o servidor e o erro aparece para quem tentou publicar.
    expect(publicados).toHaveLength(0)
    // Regex: o aviso de erro do app é "⚠️ {mensagem}" (dois nós de texto).
    expect(await screen.findByText(/Selecione ao menos uma turma\./)).toBeInTheDocument()
  })

  it("erro da API aparece no formulário e o texto digitado não se perde", async () => {
    const user = userEvent.setup()
    server.use(
      http.post("/api/notices", () =>
        HttpResponse.json({ error: "Turma não encontrada ou inativa: c9." }, { status: 422 }),
      ),
    )
    renderView()
    await screen.findByText("Reunião de pais")

    await user.type(screen.getByLabelText(/Título do aviso/), "Aviso com turma velha")
    await user.type(screen.getByLabelText(/^Mensagem/), "Turma foi desativada.")
    await user.selectOptions(screen.getByLabelText(/Quem recebe/), "classes")
    await user.click(screen.getByLabelText("2º Ano A"))
    await user.click(screen.getByRole("button", { name: "Publicar aviso" }))

    expect(await screen.findByText(/Turma não encontrada ou inativa: c9\./)).toBeInTheDocument()
    // Perder o texto digitado obrigaria a coordenação a digitar o aviso de novo.
    expect(screen.getByLabelText(/Título do aviso/)).toHaveValue("Aviso com turma velha")
    expect(screen.getByLabelText(/^Mensagem/)).toHaveValue("Turma foi desativada.")
    expect(screen.getByLabelText("2º Ano A")).toBeChecked()
  })

  it("carregando e erro não tomam a tela, e 'Tentar novamente' recupera", async () => {
    const user = userEvent.setup()
    let fora = true
    server.use(
      http.get("/api/notices", () =>
        fora
          ? HttpResponse.json({ error: "indisponível" }, { status: 500 })
          : HttpResponse.json({ data: pagina }),
      ),
    )
    renderView()

    // Carregando: o esqueleto aparece antes de qualquer resposta.
    expect(screen.getAllByLabelText("Carregando avisos").length).toBeGreaterThan(0)

    expect(await screen.findByText("Não foi possível carregar os dados.")).toBeInTheDocument()
    expect(screen.queryByText("Reunião de pais")).not.toBeInTheDocument()

    fora = false
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }))

    expect(await screen.findByText("Reunião de pais")).toBeInTheDocument()
    expect(screen.queryByText("Não foi possível carregar os dados.")).not.toBeInTheDocument()
  })

  it("quadro vazio avisa que não há aviso, sem erro e sem 'Tentar novamente'", async () => {
    pagina = { items: [], total: 0, page: 1, pageSize: 10 }
    renderView()

    expect(await screen.findByText("Nenhum aviso publicado")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).not.toBeInTheDocument()
    expect(screen.queryByText("0 aviso(s) no quadro")).not.toBeInTheDocument()
  })

  it("o formulário tem nome, campos obrigatórios e o público como conjunto com legenda", async () => {
    renderView()
    await screen.findByText("Reunião de pais")

    // `<form>` nomeado é landmark de verdade: sem `aria-labelledby` o leitor de
    // tela acha os campos soltos, sem saber que formam o formulário de aviso.
    expect(screen.getByRole("form", { name: "Publicar aviso" })).toBeInTheDocument()
    expect(screen.getByLabelText(/Título do aviso/)).toBeRequired()
    expect(screen.getByLabelText(/^Mensagem/)).toBeRequired()
    // O alvo do aviso é um conjunto de duas opções (WCAG 1.3.1).
    expect(screen.getByRole("group", { name: /Quem recebe/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Publicar aviso" })).toBeInTheDocument()
  })
})
