// Testes da tela "Minhas Turmas" / detalhe da turma (V3, 4.3).
// Mesma pilha dos demais testes de client: Testing Library + MSW sobre o wrapper
// real `src/lib/api.ts`, `UserProvider` real e `onUnhandledRequest: "error"` —
// nenhuma chamada de rede escapa sem handler, então um `fetch` a mais na tela
// quebraria o teste em vez de passar em silêncio.
//
// O que se fixa aqui é o que a TELHA fala e o que o TECLADO faz:
//  * o par turma-curso no título, no subtítulo e no nome acessível da tabela
//    (a turma sozinha não identifica: duas homônimas de cursos diferentes);
//  * a tabela de alunos com `th scope="row"` virando `rowheader` — ler só
//    `cell` deslocaria todas as colunas em 1 (o mesmo limite do 4.2);
//  * o tablist com roving tabindex e setas/Home/End, copiado do padrão da 4.1;
//  * a ressalva do R5 VISÍVEL na aba Pontuação (é o texto que impede o
//    professor de ler "média por matéria" como "saldo");
//  * os atalhos da aba Conteúdos chamando a navegação do painel, e não uma
//    listagem que o escopo por DÓ tornaria mentirosa (R28);
//  * os estados degenerados: vazio, erro com retry, turma inativa e CSV.
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import type { Class, ClassDetail, SafeUser } from "@shared/types"
import { TeacherClassesView } from "./TeacherClassesView"
import { ToastProvider } from "../../context/ToastContext"
import { UserProvider } from "../../context/UserContext"
import { ToastHost } from "../../components/ui/Toast"

const server = setupServer()

const PROFESSOR: SafeUser = {
  id: "u6",
  name: "Prof. Marcelo",
  email: "marcelo@etec.sp.gov.br",
  role: "teacher",
  active: true,
  avatar: "MA",
  classIds: [],
  createdAt: "02/03/2026, 08:00:00",
}

const C1: Class = {
  id: "c1",
  name: "1º Ano A",
  course: "Informática",
  year: 1,
  shift: "morning",
  active: true,
  studentIds: ["u2", "u3"],
  teacherIds: ["u6"],
}

const C2: Class = {
  id: "c2",
  name: "2º Ano B",
  course: "Administração",
  year: 2,
  shift: "afternoon",
  active: true,
  studentIds: ["u2"],
  teacherIds: ["u6", "u7"],
}

/** Detalhe de referência: o que o `GET /api/classes/c1/detail` responde. */
const DETALHE: ClassDetail = {
  class: C1,
  students: [
    { id: "u2", name: "Ana Luiza", email: "ana@etec.sp.gov.br", level: "🥈 Prata", balance: 120, streak: 3, approved: 4 },
    { id: "u3", name: "Bruno Lima", email: "bruno@etec.sp.gov.br", level: "🥉 Bronze", balance: 20, streak: 0, approved: 1 },
  ],
  subjects: [
    { name: "Matemática", avg: 30 },
    { name: "Língua Portuguesa", avg: 12 },
  ],
  stats: { students: 2, avgBalance: 70, total: 140 },
}

let turmas: Class[]
let detalhe: ClassDetail

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))

beforeEach(() => {
  turmas = [C1, C2]
  detalhe = structuredClone(DETALHE)
  server.use(
    http.get("/api/classes", () => HttpResponse.json({ data: turmas })),
    http.get("/api/classes/:id/detail", ({ params }) => {
      const id = String(params.id)
      if (id !== detalhe.class.id) {
        return HttpResponse.json({ error: "TURMA_NAO_ENCONTRADA" }, { status: 404 })
      }
      return HttpResponse.json({ data: detalhe })
    }),
  )
})

afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function renderView(props: { onNavigate?: (page: string) => void } = {}) {
  return render(
    <ToastProvider>
      <UserProvider user={PROFESSOR} onLogout={() => {}}>
        <TeacherClassesView {...props} />
      </UserProvider>
      {/* o app real monta o ToastHost ao lado da tela (App.tsx) */}
      <ToastHost />
    </ToastProvider>,
  )
}

/** Nome acessível da tabela: o PAR turma-curso, como nas tabelas da 4.2. */
const tabelaDeAlunos = (nome: string, curso: string) =>
  screen.getByRole("table", { name: `Alunos da turma — ${nome} — ${curso}` })

