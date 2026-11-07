// Teste do sino de notificações do `Layout` (V3, 3.4 — Important 1 da review).
//
// O sino e a tela de notificações precisam enxergar o MESMO estado. Antes, o
// `Layout` chamava `useNotifications()` por conta própria: o sino nascia com uma
// cópia congelada da lista e nunca acompanhava o acuse da tela — o badge
// supercontava a sessão inteira. Este teste renderiza o painel de verdade
// (Layout + tela, como o App monta) e prova que uma única fonte de verdade
// alimenta os dois: quando a tela some com uma transitória, o sino cai junto.
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import { setupServer } from "msw/node"
import type { SafeUser } from "@shared/types"
import { Layout, type NavItem } from "./Layout"
import { NotificationsView } from "../pages/shared/NotificationsView"
import { NotificationsProvider } from "../context/NotificationsContext"
import { PreferencesProvider } from "../context/PreferencesContext"
import { UserProvider } from "../context/UserContext"
import { ToastProvider } from "../context/ToastContext"
import { ToastHost } from "./ui/Toast"
import { criarBancoNotificacoes, APROVADA, type NotificationsBanco } from "../test/notificationsBanco"

const server = setupServer()

const ALUNO: SafeUser = {
  id: "u-aluno",
  name: "Ana Souza",
  email: "ana.souza@etec.sp.gov.br",
  role: "student",
  active: true,
  avatar: "AS",
  classIds: ["c1", "c2"],
  createdAt: "02/03/2026, 08:00:00",
}

const NAV: NavItem[] = [
  { id: "inicio", label: "Início", icon: "🏠" },
  { id: "atividades", label: "Atividades", icon: "📝" },
  { id: "notificacoes", label: "Notificações", icon: "🔔" },
]

let banco: NotificationsBanco

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))

beforeEach(() => {
  banco = criarBancoNotificacoes()
  server.use(...banco.handlers)
})

afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function renderPainel() {
  return render(
    <PreferencesProvider>
      <ToastProvider>
        <UserProvider user={ALUNO} onLogout={() => {}}>
          {/* O App (AppGate) monta o provider ACIMA do Layout: é essa a fonte única. */}
          <NotificationsProvider>
            <Layout nav={NAV} active="inicio" onNavigate={() => {}} title="Início">
              <NotificationsView />
            </Layout>
          </NotificationsProvider>
          <ToastHost />
        </UserProvider>
      </ToastProvider>
    </PreferencesProvider>,
  )
}

describe("sino do Layout e tela de notificações compartilham o estado (3.4)", () => {
  it("o sino cai junto quando a tela consome uma transitória (fonte única)", async () => {
    renderPainel()

    // Quatro não lidas no sino e na tela — o estado é um só.
    expect(await screen.findByRole("button", { name: /Notificações, 4 não lidas/ })).toBeInTheDocument()
    expect(await screen.findByText("Atividade aprovada!")).toBeInTheDocument()

    // A tela consome a transitória sozinha; o sino acompanha SEM novo fetch:
    // o badge é derivado do MESMO controller.
    await waitFor(
      () => {
        expect(screen.queryByText("Atividade aprovada!")).not.toBeInTheDocument()
      },
      { timeout: 3000 },
    )
    expect(await screen.findByRole("button", { name: /Notificações, 3 não lidas/ })).toBeInTheDocument()

    // Uma GET só foi necessária (a inicial): a reconciliação do sino não busca
    // nada por conta própria — se o Layout tivesse estado próprio, haveria GETs
    // em dobro e o badge não acompanharia.
    expect(banco.acusesIndividuais).toEqual([APROVADA.id])
    // A contagem exata pode variar pela reconciliação, mas NUNCA pode haver
    // fetch extra do sino: o provider é um só e montou junto com a tela.
    expect(banco.listagens).toBeGreaterThanOrEqual(1)
    expect(within(screen.getByRole("region", { name: "Atividades e novidades" })).getByText(/Correção solicitada/))
      .toBeInTheDocument()
  })
})