// Testes da tela de Notificações (V3, 3.4 — R35/R36).
// Mesma pilha dos demais testes de client: Testing Library + MSW sobre o wrapper
// real `src/lib/api.ts`. O "banco" falso é o `notificationsBanco` compartilhado
// com o teste do sino do `Layout` (os dois julgam a mesma fonte de verdade):
//   - `GET /api/notifications` é PURO (não apaga, não marca);
//   - `PATCH /api/notifications/:id/read` apaga a TRANSITÓRIA e marca a
//     PERSISTENTE (404 se ela já não existe mais);
//   - `PATCH /api/notifications/read` faz as duas coisas em lote.
// É esse banco que julga o client: se a tela mostrar um item que o servidor já
// apagou, o defeito é do client (é o R35).
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { setupServer } from "msw/node"
import type { Notification } from "@shared/types"
import { NotificationsView } from "./NotificationsView"
import { NotificationsProvider } from "../../context/NotificationsContext"
import { ToastProvider } from "../../context/ToastContext"
import { ToastHost } from "../../components/ui/Toast"
import {
  AVISO_COORD,
  APROVADA,
  CORRECAO,
  NOVA_ATIVIDADE,
  criarBancoNotificacoes,
  type NotificationsBanco,
} from "../../test/notificationsBanco"

const server = setupServer()

function aviso(over: Partial<Notification> & Pick<Notification, "id" | "title" | "type">): Notification {
  return {
    userId: "u-aluno",
    message: "Mensagem de exemplo da notificação.",
    read: false,
    transient: false,
    relatedActivityId: null,
    createdAt: "29/09/2026, 09:00:00",
    ...over,
  }
}

let banco: NotificationsBanco

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))

beforeEach(() => {
  banco = criarBancoNotificacoes()
  server.use(...banco.handlers)
})

afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function renderView() {
  return render(
    // A tela consome o MESMO controller que o sino do `Layout` (fonte única):
    // o provider é o mesmo que o `App` monta acima do painel.
    <NotificationsProvider>
      <ToastProvider>
        <NotificationsView />
        {/* o app real monta o ToastHost ao lado da tela (App.tsx) */}
        <ToastHost />
      </ToastProvider>
    </NotificationsProvider>,
  )
}

/**
 * A transitória fica na tela um instante antes do acuse automático (o usuário
 * precisa ter tempo de LER a mensagem antes dela sair). O limite cobre a
 * permanência + a ida e volta da API, não um tempo arbitrário.
 */
async function esperarTransitoriaSumir(texto: string) {
  await waitFor(() => expect(screen.queryByText(texto)).not.toBeInTheDocument(), { timeout: 3000 })
}

/**
 * Deixa passar `ms` de relógio real.
 *
 * Existe para provar a PERMANÊNCIA (o tempo de leitura), não o sumiço: um
 * `setTimeout(0)` também faz a transitória sumir sozinha, e mesmo assim o aluno
 * perderia "+15 pts" antes de conseguir ler. O limite é bem menor que a
 * permanência real, então o teste não fica lento nem disputa a janela.
 */
