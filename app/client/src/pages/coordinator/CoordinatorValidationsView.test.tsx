// Testes do laço da coordenação na validação (V3, 4.7).
// Mesma pilha dos demais testes de client: Testing Library + MSW sobre o wrapper
// real `src/lib/api.ts` — nada de mockar `api` nem `SubmissionsManager`. O que se
// fixa é o que a COORDENAÇÃO vê e o que sai na rede:
//  - a tela "Validações da escola" abre com os cinco filtros da 4.1;
//  - os cinco filtros viram UMA query combinável (AND) e a lista da tela é a
//    resposta do servidor, não um recorte local;
//  - entregas de atividades de professores DIFERENTES aparecem juntas e o nome
//    do aluno é resolvido por `GET /api/users?role=student` (a coordenação é o
//    único papel que lista usuários);
//  - escolher a Matéria restringe as Atividades oferecidas, sem novo pedido ao
//    servidor e sem 403 (a lista continua sendo a do escopo que já veio).
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import type { Activity, SafeUser, Submission, Subject } from "@shared/types"
import { CoordinatorValidationsView } from "./CoordinatorValidationsView"
import { ToastProvider } from "../../context/ToastContext"
import { ToastHost } from "../../components/ui/Toast"

const server = setupServer()

function atividade(over: Partial<Activity> & Pick<Activity, "id" | "title">): Activity {
  return {
    description: "Descrição da atividade",
    subjectId: "m1",
    teacherId: "u-prof-a",
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

/**
 * Duas matérias e três atividades de DOIS professores diferentes. A coordenação
 * não é escopada por dono: as três têm de chegar em `GET /api/activities`.
 */
const ATIVIDADES: Activity[] = [
  atividade({ id: "a1", title: "Revisão de Língua Portuguesa", subjectId: "m1", teacherId: "u-prof-a" }),
  atividade({ id: "a2", title: "Crônica da feira cultural", subjectId: "m1", teacherId: "u-prof-b", classId: "c2" }),
  atividade({ id: "a3", title: "Roteiro de laboratório", subjectId: "m2", teacherId: "u-prof-b" }),
]

const MATERIAS: Subject[] = [
  { id: "m1", name: "Língua Portuguesa", icon: "📖", teacherIds: ["u-prof-a", "u-prof-b"], classIds: ["c1", "c2"] },
  { id: "m2", name: "Química", icon: "🧪", teacherIds: ["u-prof-b"], classIds: ["c1"] },
]

const ALUNOS: SafeUser[] = [
  {
    id: "u1",
    name: "Ana Souza",
    email: "ana@etec.sp.gov.br",
    role: "student",
    active: true,
    avatar: "A",
    classIds: ["c1"],
    createdAt: "01/09/2026, 08:00:00",
  },
  {
    id: "u2",
    name: "Mateus Lima",
    email: "mateus@etec.sp.gov.br",
    role: "student",
    active: true,
    avatar: "M",
    classIds: ["c2"],
    createdAt: "01/09/2026, 08:00:00",
  },
]

function entrega(over: Partial<Submission> & Pick<Submission, "id" | "activityId">): Submission {
  return {
    studentId: "u1",
    submittedAt: "10/09/2026, 08:00:00",
    status: "approved",
    delayed: false,
    evidence: "Evidência",
    comment: "Comentário",
    attachments: [],
    validatedBy: null,
    validatedAt: null,
    feedback: "",
    ...over,
  }
}

/** Entregas em atividades de professores DIFERENTES — as duas têm de aparecer. */
const ENTREGAS: Submission[] = [
  entrega({ id: "s1", activityId: "a1", studentId: "u1", submittedAt: "10/09/2026, 08:00:00" }),
  entrega({ id: "s2", activityId: "a2", studentId: "u2", submittedAt: "11/09/2026, 08:00:00" }),
]

/** Search params de cada `GET /api/submissions` que saiu, na ordem. */
let pedidosSubmissions: URLSearchParams[] = []
/** Search de cada `GET /api/users` que saiu, na ordem. */
let pedidosUsers: string[] = []
/** URLs de `GET /api/activities` (o filtro de matéria não pode pedir outra lista). */
let pedidosActivities: string[] = []

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))

