// Testes da tela "Desempenho" do professor (V3, 4.2 — Round B).
// Mesma pilha dos demais testes de client: Testing Library + MSW sobre o wrapper
// real `src/lib/api.ts`. O que se fixa é o que a tela FALA: as contagens de
// entrega por atividade (inclusive o atraso destacado e a taxa em %), o prazo
// cru em DD/MM/AAAA, a tolerância 0 explicada por extenso, o ranking agrupado
// por turma com a sequência, e os dois estados degenerados (vazio e erro).
// As duas seções que já existiam (conclusão e a do CSV de pontos) também são
// conferidas: a 4.2 AJUSTOU o escopo do ranking (T4.2-R1 — a tabela chapada sai,
// o CSV fica) e não pode quebrar o contrato delas, que está fixado em
// `server/src/tests/reports.test.ts`.
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import type { CompletionReportRow, PointsReportRow, TeacherPerformanceReport } from "../../lib/types"
import { levelLabel } from "@shared/types"
import { TeacherPerformanceView } from "./TeacherPerformanceView"
import { ToastProvider } from "../../context/ToastContext"
import { ToastHost } from "../../components/ui/Toast"

const server = setupServer()

const RELATORIO: TeacherPerformanceReport = {
  activities: [
    {
      activityId: "a1",
      title: "Lista de exercícios — Frações",
      subject: "Matemática",
      className: "3º Info A",
      deadline: "15/10/2026",
      lateWindowDays: 7,
      deliveries: 4,
      approved: 3,
      rejected: 1,
      pending: 0,
      late: 1,
      donePct: 75,
    },
    {
      activityId: "a2",
      // Dia 10 de FEVEREIRO: `new Date("10/02/2026")` leria 2 de OUTUBRO, que é
      // exatamente o bug que exibir o prazo cru evita (R4.2-H).
      title: "Leitura de O Pequeno Príncipe",
      subject: "Língua Portuguesa",
      className: "2º Adm B",
      deadline: "10/02/2026",
      lateWindowDays: 0,
      deliveries: 2,
      approved: 0,
      rejected: 0,
      pending: 2,
      late: 0,
      donePct: 0,
    },
    {
      activityId: "a3",
      title: "Ação escolar do bazar",
      subject: "Atividades",
      className: "3º Info A",
      deadline: "20/09/2026",
      lateWindowDays: 3,
      deliveries: 0,
      approved: 0,
      rejected: 0,
      pending: 0,
      late: 0,
      donePct: 0,
    },
    {
      // Tolerância 1 (singular): sem esta linha, "1 dia" e "1 dias" seriam
      // indistinguíveis pelo teste, e a mutação do plural não cairia.
      activityId: "a4",
      title: "Resumo do capítulo 3",
      subject: "Matemática",
      className: "3º Info A",
      deadline: "05/11/2026",
      lateWindowDays: 1,
      deliveries: 1,
      approved: 1,
      rejected: 0,
      pending: 0,
      late: 0,
      donePct: 100,
    },
  ],
  ranking: [
    {
      className: "3º Info A",
      course: "Informática",
      rows: [
        { studentName: "Ana Beatriz", balance: 120, level: "🥈 Prata", streak: 3 },
        { studentName: "Carlos Souza", balance: 40, level: "🥉 Bronze", streak: 1 },
        // Sequência 0: "0 dias seguidos" seria enganoso — é ausência de sequência.
        { studentName: "Bruno Lima", balance: 0, level: "🥉 Bronze", streak: 0 },
      ],
    },
    {
      // A mesma aluna em outra turma do professor: no ranking chapado ela aparece
      // uma vez (pela `classIds[0]`), aqui aparece nos dois grupos.
      className: "2º Adm B",
      course: "Administração",
      rows: [{ studentName: "Ana Beatriz", balance: 120, level: "🥈 Prata", streak: 3 }],
    },
    {
      className: "1º Adm A",
      course: "Administração",
      rows: [],
    },
  ],
}

