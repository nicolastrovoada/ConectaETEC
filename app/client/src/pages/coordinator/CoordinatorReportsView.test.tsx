// Testes do relatório completo da coordenação (V3, 4.5).
// Mesma pilha dos demais testes de client: Testing Library + MSW sobre o wrapper
// real `src/lib/api.ts`. O contrato fixado aqui é o da TELA: a primeira consulta
// sai sem filtros; "Aplicar filtros" manda from/to/classId/subjectId/teacherId
// para os cinco relatórios; os blocos novos desenham os valores do servidor; o
// CSV de cada bloco novo leva os MESMOS filtros + format=csv; e "Limpar filtros"
// volta ao estado inicial recarregando sem query.
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import type { Class, SafeUser, Subject } from "@shared/types"
import type {
  ActivitiesByTypeRow,
  ActivityDetailReportRow,
  ClassRankingGroup,
  CompletionReportRow,
  SubjectRankingGroup,
} from "../../lib/types"
import { downloadFile } from "../../lib/api"
import { CoordinatorReportsView } from "./CoordinatorReportsView"
import { ToastProvider } from "../../context/ToastContext"
import { ToastHost } from "../../components/ui/Toast"

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api")>()
  return { ...actual, downloadFile: vi.fn() }
})

const downloadMock = vi.mocked(downloadFile)

const server = setupServer()

const ROUTES = [
  "/api/reports/completion",
  "/api/reports/activities-by-type",
  "/api/reports/activity-detail",
  "/api/reports/rankings/classes",
  "/api/reports/rankings/subjects",
] as const

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
    teacherIds: ["u-prof2"],
  },
]

const SUBJECTS: Subject[] = [
  { id: "m1", name: "Matemática", icon: "📐", teacherIds: ["u-prof"], classIds: ["c1"] },
  { id: "m2", name: "Português", icon: "📖", teacherIds: ["u-prof2"], classIds: ["c2"] },
]

const TEACHERS: SafeUser[] = [
  {
    id: "u-prof",
    name: "Marcelo Ferreira",
    email: "marcelo@etec.sp.gov.br",
    role: "teacher",
    active: true,
    avatar: "M",
    classIds: ["c1"],
    createdAt: "01/02/2026, 08:00:00",
  },
  {
    id: "u-prof2",
    name: "Ana Paula",
    email: "ana@etec.sp.gov.br",
    role: "teacher",
    active: true,
    avatar: "A",
    classIds: ["c2"],
    createdAt: "01/02/2026, 08:00:00",
  },
]

const CONCLUSAO: CompletionReportRow[] = [
  { className: "3º Info A", course: "Informática", students: 20, activities: 3, possible: 60, done: 48, pct: 80 },
  { className: "2º Adm B", course: "Administração", students: 18, activities: 2, possible: 36, done: 9, pct: 25 },
]

const POR_TIPO: ActivitiesByTypeRow[] = [
  { type: "academic", label: "Acadêmica", count: 7 },
  { type: "event", label: "Evento", count: 2 },
]

const DETALHE: ActivityDetailReportRow[] = [
  {
    activityId: "a1",
    title: "Lista de frações",
    type: "academic",
    subject: "Matemática",
    className: "3º Info A",
    teacherName: "Marcelo Ferreira",
    deadline: "15/10/2026",
    createdAt: "01/09/2026, 08:00:00",
    deliveries: 10,
    approved: 6,
    rejected: 2,
    pending: 2,
    late: 3,
    donePct: 60,
  },
  {
    activityId: "a2",
    title: "Leitura do conto",
    type: "school_action",
    subject: "Português",
    className: "2º Adm B",
    teacherName: "Ana Paula",
    deadline: "20/09/2026",
    createdAt: "02/09/2026, 09:30:00",
    deliveries: 0,
    approved: 0,
    rejected: 0,
    pending: 0,
    late: 0,
    donePct: 0,
  },
]

