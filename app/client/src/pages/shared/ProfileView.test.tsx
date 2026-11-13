// Testes do Perfil editável (V3, 4.6 — foto, nome e senha).
// Mesma pilha dos demais testes do client: Testing Library + MSW sobre o wrapper
// real `src/lib/api.ts`. O "servidor" falso guarda o usuário e prova o que a tela
// envia: nome no PATCH JSON, foto no multipart `avatar` e nenhuma chamada quando
// a confirmação de senha diverge.
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import type { Class, SafeUser, Subject } from "@shared/types"
import { ProfileView } from "./ProfileView"
import { api } from "../../lib/api"
import { UserProvider } from "../../context/UserContext"
import { ToastProvider } from "../../context/ToastContext"
import { ToastHost } from "../../components/ui/Toast"

const server = setupServer()

const ALUNO: SafeUser = {
  id: "u-aluno",
  name: "Ana Souza",
  email: "ana@etec.sp.gov.br",
  role: "student",
  active: true,
  avatar: "AS",
  classIds: ["c1"],
  createdAt: "02/03/2026, 08:00:00",
}

const PROFESSOR: SafeUser = {
  id: "u-prof",
  name: "Marcelo Pereira",
  email: "marcelo@etec.sp.gov.br",
  role: "teacher",
  active: true,
  avatar: "MP",
  classIds: ["c1"],
  createdAt: "10/02/2026, 08:00:00",
}

const CLASSES: Class[] = [
  {
    id: "c1",
    name: "1º Ano A",
    course: "Técnico em Administração",
    year: 1,
    shift: "morning",
    active: true,
    studentIds: ["u-aluno"],
    teacherIds: ["u-prof"],
  },
  {
    id: "c2",
    name: "2º Ano A",
    course: "Técnico em Administração",
    year: 2,
    shift: "morning",
    active: true,
    studentIds: [],
    teacherIds: [],
  },
]

const SUBJECTS: Subject[] = [
  { id: "s1", name: "Língua Portuguesa", icon: "📖", teacherIds: ["u-prof"], classIds: ["c1"] },
  { id: "s2", name: "Matemática", icon: "📐", teacherIds: ["outro"], classIds: ["c1"] },
]

const PONTOS = {
  balance: 120,
  levelLabel: "Prata",
  nextLevel: 200,
  missingForNextLevel: 80,
  currentStreakDays: 4,
  nextStreakMilestone: 7,
  daysToNextMilestone: 3,
  transactions: [],
}

let currentUser: SafeUser
let patchBodies: unknown[]
let avatarForm: FormData | null

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" })
  // jsdom não implementa object URLs; o preview do arquivo usa a API real no browser.
  URL.createObjectURL = vi.fn(() => "blob:preview-da-foto")
  URL.revokeObjectURL = vi.fn()
})

beforeEach(() => {
  currentUser = ALUNO
  patchBodies = []
  avatarForm = null

  server.use(
    http.get("/api/users/:id/points", () => HttpResponse.json({ data: PONTOS })),
    http.get("/api/classes", () => HttpResponse.json({ data: CLASSES })),
    http.get("/api/subjects", () => HttpResponse.json({ data: SUBJECTS })),
    http.get("/api/auth/me", () => HttpResponse.json({ data: currentUser })),
    http.patch("/api/users/me", async ({ request }) => {
      const body = (await request.json()) as { name?: string }
      patchBodies.push(body)
      currentUser = { ...currentUser, name: body.name ?? currentUser.name }
      return HttpResponse.json({ data: currentUser })
    }),
  )
})

afterEach(() => {
  server.resetHandlers()
  vi.restoreAllMocks()
  cleanup()
})
afterAll(() => server.close())

function renderView(user: SafeUser = ALUNO) {
  return render(
    <ToastProvider>
      <UserProvider user={user} onLogout={() => {}}>
        <ProfileView />
        <ToastHost />
      </UserProvider>
    </ToastProvider>,
  )
}

