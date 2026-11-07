// Setup global de testes do client (Vitest + jsdom + Testing Library).
// Carregado via `setupFiles` em client/vite.config.ts (bloco `test`).

import "@testing-library/jest-dom/vitest"
import { afterEach } from "vitest"
import { cleanup } from "@testing-library/react"

// Desmonta componentes entre os testes (o auto-cleanup do RTL também funciona
// com `globals: true`, mas garantimos explicitamente).
afterEach(() => {
  cleanup()
})

// Resolve URLs relativas como o navegador faz (contra a origem atual do jsdom).
// Necessário porque `src/lib/api.ts` chama `fetch(path)` com a mesma forma
// relativa usada em produção (ex.: "/api/activities"), e o `fetch` do Node
// (undici) rejeita URL relativa — o que impediria testes com MSW via `api.get`.
const realFetch = globalThis.fetch
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  if (typeof input === "string" && input.startsWith("/")) {
    return realFetch(new URL(input, "http://localhost:3000").toString(), init)
  }
  return realFetch(input, init)
}) as typeof fetch

// Nota: não é necessário mock de `window.matchMedia` — PreferencesContext usa
// apenas `localStorage`/`document`, e nenhum componente do client usa matchMedia
// hoje (verificado em src/). Se um futuro componente usar, adicionar aqui:
//
// Object.defineProperty(window, "matchMedia", {
//   writable: true,
//   value: (query: string) => ({
//     matches: false,
//     media: query,
//     onchange: null,
//     addListener: () => {},
//     removeListener: () => {},
//     addEventListener: () => {},
//     removeEventListener: () => {},
//     dispatchEvent: () => false,
//   }),
// })