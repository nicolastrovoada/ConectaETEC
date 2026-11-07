// Estado de notificações do usuário logado (RF10).
//
// Este é o ÚNICO dono da lista: a tela de notificações E o sino do `Layout`
// consomem o mesmo controller (via `NotificationsProvider`), para que o badge do
// sino não possa divergir do que está na tela. Nenhum consumidor chama `api`
// por conta própria — quem busca a lista, e quem reconcileia depois de um
// acuse, é este módulo.
import { createContext, useContext, type ReactNode } from "react"
import { useNotifications, type NotificationsController } from "../hooks/useNotifications"

const NotificationsContext = createContext<NotificationsController | null>(null)

/**
 * Uma instância do hook para a sessão inteira do painel.
 *
 * Fica no `App` (e não na tela) porque o sino vive no `Layout`, que monta antes
 * de qualquer página: se o provider ficasse na `NotificationsView`, o sino
 * continuaria com a cópia congelada e o defeito do badge mentiroso voltaria.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  return <NotificationsContext.Provider value={useNotifications()}>{children}</NotificationsContext.Provider>
}

export function useNotificationsController(): NotificationsController {
  const ctx = useContext(NotificationsContext)
  if (!ctx) throw new Error("useNotificationsController deve ser usado dentro de NotificationsProvider")
  return ctx
}