describe("Perfil editável (4.6)", () => {
  it("edita o próprio nome pelo PATCH /api/users/me", async () => {
    const user = userEvent.setup()
    renderView()

    await screen.findByText("Ana Souza")
    await user.click(screen.getByRole("button", { name: "Editar perfil" }))

    const nome = screen.getByLabelText(/Nome/)
    await user.clear(nome)
    await user.type(nome, "Ana Clara Souza")
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }))

    await waitFor(() => expect(patchBodies).toEqual([{ name: "Ana Clara Souza" }]))
    expect(await screen.findByText("Perfil atualizado.")).toBeInTheDocument()
  })

  it("envia a foto como multipart e mostra o preview", async () => {
    const user = userEvent.setup()
    renderView()

    // O multipart é observado no wrapper `api.postForm` (no jsdom o `FormData`
    // não atravessa o fetch do Node intacto); o que importa é que a tela entregou
    // o arquivo no campo "avatar" e refletiu a URL devolvida pelo servidor.
    const postForm = vi.spyOn(api, "postForm").mockImplementation((async (
      _path: string,
      form: FormData,
    ) => {
      avatarForm = form
      currentUser = { ...currentUser, avatar: "/uploads/avatars/foto-nova.png" }
      return currentUser
    }) as typeof api.postForm)

    await user.click(await screen.findByRole("button", { name: "Editar perfil" }))
    expect(
      screen.getByText(/A foto é salva imediatamente/),
    ).toBeInTheDocument()
    const arquivo = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "foto.png", {
      type: "image/png",
    })
    await user.upload(screen.getByLabelText("Escolher foto de perfil"), arquivo)

    await waitFor(() => expect(avatarForm).not.toBeNull())
    expect(postForm).toHaveBeenCalledWith("/api/users/me/avatar", expect.any(FormData))
    const enviado = avatarForm?.get("avatar")
    expect(enviado).toBeInstanceOf(File)
    expect((enviado as File).name).toBe("foto.png")
    expect(await screen.findByText("Foto de perfil atualizada.")).toBeInTheDocument()

    // Sem nome/senha pendentes, o upload fecha a edição: o próximo clique não
    // pode cair em "Nenhuma alteração para salvar." nem exibir a prévia blob.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Editar perfil" })).toBeInTheDocument(),
    )
    expect(screen.queryByRole("button", { name: "Salvar alterações" })).not.toBeInTheDocument()
    expect(screen.queryByText("Nenhuma alteração para salvar.")).not.toBeInTheDocument()
    expect(screen.queryByAltText("Prévia da nova foto de perfil")).not.toBeInTheDocument()
    expect(document.querySelector('img[src="/uploads/avatars/foto-nova.png"]')).not.toBeNull()
  })

  it("ao abrir a edição, o foco vai para o campo de nome", async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(await screen.findByRole("button", { name: "Editar perfil" }))
    const nome = screen.getByLabelText(/Nome/)
    await waitFor(() => expect(document.activeElement).toBe(nome))
  })

  it("confirmação de senha divergente bloqueia o PATCH", async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(await screen.findByRole("button", { name: "Editar perfil" }))
    await user.type(screen.getByLabelText("Senha atual"), "123456")
    await user.type(screen.getByLabelText("Nova senha"), "novaSenha9")
    await user.type(screen.getByLabelText("Confirmar nova senha"), "senhaDiferente")
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A confirmação não confere com a nova senha.",
    )
    expect(patchBodies).toEqual([])
  })

  it("mostra turma/curso do aluno", async () => {
    renderView()
    expect(
      await screen.findByText("1º Ano A — Técnico em Administração"),
    ).toBeInTheDocument()
  })

  it("mostra as matérias do professor", async () => {
    renderView(PROFESSOR)
    expect(await screen.findByText("Língua Portuguesa")).toBeInTheDocument()
    expect(screen.queryByText("Matemática")).not.toBeInTheDocument()
  })
})
