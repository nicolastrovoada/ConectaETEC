// Testes da tela "Meus Reforços" do professor (V3, 3.2).
// Mesma pilha dos demais testes de client: Testing Library + MSW sobre o wrapper
// real `src/lib/api.ts`, com o usuário do `UserProvider` — é dele que sai a
// regra de dono (só edita/exclui o reforço que criou).
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest"
import type { MockInstance } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import type { Class, SafeUser, StudyContent, Subject } from "@shared/types"
import { TeacherStudyContentsView } from "./TeacherStudyContentsView"
import { api } from "../../lib/api"
import { UserProvider } from "../../context/UserContext"
import { ToastProvider } from "../../context/ToastContext"
import { ToastHost } from "../../components/ui/Toast"

const server = setupServer()

const PROFESSOR: SafeUser = {
  id: "u-prof",
  name: "Marcelo Ferreira",
  email: "marcelo.ferreira@etec.sp.gov.br",
  role: "teacher",
  active: true,
  avatar: "MF",
  classIds: ["c1", "c2"],
  createdAt: "01/02/2026, 08:00:00",
}

const CLASSES: Class[] = [
  {
    id: "c1",
    name: "3º Info A",
    course: "Informática",
    year: 3,
    shift: "morning",
    active: true,
    studentIds: ["u-aluno"],
    teacherIds: ["u-prof"],
  },
  {
    id: "c2",
    name: "2º Adm B",
    course: "Administração",
    year: 2,
    shift: "afternoon",
    active: true,
    studentIds: [],
    teacherIds: ["u-prof"],
  },
]

const SUBJECTS: Subject[] = [
  { id: "s1", name: "Matemática", icon: "📐", teacherIds: ["u-prof"], classIds: ["c1", "c2"] },
  { id: "s2", name: "Língua Portuguesa", icon: "📖", teacherIds: ["u-prof"], classIds: ["c1", "c2"] },
]

function reforco(over: Partial<StudyContent> & Pick<StudyContent, "id" | "topic">): StudyContent {
  return {
    subject: "Matemática",
    icon: "📖",
    color: "blue",
    exercises: 0,
    description: "Resumo que o aluno vê no card.",
    content: "A lição completa que o aluno lê ao expandir.",
    teacherId: "u-prof",
    classIds: ["c1"],
    points: 5,
    questions: [],
    attachments: [],
    ...over,
  }
}

const MEU = reforco({ id: "sc1", topic: "Regra dos três" })
/** Reforço de outro professor: a API não mandaria, mas a tela não pode confiar nisso. */
const DE_OUTRO = reforco({ id: "sc2", topic: "Crase na frase", subject: "Língua Portuguesa", teacherId: "u-colega" })

let lista: StudyContent[]
/** Corpos capturados das chamadas de escrita (o teste confere o que foi para a API). */
let criados: unknown[]
let editados: Array<{ id: string; body: unknown }>
let deletados: string[]
// O corpo multipart do `fetch` do Node (undici) não consegue ler o `File` do
// jsdom ("Cannot read properties of undefined (reading '_buffer')"), então o
// envio de anexo é verificado na borda `api.postForm` — o que interessa aqui é o
// que a tela monta: endpoint certo, campo "attachments" e nome do arquivo.
let postForm: MockInstance<typeof api.postForm>

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))

beforeEach(() => {
  lista = [MEU]
  criados = []
  editados = []
  deletados = []
  postForm = vi.spyOn(api, "postForm").mockResolvedValue([])

  server.use(
    http.get("/api/study-contents", () => HttpResponse.json({ data: lista })),
    http.get("/api/classes", () => HttpResponse.json({ data: CLASSES })),
    http.get("/api/subjects", () => HttpResponse.json({ data: SUBJECTS })),
    http.post("/api/study-contents", async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>
      criados.push(body)
      const created = reforco({ id: "sc-novo", topic: String(body.topic), ...(body as Partial<StudyContent>) })
      lista = [...lista, created]
      return HttpResponse.json({ data: created }, { status: 201 })
    }),
    http.patch("/api/study-contents/:id", async ({ request, params }) => {
      const body = (await request.json()) as Record<string, unknown>
      const id = String(params.id)
      editados.push({ id, body })
      lista = lista.map((c) => (c.id === id ? { ...c, ...(body as Partial<StudyContent>) } : c))
      return HttpResponse.json({ data: lista.find((c) => c.id === id) })
    }),
    http.delete("/api/study-contents/:id", ({ params }) => {
      const id = String(params.id)
      deletados.push(id)
      lista = lista.filter((c) => c.id !== id)
      return HttpResponse.json({ data: { ok: true } })
    }),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  server.resetHandlers()
})
afterAll(() => server.close())

