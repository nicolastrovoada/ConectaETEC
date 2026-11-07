// Testes da aba oculta de filtros da validação (V3, 4.1).
// Mesma pilha dos demais testes de client: Testing Library + MSW sobre o wrapper
// real `src/lib/api.ts`. O que se fixa é o comportamento VISÍVEL e o que sai
// na rede:
//  - o botão "Filtros" revela/esconde o painel (`aria-expanded` + `aria-controls`);
//  - os cinco campos montam UMA query combinável (AND) — nenhum filtro é aplicado
//    no cliente, porque a lista da tela tem de ser a lista que o servidor devolveu;
//  - as matérias oferecidas são as das atividades do escopo, não a lista global;
//  - "Limpar filtros" volta ao estado inicial;
//  - data que não existe não vira data de 1970: o erro aparece no campo e o
//    parâmetro não vai para a query.
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import type { Activity, Subject, Submission } from "@shared/types"
import { SubmissionsManager } from "./SubmissionsManager"
import { ToastProvider } from "../context/ToastContext"
import { ToastHost } from "../components/ui/Toast"
import { brDayKey } from "../lib/format"

const server = setupServer()

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

/** Duas atividades do MESMO escopo (m1) e uma de outra matéria (m2). */
const ATIVIDADES: Activity[] = [
  atividade({ id: "a1", title: "Revisão de Língua Portuguesa", subjectId: "m1" }),
  atividade({ id: "a2", title: "Crônica da feira", subjectId: "m1" }),
  atividade({ id: "a3", title: "Roteiro de laboratório", subjectId: "m2" }),
]

const MATERIAS: Subject[] = [
  { id: "m1", name: "Língua Portuguesa", icon: "📖", teacherIds: ["u-prof"], classIds: ["c1"] },
  { id: "m2", name: "Química", icon: "🧪", teacherIds: ["u-prof"], classIds: ["c1"] },
  // Disciplina da escola inteira: se a lista de opções for a global, ela aparece
  // aqui — e escolher uma matéria que o escopo não tem devolve sempre vazio.
  { id: "m3", name: "Direito Empresarial", icon: "⚖️", teacherIds: ["u-outro"], classIds: ["c2"] },
]

function entrega(over: Partial<Submission> & Pick<Submission, "id" | "activityId">): Submission {
  return {
    studentId: "u1",
    submittedAt: "10/09/2026, 08:00:00",
    status: "under_review",
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

/** Search params de cada `GET /api/submissions` que saiu, na ordem. */
let pedidos: URLSearchParams[] = []

/**
 * O que o handler de `/api/submissions` devolve. Variável (e não constante)
 * porque o handler antes devolvia SEMPRE uma entrega: sem isso o `EmptyState` e
 * a paginação (que precisa de mais de uma página) nunca montavam, e nenhuma
 * linha da lista podia ser testada.
 */
let respostaSubmissions: Submission[] = [entrega({ id: "s1", activityId: "a1" })]

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))

beforeEach(() => {
  pedidos = []
  respostaSubmissions = [entrega({ id: "s1", activityId: "a1" })]
  server.use(
    http.get("/api/activities", () => HttpResponse.json({ data: ATIVIDADES })),
    http.get("/api/subjects", () => HttpResponse.json({ data: MATERIAS })),
    http.get("/api/submissions", ({ request }) => {
      const url = new URL(request.url)
      pedidos.push(url.searchParams)
      // O handler valida o período como a rota faz: `from > to` é 400
      // `PERIOD_REVERSED` no servidor, e é esse 400 que esconderia a tabela
      // atrás do `ErrorState` se o client mandasse o período invertido. Aqui a
      // resposta espelha o contrato real, para o teste ver o efeito de verdade.
      const from = url.searchParams.get("from")
      const to = url.searchParams.get("to")
      if (from && to && brDayKey(from) > brDayKey(to)) {
        return HttpResponse.json(
          { error: `Período inválido: "from" (${from}) é posterior a "to" (${to}).` },
          { status: 400 },
        )
      }
      // Devolve a lista configurada: quem filtra é o servidor, e um filtro
      // aplicado no cliente apareceria como lista vazia aqui.
      return HttpResponse.json({ data: respostaSubmissions })
    }),
  )
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})

