import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Notification, NotificationType } from "@shared/types"
import { useNotificationsController } from "../../context/NotificationsContext"
import { useToast } from "../../context/ToastContext"
import { Badge } from "../../components/ui/Badge"
import { Button } from "../../components/ui/Button"
import { Card, SectionHeader } from "../../components/ui/Card"
import { EmptyState, ErrorState, LoadingBlock } from "../../components/ui/EmptyState"
import { formatBrDateTime } from "../../lib/format"
import {
  NOTIFICATION_READ_COLORS,
  NOTIFICATION_READ_LABELS,
  NOTIFICATIONS_LABELS,
  notificationsRemovedLabel,
  notificationsUnreadLabel,
} from "../../lib/labels"

// Ícone/cor de cada tipo de notificação. `coord_notice` entra aqui porque o
// contrato compartilhado já declara o tipo (a tela de avisos é da Fase 3).
const TYPE_ICONS: Record<NotificationType, string> = {
  activity_approved: "✅",
  activity_rejected: "❌",
  activity_revision: "✏️",
  coord_notice: "📢",
  new_activity: "📋",
  reward: "🏆",
  system: "🔔",
}

/**
 * Cor do ícone de cada tipo.
 *
 * `coord_notice` é o único que usa **gradiente**, e é deliberado: a coordenação
 * é laranja/vermelho neste design system (`ROLE_THEME.coordinator.avatar` =
 * `from-orange-500 to-red-600`), e um laranja-100 chapado colidiria com o
 * `activity_revision`, que é laranja também. O gradiente separa os dois sem
 * inventar uma cor nova. O emoji é `aria-hidden` e o tipo também é dito pelo
 * título da seção, então a cor nunca é o único indício (WCAG 1.4.1).
 */
const TYPE_COLORS: Record<NotificationType, string> = {
  activity_approved: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  activity_rejected: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  activity_revision: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  coord_notice: "bg-gradient-to-br from-orange-500 to-red-600 text-white",
  new_activity: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  reward: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  system: "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300",
}

/**
 * Quanto tempo a transitória fica na tela antes do acuse automático (RF10).
 *
 * Sem esta espera, o `PATCH` sairia no mesmo instante em que a lista é
 * desenhada e a notificação desapareceria antes de o aluno conseguir ler
 * "+15 pts" — o mesmo "consumida por quem não olhou" que a 3.3 proibiu no `GET`.
 * O item continua sumindo sozinho: o tempo é de leitura, não de interação.
 */
const PERMANENCIA_TRANSIENT_MS = 1500

/** Categorias da lista: a institucional vem primeiro (3.4). */
const TIPO_COORDENACAO: NotificationType = "coord_notice"

interface ItemProps {
  notification: Notification
  onAcknowledge: (id: string) => void
}

/** Cartão de uma notificação. O clique confirma a leitura (idempotente, R36). */
function NotificationItem({ notification, onAcknowledge }: ItemProps) {
  const lida = notification.read
  return (
    <button
      type="button"
      onClick={() => {
        if (!lida) onAcknowledge(notification.id)
      }}
      // `aria-disabled` (e não um `<div>`): o item continua alcançável pelo
      // teclado e continua sendo anunciado depois de lido, mas a tela deixa de
      // oferecer um clique que não faria nada.
      aria-disabled={lida}
      className={`w-full text-left bg-white dark:bg-slate-900 border rounded-2xl p-4 transition-shadow ${
        lida
          ? "border-gray-100 dark:border-slate-800 opacity-80 cursor-default"
          : "border-blue-200 dark:border-blue-900 shadow-sm hover:shadow-md"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0 ${TYPE_COLORS[notification.type]}`}
          aria-hidden="true"
        >
          {TYPE_ICONS[notification.type]}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-gray-900 dark:text-white">{notification.title}</p>
            {/* Texto, não bolinha colorida: a lista mistura lidas e não lidas para
                sempre agora, e cor sozinha não distingue (WCAG 1.4.1). */}
            <Badge className={lida ? NOTIFICATION_READ_COLORS.read : NOTIFICATION_READ_COLORS.unread}>
              {lida ? NOTIFICATION_READ_LABELS.read : NOTIFICATION_READ_LABELS.unread}
            </Badge>
          </div>
          <p className="text-sm text-gray-600 dark:text-slate-300 mt-0.5">{notification.message}</p>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1.5">{formatBrDateTime(notification.createdAt)}</p>
        </div>
      </div>
    </button>
  )
}

