import { describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { LandingPage } from "./LandingPage"

describe("LandingPage", () => {
  it("renderiza a apresentação com um único h1, CTA de âncora e legenda do mock", () => {
    render(<LandingPage onRequestLogin={() => {}} />)

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Uma escola mais conectada começa com a participação de todos.",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Conhecer a plataforma" })).toHaveAttribute("href", "#sobre")
    expect(
      screen.getByText("Demonstração visual. Interface ilustrativa, sem dados reais."),
    ).toBeInTheDocument()
  })

  it("chama onRequestLogin ao clicar em Entrar na conta no header", async () => {
    const user = userEvent.setup()
    const onRequestLogin = vi.fn()
    render(<LandingPage onRequestLogin={onRequestLogin} />)

    const header = screen.getByRole("banner")
    await user.click(within(header).getByRole("button", { name: "Entrar na conta" }))

    expect(onRequestLogin).toHaveBeenCalledTimes(1)
  })

  it("chama onRequestLogin ao clicar em Fazer login", async () => {
    const user = userEvent.setup()
    const onRequestLogin = vi.fn()
    render(<LandingPage onRequestLogin={onRequestLogin} />)

    await user.click(screen.getByRole("button", { name: "Fazer login" }))

    expect(onRequestLogin).toHaveBeenCalledTimes(1)
  })

  it("abre o menu mobile e fecha com Escape devolvendo o foco ao botão", async () => {
    const user = userEvent.setup()
    render(<LandingPage onRequestLogin={() => {}} />)

    const menuButton = screen.getByRole("button", { name: "Abrir menu de navegação" })
    await user.click(menuButton)

    expect(menuButton).toHaveAttribute("aria-expanded", "true")
    const panel = document.getElementById("menu-landing")
    expect(panel).not.toBeNull()
    expect(within(panel as HTMLElement).getByRole("link", { name: "Início" })).toHaveFocus()

    await user.keyboard("{Escape}")

    expect(menuButton).toHaveAttribute("aria-expanded", "false")
    expect(menuButton).toHaveFocus()
  })
})