function renderManager() {
  return render(
    <ToastProvider>
      <SubmissionsManager role="teacher" canValidateActivity={() => true} />
      <ToastHost />
    </ToastProvider>,
  )
}

const botaoFiltros = () => screen.getByRole("button", { name: /Filtros/ })
const painel = () => document.getElementById("painel-filtros-validador")
const ultimaQuery = () => pedidos[pedidos.length - 1]

async function abrir() {
  const user = userEvent.setup()
  renderManager()
  await waitFor(() => expect(pedidos.length).toBeGreaterThan(0))
  await user.click(botaoFiltros())
  return user
}

describe("SubmissionsManager — aba oculta de filtros (4.1)", () => {
  it("o botão revela e esconde o painel", async () => {
    renderManager()
    await waitFor(() => expect(pedidos.length).toBeGreaterThan(0))

    // Fechado: o botão declara o estado, e o painel está no DOM mas invisível
    // (`aria-controls` apontando para elemento que existe é o motivo de o painel
    // ficar montado em vez de ser removido).
    expect(botaoFiltros()).toHaveAttribute("aria-expanded", "false")
    expect(botaoFiltros()).toHaveAttribute("aria-controls", "painel-filtros-validador")
    expect(painel()).not.toBeNull()
    expect(painel()).not.toBeVisible()

    const user = userEvent.setup()
    await user.click(botaoFiltros())
    expect(botaoFiltros()).toHaveAttribute("aria-expanded", "true")
    expect(painel()).toBeVisible()
    // Os cinco campos da spec (decisão nº 14) existem com label associado.
    expect(screen.getByLabelText("Matéria")).toBeInTheDocument()
    expect(screen.getByLabelText("Atividade")).toBeInTheDocument()
    expect(screen.getByLabelText("Status")).toBeInTheDocument()
    expect(screen.getByLabelText("Aluno")).toBeInTheDocument()
    expect(screen.getByLabelText("De")).toBeInTheDocument()
    expect(screen.getByLabelText("Até")).toBeInTheDocument()

    await user.click(botaoFiltros())
    expect(botaoFiltros()).toHaveAttribute("aria-expanded", "false")
    expect(painel()).not.toBeVisible()
  })

  it("as matérias oferecidas são as do escopo, não a lista global", async () => {
    await abrir()

    const opcoes = Array.from(
      (screen.getByLabelText("Matéria") as HTMLSelectElement).options,
    ).map((o) => o.textContent)
    expect(opcoes).toEqual([
      "Todas as matérias",
      "Língua Portuguesa",
      "Química",
    ])
    // `Direito Empresarial` (m3) existe no banco mas nenhuma atividade do escopo
    // é dela: oferecer a escolha seria oferecer um filtro que nunca acha nada.
    expect(opcoes).not.toContain("Direito Empresarial")
  })

  it("os cinco filtros saem juntos na query (um pedido só)", async () => {
    const user = await abrir()

    await user.selectOptions(screen.getByLabelText("Matéria"), "m1")
    await user.selectOptions(screen.getByLabelText("Atividade"), "a2")
    await user.selectOptions(screen.getByLabelText("Status"), "approved")
    await user.type(screen.getByLabelText("Aluno"), "Ana")
    await user.type(screen.getByLabelText("De"), "01/09/2026")
    await user.type(screen.getByLabelText("Até"), "30/09/2026")

    await waitFor(() => {
      const query = ultimaQuery()
      expect(query.get("subjectId")).toBe("m1")
      expect(query.get("activityId")).toBe("a2")
      expect(query.get("status")).toBe("approved")
      expect(query.get("studentName")).toBe("Ana")
      expect(query.get("from")).toBe("01/09/2026")
      expect(query.get("to")).toBe("30/09/2026")
    })
    // A barra é `DD/MM/AAAA` percent-escapado pelo `URLSearchParams` — o mesmo
    // que o servidor recebe em produção.
    expect(ultimaQuery().toString()).toContain("from=01%2F09%2F2026")
  })

  it("período que não é data vira erro no campo e não vai para a query", async () => {
    const user = await abrir()
    const campo = screen.getByLabelText("De") as HTMLInputElement

    await user.type(campo, "32/13/2026")

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Data inválida"))
    expect(campo).toHaveAttribute("aria-invalid", "true")
    await waitFor(() => expect(ultimaQuery().get("from")).toBeNull())
    // O resto dos filtros continua indo — um campo ruim não zera a query toda.
    expect(ultimaQuery().get("activityId")).toBe("a1")

    await user.clear(campo)
    await user.type(campo, "01/09/2026")
    await waitFor(() => expect(ultimaQuery().get("from")).toBe("01/09/2026"))
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  // MINOR-2: a mensagem precisa ser alcançável pelo leitor de tela a partir dos
  // DOIS campos. Um `role="alert"` solto no fim do fieldset é lido quando
  // aparece, mas não fica associado ao campo quando o foco volta para ele.
  it("a mensagem do período é descrita pelos dois campos (aria-describedby)", async () => {
    const user = await abrir()
    await user.type(screen.getByLabelText("De"), "32/13/2026")

    const alerta = await screen.findByText(/Data inválida/)
    const idErro = alerta.getAttribute("id")
    expect(idErro, "a mensagem de erro precisa de id para ser descrita").toBeTruthy()
    for (const rotulo of ["De", "Até"]) {
      expect(
        (screen.getByLabelText(rotulo).getAttribute("aria-describedby") ?? "").split(" "),
        `"${rotulo}" não descreve a mensagem de erro`,
      ).toContain(idErro)
    }
  })

  // MINOR-1: "Limpar filtros" só existe para desfazer o que está na query. Uma
  // data que não existe não vai na query, então não há o que limpar por ela.
  it("data que não existe não habilita “Limpar filtros” (só conta o que sai na query)", async () => {
    const user = await abrir()
    const botaoLimpar = screen.getByRole("button", { name: "Limpar filtros" })
    expect(botaoLimpar).toBeDisabled()

    await user.type(screen.getByLabelText("De"), "32/13/2026")
    await screen.findByText(/Data inválida/)
    expect(botaoLimpar, "data inválida não é filtro ativo").toBeDisabled()
    expect(screen.queryByText("filtros ativos")).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText("De"))
    await user.type(screen.getByLabelText("De"), "01/09/2026")
    await waitFor(() => expect(botaoLimpar).toBeEnabled())
    expect(screen.getByText("1 filtro ativo")).toBeInTheDocument()
  })

  it("Limpar filtros volta ao estado inicial", async () => {
    const user = await abrir()
    const botaoLimpar = screen.getByRole("button", { name: "Limpar filtros" })
    // Nada ativo ainda: o botão não finge ter o que limpar.
    expect(botaoLimpar).toBeDisabled()

    await user.selectOptions(screen.getByLabelText("Matéria"), "m2")
    await user.selectOptions(screen.getByLabelText("Status"), "approved")
    await user.type(screen.getByLabelText("Aluno"), "Beatriz")
    await user.type(screen.getByLabelText("De"), "01/09/2026")
    await waitFor(() => expect(ultimaQuery().get("subjectId")).toBe("m2"))
    expect(botaoLimpar).toBeEnabled()
    // Cinco, não quatro: escolher a Matéria também ZEROU a atividade padrão
    // (que era de outra matéria), então atividade + matéria + status + nome + de.
    expect(screen.getByText("5 filtros ativos")).toBeInTheDocument()

    await user.click(botaoLimpar)

    await waitFor(() => {
      const query = ultimaQuery()
      expect(query.get("subjectId")).toBeNull()
      expect(query.get("status")).toBeNull()
      expect(query.get("studentName")).toBeNull()
      expect(query.get("from")).toBeNull()
      // A atividade volta ao padrão da tela (a primeira da lista), e não some:
      // o estado inicial já vinha com ela pré-selecionada.
      expect(query.get("activityId")).toBe("a1")
    })
    expect((screen.getByLabelText("Matéria") as HTMLSelectElement).value).toBe("")
    expect((screen.getByLabelText("Atividade") as HTMLSelectElement).value).toBe("a1")
    expect((screen.getByLabelText("Aluno") as HTMLInputElement).value).toBe("")
    expect(screen.queryByText("filtros ativos")).not.toBeInTheDocument()
  })

  it("“Todas as atividades” sobrevive ao clique (não volta para a primeira)", async () => {
    const user = await abrir()
    await waitFor(() => expect(ultimaQuery().get("activityId")).toBe("a1"))

    await user.selectOptions(screen.getByLabelText("Atividade"), "")

    await waitFor(() => expect(ultimaQuery().get("activityId")).toBeNull())
    // O efeito que pré-seleciona a primeira só roda UMA vez (ref) — sem isso o
    // select "todas" seria impossível de usar.
    expect((screen.getByLabelText("Atividade") as HTMLSelectElement).value).toBe("")
    expect(screen.getByText("1 filtro ativo")).toBeInTheDocument()
  })

  // Important 3: Matéria e Atividade são E na query. A tela abre na primeira
  // atividade (padrão herdado) e o usuário escolhe outra Matéria — aí a
  // atividade pré-selecionada passa a ser IMPOSSÍVEL de combinar com a matéria
  // escolhida e a lista vinha vazia, enquanto o contador dizia "1 filtro
  // ativo" (a atividade padrão nem era contada). Escolher outra dimensão zera a
  // restrição herdada, e o contador passa a dizer os dois filtros que o
  // usuário mexeu.
  it("escolher Matéria zera a atividade padrão (as duas dimensões são E)", async () => {
    const user = await abrir()
    await waitFor(() => expect(ultimaQuery().get("activityId")).toBe("a1"))

    // a1 é de Língua Portuguesa; Química (m2) só tem o a3.
    await user.selectOptions(screen.getByLabelText("Matéria"), "m2")

    await waitFor(() => expect(ultimaQuery().get("subjectId")).toBe("m2"))
    expect(
      ultimaQuery().get("activityId"),
      "atividade padrão é de outra matéria: mantê-la trava a lista em vazio",
    ).toBeNull()
    expect((screen.getByLabelText("Atividade") as HTMLSelectElement).value).toBe("")
    // O contador não pode mentir: matéria escolhida + atividade alterada.
    expect(screen.getByText("2 filtros ativos")).toBeInTheDocument()
  })

  // ACHADO A (re-review do round 2): este teste tem de percorrer o CAMINHO REAL
  // do usuário — escolher uma Matéria, escolher uma atividade DESSA matéria e só
  // então alargar para "Todas as matérias". Ele abria com `subjectId === ""` e
  // "alargava" escolhendo `""`: aí `valor === subjectId` era verdadeiro, o early
  // return de `escolherMateria` encerrava a função e o bloco de preservação nunca
  // rodava — o teste passava sem exercitar a invariante (mutante "remover o
  // bloco" continuava verde).
  it("trocar Matéria para 'Todas as matérias' preserva a atividade escolhida à mão", async () => {
    const user = await abrir()
    await waitFor(() => expect(ultimaQuery().get("activityId")).toBe("a1"))

    // Matéria primeiro: escolher outra dimensão zera a atividade padrão herdada
    // (I-3), então a atividade escolhida logo abaixo é escolha à mão de verdade
    // (a2 ≠ padrão a1) e pertence à matéria que está selecionada.
    await user.selectOptions(screen.getByLabelText("Matéria"), "m1")
    await user.selectOptions(screen.getByLabelText("Atividade"), "a2")

    await waitFor(() => {
      expect(ultimaQuery().get("subjectId")).toBe("m1")
      expect(ultimaQuery().get("activityId")).toBe("a2")
    })

    // Alarga o escopo para "Todas as matérias"
    await user.selectOptions(screen.getByLabelText("Matéria"), "")

    await waitFor(() => {
      expect(ultimaQuery().get("subjectId")).toBeNull()
      expect(
        ultimaQuery().get("activityId"),
        "atividade escolhida à mão deve sobreviver ao trocar matéria para todas",
      ).toBe("a2")
    })
    expect((screen.getByLabelText("Atividade") as HTMLSelectElement).value).toBe("a2")
  })

  // Este teste exercita a PRIMEIRA escolha de matéria (`subjectId` ainda é `""`
  // quando "m1" é escolhida), não uma re-escolha: o nome antigo prometia a
  // invariante do early return de `escolherMateria` e esse é o teste que a
  // exercita (o de baixo).
  it("escolher a matéria da atividade escolhida à mão não zera essa atividade", async () => {
    const user = await abrir()
    await waitFor(() => expect(ultimaQuery().get("activityId")).toBe("a1"))

    await user.selectOptions(screen.getByLabelText("Atividade"), "a2")
    await waitFor(() => expect(ultimaQuery().get("activityId")).toBe("a2"))

    // a2 é de Língua Portuguesa: pertence à matéria escolhida, então sobrevive.
    await user.selectOptions(screen.getByLabelText("Matéria"), "m1")

    await waitFor(() => {
      expect(ultimaQuery().get("subjectId")).toBe("m1")
      expect(ultimaQuery().get("activityId")).toBe("a2")
    })
  })

  // ACHADO B (re-review do round 2): a guarda `valor === subjectId` de
  // `escolherMateria` só é alcançada por um `change` com o valor JÁ selecionado.
  // O browser não dispara esse evento, mas o `user-event` dispara `input`/`change`
  // incondicionalmente (`selectOptions.js`, sem guarda de "já estava
  // selecionado"), então a guarda é exercitável em teste. O caso que a distingue
  // é a atividade PADRÃO escolhida explicitamente: a guarda de "pertence à nova
  // matéria" só age quando a atividade é diferente da padrão, então sem a guarda
  // `escolherMateria` zeraria a atividade e a lista perderia a restrição.
  it("reescolher a mesma matéria não zera a atividade", async () => {
    const user = await abrir()
    await waitFor(() => expect(ultimaQuery().get("activityId")).toBe("a1"))

    await user.selectOptions(screen.getByLabelText("Matéria"), "m1")
    // Escolhe a1 à mão (a padrão): agora a atividade é a que o usuário quer.
    await user.selectOptions(screen.getByLabelText("Atividade"), "a1")
    await waitFor(() => expect(ultimaQuery().get("activityId")).toBe("a1"))

    // Reescolhe a MESMA matéria: o valor não muda, o `change` chega igual.
    await user.selectOptions(screen.getByLabelText("Matéria"), "m1")

    await waitFor(() => expect(ultimaQuery().get("subjectId")).toBe("m1"))
    expect(
      ultimaQuery().get("activityId"),
      "reescolher a mesma matéria não pode mexer na atividade",
    ).toBe("a1")
    expect((screen.getByLabelText("Atividade") as HTMLSelectElement).value).toBe("a1")
  })

  // Important 1: `from > to` é período invertido — erro de DIGITAÇÃO, não erro
  // de tela. Mandá-lo na query devolve 400 `PERIOD_REVERSED` do servidor e o
  // `ErrorState` escondia a tabela inteira (a lista com os outros quatro
  // filtros funcionando era útil). O client detecta a inversão com a chave de
  // dia, marca as duas pontas e suprime os dois parâmetros.
  it("período invertido é erro de campo e não derruba a tabela", async () => {
    const user = await abrir()

    await user.type(screen.getByLabelText("De"), "10/09/2026")
    await user.type(screen.getByLabelText("Até"), "01/09/2026")

    expect(await screen.findByText(/invertido/i)).toBeInTheDocument()
    expect(screen.getByLabelText("De")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByLabelText("Até")).toHaveAttribute("aria-invalid", "true")
    // Nenhum dos dois sai: mandar o par invertido é o 400 que derruba a tabela.
    expect(ultimaQuery().get("from")).toBeNull()
    expect(ultimaQuery().get("to")).toBeNull()
    // A lista continua de pé — é o que o Ruling 2 do implementador prometeu.
    expect(screen.getByRole("table")).toBeInTheDocument()
    expect(screen.queryByText("Não foi possível carregar os dados.")).not.toBeInTheDocument()
    // Período invertido também não é "filtro ativo": nada dele está na query.
    expect(screen.getByRole("button", { name: "Limpar filtros" })).toBeDisabled()

    // Acerto a data e o filtro volta a valer sozinho.
    await user.clear(screen.getByLabelText("Até"))
    await user.type(screen.getByLabelText("Até"), "30/09/2026")
    await waitFor(() => expect(ultimaQuery().get("from")).toBe("10/09/2026"))
    expect(ultimaQuery().get("to")).toBe("30/09/2026")
    expect(screen.queryByText(/invertido/i)).not.toBeInTheDocument()
  })

  // MINOR-4: com a lista de atividades vazia, a opção "Todas as atividades" e a
  // "Nenhuma atividade" eram DUAS opções com o mesmo value — o select ficava
  // com duas linhas iguais e nenhuma dizia a verdade.
  it("sem atividades, o select de Atividade mostra uma única opção", async () => {
    server.use(http.get("/api/activities", () => HttpResponse.json({ data: [] })))
    await abrir()

    const select = screen.getByLabelText("Atividade") as HTMLSelectElement
    await waitFor(() => expect(select.options.length).toBe(1))
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(["Nenhuma atividade"])
  })

  // MINOR-5 (a): com o handler devolvendo lista vazia, o `EmptyState` monta —
  // e, com a lista cheia, ele NÃO monta. As duas metades são o teste: só a
  // segunda distingue "estado vazio" de "estado vazio mostrado por cima da
  // tabela" (mutante que removesse a guarda `list.length === 0`).
  it("lista vazia mostra o estado vazio, sem tabela e sem tela de erro", async () => {
    const user = await abrir()

    expect(await screen.findByRole("table")).toBeInTheDocument()
    expect(screen.queryByText("Nenhuma entrega aqui")).not.toBeInTheDocument()

    respostaSubmissions = []
    await user.selectOptions(screen.getByLabelText("Status"), "approved")

    expect(await screen.findByText("Nenhuma entrega aqui")).toBeInTheDocument()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    expect(screen.queryByText("Não foi possível carregar os dados.")).not.toBeInTheDocument()
  })

  // MINOR-5 (b): com mais de uma página, mudar um filtro tem que devolver o
  // validador à PRIMEIRA página — na página 3 de um filtro novo o resultado é
  // uma lista vazia sem explicação.
  it("mudar um filtro volta para a primeira página", async () => {
    respostaSubmissions = Array.from({ length: 9 }, (_, i) =>
      entrega({ id: `s${i + 1}`, activityId: "a1" }),
    )
    const user = await abrir()
    await screen.findByRole("table")

    await user.click(screen.getByRole("button", { name: "Próxima →" }))
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "2" })).toHaveAttribute("aria-current", "page"),
    )

    await user.selectOptions(screen.getByLabelText("Status"), "approved")

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "1" })).toHaveAttribute("aria-current", "page"),
    )
  })
})