function esperar(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/** Os dois grupos nomeados da tela (a ordem é a da renderização). */
async function acharGrupos() {
  const grupos = await screen.findAllByRole("region")
  const avisos = grupos.find((g) => g.getAttribute("aria-labelledby") === "notificacoes-coordenacao")
  const novidades = grupos.find((g) => g.getAttribute("aria-labelledby") === "notificacoes-novidades")
  if (!avisos || !novidades) {
    throw new Error("A tela não renderizou os dois grupos nomeados (coordenação e novidades).")
  }
  return { avisos, novidades }
}

describe("Notificações — transitória some sozinha e aviso da coordenação (3.4)", () => {
  it("a transitória aparece e some sozinha depois, sem clique do usuário (Review Focus 5)", async () => {
    renderView()

    // Ela aparece: o `GET` puro devolve o que o banco tem.
    expect(await screen.findByText("Atividade aprovada!")).toBeInTheDocument()
    expect(await screen.findByText("Você ganhou +15 pts em Regra dos três.")).toBeInTheDocument()

    // E fica um instante: sem este tempo de leitura o aluno perderia "+15 pts"
    // antes de conseguir ver, que é o defeito que a permanência evita.
    await esperar(400)
    expect(screen.getByText("Atividade aprovada!")).toBeInTheDocument()
    expect(banco.acusesIndividuais).toEqual([])

    // Some sozinha — nenhum `userEvent` neste teste.
    await esperarTransitoriaSumir("Atividade aprovada!")

    // O desaparecimento veio do acuse do client (1 chamada, 1 só) E de uma
    // nova listagem: a tela não pode filtrar o item morto por conta própria.
    expect(banco.acusesIndividuais).toEqual([APROVADA.id])
    expect(banco.listagens).toBeGreaterThanOrEqual(2)

    // O que é persistente continua na tela, ainda não lido (ninguém clicou).
    expect(screen.getByText("Correção solicitada")).toBeInTheDocument()
    const { avisos, novidades } = await acharGrupos()
    expect(within(avisos).getByText("1 não lida")).toBeInTheDocument()
    expect(within(novidades).getByText("2 não lidas")).toBeInTheDocument()
    expect(screen.queryByText("Você está em dia 🎉")).not.toBeInTheDocument()
  })

  it("a persistente fica na lista depois do acuse, marcada como lida, e o contador acompanha", async () => {
    const user = userEvent.setup()
    renderView()

    const item = await screen.findByRole("button", { name: /Correção solicitada/ })
    expect(within(item).getByText("Não lida")).toBeInTheDocument()
    // A transitória sai sozinha primeiro: o contador só pode Refletir o servidor.
    await esperarTransitoriaSumir("Atividade aprovada!")

    await user.click(screen.getByRole("button", { name: /Correção solicitada/ }))

    // A persistente NÃO some: o servidor só a marcou como lida.
    const depois = await screen.findByRole("button", { name: /Correção solicitada/ })
    expect(within(depois).getByText("Lida")).toBeInTheDocument()
    expect(screen.getByText("O professor pediu um ajuste na sua entrega.")).toBeInTheDocument()

    // O contador de cada grupo acompanha: sobrou 1 não lida na coordenação
    // (o aviso) e 1 no resto (a nova atividade).
    const { avisos, novidades } = await acharGrupos()
    expect(within(avisos).getByText("1 não lida")).toBeInTheDocument()
    expect(within(novidades).getByText("1 não lida")).toBeInTheDocument()
    expect(screen.getByText("2 não lidas")).toBeInTheDocument()
    // Ainda não está "em dia": sobrou o que o aluno não leu.
    expect(screen.queryByText("Você está em dia 🎉")).not.toBeInTheDocument()
    // Dois acuses, um por notificação: o automático da transitória (n1) e o
    // clique do aluno na persistente (n2) — cada um chamando o servidor uma vez.
    expect(banco.acusesIndividuais).toEqual([APROVADA.id, CORRECAO.id])
  })

  it("clicar em item já acusado automaticamente não duplica a chamada nem mostra erro (R36)", async () => {
    const user = userEvent.setup()
    // A listagem de reconciliação fica presa: o item permanece na tela já
    // acusado — exatamente a janela em que o clique manual podia duplicar o PATCH.
    banco.segurarListagem()
    renderView()

    expect(await screen.findByText("Atividade aprovada!")).toBeInTheDocument()
    await waitFor(() => expect(banco.acusesIndividuais).toEqual([APROVADA.id]), { timeout: 3000 })
    expect(screen.getByRole("button", { name: /Atividade aprovada!/ })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /Atividade aprovada!/ }))

    // Nenhuma segunda chamada (o 404 seria o "erro invisível" e a auditoria duplicada).
    expect(banco.acusesIndividuais).toEqual([APROVADA.id])
    // E nada de toast de erro na tela.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.queryByText(/Falha/)).not.toBeInTheDocument()

    banco.soltarListagem()
    await esperarTransitoriaSumir("Atividade aprovada!")
    expect(banco.acusesIndividuais).toEqual([APROVADA.id])
  })

  it("o clique manual durante o acuse EM VOO também não duplica a chamada (R36, MINOR-1)", async () => {
    const user = userEvent.setup()
    // O PATCH automático fica preso no servidor (EM VOO): é a janela entre o
    // pedido sair e a resposta voltar — o clique manual não pode disparar um
    // segundo PATCH para o mesmo id só porque a resposta ainda não chegou.
    banco.segurarAcuse()
    renderView()

    expect(await screen.findByText("Atividade aprovada!")).toBeInTheDocument()
    await waitFor(() => expect(banco.acusesIndividuais).toEqual([APROVADA.id]), { timeout: 3000 })

    await user.click(screen.getByRole("button", { name: /Atividade aprovada!/ }))

    expect(banco.acusesIndividuais).toEqual([APROVADA.id])
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()

    banco.soltarAcuse()
    await esperarTransitoriaSumir("Atividade aprovada!")
    expect(banco.acusesIndividuais).toEqual([APROVADA.id])
  })

  it("o acuse automático com 404 (item já consumido em outra aba) reconcilia a lista (R35, Important 2)", async () => {
    renderView()

    expect(await screen.findByText("Atividade aprovada!")).toBeInTheDocument()

    // Outra aba com o mesmo aluno já consumiu a transitória: no servidor ela
    // não existe mais, mas o GET puro já tinha devolvido para esta tela. O
    // acuse automático chega atrasado e leva 404.
    banco.removerComoSeOutraAbaTivesseConsumido(APROVADA.id)

    // O client trata o 404 como "confirmada em outro lugar": recarrega (a
    // próxima GET não tem mais o item) em vez de deixar o fantasma na tela.
    await esperarTransitoriaSumir("Atividade aprovada!")
    expect(banco.acusesIndividuais).toEqual([APROVADA.id])
    expect(banco.listagens).toBeGreaterThanOrEqual(2)
    // E nada de toast de erro: o 404 aqui não é culpa do aluno.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("o botão de acuse em lote diz o que faz e some com as transitórias (R35)", async () => {
    const user = userEvent.setup()
    renderView()

    // A copy antiga prometia menos do que o botão faz: ele também REMOVE as
    // transitórias, então "Marcar todas como lidas" não pode mais existir.
    const botao = await screen.findByRole("button", { name: "Confirmar leitura de tudo" })
    expect(screen.queryByText(/Marcar todas como lidas/)).not.toBeInTheDocument()

    await user.click(botao)

    expect(banco.acusesEmLote).toBe(1)
    // Transitória removida, persistente marcada — e a lista reconciliada.
    await esperarTransitoriaSumir("Atividade aprovada!")
    const correcao = await screen.findByRole("button", { name: /Correção solicitada/ })
    expect(within(correcao).getByText("Lida")).toBeInTheDocument()
    expect(await screen.findByText("Você está em dia 🎉")).toBeInTheDocument()
    // E a confirmação é dita ao usuário (a copy antiga mentia sobre o resultado).
    expect(await screen.findByText(/Leitura confirmada/)).toBeInTheDocument()
  })

  it("o sumiço vindo do próprio acuse em lote não é anunciado duas vezes (toast basta, MINOR-4)", async () => {
    const user = userEvent.setup()
    renderView()

    // Espera a lista desmontar o skeleton (que também é `role="status"`), para
    // a região viva ser a ÚNICA `status` na tela no momento da captura.
    expect(await screen.findByRole("button", { name: /Correção solicitada/ })).toBeInTheDocument()
    const live = screen.getByRole("status")
    expect(live).toBeEmptyDOMElement()

    await user.click(await screen.findByRole("button", { name: "Confirmar leitura de tudo" }))

    // O toast já contou a história do clique ("Leitura confirmada"); a região
    // viva não pode repetir o sumiço da transitória — seria o mesmo evento
    // anunciado duas vezes.
    expect(await screen.findByText(/Leitura confirmada/)).toBeInTheDocument()
    await esperarTransitoriaSumir("Atividade aprovada!")
    expect(live).toBeEmptyDOMElement()
  })

  it("os avisos da coordenação formam a primeira categoria, na ordem do servidor", async () => {
    const AVISO_ANTIGO = aviso({
      id: "n5",
      type: "coord_notice",
      transient: false,
      title: "Aviso: feriado na quinta",
      message: "Não haverá aula na quinta-feira.",
      createdAt: "28/09/2026, 18:00:00",
    })
    const LIDA = aviso({
      id: "n6",
      type: "coord_notice",
      transient: false,
      read: true,
      title: "Aviso: enquete de acompanhamento",
      message: "Responda até sexta.",
      createdAt: "28/09/2026, 17:00:00",
    })
    // A lista do servidor é uma coisa só; as categorias são do client, e não
    // podem reordenar o que já veio pronto. A ordem abaixo é propositalmente
    // NÃO alfabética e NÃO por data: se a tela reordenasse, a prova quebraria.
    banco.definirLista([AVISO_COORD, NOVA_ATIVIDADE, AVISO_ANTIGO, CORRECAO, LIDA])
    renderView()

    const [avisos, novidades] = await screen.findAllByRole("region")
    expect(avisos).toHaveAccessibleName("Avisos da coordenação")
    expect(novidades).toHaveAccessibleName("Atividades e novidades")

    // Dentro do grupo: a ordem é a do servidor, não alfabética nem por tipo.
    const itensAviso = within(avisos).getAllByRole("listitem")
    expect(within(itensAviso[0]).getByText("Aviso: reunião de pais")).toBeInTheDocument()
    expect(within(itensAviso[1]).getByText("Aviso: feriado na quinta")).toBeInTheDocument()
    // O aviso já lido fica visível (é persistente) e não conta como não lida.
    expect(within(itensAviso[2]).getByText("Lida")).toBeInTheDocument()
    expect(within(avisos).getByText("2 não lidas")).toBeInTheDocument()

    // O grupo seguinte traz o resto, também na ordem do servidor.
    const itensNovidade = within(novidades).getAllByRole("listitem")
    expect(within(itensNovidade[0]).getByText("Nova atividade publicada")).toBeInTheDocument()
    expect(within(itensNovidade[1]).getByText("Correção solicitada")).toBeInTheDocument()

    // Nada de notificação persistente sumindo por efeito da categorização.
    expect(banco.listagens).toBe(1)
    expect(banco.acusesIndividuais).toEqual([])
    expect(banco.acusesEmLote).toBe(0)
  })

  it("o aviso da coordenação não usa a cor do professor, e o texto diz o que ele é", async () => {
    renderView()

    const item = await screen.findByRole("button", { name: /Aviso: reunião de pais/ })
    const icone = within(item).getByText("📢")
    // A coordenação é laranja/vermelho no design system (`ROLE_THEME.coordinator`),
    // nunca o roxo do professor — e o `aria-hidden` mantém a cor decorativa.
    expect(icone).toHaveClass("bg-gradient-to-br", "from-orange-500", "to-red-600")
    expect(icone).not.toHaveClass("bg-purple-100")
    expect(icone).toHaveAttribute("aria-hidden", "true")
    // O tipo também é dito por texto, então a cor nunca é o único indício (WCAG 1.4.1).
    expect(screen.getByRole("region", { name: "Avisos da coordenação" })).toBeInTheDocument()
  })

  it("o sumiço da transitória é anunciado para o leitor de tela (aria-live)", async () => {
    renderView()

    expect(await screen.findByText("Atividade aprovada!")).toBeInTheDocument()
    // A região viva já está no DOM (vazia) quando o item some: é assim que o
    // leitor de tela percebe a mudança em vez de perdê-la em silêncio.
    const live = screen.getByRole("status")
    expect(live).toHaveAttribute("aria-live", "polite")
    expect(live).toBeEmptyDOMElement()

    await esperarTransitoriaSumir("Atividade aprovada!")

    // `waitFor` pelo mesmo motivo do teste anterior: o anúncio vem do efeito que
    // compara a lista antiga com a nova, ou seja, um passo depois do sumiço.
    await waitFor(() => {
      expect(live).toHaveTextContent(/Atividade aprovada!/)
      expect(live).toHaveTextContent(/saiu da lista/)
    })
  })

  it("a lista não pisca: reconciliar mantém o que está na tela até o servidor responder", async () => {
    banco.segurarListagem()
    renderView()

    expect(await screen.findByText("Atividade aprovada!")).toBeInTheDocument()
    // A 2ª `GET` está presa: o acuse já aconteceu, mas a resposta não. Durante
    // essa janela a lista continua montada (sem skeleton, sem tela vazia) e a
    // região viva também — se ela fosse desmontada, o anúncio do sumiço sumiria.
    await waitFor(() => expect(banco.acusesIndividuais).toEqual([APROVADA.id]), { timeout: 3000 })
    expect(screen.getByText("Correção solicitada")).toBeInTheDocument()
    expect(screen.queryByText(/Carregando notificações/)).not.toBeInTheDocument()
    expect(screen.getByRole("status")).toBeInTheDocument()

    banco.soltarListagem()
    await esperarTransitoriaSumir("Atividade aprovada!")
    // `waitFor`: o anúncio é um efeito que roda DEPOIS do commit que remove o
    // item, então ele não existe no instante em que o item some.
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/saiu da lista/))
  })
})