const CONCLUSAO: CompletionReportRow[] = [
  { className: "3º Info A", course: "Informática", students: 20, activities: 3, possible: 60, done: 48, pct: 80 },
]

const PONTOS: PointsReportRow[] = [
  { studentName: "Ana Beatriz", className: "3º Info A", balance: 120, level: "🥈 Prata" },
  { studentName: "Carlos Souza", className: "3º Info A", balance: 40, level: "🥉 Bronze" },
]

let relatorio: TeacherPerformanceReport

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))

beforeEach(() => {
  relatorio = RELATORIO
  server.use(
    http.get("/api/reports/completion", () => HttpResponse.json({ data: CONCLUSAO })),
    http.get("/api/reports/points", () => HttpResponse.json({ data: PONTOS })),
    http.get("/api/reports/teacher-performance", () => HttpResponse.json({ data: relatorio })),
  )
})

afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function renderView() {
  return render(
    <ToastProvider>
      <TeacherPerformanceView />
      {/* o app real monta o ToastHost ao lado da tela (App.tsx) */}
      <ToastHost />
    </ToastProvider>,
  )
}

/** Índices das colunas da tabela de métricas — a ordem é do `<thead>`. */
const COL: Record<string, number> = {
  atividade: 0,
  prazo: 1,
  entregas: 2,
  aprovadas: 3,
  reprovadas: 4,
  pendentes: 5,
  atrasadas: 6,
  taxa: 7,
}

const tabelaMetricas = () => screen.getByRole("table", { name: "Desempenho das minhas atividades" })

/**
 * O nome acessível do ranking carrega o PAR turma-curso (m7), não só a turma:
 * a spec diz que a turma é editável, então duas homônimas de cursos diferentes
 * são possíveis — e com o nome curto os dois `table` colidiam no mesmo nome
 * acessível. Passar o par aqui é o que fixa esse contrato no teste.
 */
const tabelaDaTurma = (turma: string, curso: string) =>
  screen.getByRole("table", { name: `Ranking de pontos — ${turma} — ${curso}` })

/** Índices das colunas do ranking — a ordem é do `<tbody>` (o `th scope="row"` é o nome). */
const RANK: Record<string, number> = {
  posicao: 0,
  saldo: 1,
  nivel: 2,
  sequencia: 3,
}

/** Linha do ranking que pertence ao aluno informado (o `th scope="row"` é o nome). */
function linhaDoAluno(turma: string, curso: string, nome: string) {
  const linhas = within(tabelaDaTurma(turma, curso)).getAllByRole("row")
  const achada = linhas.find((linha) => within(linha).queryByRole("rowheader")?.textContent === nome)
  if (!achada) throw new Error(`nenhuma linha do ranking de "${turma} — ${curso}" é de "${nome}"`)
  return achada
}

/** Linha da tabela de métricas que contém o título informado. */
function linhaDaAtividade(titulo: string) {
  const linhas = within(tabelaMetricas()).getAllByRole("row")
  const achada = linhas.find((linha) => linha.textContent?.includes(titulo))
  if (!achada) throw new Error(`nenhuma linha da tabela de métricas contém "${titulo}"`)
  return achada
}

const celula = (linha: HTMLElement, coluna: number): HTMLElement => {
  // O título é `<th scope="row">`, e a ARIA mapeia `th[scope=row]` para
  // `rowheader` — NÃO para `cell`. Ler só `getAllByRole("cell")" devolveria a
  // linha a partir da SEGUNDA coluna e todas as colunas deste arquivo estariam
  // deslocadas em 1 (o teste passaria a ler "entregas" como "prazo" e assim por
  // diante). Por isso o `rowheader` entra na PRIMEIRA posição, como no `<thead>`.
  const cabecalho = within(linha).queryByRole("rowheader")
  const celulas = within(linha).getAllByRole("cell")
  const naOrdem = cabecalho ? [cabecalho, ...celulas] : celulas
  return naOrdem[coluna]
}