interface GroupProps {
  id: string
  title: string
  icon: string
  items: Notification[]
  onAcknowledge: (id: string) => void
}

/** Seção nomeada da lista (`section[aria-labelledby]` = região na árvore de acessibilidade). */
function NotificationGroup({ id, title, icon, items, onAcknowledge }: GroupProps) {
  const naoLidas = items.filter((n) => !n.read).length
  return (
    <section aria-labelledby={id} className="mb-6 last:mb-0">
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <h3
          id={id}
          className="text-sm font-bold uppercase tracking-wide text-gray-600 dark:text-slate-300"
          style={{ fontFamily: "Nunito, sans-serif" }}
        >
          <span aria-hidden="true">{icon} </span>
          {title}
        </h3>
        {naoLidas > 0 && (
          <Badge className={NOTIFICATION_READ_COLORS.unread}>{notificationsUnreadLabel(naoLidas)}</Badge>
        )}
      </div>
      <ul className="space-y-3">
        {items.map((notification) => (
          <li key={notification.id}>
            <NotificationItem notification={notification} onAcknowledge={onAcknowledge} />
          </li>
        ))}
      </ul>
    </section>
  )
}

export function NotificationsView() {
  // O mesmo controller do sino do `Layout` — ver `NotificationsContext`.
  const {
    notifications,
    loading,
    error,
    reload,
    markAllRead,
    markRead,
    acknowledgeTransients,
    unreadCount,
  } = useNotificationsController()
  const { showToast } = useToast()

  // ─── Acuse automático das transitórias, DEPOIS de exibir (RF10/R35) ─────────
  // A chave é o conjunto de transitórias pendentes: o timer só rearma quando
  // esse conjunto muda, então o item não fica sendo reacusado a cada render.
  const pendentes = useMemo(
    () => notifications.filter((n) => n.transient && !n.read).map((n) => n.id).join(","),
    [notifications],
  )
  useEffect(() => {
    if (pendentes === "") return
    const timer = window.setTimeout(() => void acknowledgeTransients(), PERMANENCIA_TRANSIENT_MS)
    return () => window.clearTimeout(timer)
  }, [pendentes, acknowledgeTransients])

  // ─── O sumiço é anunciado (aria-live) ───────────────────────────────────────
  // A transitória some sozinha: para o leitor de tela, um item que desaparece
  // sem palavra é um evento perdido. A região viva fica sempre montada (vazia
  // quando não há o que dizer), que é a forma confiável de o leitor perceber a
  // mudança em vez de perdê-la.
  const listaAnterior = useRef<Notification[] | null>(null)
  const [anuncio, setAnuncio] = useState("")
  /**
   * Ids cujo sumiço o USUÁRIO pediu (clique ou "ler tudo"): remoção por clique
   * não é anunciada — o próprio clique é a confirmação visual, e no acuse em
   * lote o toast já conta o resultado (MINOR-4). Anunciar de novo seria a mesma
   * notícia duas vezes para o leitor de tela.
   */
  const removidasPeloUsuario = useRef<Set<string>>(new Set())
  useEffect(() => {
    const anterior = listaAnterior.current
    listaAnterior.current = notifications
    if (!anterior) return
    const ids = new Set(notifications.map((n) => n.id))
    const saidas = anterior.filter((n) => !ids.has(n.id))
    if (saidas.length === 0) return
    const aAnunciar = saidas.filter((n) => !removidasPeloUsuario.current.has(n.id))
    // Ids já processados saem do set (o id nunca volta à lista): sem isso o set
    // cresceria para sempre a cada clique na sessão.
    for (const n of saidas) removidasPeloUsuario.current.delete(n.id)
    if (aAnunciar.length === 0) return
    setAnuncio(notificationsRemovedLabel(aAnunciar.map((n) => n.title)))
  }, [notifications])

  const handleAcknowledge = useCallback(
    (id: string) => {
      // Remoção por clique do usuário: não pode ser anunciada de novo (MINOR-4).
      removidasPeloUsuario.current.add(id)
      void markRead(id).catch((err: unknown) => {
        showToast(err instanceof Error ? err.message : NOTIFICATIONS_LABELS.confirmError, "error")
      })
    },
    [markRead, showToast],
  )

  const handleMarkAll = useCallback(async () => {
    try {
      await markAllRead()
      // O servidor CONFIRMOU o lote: as transitórias atuais vão sair da lista.
      // O toast já conta o resultado ao usuário, então o aria-live não pode
      // repetir a notícia quando a reconciliação trouxer a lista nova (MINOR-4).
      for (const n of notifications) {
        if (n.transient && !n.read) removidasPeloUsuario.current.add(n.id)
      }
      showToast(NOTIFICATIONS_LABELS.confirmAllDone)
    } catch (err) {
      showToast(err instanceof Error ? err.message : NOTIFICATIONS_LABELS.confirmError, "error")
    }
  }, [markAllRead, showToast, notifications])

  const avisos = notifications.filter((n) => n.type === TIPO_COORDENACAO)
  const novidades = notifications.filter((n) => n.type !== TIPO_COORDENACAO)
  // Carregamento só no PRIMEIRO fetch: durante a reconciliação (R35) a lista que
  // está na tela continua, senão cada acuse piscaria a tela inteira — e a região
  // `aria-live` (montada junto com a lista) seria desmontada junto, engolindo o
  // anúncio do sumiço.
  const carregando = loading && notifications.length === 0
  const listaVisivel = !carregando && !error && notifications.length > 0

  return (
    <div className="max-w-3xl mx-auto">
      <SectionHeader
        icon="🔔"
        title="Notificações"
        subtitle={unreadCount > 0 ? notificationsUnreadLabel(unreadCount) : NOTIFICATIONS_LABELS.allCaughtUp}
        action={
          unreadCount > 0 ? (
            <Button onClick={() => void handleMarkAll()} className="bg-blue-700 hover:bg-blue-800">
              {NOTIFICATIONS_LABELS.confirmAll}
            </Button>
          ) : undefined
        }
      />

      <p className="flex items-start gap-2 text-xs text-gray-500 dark:text-slate-400 mb-4">
        <span aria-hidden="true">ℹ️</span>
        {NOTIFICATIONS_LABELS.hint}
      </p>

      {carregando && <LoadingBlock rows={4} label={NOTIFICATIONS_LABELS.loading} />}

      {!carregando && error && <ErrorState message={error} onRetry={reload} />}

      {!carregando && !error && notifications.length === 0 && (
        <Card>
          <EmptyState
            icon="🔕"
            title={NOTIFICATIONS_LABELS.emptyTitle}
            description={NOTIFICATIONS_LABELS.emptyDescription}
          />
        </Card>
      )}

      {/* Região viva SEMPRE montada (mesmo vazia, mesmo com a lista escondida):
          se ela nascesse junto com o item, a última notificação da tela sumiria
          junto com o anúncio do próprio sumiço. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {anuncio}
      </div>

      {listaVisivel && (
        <>
          {/* A institucional primeiro (é o que exige ação), o resto depois — e
              dentro de cada grupo a ordem é a do servidor, sem reordenar. */}
          {avisos.length > 0 && (
            <NotificationGroup
              id="notificacoes-coordenacao"
              title={NOTIFICATIONS_LABELS.coordGroup}
              icon="📢"
              items={avisos}
              onAcknowledge={handleAcknowledge}
            />
          )}
          {novidades.length > 0 && (
            <NotificationGroup
              id="notificacoes-novidades"
              title={NOTIFICATIONS_LABELS.otherGroup}
              icon="🔔"
              items={novidades}
              onAcknowledge={handleAcknowledge}
            />
          )}
        </>
      )}
    </div>
  )
}