function renderView() {
  return render(
    <UserProvider user={PROFESSOR} onLogout={() => {}}>
      <ToastProvider>
        <TeacherStudyContentsView />
        {/* o app real monta o ToastHost ao lado da tela (App.tsx) */}
        <ToastHost />
      </ToastProvider>
    </UserProvider>,
  )
}

const cartao = (topico: string) => screen.getByRole("article", { name: topico })
const dialogo = () => within(screen.getByRole("dialog"))

describe("Professor — Meus reforços (3.2)", () => {
  it("criar reforço envia o formulário inteiro e o reforço aparece na lista", async () => {
    const user = userEvent.setup()
    renderView()

    expect(await screen.findByRole("article", { name: "Regra dos três" })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /Novo reforço/ }))
    const form = dialogo()

    await user.type(form.getByLabelText(/Título do reforço/), "Revolução Industrial")
    await user.selectOptions(form.getByLabelText(/Matéria/), "Língua Portuguesa")
    await user.type(form.getByLabelText(/Resumo para o aluno/), "Panorama do século XIX.")
    await user.type(form.getByLabelText(/Conteúdo da lição/), "Máquinas a vapor e a cidade industrial.")
    await user.click(form.getByLabelText(/3º Info A/))
    await user.clear(form.getByLabelText(/Pontos/))
    await user.type(form.getByLabelText(/Pontos/), "15")
    await user.click(form.getByRole("button", { name: "Adicionar questão" }))
    await user.type(form.getByLabelText("Questão 1"), "O que impulsionou a industrialização?")
    // Questão em branco não entra no payload.
    await user.click(form.getByRole("button", { name: "Adicionar questão" }))
    await user.click(form.getByRole("button", { name: "Adicionar questão" }))

    await user.click(form.getByRole("button", { name: /Publicar reforço/ }))

    // O corpo é conferido inteiro: o schema do servidor é `.strict()`, então um
    // campo a mais (ou um `teacherId` no corpo) seria 400.
    await waitFor(() =>
      expect(criados).toEqual([
        {
          topic: "Revolução Industrial",
          subject: "Língua Portuguesa",
          description: "Panorama do século XIX.",
          content: "Máquinas a vapor e a cidade industrial.",
          classIds: ["c1"],
          points: 15,
          questions: ["O que impulsionou a industrialização?"],
        },
      ]),
    )

    expect(await screen.findByRole("article", { name: "Revolução Industrial" })).toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(await screen.findByText(/Reforço "Revolução Industrial" publicado nas turmas selecionadas/)).toBeInTheDocument()
  })

  it("editar envia PATCH do reforço certo e a lista mostra o título novo", async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(within(await screen.findByRole("article", { name: "Regra dos três" })).getByRole("button", { name: /Editar/ }))

    const form = dialogo()
    // O formulário abre já com o conteúdo do reforço.
    expect(form.getByLabelText(/Título do reforço/)).toHaveValue("Regra dos três")
    await user.clear(form.getByLabelText(/Título do reforço/))
    await user.type(form.getByLabelText(/Título do reforço/), "Regra dos três — revisão")
    await user.click(form.getByRole("button", { name: /Salvar alterações/ }))

    await waitFor(() =>
      expect(editados).toEqual([
        {
          id: "sc1",
          body: {
            topic: "Regra dos três — revisão",
            subject: "Matemática",
            description: "Resumo que o aluno vê no card.",
            content: "A lição completa que o aluno lê ao expandir.",
            classIds: ["c1"],
            points: 5,
            questions: [],
          },
        },
      ]),
    )
    expect(await screen.findByRole("article", { name: "Regra dos três — revisão" })).toBeInTheDocument()
  })

  it("só o reforço do próprio professor tem editar e excluir", async () => {
    lista = [MEU, DE_OUTRO]
    renderView()

    expect(await screen.findByRole("article", { name: "Regra dos três" })).toBeInTheDocument()
    // A lista vem escopada da API (só o que é dele), mas a tela não compra a
    // promessa: as ações seguem o dono (`teacherId`), como no servidor.
    expect(screen.getByRole("article", { name: "Crase na frase" })).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: /Editar/ })).toHaveLength(1)
    expect(screen.getAllByRole("button", { name: /Excluir/ })).toHaveLength(1)
    expect(within(cartao("Crase na frase")).queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument()
  })

  it("excluir o próprio reforço pede confirmação e some da lista", async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(within(await screen.findByRole("article", { name: "Regra dos três" })).getByRole("button", { name: /Excluir/ }))

    // Nada é apagado só de abrir a confirmação.
    expect(deletados).toEqual([])
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Confirmar exclusão/ }))

    await waitFor(() => expect(deletados).toEqual(["sc1"]))
    expect(screen.queryByRole("article", { name: "Regra dos três" })).not.toBeInTheDocument()
    expect(await screen.findByText(/Reforço "Regra dos três" excluído/)).toBeInTheDocument()
  })

  it("excluir reforço já concluído (409) vira mensagem de negócio, não tela quebrada", async () => {
    const user = userEvent.setup()
    server.use(
      http.delete("/api/study-contents/:id", () =>
        HttpResponse.json(
          {
            error: "Este reforço já foi concluído por alunos e não pode ser removido: os pontos já foram creditados.",
            details: "CONTENT_HAS_COMPLETIONS",
          },
          { status: 409 },
        ),
      ),
    )
    renderView()

    await user.click(within(await screen.findByRole("article", { name: "Regra dos três" })).getByRole("button", { name: /Excluir/ }))
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Confirmar exclusão/ }))

    // A mensagem do servidor chega como texto, no toast de erro…
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Este reforço já foi concluído por alunos e não pode ser removido: os pontos já foram creditados.",
    )
    // …a lista continua inteira e nenhuma tela de erro tomou o lugar.
    expect(screen.getByRole("article", { name: "Regra dos três" })).toBeInTheDocument()
    expect(screen.queryByText("Não foi possível carregar os dados.")).not.toBeInTheDocument()
  })

  it("anexar material de apoio sobe o arquivo para o reforço e a lista mostra o anexo", async () => {
    const user = userEvent.setup()
    server.use(
      http.get("/api/study-contents", () =>
        HttpResponse.json({
          data: [
            {
              ...MEU,
              attachments: [
                {
                  id: "an1",
                  filename: "exemplo.png",
                  storedName: "sc1-an1.png",
                  mimeType: "image/png",
                  size: 51_200,
                  uploadedAt: "29/09/2026, 08:00:00",
                },
              ],
            },
          ],
        }),
      ),
    )
    renderView()

    const arquivo = new File(["conteudo"], "exemplo.png", { type: "image/png" })
    await user.upload(within(await screen.findByRole("article", { name: "Regra dos três" })).getByLabelText(/Anexar material de apoio/), arquivo)
    await user.click(screen.getByRole("button", { name: /^Anexar$/ }))

    // Endpoint de anexo + multipart com o campo "attachments" e o nome do arquivo.
    await waitFor(() => expect(postForm).toHaveBeenCalledTimes(1))
    const [url, form] = postForm.mock.calls[0]
    expect(url).toBe("/api/study-contents/sc1/attachments")
    expect((form.get("attachments") as File).name).toBe("exemplo.png")
    // Depois do envio a lista recarrega e mostra o anexo.
    expect(await screen.findByText("exemplo.png")).toBeInTheDocument()
  })
})

