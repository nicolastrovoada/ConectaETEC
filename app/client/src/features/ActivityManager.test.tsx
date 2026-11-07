// Testes do gerenciador de atividades — exclusão lógica (V3, 2.4).
// Mesma pilha dos demais testes de client: Testing Library + MSW sobre o wrapper
// real `src/lib/api.ts`. O que se fixa é o comportamento visível: o botão só
// existe para quem pode gerenciar, a confirmação é obrigatória, a API é chamada
// e a atividade desaparece da lista.
import { describe, it, expect, beforeAll, afterEach, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import type { Activity } from "@shared/types"
import { ActivityManager } from "./ActivityManager"
import { ToastProvider } from "../context/ToastContext"
import { ToastHost } from "../components/ui/Toast"

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

const ATIVIDADE = atividade({ id: "a1", title: "Projeto de gestão" })
const DE_OUTRO = atividade({ id: "a2", title: "Atividade de outro professor" })

/** O que o "banco" devolve na listagem — o servidor filtra as excluídas. */
let lista: Activity[] = [ATIVIDADE]

/** Ids cujo DELETE chegou ao servidor. */
let deletados: string[] = []

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))

beforeEach(() => {
  lista = [ATIVIDADE]
  deletados = []
  server.use(
    http.get("/api/activities", ({ request }) => {
      if (new URL(request.url).searchParams.get("calendar") === "true") {
        return HttpResponse.json({
          data: { calendar: lista.map((a) => ({ month: a.deadline.slice(3), activities: [a] })) },
        })
      }
      return HttpResponse.json({ data: lista })
    }),
    http.get("/api/classes", () => HttpResponse.json({ data: [] })),
    http.get("/api/subjects", () => HttpResponse.json({ data: [] })),
    http.delete("/api/activities/:id", ({ params }) => {
      const id = String(params.id)
      deletados.push(id)
      lista = lista.filter((a) => a.id !== id)
      return HttpResponse.json({
        data: { ...ATIVIDADE, deletedAt: "28/09/2026, 10:00:00", deletedBy: "u-prof" },
      })
    }),
  )
})

afterEach(() => {
  server.resetHandlers()
})

function renderManager(canManageActivity: (a: Activity) => boolean = () => true) {
  return render(
    <ToastProvider>
      <ActivityManager
        role="teacher"
        canCreate
        canManageActivity={canManageActivity}
        onGoToSubmissions={() => {}}
      />
      {/* o app real monta o ToastHost ao lado da tela (App.tsx) */}
      <ToastHost />
    </ToastProvider>,
  )
}

const cartao = (titulo: string) => screen.findByText(titulo)

describe("ActivityManager — exclusão de atividade (2.4)", () => {
  it("excluir chama a API e a atividade some da lista", async () => {
    const user = userEvent.setup()
    renderManager()

    expect(await cartao(ATIVIDADE.title)).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /Excluir/ }))
    // Confirmação antes do destructive: nada é chamado só de abrir o modal.
    expect(deletados).toHaveLength(0)

    await user.click(screen.getByRole("button", { name: /Confirmar exclusão/ }))

    await waitFor(() => expect(deletados).toEqual([ATIVIDADE.id]))
    await waitFor(() => expect(screen.queryByText(ATIVIDADE.title)).not.toBeInTheDocument())
  })

  it("cancelar a confirmação não chama a API e mantém a atividade na lista", async () => {
    const user = userEvent.setup()
    renderManager()

    expect(await cartao(ATIVIDADE.title)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /Excluir/ }))
    await user.click(screen.getByRole("button", { name: /Cancelar/ }))

    expect(deletados).toHaveLength(0)
    expect(await cartao(ATIVIDADE.title)).toBeInTheDocument()
  })

  it("só aparece o botão de excluir na atividade que o papel pode gerenciar", async () => {
    lista = [ATIVIDADE, DE_OUTRO]
    renderManager((a) => a.id === ATIVIDADE.id)

    expect(await cartao(ATIVIDADE.title)).toBeInTheDocument()
    expect(await cartao(DE_OUTRO.title)).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: /Excluir/ })).toHaveLength(1)
  })

  it("falha da API mantém a atividade na lista e mostra o erro", async () => {
    const user = userEvent.setup()
    server.use(
      http.delete("/api/activities/:id", () =>
        HttpResponse.json({ error: "Atividade já excluída." }, { status: 409 }),
      ),
    )
    renderManager()

    expect(await cartao(ATIVIDADE.title)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /Excluir/ }))
    await user.click(screen.getByRole("button", { name: /Confirmar exclusão/ }))

    // Sem refresh de página: a lista continua inteira e o usuário vê o motivo.
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Atividade já excluída."),
    )
    expect(screen.getByText(ATIVIDADE.title)).toBeInTheDocument()
  })
})