/** Linha da tabela que pertence ao aluno informado (o `th scope="row"` é o nome). */
function linhaDoAluno(nome: string, curso = "Informática") {
  const linhas = within(tabelaDeAlunos("1º Ano A", curso)).getAllByRole("row")
  const achada = linhas.find((linha) => within(linha).queryByRole("rowheader")?.textContent === nome)
  if (!achada) throw new Error(`nenhuma linha da tabela de alunos é de "${nome}"`)
  return achada
}

const celula = (linha: HTMLElement, coluna: number): HTMLElement => {
  // O título é `<th scope="row">`, e a ARIA mapeia `th[scope=row]` para
  // `rowheader` — NÃO para `cell`. Ler só `getAllByRole("cell")` devolveria a
  // linha a partir da SEGUNDA coluna e todas as colunas estariam deslocadas em
  // 1. Por isso o `rowheader` entra na PRIMEIRA posição, como no `<thead>`.
  const cabecalho = within(linha).queryByRole("rowheader")
  const celulas = within(linha).getAllByRole("cell")
  const naOrdem = cabecalho ? [cabecalho, ...celulas] : celulas
  return naOrdem[coluna]
}

const COL: Record<string, number> = {
  aluno: 0,
  email: 1,
  nivel: 2,
  saldo: 3,
  sequencia: 4,
  aprovadas: 5,
}

async function abrirDetalhe(nome = "1º Ano A") {
  const user = userEvent.setup()
  renderView()
  await user.click(await screen.findByRole("button", { name: `Ver detalhes da turma ${nome}` }))
  return user
}

const aba = (nome: string) => screen.getByRole("tab", { name: nome })