const RANKING_TURMAS: ClassRankingGroup[] = [
  {
    className: "3º Info A",
    course: "Informática",
    rows: [
      { studentName: "Ana Beatriz", points: 120, level: "🥈 Prata" },
      { studentName: "Carlos Souza", points: 40, level: "🥉 Bronze" },
    ],
  },
  {
    className: "2º Adm B",
    course: "Administração",
    rows: [{ studentName: "Diego Alves", points: 80, level: "🥉 Bronze" }],
  },
]

const RANKING_MATERIAS: SubjectRankingGroup[] = [
  {
    subjectId: "m1",
    subjectName: "Matemática",
    icon: "📐",
    rows: [{ studentName: "Ana Beatriz", className: "3º Info A", points: 120, level: "🥈 Prata" }],
  },
  {
    subjectId: "m2",
    subjectName: "Português",
    icon: "📖",
    rows: [{ studentName: "Diego Alves", className: "2º Adm B", points: 80, level: "🥉 Bronze" }],
  },
]

/** URLs pedidas por rota de relatório — é nelas que os filtros precisam aparecer. */
let pedidos: Record<string, URL[]>
/** Opções do select de professor: a coordenação busca somente professores ativos. */
let pedidosDeProfessores: URL[]

function reportHandler(route: string, data: unknown) {
  return http.get(route, ({ request }) => {
    pedidos[route].push(new URL(request.url))
    return HttpResponse.json({ data })
  })
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))

beforeEach(() => {
  pedidos = Object.fromEntries(ROUTES.map((route) => [route, []]))
  pedidosDeProfessores = []
  downloadMock.mockReset()
  downloadMock.mockResolvedValue(undefined)

  server.use(
    http.get("/api/classes", () => HttpResponse.json({ data: CLASSES })),
    http.get("/api/subjects", () => HttpResponse.json({ data: SUBJECTS })),
    http.get("/api/users", ({ request }) => {
      pedidosDeProfessores.push(new URL(request.url))
      return HttpResponse.json({ data: TEACHERS })
    }),
    reportHandler("/api/reports/completion", CONCLUSAO),
    reportHandler("/api/reports/activities-by-type", POR_TIPO),
    reportHandler("/api/reports/activity-detail", DETALHE),
    reportHandler("/api/reports/rankings/classes", RANKING_TURMAS),
    reportHandler("/api/reports/rankings/subjects", RANKING_MATERIAS),
  )
})

afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function renderView() {
  return render(
    <ToastProvider>
      <CoordinatorReportsView />
      {/* o app real monta o ToastHost ao lado da tela (App.tsx) */}
      <ToastHost />
    </ToastProvider>,
  )
}

const ultimaConsulta = (route: string) => pedidos[route].at(-1)

/** Parâmetros que "Aplicar filtros" precisa espalhar por TODOS os relatórios. */
const FILTROS_APLICADOS = {
  from: "2026-01-01",
  to: "2026-03-31",
  classId: "c1",
  subjectId: "m1",
  teacherId: "u-prof",
}

async function aguardarConsulta(route: string, quantidade: number) {
  await waitFor(() => expect(pedidos[route]).toHaveLength(quantidade))
}

async function preencherFiltros(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("option", { name: "3º Info A" })
  await screen.findByRole("option", { name: "Matemática" })
  await screen.findByRole("option", { name: "Marcelo Ferreira" })

  fireEvent.change(screen.getByLabelText("De"), { target: { value: FILTROS_APLICADOS.from } })
  fireEvent.change(screen.getByLabelText("Até"), { target: { value: FILTROS_APLICADOS.to } })
  await user.selectOptions(screen.getByLabelText("Turma"), FILTROS_APLICADOS.classId)
  await user.selectOptions(screen.getByLabelText("Matéria"), FILTROS_APLICADOS.subjectId)
  await user.selectOptions(screen.getByLabelText("Professor"), FILTROS_APLICADOS.teacherId)
}

function conferirFiltrosNaUrl(url: URL) {
  expect(url.searchParams.get("from")).toBe(FILTROS_APLICADOS.from)
  expect(url.searchParams.get("to")).toBe(FILTROS_APLICADOS.to)
  expect(url.searchParams.get("classId")).toBe(FILTROS_APLICADOS.classId)
  expect(url.searchParams.get("subjectId")).toBe(FILTROS_APLICADOS.subjectId)
  expect(url.searchParams.get("teacherId")).toBe(FILTROS_APLICADOS.teacherId)
}

