// Smoke test do bootstrap de testes do client:
// prova que jsdom + @testing-library/react + user-event + jest-dom funcionam
// juntos (sem depender de páginas/features que outros agentes estão alterando).
import { describe, it, expect } from "vitest"
import { useState } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

function Counter() {
  const [count, setCount] = useState(0)
  return (
    <div>
      <p>{count}</p>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        Incrementar
      </button>
    </div>
  )
}

describe("bootstrap Testing Library (smoke)", () => {
  it("renderiza um componente e interage por clique", async () => {
    const user = userEvent.setup()
    render(<Counter />)

    expect(screen.getByText("0")).toBeInTheDocument()
    const button = screen.getByRole("button", { name: "Incrementar" })
    expect(button).toBeInTheDocument()

    await user.click(button)
    await user.click(button)

    expect(screen.getByText("2")).toBeInTheDocument()
  })

  it("cleanup entre testes: o contador anterior não vaza", () => {
    render(<Counter />)
    expect(screen.getByText("0")).toBeInTheDocument()
  })
})