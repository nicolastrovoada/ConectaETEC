import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { LoginPage } from "./LoginPage"

describe("LoginPage", () => {
  it("não oferece atalhos de contas demo que não existem no backend", () => {
    render(<LoginPage onLogin={vi.fn()} />)

    expect(screen.queryByText(/senha de todos os perfis/)).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Aluno" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Professor" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Funcionário" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Coordenação" })).not.toBeInTheDocument()
  })
})