function conferirSemFiltros(url: URL) {
  expect(url.search).toBe("")
}

describe("Coordenação — relatório completo (4.5)", () => {
  it("a primeira consulta dos cinco relatórios sai sem filtros", async () => {
    renderView()

    // Espera o conteúdo de cada bloco para garantir que as cinco rotas responderam.
    await screen.findByRole("table", { name: "Atrasos por atividade" })
    await screen.findByRole("table", { name: "Ranking de pontos — 3º Info A — Informática" })
    await screen.findByRole("table", { name: "Ranking por matéria — Matemática" })
    await screen.findByText("80%")
    await screen.findByText("Acadêmica")

    for (const route of ROUTES) {
      await aguardarConsulta(route, 1)
      conferirSemFiltros(pedidos[route][0])
    }

    // As opções de professor vêm do recorte da coordenação: só role=teacher.
    await waitFor(() => expect(pedidosDeProfessores).toHaveLength(1))
    expect(pedidosDeProfessores[0].searchParams.get("role")).toBe("teacher")
  })

  it("“Aplicar filtros” envia o mesmo recorte para todos os relatórios", async () => {
    const user = userEvent.setup({ delay: null })
    renderView()

    await preencherFiltros(user)
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }))

    for (const route of ROUTES) {
      await aguardarConsulta(route, 2)
      const url = ultimaConsulta(route)
      expect(url).toBeDefined()
      conferirFiltrosNaUrl(url!)
      expect(url!.searchParams.get("format")).toBeNull()
    }
  })

  it("desenha os atrasos por atividade com as colunas e valores do servidor", async () => {
    renderView()

    const tabela = await screen.findByRole("table", { name: "Atrasos por atividade" })
    const cabecalhos = within(tabela).getAllByRole("columnheader").map((th) => th.textContent)
    expect(cabecalhos).toEqual(["Atividade", "Professor", "Turma", "Matéria", "Entregas", "Aprovadas", "Pendentes", "Atrasadas", "%"])

    const linha = within(tabela).getByRole("row", { name: /Lista de frações/ })
    expect(within(linha).getByRole("rowheader")).toHaveTextContent("Lista de frações")
    expect(within(linha).getByRole("rowheader")).toHaveTextContent("Prazo: 15/10/2026")

    const celulas = within(linha).getAllByRole("cell")
    expect(celulas[0]).toHaveTextContent("Marcelo Ferreira")
    expect(celulas[1]).toHaveTextContent("3º Info A")
    expect(celulas[2]).toHaveTextContent("Matemática")
    expect(celulas[3]).toHaveTextContent("10")
    expect(celulas[4]).toHaveTextContent("6")
    expect(celulas[5]).toHaveTextContent("2")
    expect(celulas[6]).toHaveTextContent("3 atrasadas")
    expect(celulas[7]).toHaveTextContent("60%")

    // Atividade sem entrega: 0% com a explicação, sem barra inventada.
    const semEntrega = within(tabela).getByRole("row", { name: /Leitura do conto/ })
    const celulasSemEntrega = within(semEntrega).getAllByRole("cell")
    expect(celulasSemEntrega[3]).toHaveTextContent("0")
    expect(celulasSemEntrega[6]).toHaveTextContent("0")
    expect(celulasSemEntrega[7]).toHaveTextContent("0%")
    expect(within(semEntrega).getByText("sem entregas")).toBeInTheDocument()
  })

  it("desenha o ranking por turma com pontos e nível", async () => {
    renderView()

    const tabela = await screen.findByRole("table", { name: "Ranking de pontos — 3º Info A — Informática" })
    expect(within(tabela).getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["Aluno", "Pontos", "Nível"])

    const linha = within(tabela).getByRole("row", { name: /Ana Beatriz/ })
    expect(within(linha).getByRole("rowheader")).toHaveTextContent("Ana Beatriz")
    const celulas = within(linha).getAllByRole("cell")
    expect(celulas[0]).toHaveTextContent("120")
    expect(celulas[1]).toHaveTextContent("🥈 Prata")

    const outraTurma = screen.getByRole("table", { name: "Ranking de pontos — 2º Adm B — Administração" })
    const diego = within(outraTurma).getByRole("row", { name: /Diego Alves/ })
    expect(within(diego).getAllByRole("cell")[0]).toHaveTextContent("80")
  })

  it("desenha o ranking por matéria com aluno, turma, pontos e nível", async () => {
    renderView()

    const tabela = await screen.findByRole("table", { name: "Ranking por matéria — Matemática" })
    expect(within(tabela).getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["Aluno", "Turma", "Pontos", "Nível"])

    const linha = within(tabela).getByRole("row", { name: /Ana Beatriz/ })
    expect(within(linha).getByRole("rowheader")).toHaveTextContent("Ana Beatriz")
    const celulas = within(linha).getAllByRole("cell")
    expect(celulas[0]).toHaveTextContent("3º Info A")
    expect(celulas[1]).toHaveTextContent("120")
    expect(celulas[2]).toHaveTextContent("🥈 Prata")

    // O cabeçalho do grupo carrega o ícone da matéria (aria-hidden) + o nome.
    const grupoPortugues = screen.getByRole("table", { name: "Ranking por matéria — Português" })
    expect(within(grupoPortugues).getByRole("row", { name: /Diego Alves/ })).toBeInTheDocument()
  })

  it("o CSV de cada bloco novo leva os filtros aplicados e format=csv", async () => {
    const user = userEvent.setup({ delay: null })
    renderView()

    await preencherFiltros(user)
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }))
    await aguardarConsulta("/api/reports/activity-detail", 2)

    const blocos = [
      { botao: "Exportar CSV — Atrasos por atividade", rota: "/api/reports/activity-detail" },
      { botao: "Exportar CSV — Ranking por turma", rota: "/api/reports/rankings/classes" },
      { botao: "Exportar CSV — Ranking por matéria", rota: "/api/reports/rankings/subjects" },
    ]

    for (const bloco of blocos) {
      downloadMock.mockClear()
      await user.click(screen.getByRole("button", { name: bloco.botao }))
      await waitFor(() => expect(downloadMock).toHaveBeenCalledTimes(1))

      const caminho = downloadMock.mock.calls[0][0]
      const url = new URL(caminho, "http://localhost")
      expect(url.pathname).toBe(bloco.rota)
      expect(url.searchParams.get("format")).toBe("csv")
      conferirFiltrosNaUrl(url)
    }
  })

  it("“Limpar filtros” restaura os campos e recarrega os cinco relatórios sem filtros", async () => {
    const user = userEvent.setup({ delay: null })
    renderView()

    await preencherFiltros(user)
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }))
    await aguardarConsulta("/api/reports/completion", 2)

    await user.click(screen.getByRole("button", { name: "Limpar filtros" }))

    expect(screen.getByLabelText("De")).toHaveValue("")
    expect(screen.getByLabelText("Até")).toHaveValue("")
    expect(screen.getByLabelText("Turma")).toHaveValue("")
    expect(screen.getByLabelText("Matéria")).toHaveValue("")
    expect(screen.getByLabelText("Professor")).toHaveValue("")

    for (const route of ROUTES) {
      await aguardarConsulta(route, 3)
      conferirSemFiltros(ultimaConsulta(route)!)
    }
  })

  it("falha nas opções de filtro não derruba os relatórios", async () => {
    server.use(http.get("/api/subjects", () => HttpResponse.json({ message: "sem matérias" }, { status: 500 })))
    renderView()

    // O dado principal continua na tela…
    await screen.findByRole("table", { name: "Atrasos por atividade" })
    expect(screen.getByRole("table", { name: "Ranking de pontos — 3º Info A — Informática" })).toBeInTheDocument()
    // …e o aviso é local, sem ErrorState tomando conta do relatório inteiro.
    expect(await screen.findByText(/Algumas opções de filtro não puderam ser carregadas/)).toBeInTheDocument()
    expect(screen.queryByText("Não foi possível carregar os dados.")).not.toBeInTheDocument()
  })
})
