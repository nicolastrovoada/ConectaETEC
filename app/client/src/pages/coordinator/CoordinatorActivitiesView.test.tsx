// Testes da aba "Atividades excluídas" da coordenação (V3, 2.6).
// Mesma pilha dos demais testes de client: Testing Library + MSW sobre o wrapper
// real `src/lib/api.ts`. O que se fixa é o comportamento VISÍVEL do switch
// "Ativas" | "Excluídas": qual lista está na tela, os marcadores de exclusão
// (data/hora pt-BR + autor) e a inércia do cartão excluído (nada de
// editar/excluir/entregas). Nada de asserção de forma de prop.
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import type { Activity, Class, Subject } from "@shared/types"
import { CoordinatorActivitiesView } from "./CoordinatorActivitiesView"
import { ToastProvider } from "../../context/ToastContext"
import { ToastHost } from "../../components/ui/Toast"

const server = setupServer()

/** O que `GET /api/activities?deleted=true` devolve: a atividade + o nome do autor. */
type DeletedActivity = Activity & { deletedByName: string | null }

function atividade(over: Partial<Activity> & Pick<Activity, "id" | "title">): Activity {
  return {
    description: "Descrição da atividade",
    subjectId: "m1",
    teacherId: "u-prof",
    classId: "c1",
    points: 30,
    deadline: "15/10/2026",
    lateWindowDays: 7,
    type: "academic",
    status: "active",
    createdAt: "01/09/2026, 08:00:00",
    deletedAt: null,
    deletedBy: null,
    ...over,
  }
}

const ATIVA = atividade({ id: "a1", title: "Projeto de gestão" })
const EXCLUIDA = atividade({
  id: "a2",
  title: "Ação escolar do bazar",
  points: 30,
  deletedAt: "28/09/2026, 10:00:00",
  deletedBy: "u-prof",
})
/** `deletedBy` sem FK (R18): aponta para um id que não existe mais. */
const EXCLUIDA_ORFA = atividade({
  id: "a3",
  title: "Mutirão de leitura",
  subjectId: "m2",
  classId: "c2",
  points: 15,
  deadline: "20/09/2026",
  deletedAt: "27/09/2026, 18:30:00",
  deletedBy: "u-fantasma",
})

const CLASSES: Class[] = [
  {
    id: "c1",
    name: "3º Info A",
    course: "Informática",
    year: 3,
    shift: "morning",
    active: true,
    studentIds: ["u1"],
    teacherIds: ["u-prof"],
  },
  {
    id: "c2",
    name: "2º Adm B",
    course: "Administração",
    year: 2,
    shift: "afternoon",
    active: true,
    studentIds: ["u2"],
    teacherIds: ["u-prof"],
  },
]
const SUBJECTS: Subject[] = [
  { id: "m1", name: "Matemática", icon: "📐", teacherIds: ["u-prof"], classIds: ["c1"] },
  { id: "m2", name: "Português", icon: "📖", teacherIds: ["u-prof"], classIds: ["c2"] },
]

let ativas: Activity[] = [ATIVA]
let excluidas: DeletedActivity[] = []
/** URLs pedidas na rede — o `deleted=true` precisa ir para o servidor, não ser filtro local. */
let pedidos: string[] = []

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))

beforeEach(() => {
  ativas = [ATIVA]
  excluidas = [
    { ...EXCLUIDA, deletedByName: "Marcelo Ferreira" },
    { ...EXCLUIDA_ORFA, deletedByName: null },
  ]
  pedidos = []
  server.use(
    http.get("/api/activities", ({ request }) => {
      const url = new URL(request.url)
      pedidos.push(`${url.pathname}${url.search}`)
      if (url.searchParams.get("deleted") === "true") return HttpResponse.json({ data: excluidas })
      if (url.searchParams.get("calendar") === "true") {
        return HttpResponse.json({ data: { calendar: ativas.map((a) => ({ month: a.deadline.slice(3), activities: [a] })) } })
      }
      return HttpResponse.json({ data: ativas })
    }),
    http.get("/api/classes", () => HttpResponse.json({ data: CLASSES })),
    http.get("/api/subjects", () => HttpResponse.json({ data: SUBJECTS })),
  )
})

afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function renderView() {
  return render(
    <ToastProvider>
      <CoordinatorActivitiesView onGoToValidations={() => {}} />
      {/* o app real monta o ToastHost ao lado da tela (App.tsx) */}
      <ToastHost />
    </ToastProvider>,
  )
}

