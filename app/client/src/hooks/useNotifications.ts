import { useCallback, useEffect, useMemo, useRef } from "react"
import type { Notification } from "@shared/types"
import { api, ApiError } from "../lib/api"
import { useAsync } from "./useAsync"

export interface NotificationsController {
  notifications: Notification[]
  unreadCount: number
  loading: boolean
  error: string | null
  reload: () => void
  markAllRead: () => Promise<void>
  markRead: (id: string) => Promise<void>
  acknowledgeTransients: () => Promise<void>
}

/**
 * Notificações do usuário logado + ações de leitura (RF10).
 *
 * Regra da 3.3 que o client precisa respeitar: o `GET` é **puro** (não apaga,
 * não marca) e quem consome a transitória é o **acuse** (`PATCH`), chamado
 * DEPOIS de exibir. Por isso o `GET` sozinho não pode "limpar" a tela: quem
 * decide o que sai da lista é o servidor, e a lista volta a ser buscada
 * (`reload`) depois de cada acuse — nunca filtrada por conta própria.
 */
export function useNotifications(): NotificationsController {
  const { data, error, loading, reload } = useAsync<Notification[]>(
    useCallback(() => api.get<Notification[]>("/api/notifications"), []),
    [],
  )

  const notifications = useMemo(() => data ?? [], [data])

  // A lista que está na tela agora. As ações leem daqui em vez de receber
  // argumento, para que o hook seja o dono de "o que já foi acusado" — é o que
  // fecha o R36 (o clique manual e o acuse automático não chamam o mesmo PATCH).
  const listaRef = useRef<Notification[]>([])
  useEffect(() => {
    listaRef.current = notifications
  }, [notifications])

  /**
   * Ids cujo acuse o servidor JÁ confirmou.
   *
   * NÃO é fonte de verdade da tela nem do contador: os dois vêm do `GET`. É
   * apenas a trava de idempotência — sem ela, o clique manual numa transitória
   * que o automático já consumiu geraria uma segunda auditoria e um 404.
   */
  const acusadas = useRef<Set<string>>(new Set())
  /** Acuses em voo: impedem duas chamadas concorrentes para o mesmo id. */
  const emVoo = useRef<Set<string>>(new Set())

  /** Não lidas do SERVIDOR — o contador antigo usava um `Set` local e divergia. */
  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications])

  /** Acusa tudo: transitórias somem, persistentes viram lidas (3.3). */
  const markAllRead = useCallback(async () => {
    const alvo = listaRef.current
    try {
      await api.patch<{ ok: boolean }>("/api/notifications/read")
    } catch (err) {
      throw err instanceof Error ? err : new Error("Falha ao confirmar a leitura das notificações.")
    }
    // Sucesso = o servidor já respondeu por tudo que estava na tela. Marcar aqui
    // evita que o clique manual em um item posterior refaça o acuse dele (R36).
    for (const n of alvo) acusadas.current.add(n.id)
    reload()
  }, [reload])

  /** Acusa UMA notificação e volta a lista do servidor. */
  const markRead = useCallback(async (id: string) => {
    // `emVoo` também é trava (MINOR-1): o clique manual durante o acuse em voo
    // dispararia um segundo PATCH para o mesmo id — o R36 cobria o pós-sucesso
    // (via `acusadas`), mas a janela entre o pedido sair e a resposta voltar
    // ficava aberta.
    if (acusadas.current.has(id) || emVoo.current.has(id)) return
    emVoo.current.add(id)
    try {
      await api.patch<{ ok: boolean }>(`/api/notifications/${id}/read`)
    } catch (err) {
      // 404 = ela já saiu da lista (o acuse automático consumiu): reconcilia em
      // silêncio. Mostrar erro aqui seria culpar o aluno por um 404 que ele não
      // provocou — e é o 404 que o R36 existia para evitar.
      if (err instanceof ApiError && err.status === 404) {
        reload()
        return
      }
      throw err instanceof Error ? err : new Error("Falha ao marcar notificação como lida.")
    } finally {
      emVoo.current.delete(id)
    }
    acusadas.current.add(id)
    reload()
  }, [reload])

  /**
   * Acusa as transitórias que estão **na tela** e recarrega (RF10/Review Focus 5).
   *
   * Sem o `reload`, a notificação que o servidor acabou de apagar ficaria
   * presa na tela — o defeito que o R35 registrava. Sem o `acusadas`, o clique
   * manual duplicaria o acuse (R36).
   */
  const acknowledgeTransients = useCallback(async () => {
    const alvos = listaRef.current.filter(
      (n) => n.transient && !n.read && !acusadas.current.has(n.id) && !emVoo.current.has(n.id),
    )
    if (alvos.length === 0) return
    for (const n of alvos) emVoo.current.add(n.id)

    const confirmadas = await Promise.all(
      alvos.map(async (n) => {
        try {
          await api.patch<{ ok: boolean }>(`/api/notifications/${n.id}/read`)
          acusadas.current.add(n.id)
          return true
        } catch (err) {
          // 404 = outra aba/instância já consumiu a transitória (R35/Important 2):
          // o servidor é o dono da verdade e diz que o item não existe mais. É
          // uma confirmação de SUMIÇO, então recarregar remove o fantasma da
          // tela. NÃO marca em `acusadas` (quem consumiu foi a outra aba) mas
          // também não mostra erro: o aluno não fez nada de errado.
          if (err instanceof ApiError && err.status === 404) return true
          // Falhou (rede/500): a notificação continua na lista e fica apta a
          // uma nova tentativa no próximo acuse ou no clique do usuário. Não
          // entra em `acusadas`, senão o item ficaria preso na tela para sempre.
          return false
        } finally {
          emVoo.current.delete(n.id)
        }
      }),
    )

    // Só recarrega se algo saiu da lista: um reload a cada falha viraria
    // requisição em laço.
    if (confirmadas.some(Boolean)) reload()
  }, [reload])

  return { notifications, unreadCount, loading, error, reload, markAllRead, markRead, acknowledgeTransients }
}
