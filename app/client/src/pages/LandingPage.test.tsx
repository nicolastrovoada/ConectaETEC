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

  it("oferece um único CTA de acesso no header e abre o login", async () => {
    const user = userEvent.setup()
    const onRequestLogin = vi.fn()
    render(<LandingPage onRequestLogin={onRequestLogin} />)

    const header = screen.getByRole("banner")
    const accessButtons = within(header)
      .getAllByRole("button")
      .filter((button) => /entrar|fazer login/i.test(button.textContent ?? ""))

    expect(accessButtons).toHaveLength(1)
    expect(screen.queryByRole("button", { name: "Fazer login" })).not.toBeInTheDocument()

    await user.click(accessButtons[0])

    expect(onRequestLogin).toHaveBeenCalledTimes(1)
  })

  it("oferece um único CTA de acesso no menu mobile", async () => {
    const user = userEvent.setup()
    render(<LandingPage onRequestLogin={() => {}} />)

    await user.click(screen.getByRole("button", { name: "Abrir menu de navegação" }))

    const panel = document.getElementById("menu-landing") as HTMLElement
    const accessButtons = within(panel)
      .getAllByRole("button")
      .filter((button) => /entrar|fazer login/i.test(button.textContent ?? ""))

    expect(accessButtons).toHaveLength(1)
    expect(within(panel).queryByRole("button", { name: "Fazer login" })).not.toBeInTheDocument()
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