const aba = (nome: string) => screen.getByRole("tab", { name: nome })
const painelExcluidas = () => within(screen.getByRole("tabpanel"))

describe("Coordenação — aba de atividades excluídas (2.6)", () => {
  it("começa em Ativas e troca para a lista de excluídas com autor e data", async () => {
    const user = userEvent.setup()
    renderView()

    // Estado inicial: a lista de verdade (Ativas), sem resíduo da lixeira.
    expect(aba("Ativas")).toHaveAttribute("aria-selected", "true")
    expect(await screen.findByText(ATIVA.title)).toBeInTheDocument()
    expect(screen.queryByText(EXCLUIDA.title)).not.toBeInTheDocument()

    await user.click(aba("Excluídas"))

    expect(aba("Excluídas")).toHaveAttribute("aria-selected", "true")
    expect(aba("Ativas")).toHaveAttribute("aria-selected", "false")

    const painel = await painelExcluidas().findByText(EXCLUIDA.title)
    expect(painel).toBeInTheDocument()
    // Detalhes da atividade: título, pontos, disciplina, turma e prazo.
    expect(painelExcluidas().getByText("30 pts")).toBeInTheDocument()
    expect(painelExcluidas().getByText(/Matemática/)).toBeInTheDocument()
    expect(painelExcluidas().getByText(/3º Info A/)).toBeInTheDocument()
    expect(painelExcluidas().getByText(/15\/10\/2026/)).toBeInTheDocument()
    // Marcadores de exclusão: rótulo textual (a cor não é o único indicador),
    // data/hora pt-BR e autor. O separador data/hora depende da ICU do host
    // ("27/09/2026, 18:30" ou "27/09/2026 18:30"), então o padrão é tolerante.
    expect(painelExcluidas().getAllByText("Excluída")).toHaveLength(excluidas.length)
    expect(painelExcluidas().getByText(/Excluída em 28\/09\/2026[,\s]*10:00/)).toBeInTheDocument()
    expect(painelExcluidas().getByText("Marcelo Ferreira")).toBeInTheDocument()

    // A lixeira vem do servidor (filtro `deleted=true`), não é filtro de client.
    expect(pedidos).toContain("/api/activities?deleted=true")
    // A lista de ativas saiu da tela junto com a troca de aba.
    expect(screen.queryByText(ATIVA.title)).not.toBeInTheDocument()

    await user.click(aba("Ativas"))

    expect(await screen.findByText(ATIVA.title)).toBeInTheDocument()
    expect(screen.queryByText(EXCLUIDA.title)).not.toBeInTheDocument()
    expect(aba("Ativas")).toHaveAttribute("aria-selected", "true")
  })

  it("cartão excluído é inerte: sem editar, excluir, publicar ou abrir entregas", async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(aba("Excluídas"))
    await painelExcluidas().findByText(EXCLUIDA.title)

    const painel = screen.getByRole("tabpanel")
    expect(within(painel).queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument()
    expect(within(painel).queryByRole("button", { name: /Excluir/ })).not.toBeInTheDocument()
    expect(within(painel).queryByRole("button", { name: /Entregas/ })).not.toBeInTheDocument()
    expect(within(painel).queryByRole("button", { name: /Publicar/ })).not.toBeInTheDocument()
    // Nem os filtros/visões da lista viva (que editariam a atividade).
    expect(within(painel).queryByLabelText("Status")).not.toBeInTheDocument()
    expect(within(painel).queryByRole("button", { name: /Visão calendário/ })).not.toBeInTheDocument()
  })

  it("autor sem nome (id órfão ou usuário inativo) cai no fallback sem quebrar", async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(aba("Excluídas"))
    await painelExcluidas().findByText(EXCLUIDA_ORFA.title)

    // `deletedBy` é id SEM FK: ou não resolve mais, ou o usuário está inativo —
    // a lixeira mostra o id e não quebra.
    expect(screen.getByText("Usuário removido (u-fantasma)")).toBeInTheDocument()
    expect(screen.getByText(/Excluída em 27\/09\/2026[,\s]*18:30/)).toBeInTheDocument()
    // O cartão vizinho continua legível (o fallback é por item, não da lista).
    expect(screen.getByText("Marcelo Ferreira")).toBeInTheDocument()
  })

  it("avisa quando não há nada na lixeira", async () => {
    const user = userEvent.setup()
    excluidas = []
    renderView()

    await user.click(aba("Excluídas"))

    expect(await painelExcluidas().findByText("Nenhuma atividade excluída")).toBeInTheDocument()
    expect(screen.queryByText(ATIVA.title)).not.toBeInTheDocument()
  })

  it("as abas navegam pelo teclado (setas) mantendo o padrão ARIA", async () => {
    const user = userEvent.setup()
    renderView()

    await aba("Ativas").focus()
    await user.keyboard("{ArrowRight}")

    expect(aba("Excluídas")).toHaveAttribute("aria-selected", "true")
    expect(aba("Excluídas")).toHaveFocus()
    // A aba selecionada carrega um contorno (`ring-2`) além do preenchimento: a
    // escolha não pode depender só de cor (WCAG 1.4.1).
    expect(aba("Excluídas")).toHaveClass("ring-2")
    expect(aba("Ativas")).not.toHaveClass("ring-2")

    await user.keyboard("{ArrowLeft}")
    expect(aba("Ativas")).toHaveAttribute("aria-selected", "true")
    expect(aba("Ativas")).toHaveFocus()
  })

  it("o painel da lixeira é alcançável pelo teclado (é tudo texto, sem botão)", async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(aba("Excluídas"))
    await painelExcluidas().findByText(EXCLUIDA.title)

    // Sem `tabIndex` o painel da lixeira não tinha nada focável (cartão sem ações).
    const painel = screen.getByRole("tabpanel")
    expect(painel).toHaveAttribute("tabindex", "0")
    painel.focus()
    expect(painel).toHaveFocus()
  })

  it("turmas e disciplinas fora do ar não trancam a lixeira: vira fallback", async () => {
    const user = userEvent.setup()
    // Falha SÓ nos enfeites: a lixeira carregou, então a lista tem de aparecer.
    server.use(
      http.get("/api/classes", () => HttpResponse.json({ message: "sem turmas" }, { status: 500 })),
      http.get("/api/subjects", () => HttpResponse.json({ message: "sem disciplinas" }, { status: 500 })),
    )
    renderView()

    await user.click(aba("Excluídas"))
    await painelExcluidas().findByText(EXCLUIDA.title)

    // O dado principal apareceu com os fallbacks no lugar de turma/disciplina…
    // (regex: o texto mora no mesmo elemento dos ícones 📐/🏫).
    expect(painelExcluidas().getAllByText(/Disciplina removida/)).toHaveLength(excluidas.length)
    expect(painelExcluidas().getAllByText(/Turma removida/)).toHaveLength(excluidas.length)
    expect(painelExcluidas().getByText("30 pts")).toBeInTheDocument()
    expect(painelExcluidas().getByText("Marcelo Ferreira")).toBeInTheDocument()
    // …e nenhum ErrorState tomando a tela (o retry aqui seria um no-op).
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("falha na lixeira mostra o erro e 'Tentar novamente' recupera", async () => {
    const user = userEvent.setup()
    let fora = true
    server.use(
      http.get("/api/activities", ({ request }) => {
        const url = new URL(request.url)
        if (url.searchParams.get("deleted") === "true" && fora) {
          return HttpResponse.json({ message: "indisponível" }, { status: 500 })
        }
        if (url.searchParams.get("deleted") === "true") return HttpResponse.json({ data: excluidas })
        if (url.searchParams.get("calendar") === "true") {
          return HttpResponse.json({ data: { calendar: ativas.map((a) => ({ month: a.deadline.slice(3), activities: [a] })) } })
        }
        return HttpResponse.json({ data: ativas })
      }),
    )
    renderView()

    await user.click(aba("Excluídas"))

    expect(await screen.findByText("Não foi possível carregar os dados.")).toBeInTheDocument()

    fora = false
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }))

    expect(await painelExcluidas().findByText(EXCLUIDA.title)).toBeInTheDocument()
    expect(screen.queryByText("Não foi possível carregar os dados.")).not.toBeInTheDocument()
  })

  it("o cabeçalho da tela fica acima das abas, não dentro do painel", async () => {
    const user = userEvent.setup()
    renderView()

    // Título da coordenação desenhado uma vez só…
    const titulo = screen.getByRole("heading", { name: /Atividades da escola/ })
    expect(titulo).toBeInTheDocument()
    expect(screen.getAllByRole("heading", { name: /^📋\s*Atividades/ })).toHaveLength(1)
    // …e o `ActivityManager` NÃO repete o cabeçalho dentro do painel (`showHeader={false}`).
    expect(within(screen.getByRole("tabpanel")).queryByRole("heading", { name: /Atividades/ })).not.toBeInTheDocument()

    await user.click(aba("Excluídas"))
    await painelExcluidas().findByText(EXCLUIDA.title)
    expect(titulo).toBeInTheDocument()
  })
})