beforeEach(() => {
  pedidosSubmissions = []
  pedidosUsers = []
  pedidosActivities = []
  server.use(
    http.get("/api/activities", ({ request }) => {
      pedidosActivities.push(new URL(request.url).search)
      return HttpResponse.json({ data: ATIVIDADES })
    }),
    http.get("/api/subjects", () => HttpResponse.json({ data: MATERIAS })),
    // Só a coordenação pede o diretório (a 4.1 usa isto para os nomes das
    // entregas). O handler responde apenas com `role=student`: qualquer outro
    // pedido no teste é falha, não degradação silenciosa.
    http.get("/api/users", ({ request }) => {
      const search = new URL(request.url).search
      pedidosUsers.push(search)
      if (new URL(request.url).searchParams.get("role") !== "student") {
        return HttpResponse.json({ error: "papel não suportado neste teste" }, { status: 400 })
      }
      return HttpResponse.json({ data: ALUNOS })
    }),
    http.get("/api/submissions", ({ request }) => {
      const url = new URL(request.url)
      pedidosSubmissions.push(url.searchParams)
      // Quem filtra é o servidor: o handler devolve SEMPRE as duas entregas, de
      // modo que um filtro local apareceria como lista vazia/recortada aqui.
      return HttpResponse.json({ data: ENTREGAS })
    }),
  )
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})

function renderView() {
  return render(
    <ToastProvider>
      <CoordinatorValidationsView />
      {/* o app real monta o ToastHost ao lado da tela (App.tsx) */}
      <ToastHost />
    </ToastProvider>,
  )
}

const botaoFiltros = () => screen.getByRole("button", { name: /Filtros/ })
const ultimaQuery = () => pedidosSubmissions[pedidosSubmissions.length - 1]
const selectAtividade = () => screen.getByLabelText("Atividade") as HTMLSelectElement

function opcoesAtividade(): Array<string | null> {
  return Array.from(selectAtividade().options).map((o) => o.textContent)
}

