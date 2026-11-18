import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { LandingPage } from "../../pages/LandingPage"

describe("LandingPage sections (Fase 2)", () => {
  it("renderiza âncoras e títulos principais das seções intermediárias", () => {
    const { container } = render(<LandingPage onRequestLogin={() => {}} />)

    const expected = [
      { id: "sobre", name: "Tudo começou com uma necessidade real." },
      { id: "solucao", name: "Uma plataforma. Diferentes possibilidades. Um objetivo em comum." },
      { id: "funcionalidades", name: "Tudo o que a rotina escolar precisa, conectado em um só lugar." },
      { id: "para-quem", name: "Quatro perfis, uma mesma conexão." },
      { id: "como-funciona", name: "Da atividade à conquista." },
      { id: "gamificacao", name: "Participar também pode ser uma conquista." },
      { id: "desenvolvimento", name: "Uma ideia construída a partir da realidade escolar." },
      { id: "tecnologia", name: "Por trás de uma experiência integrada." },
      { id: "estado-atual", name: "Um projeto em evolução." },
      { id: "contato", name: "Vamos manter essa conexão?" },
    ]

    for (const section of expected) {
      expect(container.querySelector(`#${section.id}`)).not.toBeNull()
      expect(screen.getByRole("heading", { level: 2, name: section.name })).toBeInTheDocument()
    }
  })
})