describe("Professor — Minhas turmas (4.3)", () => {
  it("lista as turmas com o par turma-curso e abre o detalhe ao clicar", async () => {
    const user = await abrirDetalhe()

    // O par turma-curso no subtítulo do detalhe: a turma sozinha não identifica.
    // O nome acessível do `h2` carrega o ícone do `SectionHeader` ("🏫 1º Ano A"),
    // então a busca é por padrão, não por igualdade.
    expect(screen.getByRole("heading", { name: /1º Ano A/ })).toBeInTheDocument()
    expect(screen.getByText(/Informática · Manhã · 1º ano/)).toBeInTheDocument()

    // E a navegação volta para a lista sem router (estado local, R10).
    await user.click(screen.getByRole("button", { name: /Voltar para as turmas/ }))
    expect(screen.getByRole("heading", { name: "2º Ano B" })).toBeInTheDocument()
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument()
  })

  it("mostra os alunos com e-mail, nível, saldo, sequência e aprovadas", async () => {
    await abrirDetalhe()

    const ana = linhaDoAluno("Ana Luiza")
    expect(celula(ana, COL.email)).toHaveTextContent("ana@etec.sp.gov.br")
    expect(celula(ana, COL.nivel)).toHaveTextContent("🥈 Prata")
    expect(celula(ana, COL.saldo)).toHaveTextContent("120")
    // Sequência 3 (singular/plural é distinguível: 3 dias).
    expect(celula(ana, COL.sequencia)).toHaveTextContent("3 dias")
    expect(celula(ana, COL.aprovadas)).toHaveTextContent("4")

    // Sequência 0 é ausência de sequência — "0 dias seguidos" seria enganoso.
    expect(celula(linhaDoAluno("Bruno Lima"), COL.sequencia)).toHaveTextContent("sem sequência hoje")
  })

  it("espelha o roster do servidor: uma linha por aluno do payload", async () => {
    await abrirDetalhe()
    const tabela = tabelaDeAlunos("1º Ano A", "Informática")
    // Uma linha por aluno do payload, mais o cabeçalho. A tela NÃO re-filtra por
    // outro critério (o roster já vem pronto do servidor): se ela "consertasse"
    // a lista, apareceria alguém que o servidor não mandou.
    expect(within(tabela).getAllByRole("row")).toHaveLength(detalhe.students.length + 1)
    expect(within(tabela).getByText("ana@etec.sp.gov.br")).toBeInTheDocument()
    expect(within(tabela).getByText("bruno@etec.sp.gov.br")).toBeInTheDocument()
    // No seed o professor responsável está em `studentIds` da c1, e mesmo assim
    // não aparece: quem filtra é o servidor (`role = 'student' AND active = 1`).
    expect(within(tabela).queryByText(/Marcelo/)).not.toBeInTheDocument()
  })

  it("as abas têm papel, nome acessível e só um painel visível", async () => {
    const user = await abrirDetalhe()

    expect(screen.getByRole("tablist", { name: "Detalhe da turma" })).toBeInTheDocument()
    expect(screen.getAllByRole("tab")).toHaveLength(3)
    // Aba inicial: Alunos, e o roving tabindex põe o foco só na selecionada.
    expect(aba("Alunos")).toHaveAttribute("aria-selected", "true")
    expect(aba("Alunos")).toHaveAttribute("tabindex", "0")
    expect(aba("Pontuação")).toHaveAttribute("tabindex", "-1")
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1)

    await user.click(aba("Pontuação"))
    expect(aba("Pontuação")).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "aba-pontuacao")
  })

  it("o teclado troca de aba: setas e Home/End, com o foco junto", async () => {
    const user = await abrirDetalhe()

    aba("Alunos").focus()
    await user.keyboard("{ArrowRight}")
    expect(aba("Pontuação")).toHaveAttribute("aria-selected", "true")
    expect(aba("Pontuação")).toHaveFocus()

    await user.keyboard("{ArrowRight}")
    expect(aba("Conteúdos")).toHaveAttribute("aria-selected", "true")

    // Home volta à primeira; End vai à última. Sem isso o teclado "daria a volta"
    // e não alcançaria as pontas.
    await user.keyboard("{Home}")
    expect(aba("Alunos")).toHaveAttribute("aria-selected", "true")
    await user.keyboard("{End}")
    expect(aba("Conteúdos")).toHaveAttribute("aria-selected", "true")
    // Cíclico: o último volta para o primeiro (e não fica preso).
    await user.keyboard("{ArrowRight}")
    expect(aba("Alunos")).toHaveAttribute("aria-selected", "true")
  })

  it("a aba Pontuação mostra a média por matéria E a ressalva do R5 na tela", async () => {
    const user = await abrirDetalhe()
    await user.click(aba("Pontuação"))

    expect(screen.getByText("Matemática")).toBeInTheDocument()
    expect(screen.getByText("30")).toBeInTheDocument()
    expect(screen.getByText("12")).toBeInTheDocument()

    // Stats derivados da mesma lista (invariante 2.3): 2 alunos, (120+20)/2 = 70.
    // Os rótulos são `<p>`, e não o texto solto: "Alunos" também é o nome de uma
    // ABA, e `getByText` sem `selector` acusaria a ambiguidade.
    expect(screen.getByText("Alunos", { selector: "p" })).toBeInTheDocument()
    expect(screen.getByText("Saldo médio", { selector: "p" })).toBeInTheDocument()
    expect(screen.getByText("70")).toBeInTheDocument()
    expect(screen.getByText("140")).toBeInTheDocument()

    // A ressalva é o que impede "média por matéria" de ser lida como "saldo":
    // bônus/ajuste/regaste/sequência/reforço entram no saldo e NÃO aqui.
    const ressalva = screen.getByText(/Média por aluno da turma em cada matéria/)
    expect(ressalva).toBeInTheDocument()
    expect(ressalva).toHaveTextContent(/bônus, ajustes, resgates, bônus de sequência, reforço/)
    expect(ressalva).toHaveTextContent(/os pontos de atividades excluídas/)
    expect(ressalva).toHaveTextContent(/não nesta média/)
  })

  it("a aba Conteúdos dá atalhos para Reforços e Atividades via onNavigate", async () => {
    const navegar = vi.fn()
    const user = userEvent.setup()
    renderView({ onNavigate: navegar })
    await user.click(await screen.findByRole("button", { name: /Ver detalhes da turma 1º Ano A/ }))
    await user.click(aba("Conteúdos"))

    await user.click(screen.getByRole("button", { name: /Meus Reforços/ }))
    await user.click(screen.getByRole("button", { name: /Atividades/ }))
    // Os ids são os valores REAIS do union `Page` do `TeacherDashboard`
    // (`reforcos` e `activities`): um id inventado deixaria o botão mudo.
    expect(navegar).toHaveBeenCalledWith("reforcos")
    expect(navegar).toHaveBeenCalledWith("activities")
  })

  it("estado vazio: turma sem aluno ativo", async () => {
    detalhe = { ...structuredClone(DETALHE), students: [], stats: { students: 0, avgBalance: 0, total: 0 } }
    await abrirDetalhe()
    expect(screen.getByText("Nenhum aluno ativo nesta turma")).toBeInTheDocument()
    expect(screen.queryByRole("table", { name: /Alunos da turma/ })).not.toBeInTheDocument()
  })

  it("turma inativa avisa sem inventar campo novo no payload", async () => {
    detalhe = { ...structuredClone(DETALHE), class: { ...C1, active: false } }
    await abrirDetalhe()
    expect(screen.getByText(/Turma inativa/)).toBeInTheDocument()
  })

  it("erro mostra ErrorState e o retry recarrega", async () => {
    let tentativas = 0
    server.use(
      http.get("/api/classes/:id/detail", () => {
        tentativas += 1
        if (tentativas === 1) return HttpResponse.json({ error: "FALHA" }, { status: 500 })
        return HttpResponse.json({ data: detalhe })
      }),
    )

    const user = userEvent.setup()
    renderView()
    await user.click(await screen.findByRole("button", { name: /Ver detalhes da turma 1º Ano A/ }))

    // A tela mostra o rótulo padrão E a mensagem que o servidor devolveu — um
    // dos dois sozinho esconderia erro de verdade atrás de texto genérico.
    expect(await screen.findByText("Não foi possível carregar os dados.")).toBeInTheDocument()
    expect(screen.getByText("FALHA")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }))
    expect(await screen.findByRole("table", { name: /Alunos da turma/ })).toBeInTheDocument()
  })

  it("exporta o CSV com o nome do arquivo e confirma no toast", async () => {
    let pedido = ""
    server.use(
      http.get("/api/classes/:id/detail", ({ request }) => {
        pedido = request.url
        if (request.url.includes("format=csv")) {
          return new HttpResponse("\uFEFFAluno;Email;Nível;Saldo;Aprovadas;Sequência\r\n", {
            headers: {
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": 'attachment; filename="turma-c1.csv"',
            },
          })
        }
        return HttpResponse.json({ data: detalhe })
      }),
    )

    // jsdom não implementa createObjectURL nem o download do navegador: sem estes
    // stubs, `downloadFile` quebraria no clique — e o teste não pode mexer em
    // `src/test/setup.ts`, que é compartilhado por toda a suíte.
    const criado = vi.fn(() => "blob:mock")
    const revogado = vi.fn()
    const createObjectURL = URL.createObjectURL
    const revokeObjectURL = URL.revokeObjectURL
    URL.createObjectURL = criado as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = revogado
    let nomeBaixado = ""
    const clickOriginal = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function mock(this: HTMLAnchorElement) {
      nomeBaixado = this.download
    }

    try {
      const user = await abrirDetalhe()
      await user.click(screen.getByRole("button", { name: /Exportar CSV/ }))

      await waitFor(() => expect(criado).toHaveBeenCalled())
      expect(pedido).toContain("/api/classes/c1/detail?format=csv")
      expect(nomeBaixado).toBe("turma-c1.csv")
      expect(await screen.findByText(/exportada em CSV/i)).toBeInTheDocument()
    } finally {
      URL.createObjectURL = createObjectURL
      URL.revokeObjectURL = revokeObjectURL
      HTMLAnchorElement.prototype.click = clickOriginal
    }
  })

  it("CSV que falha mostra toast de erro e não fica pendurado", async () => {
    server.use(
      http.get("/api/classes/:id/detail", ({ request }) => {
        if (request.url.includes("format=csv")) {
          return HttpResponse.json({ error: "FALHA_NO_CSV" }, { status: 500 })
        }
        return HttpResponse.json({ data: detalhe })
      }),
    )

    const user = await abrirDetalhe()
    await user.click(screen.getByRole("button", { name: /Exportar CSV/ }))
    expect(await screen.findByText("FALHA_NO_CSV")).toBeInTheDocument()
    // A tela continua utilizável: o erro é aviso, não tela quebrada.
    expect(screen.getByRole("table", { name: /Alunos da turma/ })).toBeInTheDocument()
  })
})