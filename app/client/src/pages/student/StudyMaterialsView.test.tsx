// Testes da tela de Reforço Escolar do aluno (V3, 3.2 + R31).
// Mesma pilha dos demais testes de client: Testing Library + MSW sobre o wrapper
// real `src/lib/api.ts`. O "banco" falso reproduz a regra que importa da 3.1:
// `/complete` credita UMA vez (2ª chamada = 409 `ALREADY_COMPLETED`) e, desde o
// R31, a LEITURA já devolve `completedAt` (o estado de conclusão do próprio aluno).
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import type { StudentStudyContent } from "@shared/types"
import { StudyMaterialsView } from "./StudyMaterialsView"
import { ToastProvider } from "../../context/ToastContext"
import { ToastHost } from "../../components/ui/Toast"

const server = setupServer()

function reforco(over: Partial<StudentStudyContent> & Pick<StudentStudyContent, "id" | "topic">): StudentStudyContent {
  return {
    subject: "Matemática",
    icon: "📐",
    color: "blue",
    exercises: 0,
    description: "Resumo da lição de regra dos três.",
    content: "Regra dos três: a razão entre as grandezas se conserva.",
    teacherId: "u-prof",
    classIds: ["c1"],
    points: 5,
    questions: ["Resolva: 3 maps correspondem a 12 cm, quantos cm para 8 maps?"],
    attachments: [],
    // A API sempre devolve o campo: `null` = este aluno ainda não concluiu (R31).
    completedAt: null,
    ...over,
  }
}

const MATEMATICA = reforco({ id: "sc1", topic: "Regra dos três" })
/** Reforço de OUTRA turma: chega na lista porque a API escopa (R28), não o cliente. */
const PORTUGUES = reforco({
  id: "sc2",
  topic: "Crase na frase",
  subject: "Língua Portuguesa",
  icon: "📖",
  points: 8,
  classIds: ["c2"],
  questions: [],
})
const COM_ANEXO = reforco({
  id: "sc3",
  topic: "Revolução Industrial",
  subject: "História",
  icon: "🏭",
  color: "orange",
  classIds: ["c1"],
  attachments: [
    {
      id: "an1",
      filename: "linha-do-tempo.png",
      storedName: "sc3-an1.png",
      mimeType: "image/png",
      size: 245_760,
      uploadedAt: "28/09/2026, 10:00:00",
    },
  ],
})

let lista: StudentStudyContent[]
/** Reforços já concluídos no "banco" — a trava de crédito único da 3.1. */
let concluidos: Set<string>
/** Quantas vezes o "banco" creditou pontos de verdade. */
let creditos: number
let saldo: number
/** Chamadas de `/complete` que chegaram ao servidor (id + corpo). */
let conclusoes: string[]
/** URLs da listagem pedidas na rede. */
let pedidos: string[]
let foraDoAr = false

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))

beforeEach(() => {
  lista = [MATEMATICA, PORTUGUES, COM_ANEXO]
  concluidos = new Set()
  creditos = 0
  saldo = 115
  conclusoes = []
  pedidos = []
  foraDoAr = false

  server.use(
    http.get("/api/study-contents", ({ request }) => {
      const url = new URL(request.url)
      pedidos.push(`${url.pathname}${url.search}`)
      if (foraDoAr) return HttpResponse.json({ error: "indisponível" }, { status: 500 })
      const subject = url.searchParams.get("subject")
      return HttpResponse.json({ data: subject ? lista.filter((c) => c.subject === subject) : lista })
    }),
    http.post("/api/study-contents/:id/complete", ({ params }) => {
      const id = String(params.id)
      conclusoes.push(id)
      const content = lista.find((c) => c.id === id)
      if (!content) return HttpResponse.json({ error: "Conteúdo de reforço não encontrado." }, { status: 404 })
      if (concluidos.has(id)) {
        return HttpResponse.json(
          { error: "Você já concluiu este reforço.", details: "ALREADY_COMPLETED" },
          { status: 409 },
        )
      }
      concluidos.add(id)
      creditos += content.points
      saldo += content.points
      // O servidor grava a conclusão e a LEITURA passa a devolver o estado (R31).
      lista = lista.map((c) => (c.id === id ? { ...c, completedAt: "29/09/2026, 09:00:00" } : c))
      return HttpResponse.json({
        data: {
          completion: { id: "cmp1", studentId: "u-aluno", studyContentId: id, completedAt: "29/09/2026, 09:00:00" },
          transaction: {
            id: "tx1",
            studentId: "u-aluno",
            amount: content.points,
            type: "study_content",
            description: `Reforço concluído: ${content.topic}`,
            relatedActivityId: null,
            createdBy: content.teacherId ?? "u-aluno",
            createdAt: "29/09/2026, 09:00:00",
          },
          balance: saldo,
        },
      })
    }),
  )
})

afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function renderView() {
  return render(
    <ToastProvider>
      <StudyMaterialsView />
      {/* o app real monta o ToastHost ao lado da tela (App.tsx) */}
      <ToastHost />
    </ToastProvider>,
  )
}

/** Card do reforço pelo tópico (cada cartão é um `article` nomeado pelo seu h3). */
const cartao = (topico: string) => screen.findByRole("article", { name: topico })
const cartaoAtual = (topico: string) => screen.getByRole("article", { name: topico })

describe("Aluno — Reforço Escolar (3.2)", () => {
  it("lista o reforço agrupado por disciplina e expande a lição pelo teclado", async () => {
    const user = userEvent.setup()
    renderView()

    // Agrupamento por disciplina (o agrupamento é do cliente, o escopo NÃO é).
    expect(await screen.findByRole("heading", { name: "Matemática" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Língua Portuguesa" })).toBeInTheDocument()
    expect(await screen.findByRole("heading", { name: "Regra dos três" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Revolução Industrial" })).toBeInTheDocument()

    // O resumo aparece no cartão fechado; a lição, não.
    const cartaoMatematica = await cartao("Regra dos três")
    expect(within(cartaoMatematica).getByText("Resumo da lição de regra dos três.")).toBeInTheDocument()
    expect(
      within(cartaoMatematica).queryByText("Regra dos três: a razão entre as grandezas se conserva."),
    ).not.toBeInTheDocument()

    // Expande pelo teclado: o botão é um <button> com aria-expanded (WCAG 1.4.1:
    // o estado não pode ser percebido só pela cor/ícone).
    const expandir = within(cartaoMatematica).getByRole("button", { name: /Ver lição/ })
    expect(expandir).toHaveAttribute("aria-expanded", "false")
    expandir.focus()
    await user.keyboard("{Enter}")

    const cartaoAberto = cartaoAtual("Regra dos três")
    expect(within(cartaoAberto).getByRole("button", { name: /Ocultar lição/ })).toHaveAttribute("aria-expanded", "true")
    expect(
      within(cartaoAberto).getByText("Regra dos três: a razão entre as grandezas se conserva."),
    ).toBeInTheDocument()
    expect(
      within(cartaoAberto).getByText("Resolva: 3 maps correspondem a 12 cm, quantos cm para 8 maps?"),
    ).toBeInTheDocument()

    await user.keyboard("{Enter}")
    expect(within(cartaoAtual("Regra dos três")).getByRole("button", { name: /Ver lição/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    )
  })

  it("mostra o material de apoio do reforço com nome, tamanho e data", async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(within(await cartao("Revolução Industrial")).getByRole("button", { name: /Ver lição/ }))

    const anexo = within(cartaoAtual("Revolução Industrial")).getByRole("button", { name: /linha-do-tempo\.png/ })

    expect(anexo).toHaveTextContent("240 KB")
    expect(anexo).toHaveTextContent(/28\/09\/2026[,\s]*10:00/)

    // O reforço sem anexo não ganha a seção de material de apoio.
    await user.click(within(cartaoAtual("Regra dos três")).getByRole("button", { name: /Ver lição/ }))
    expect(
      within(cartaoAtual("Regra dos três")).queryByRole("button", { name: /Material de apoio/ }),
    ).not.toBeInTheDocument()
  })

  it("concluir credita uma vez: some o botão, aparece o selo e o saldo do servidor", async () => {
    const user = userEvent.setup()
    renderView()

    const alvo = await cartao("Regra dos três")
    expect(within(alvo).getByText("+5 pts")).toBeInTheDocument()
    await user.click(within(alvo).getByRole("button", { name: /Concluir reforço/ }))

    // Selo textual (cor não é o único indício) com os pontos creditados e a data
    // que veio no 201.
    expect(await within(cartaoAtual("Regra dos três")).findByText(/Concluído em 29\/09\/2026, 09:00 · \+5 pts no seu saldo/)).toBeInTheDocument()
    // O botão some: não há como concluir de novo pela tela.
    expect(within(cartaoAtual("Regra dos três")).queryByRole("button", { name: /Concluir reforço/ })).not.toBeInTheDocument()

    // O saldo é o que o SERVIDOR devolveu (RN04) — a tela não recalcula.
    expect(await screen.findByText(/Saldo: 120 pts/)).toBeInTheDocument()

    // Uma chamada só, e o "banco" creditou exatamente uma vez.
    expect(conclusoes).toEqual([MATEMATICA.id])
    expect(creditos).toBe(5)

    // Os outros reforços continuam disponíveis (o estado é por reforço).
    expect(within(cartaoAtual("Crase na frase")).getByRole("button", { name: /Concluir reforço/ })).toBeInTheDocument()
  })

  it("concluir de novo não credita de novo: o 409 do servidor vira estado concluído", async () => {
    const user = userEvent.setup()
    // Reforço já concluído numa sessão anterior (o que a 3.1 grava no banco).
    concluidos.add(MATEMATICA.id)
    renderView()

    const alvo = await cartao("Regra dos três")
    await user.click(within(alvo).getByRole("button", { name: /Concluir reforço/ }))

    // A UI passa a mostrar o estado que o servidor já tem, sem tratar o 409 como erro genérico.
    expect(await within(cartaoAtual("Regra dos três")).findByText(/Concluído · \+5 pts no seu saldo/)).toBeInTheDocument()
    expect(within(cartaoAtual("Regra dos três")).queryByRole("button", { name: /Concluir reforço/ })).not.toBeInTheDocument()
    expect(await screen.findByText(/Você já concluiu este reforço/)).toBeInTheDocument()

    // Nenhum ponto novo: nem o saldo do "banco" nem o número de créditos mudou.
    expect(creditos).toBe(0)
    expect(saldo).toBe(115)
    expect(conclusoes).toEqual([MATEMATICA.id])
  })

  it("o reforço concluído antes do load já chega concluído: selo e nenhum botão", async () => {
    // A linha de conclusão já estava no banco (sessão anterior, outro
    // dispositivo): o `completedAt` do payload é o que faz a tela mostrar o
    // estado, e não um clique com 409. É o teste que fecha a lacuna do R31.
    const CONCLUIDO = reforco({
      id: "sc4",
      topic: "Geometria plana",
      completedAt: "28/09/2026, 20:15:00",
    })
    lista = [CONCLUIDO, MATEMATICA]
    renderView()

    const alvo = await cartao("Geometria plana")
    // Selo já no PRIMEIRO render, com a data que veio da API.
    expect(within(alvo).getByText(/Concluído em 28\/09\/2026, 20:15/)).toBeInTheDocument()
    expect(within(alvo).queryByRole("button", { name: /Concluir reforço/ })).not.toBeInTheDocument()

    // Nada foi tentado: o botão nem existe, então nenhuma chamada saiu.
    expect(conclusoes).toEqual([])
    // O reforço que ele NÃO concluiu continua disponível.
    expect(within(cartaoAtual("Regra dos três")).getByRole("button", { name: /Concluir reforço/ })).toBeInTheDocument()
  })

  it("o escopo da lista é do servidor: sem filtro de turma e sem parâmetro inventado", async () => {
    renderView()

    expect(await screen.findByRole("heading", { name: "Regra dos três" })).toBeInTheDocument()
    // A c1 E a c2 aparecem: quem escopa é a API (R28), não um `classIds.includes`
    // do cliente — e a listagem vai sem `?subject=`/`?classId=`, porque a API já
    // devolve só o que pertence ao aluno.
    expect(screen.getByRole("heading", { name: "Crase na frase" })).toBeInTheDocument()
    expect(pedidos).toEqual(["/api/study-contents"])
  })

  it("falha na listagem mostra o erro e 'Tentar novamente' recupera", async () => {
    const user = userEvent.setup()
    foraDoAr = true
    renderView()

    expect(await screen.findByText("Não foi possível carregar os dados.")).toBeInTheDocument()

    foraDoAr = false
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }))

    expect(await screen.findByRole("heading", { name: "Regra dos três" })).toBeInTheDocument()
    expect(screen.queryByText("Não foi possível carregar os dados.")).not.toBeInTheDocument()
  })
})
