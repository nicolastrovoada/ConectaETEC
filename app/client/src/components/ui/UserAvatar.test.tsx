import { describe, it, expect } from "vitest"
import { fireEvent, render } from "@testing-library/react"
import { UserAvatar } from "./UserAvatar"

describe("UserAvatar", () => {
  it("renderiza a foto quando o avatar é uma URL de upload", () => {
    const { container } = render(
      <UserAvatar user={{ name: "Ana Souza", avatar: "/uploads/avatars/foto.png" }} />,
    )
    const img = container.querySelector("img")
    expect(img).not.toBeNull()
    expect(img?.getAttribute("src")).toBe("/uploads/avatars/foto.png")
    expect(container.textContent).toBe("")
  })

  it("renderiza a letra quando o avatar não é uma foto", () => {
    const { container } = render(<UserAvatar user={{ name: "Ana Souza", avatar: "AS" }} />)
    expect(container.querySelector("img")).toBeNull()
    expect(container.textContent).toBe("AS")
  })

  it("cai para a letra inicial quando a imagem falha ao carregar", () => {
    const { container } = render(
      <UserAvatar user={{ name: "Ana Souza", avatar: "/uploads/avatars/sumiu.png" }} />,
    )
    const img = container.querySelector("img")
    expect(img).not.toBeNull()

    fireEvent.error(img as HTMLImageElement)

    expect(container.querySelector("img")).toBeNull()
    expect(container.textContent).toBe("A")
  })
})