describe("Professor — Desempenho por atividade (4.2)", () => {
  it("mostra as contagens de entrega, o atraso destacado e a taxa em %", async () => {
    renderView()

    expect(await screen.findByRole("heading", { name: "Desempenho por atividade" })).toBeInTheDocument()

    const linha = linhaDaAtividade("Lista de exercícios — Frações")
    expect(celula(linha, COL.prazo)).toHaveTextContent("15/10/2026")
    // Uma atividade por linha, com disciplina e turma (o recorte é o dono).
    expect(celula(linha, COL.atividade)).toHaveTextContent("Matemática")
    expect(celula(linha, COL.atividade)).toHaveTextContent("3º Info A")

    // As cinco contagens do contrato, célula a célula.
    expect(celula(linha, COL.entregas)).toHaveTextContent("4")
    expect(celula(linha, COL.aprovadas)).toHaveTextContent("3")
    expect(celula(linha, COL.reprovadas)).toHaveTextContent("1")
    expect(celula(linha, COL.pendentes)).toHaveTextContent("0")

    // Atraso > 0 ganha destaque, e o número não depende só da cor.
    const atrasadas = celula(linha, COL.atrasadas)
    expect(atrasadas).toHaveTextContent("1")
    expect(within(atrasadas).getByText(/1 atrasada$/)).toHaveClass("bg-amber-100")

    // A taxa é `donePct` (percentual), não contagem.
    expect(celula(linha, COL.taxa)).toHaveTextContent("75%")
    expect(within(tabelaMetricas()).getAllByRole("columnheader")).toHaveLength(8)

    // Atividade sem entrega nenhuma: 0% honesto, sem "de 0".
    const semEntrega = linhaDaAtividade("Ação escolar do bazar")
    expect(celula(semEntrega, COL.entregas)).toHaveTextContent("0")
    expect(celula(semEntrega, COL.taxa)).toHaveTextContent("0%")
    expect(celula(semEntrega, COL.taxa)).toHaveTextContent("sem entregas")

    // Atraso zero não recebe destaque.
    const semAtraso = celula(linhaDaAtividade("Leitura de O Pequeno Príncipe"), COL.atrasadas)
    expect(semAtraso).toHaveTextContent("0")
    expect(within(semAtraso).queryByText(/atrasada/)).not.toBeInTheDocument()
  })

  it("mostra o prazo como está gravado e explica a tolerância 0", async () => {
    renderView()

    await screen.findByRole("heading", { name: "Desempenho por atividade" })

    // 10 de FEVEREIRO: o prazo é exibido cru, sem passar por `new Date()` (que
    // leria 2 de outubro) nem por ISO.
    const prazo = celula(linhaDaAtividade("Leitura de O Pequeno Príncipe"), COL.prazo)
    expect(prazo).toHaveTextContent("10/02/2026")
    expect(prazo.textContent).not.toContain("02/10/2026")
    expect(prazo.textContent).not.toContain("2026-02-10")

    // Tolerância 0 = sem tolerância, com a semântica da própria dica do
    // formulário de atividade: o dia do prazo vale, no dia seguinte bloqueia.
    expect(prazo).toHaveTextContent(
      "Sem tolerância: o dia do prazo continua valendo, mas no dia seguinte o envio já é bloqueado.",
    )

    // Tolerância > 0 em dias — e o 0 nunca vira "0 dias", que seria o oposto.
    expect(celula(linhaDaAtividade("Lista de exercícios — Frações"), COL.prazo)).toHaveTextContent(
      "Tolerância de 7 dias após o prazo.",
    )
    expect(celula(linhaDaAtividade("Ação escolar do bazar"), COL.prazo)).toHaveTextContent(
      "Tolerância de 3 dias após o prazo.",
    )
    // Singular: 1 dia é "1 dia", não "1 dias".
    expect(celula(linhaDaAtividade("Resumo do capítulo 3"), COL.prazo)).toHaveTextContent(
      "Tolerância de 1 dia após o prazo.",
    )
  })

  it("agrupa o ranking por turma, com saldo, nível e sequência", async () => {
    renderView()

    expect(await screen.findByRole("heading", { name: "Ranking por turma" })).toBeInTheDocument()

    const infoA = tabelaDaTurma("3º Info A", "Informática")
    expect(within(infoA).getByText("Ana Beatriz")).toBeInTheDocument()
    expect(within(infoA).getByText("120")).toBeInTheDocument()
    expect(within(infoA).getByText("🥈 Prata")).toBeInTheDocument()
    expect(within(infoA).getByText("3 dias seguidos")).toBeInTheDocument()
    expect(within(infoA).getByText("1 dia seguido")).toBeInTheDocument()
    expect(within(infoA).getByText("40")).toBeInTheDocument()
    expect(within(tabelaDaTurma("3º Info A", "Informática")).getAllByRole("columnheader")).toHaveLength(5)
    expect(within(tabelaDaTurma("2º Adm B", "Administração")).getAllByRole("columnheader")).toHaveLength(5)
    // Sequência 0 não vira "0 dias seguidos".
    expect(within(infoA).getByText("sem sequência hoje")).toBeInTheDocument()
    // O PAR turma-curso é o rótulo acessível da tabela (o agrupamento é o dado
    // novo), e a contagem de alunos aparece no cabeçalho do cartão — no plural e
    // no singular ("1 aluno" abaixo, em 2º Adm B).
    expect(screen.getByText("Informática · 3 alunos")).toBeInTheDocument()

    // Aluna em duas turmas do professor aparece nas duas (é a diferença para o
    // ranking chapado, que resolve a turma por `classIds[0]`).
    expect(within(tabelaDaTurma("2º Adm B", "Administração")).getByText("Ana Beatriz")).toBeInTheDocument()
    expect(screen.getByText("Administração · 1 aluno")).toBeInTheDocument()

    // Turma do professor sem aluno ativo: o grupo aparece, com aviso e sem linhas.
    // (o par turma-curso é o rótulo acessível da tabela, conferido acima)
    expect(within(tabelaDaTurma("1º Adm A", "Administração")).getAllByRole("row")).toHaveLength(1)
    expect(screen.getByText("Nenhum aluno ativo nesta turma.")).toBeInTheDocument()
  })

  it("mostra o rótulo de nível que veio do servidor, sem recalcular pelo saldo", async () => {
    // Guarda do m2: `level` é RÓTULO pronto (`reports.ts:336` deriva de
    // `levelLabel(balance)`), e o client não tem por que repetir a conta — as
    // telas de aluno importam `levelLabel` justamente por isso (RN04: a tela
    // mostra o que a API devolve). O fixture principal é HONESTO (120 =>
    // "🥈 Prata"), então sozinho ele não distingue "mostrou o que veio" de
    // "recalculou e por acaso deu o mesmo texto". Aqui a linha nasce
    // DIVERGENTE de propósito: com saldo 0 o derivado seria Bronze, e o
    // servidor mandou Prata — se o client recalcular, esta célula vira Bronze.
    expect(levelLabel(0)).toBe("🥉 Bronze")
    relatorio = {
      ...RELATORIO,
      ranking: [
        {
          className: "9º Info Z",
          course: "Informática",
          rows: [{ studentName: "Dora Alves", balance: 0, level: "🥈 Prata", streak: 2 }],
        },
      ],
    }
    renderView()

    await screen.findByRole("heading", { name: "Ranking por turma" })

    const celulas = within(linhaDoAluno("9º Info Z", "Informática", "Dora Alves")).getAllByRole("cell")
    expect(celulas[RANK.saldo]).toHaveTextContent("0")
    expect(celulas[RANK.nivel]).toHaveTextContent("🥈 Prata")
    // O Bronze derivado não pode aparecer NESTA célula (outro aluno pode ter
    // Bronze de verdade, então a ausência é por célula, não na tela).
    expect(within(celulas[RANK.nivel]).queryByText(/Bronze/)).not.toBeInTheDocument()
  })

  it("relatório vazio mostra o estado vazio das duas seções novas", async () => {
    relatorio = { activities: [], ranking: [] }
    renderView()

    expect(await screen.findByText("Nenhuma atividade sua")).toBeInTheDocument()
    expect(screen.getByText("Nenhuma turma sua")).toBeInTheDocument()
    expect(screen.queryByRole("table", { name: "Desempenho das minhas atividades" })).not.toBeInTheDocument()
    // A seção continua com o seu título: o que falta são as linhas.
    expect(screen.getByRole("heading", { name: "Ranking por turma" })).toBeInTheDocument()
    expect(screen.queryByText("Informática · 3 alunos")).not.toBeInTheDocument()
  })

  it("falha no relatório mostra o erro e 'Tentar novamente' recupera", async () => {
    const user = userEvent.setup()
    let fora = true
    server.use(
      http.get("/api/reports/teacher-performance", () => {
        if (fora) return HttpResponse.json({ error: "Relatório de desempenho indisponível." }, { status: 500 })
        return HttpResponse.json({ data: relatorio })
      }),
    )
    renderView()

    const erro = await screen.findByRole("alert")
    expect(erro).toHaveTextContent("Não foi possível carregar os dados.")
    expect(erro).toHaveTextContent("Relatório de desempenho indisponível.")
    expect(screen.queryByRole("heading", { name: "Desempenho por atividade" })).not.toBeInTheDocument()

    fora = false
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }))

    expect(await screen.findByRole("heading", { name: "Desempenho por atividade" })).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("as duas seções legadas e os dois CSV continuam, com uma tabela de ranking por turma", async () => {
    renderView()

    // Nada foi relaxado: as DUAS seções que já existiam continuam, cada uma com
    // o seu CSV — o contrato delas (`Aluno;Turma;Saldo;Nível`) está fixado em
    // `server/src/tests/reports.test.ts`, e é por isso que a tabela pode sair
    // sem o botão sair (T4.2-R1).
    expect(await screen.findByRole("heading", { name: "Taxa de conclusão por turma" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Ranking de pontos dos alunos" })).toBeInTheDocument()
    expect(screen.getByText("80%")).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: /Exportar CSV/ })).toHaveLength(2)
    // E a seção nova não ganhou botão de CSV (R4.2-G: CSV é da 4.3/4.5).
    expect(within(tabelaMetricas()).queryByRole("button")).not.toBeInTheDocument()

    // O que muda no T4.2-R1: UMA tabela de ranking por turma e NENHUMA tabela
    // chapada. A contagem total é a que pega o I-2 de volta: 1 de métricas + 3
    // grupos = 4; a tabela legada restaurada faria 5 (e ela discordaria sobre a
    // turma da Ana, que o relatório traz nos dois grupos).
    expect(screen.getByRole("heading", { name: "Ranking por turma" })).toBeInTheDocument()
    expect(screen.getAllByRole("table")).toHaveLength(4)
    for (const [turma, curso] of [
      ["3º Info A", "Informática"],
      ["2º Adm B", "Administração"],
      ["1º Adm A", "Administração"],
    ] as const) {
      expect(screen.getAllByRole("table", { name: `Ranking de pontos — ${turma} — ${curso}` })).toHaveLength(1)
    }

    // A seção que ficou sem tabela diz o que ela passou a fazer — o CSV — em vez
    // de prometer um ranking que não está mais ali.
    expect(screen.getByText(/O CSV exportado aqui sai no mesmo formato de sempre/)).toBeInTheDocument()
  })
})