describe("Coordenação — validação da escola (4.7)", () => {
  it("abre com o título da escola e os cinco filtros da validação", async () => {
    const user = userEvent.setup()
    renderView()

    expect(await screen.findByRole("heading", { name: /Validações da escola/ })).toBeInTheDocument()
    await waitFor(() => expect(pedidosSubmissions.length).toBeGreaterThan(0))

    await user.click(botaoFiltros())

    // Os cinco campos da spec (decisão nº 14): Matéria, Atividade, Status,
    // Aluno e Período (De/Até).
    expect(screen.getByLabelText("Matéria")).toBeInTheDocument()
    expect(screen.getByLabelText("Atividade")).toBeInTheDocument()
    expect(screen.getByLabelText("Status")).toBeInTheDocument()
    expect(screen.getByLabelText("Aluno")).toBeInTheDocument()
    expect(screen.getByText("Período de envio")).toBeInTheDocument()
    expect(screen.getByLabelText("De")).toBeInTheDocument()
    expect(screen.getByLabelText("Até")).toBeInTheDocument()
  })

  it("combina os cinco filtros numa única query (E), sem recorte local da lista", async () => {
    const user = userEvent.setup()
    renderView()
    await waitFor(() => expect(pedidosSubmissions.length).toBeGreaterThan(0))
    await user.click(botaoFiltros())

    // Matéria primeiro: escolher outra dimensão devolve a atividade padrão
    // herdada (a1) para "Todas as atividades" (4.1), então a a1 escolhida
    // abaixo é escolha à mão dentro da matéria selecionada.
    await user.selectOptions(screen.getByLabelText("Matéria"), "m1")
    await user.selectOptions(selectAtividade(), "a1")
    await user.selectOptions(screen.getByLabelText("Status"), "approved")
    await user.type(screen.getByLabelText("Aluno"), "Ana")
    await user.type(screen.getByLabelText("De"), "01/09/2026")
    await user.type(screen.getByLabelText("Até"), "30/09/2026")

    await waitFor(() => {
      const query = ultimaQuery()
      expect(query.get("subjectId")).toBe("m1")
      expect(query.get("activityId")).toBe("a1")
      expect(query.get("status")).toBe("approved")
      expect(query.get("studentName")).toBe("Ana")
      expect(query.get("from")).toBe("01/09/2026")
      expect(query.get("to")).toBe("30/09/2026")
    })

    // A lista da tela é a RESPOSTA do servidor: o handler devolve as duas
    // entregas mesmo com os filtros aplicados, e as duas continuam visíveis —
    // nenhum filtro é reaplicado no cliente.
    const tabela = await screen.findByRole("table")
    expect(within(tabela).getByText("Ana Souza")).toBeInTheDocument()
    expect(within(tabela).getByText("Mateus Lima")).toBeInTheDocument()
  })

  it("mostra entregas de professores diferentes e resolve os nomes em /api/users", async () => {
    const user = userEvent.setup()
    renderView()
    await waitFor(() => expect(pedidosSubmissions.length).toBeGreaterThan(0))
    await user.click(botaoFiltros())

    // "Todas as atividades": a coordenação não é escopada por dono, e o que a
    // tela pede é a lista inteira da escola (as duas entregas são de atividades
    // de professores diferentes).
    await user.selectOptions(selectAtividade(), "")
    await waitFor(() => expect(ultimaQuery().get("activityId")).toBeNull())

    const tabela = await screen.findByRole("table")
    expect(within(tabela).getByText("Ana Souza")).toBeInTheDocument()
    expect(within(tabela).getByText("Mateus Lima")).toBeInTheDocument()
    // Sem o diretório o rótulo degradado seria "Aluno u1"/"Aluno u2".
    expect(screen.queryByText(/Aluno u1/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Aluno u2/)).not.toBeInTheDocument()

    // O nome saiu de `GET /api/users?role=student` — o mesmo pedido que a 4.1
    // faz só para a coordenação.
    expect(pedidosUsers.length).toBeGreaterThan(0)
    expect(pedidosUsers.every((search) => search === "?role=student")).toBe(true)
  })

  it("escolher a Matéria restringe as Atividades oferecidas (sem pedir outra lista)", async () => {
    const user = userEvent.setup()
    renderView()
    await waitFor(() => expect(pedidosSubmissions.length).toBeGreaterThan(0))
    await user.click(botaoFiltros())

    await waitFor(() => expect(opcoesAtividade()).toHaveLength(4)) // "Todas" + 3

    const pedidosDeAtividadesAntes = pedidosActivities.length
    await user.selectOptions(screen.getByLabelText("Matéria"), "m1")

    // Só as atividades da matéria escolhida ficam disponíveis: o par
    // Matéria+Atividade é E, e oferecer uma atividade de outra matéria seria
    // oferecer uma combinação que o servidor devolve vazia.
    expect(opcoesAtividade()).toEqual([
      "Todas as atividades",
      "Revisão de Língua Portuguesa",
      "Crônica da feira cultural",
    ])
    // A restrição é local: nenhum `GET /api/activities` novo (e nenhum 403) —
    // a lista continua sendo a do escopo que já chegou para a coordenação.
    expect(pedidosActivities.length).toBe(pedidosDeAtividadesAntes)
    expect(pedidosActivities.every((search) => !search.includes("subjectId"))).toBe(true)
  })

  it("trocar a Matéria reseta a Atividade escolhida à mão", async () => {
    const user = userEvent.setup()
    renderView()
    await waitFor(() => expect(pedidosSubmissions.length).toBeGreaterThan(0))
    await user.click(botaoFiltros())

    await user.selectOptions(screen.getByLabelText("Matéria"), "m1")
    // Escolha explícita (a2), não a atividade padrão herdada (a1).
    await waitFor(() => expect(opcoesAtividade()).toContain("Crônica da feira cultural"))
    await user.selectOptions(selectAtividade(), "a2")
    await waitFor(() => {
      expect(ultimaQuery().get("subjectId")).toBe("m1")
      expect(ultimaQuery().get("activityId")).toBe("a2")
    })

    // m2 não tem a2: manter o par seria pedir uma combinação impossível. O
    // reset precisa chegar à QUERY (e não só à lista de opções).
    await user.selectOptions(screen.getByLabelText("Matéria"), "m2")
    await waitFor(() => {
      expect(ultimaQuery().get("subjectId")).toBe("m2")
      expect(ultimaQuery().get("activityId")).toBeNull()
    })
  })
})
