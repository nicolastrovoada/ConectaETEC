// Banco falso de notificações para os testes do client.
//
// Reproduz a regra do servidor da 3.3 (que o client precisa respeitar):
//   - `GET /api/notifications` é PURO (não apaga, não marca);
//   - `PATCH /api/notifications/:id/read` apaga a TRANSITÓRIA e marca a
//     PERSISTENTE — e responde 404 se ela já não existe mais (outra aba
//     consumiu, ou já foi lida);
//   - `PATCH /api/notifications/read` faz as duas coisas em lote.
//
// Fica num módulo só porque dois arquivos de teste dependem dele (a tela e o
// sino do `Layout`) e duplicar o "banco" faria os dois julgarem coisas
// diferentes.
import { http, HttpResponse } from "msw"
import type { Notification } from "@shared/types"

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

/** Transitória: some sozinha depois de aparecer (3.3, `TRANSIENT_BY_TYPE`). */
export const APROVADA = aviso({
  id: "n1",
  type: "activity_approved",
  transient: true,
  title: "Atividade aprovada!",
  message: "Você ganhou +15 pts em Regra dos três.",
  createdAt: "29/09/2026, 10:00:00",
})
/** Persistente: é uma obrigação do aluno, fica até ele ler. */
export const CORRECAO = aviso({
  id: "n2",
  type: "activity_revision",
  transient: false,
  title: "Correção solicitada",
  message: "O professor pediu um ajuste na sua entrega.",
  createdAt: "29/09/2026, 09:00:00",
})
export const NOVA_ATIVIDADE = aviso({
  id: "n3",
  type: "new_activity",
  transient: false,
  title: "Nova atividade publicada",
  message: "História — Resumo do século XX.",
  createdAt: "29/09/2026, 08:00:00",
})
/** Aviso institucional: persistente e da coordenação (categoria própria na tela). */
export const AVISO_COORD = aviso({
  id: "n4",
  type: "coord_notice",
  transient: false,
  title: "Aviso: reunião de pais",
  message: "Sexta-feira, 19h, na biblioteca.",
  createdAt: "29/09/2026, 07:00:00",
})

/** Lista padrão: a mais recente primeiro, como o `ORDER BY rowid DESC` do servidor. */
export const LISTA_PADRAO: Notification[] = [APROVADA, CORRECAO, NOVA_ATIVIDADE, AVISO_COORD]

export interface NotificationsBanco {
  /** A lista que o "servidor" tem agora (o `GET` devolve isto). */
  lista: Notification[]
  /** Ids que chegaram em `PATCH /api/notifications/:id/read`, na ordem das chamadas. */
  acusesIndividuais: string[]
  /** Quantas vezes o "banco" recebeu o acuse em lote. */
  acusesEmLote: number
  /** Quantas vezes o "banco" devolveu a lista. */
  listagens: number
  /** Substitui a lista do "servidor" (a ordem devolvida é a que está no array). */
  definirLista: (lista: Notification[]) => void
  /**
   * Simula outra aba (ou outro cliente) consumindo a notificação: ela some do
   * "servidor" sem o client saber. O `GET` já devolvido continua com ela na tela
   * (o `GET` é puro), e o próximo `PATCH` leva 404 — o cenário do R35.
   */
  removerComoSeOutraAbaTivesseConsumido: (id: string) => void
  /** Segura a listagem `alvo` (1-based, a partir da próxima) até `soltarListagem()`. */
  segurarListagem: (alvo?: number) => void
  soltarListagem: () => void
  /** Segura a RESPOSTA do próximo acuse individual, para simular o PATCH em voo. */
  segurarAcuse: () => void
  soltarAcuse: () => void
  /** Handlers para `server.use(...)`. */
  handlers: ReturnType<typeof criarHandlers>
}

function criarHandlers(estado: {
  lista: Notification[]
  acusesIndividuais: string[]
  acusesEmLote: number
  listagens: number
  travaListagem: Promise<void> | null
  listagemAlvo: number
  travaAcuse: Promise<void> | null
}) {
  return [
    // `GET` PURO (R33): devolve e não mexe em nada.
    http.get("/api/notifications", async () => {
      estado.listagens += 1
      // Só segura a listagem pedida: a PRIMEIRA tem que passar para a tela
      // desenhar, senão não há item nenhum na tela para clicar.
      if (estado.travaListagem && estado.listagens >= estado.listagemAlvo) await estado.travaListagem
      return HttpResponse.json({ data: estado.lista })
    }),
    // Registrado ANTES do `/:id/read` para o "/read" não ser lido como um id.
    http.patch("/api/notifications/read", () => {
      estado.acusesEmLote += 1
      estado.lista = estado.lista
        .filter((n) => !n.transient)
        .map((n) => (n.read ? n : { ...n, read: true }))
      return HttpResponse.json({ data: { ok: true } })
    }),
    http.patch("/api/notifications/:id/read", async ({ params }) => {
      const id = String(params.id)
      estado.acusesIndividuais.push(id)
      // O pedido já chegou: a partir daqui a chamada está EM VOO, que é a janela
      // em que um clique manual não pode disparar uma segunda chamada.
      if (estado.travaAcuse) await estado.travaAcuse
      const alvo = estado.lista.find((n) => n.id === id)
      if (!alvo) return HttpResponse.json({ error: "Notificação não encontrada." }, { status: 404 })
      estado.lista = estado.lista
        .filter((n) => n.id !== id || !n.transient)
        .map((n) => (n.id === id ? { ...n, read: true } : n))
      return HttpResponse.json({ data: { ok: true } })
    }),
  ]
}

/** Cria um banco novo (isolado) para cada teste. */
export function criarBancoNotificacoes(listaInicial: Notification[] = LISTA_PADRAO): NotificationsBanco {
  const estado = {
    lista: [...listaInicial],
    acusesIndividuais: [] as string[],
    acusesEmLote: 0,
    listagens: 0,
    travaListagem: null as Promise<void> | null,
    listagemAlvo: 0,
    travaAcuse: null as Promise<void> | null,
  }

  /** Resolve as travas criadas abaixo. */
  let soltarListagem: () => void = () => undefined
  let soltarAcuse: () => void = () => undefined

  return {
    get lista() {
      return estado.lista
    },
    get acusesIndividuais() {
      return estado.acusesIndividuais
    },
    get acusesEmLote() {
      return estado.acusesEmLote
    },
    get listagens() {
      return estado.listagens
    },
    definirLista: (lista) => {
      estado.lista = lista
    },
    removerComoSeOutraAbaTivesseConsumido: (id) => {
      estado.lista = estado.lista.filter((n) => n.id !== id || !n.transient)
    },
    segurarListagem: (alvo = 2) => {
      estado.listagemAlvo = estado.listagens + alvo
      estado.travaListagem = new Promise<void>((resolve) => {
        soltarListagem = () => {
          estado.travaListagem = null
          resolve()
        }
      })
    },
    soltarListagem: () => {
      soltarListagem()
    },
    segurarAcuse: () => {
      estado.travaAcuse = new Promise<void>((resolve) => {
        soltarAcuse = () => {
          estado.travaAcuse = null
          resolve()
        }
      })
    },
    soltarAcuse: () => {
      soltarAcuse()
    },
    handlers: criarHandlers(estado),
  }
}
