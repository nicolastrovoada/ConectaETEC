import { useEffect, useMemo, useState, type ReactNode } from "react"
import { ROLE_ICONS, ROLE_LABELS } from "@shared/types"
import { useUser } from "../context/UserContext"
import { usePreferences, type FontSize } from "../context/PreferencesContext"
import { useNotificationsController } from "../context/NotificationsContext"

export interface NavItem {
  id: string
  label: string
  icon: string
}

interface LayoutProps {
  nav: NavItem[]
  active: string
  onNavigate: (id: string) => void
  title: string
  subtitle?: string
  children: ReactNode
}

const FONT_SIZES: FontSize[] = ["md", "lg", "xl"]
const FONT_LABELS: Record<FontSize, string> = { md: "Médio", lg: "Grande", xl: "Extra grande" }

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/** Estrutura padrão do painel: skip-link, sidebar por papel, topbar e conteúdo. */
export function Layout({ nav, active, onNavigate, title, subtitle, children }: LayoutProps) {
  const { user, roleTheme, logout } = useUser()
  const { theme, fontSize, toggleTheme, setFontSize } = usePreferences()
  // Mesmo controller da tela de notificações (fonte única): o sino não pode
  // supercontar o que a tela de notificações já consumiu.
  const notificationsController = useNotificationsController()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  // Drawer mobile: foco inicial no menu, trap de Tab e fechamento com Escape
  useEffect(() => {
    if (!sidebarOpen) return
    const sidebar = document.getElementById("sidebar-menu")
    if (!sidebar) return
    sidebar.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSidebarOpen(false)
        return
      }
      if (event.key !== "Tab") return
      if (window.matchMedia("(min-width: 768px)").matches) return
      const focusables = Array.from(
        sidebar.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement)
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [sidebarOpen])

  // Devolve o foco ao botão de abrir quando o drawer mobile fecha
  useEffect(() => {
    if (sidebarOpen) return
    const active = document.activeElement
    if (active && active.closest("#sidebar-menu")) {
      document.getElementById("sidebar-toggle")?.focus()
    }
  }, [sidebarOpen])

  const notificationsId = useMemo(
    () => nav.find((n) => n.id.toLowerCase().startsWith("notif"))?.id,
    [nav],
  )
  const activeIcon = nav.find((n) => n.id === active)?.icon

  async function handleLogout() {
    setLoggingOut(true)
    await logout()
    // onLogout limpa o estado no App
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex" style={{ fontFamily: "Inter, sans-serif" }}>
      <a href="#conteudo" className="skip-link" style={{ fontFamily: "Inter, sans-serif" }}>
        Pular para o conteúdo
      </a>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        id="sidebar-menu"
        tabIndex={-1}
        className={`fixed md:static inset-y-0 left-0 z-40 ${roleTheme.sidebar} w-60 flex flex-col transition-transform duration-200 focus:outline-none ${
          sidebarOpen ? "visible translate-x-0" : "invisible -translate-x-full md:visible md:translate-x-0"
        }`}
        aria-label="Menu principal"
      >
        <div className="flex items-center gap-2 px-5 h-16 border-b border-white/10">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-white/25 to-white/10 flex items-center justify-center text-white font-black text-base" style={{ fontFamily: "Nunito, sans-serif" }}>
            C
          </div>
          <div>
            <p className="text-white font-extrabold text-sm leading-tight" style={{ fontFamily: "Nunito, sans-serif" }}>
              Conecta<span className="opacity-80">ETEC</span>
            </p>
            <p className="text-[11px] text-white/60">Painel do {ROLE_LABELS[user.role]}</p>
          </div>
        </div>

        <div className="px-5 py-4 border-b border-white/10 flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-full bg-gradient-to-br ${roleTheme.avatar} flex items-center justify-center text-white text-xs font-black shrink-0`}
            aria-hidden="true"
          >
            {user.avatar}
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-semibold truncate">{user.name}</p>
            <p className={`text-[11px] ${roleTheme.sidebarMuted} truncate`}>
              {ROLE_ICONS[user.role]} {ROLE_LABELS[user.role]}
            </p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1" aria-label="Navegação do painel">
          {nav.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onNavigate(item.id)
                setSidebarOpen(false)
              }}
              aria-current={active === item.id ? "page" : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors text-left ${
                active === item.id
                  ? `${roleTheme.accent} text-white shadow-md`
                  : "text-slate-300 hover:bg-white/10"
              }`}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-white/10">
          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-300 hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <span aria-hidden="true">🚪</span>
            {loggingOut ? "Saindo..." : "Sair"}
          </button>
        </div>
      </aside>

      {/* Conteúdo principal */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800 px-4 md:px-6 h-16 flex items-center gap-3 sticky top-0 z-20 shadow-sm">
          <button
            type="button"
            id="sidebar-toggle"
            className="md:hidden w-10 h-10 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 flex items-center justify-center text-gray-600 dark:text-slate-300"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu"
            aria-expanded={sidebarOpen}
            aria-controls="sidebar-menu"
          >
            ☰
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-extrabold text-gray-900 dark:text-white truncate" style={{ fontFamily: "Nunito, sans-serif" }}>
              {activeIcon ? `${activeIcon} ` : ""}
              {title}
            </h1>
            {subtitle && <p className="text-xs text-gray-500 dark:text-slate-400 truncate hidden sm:block">{subtitle}</p>}
          </div>

          {/* Acessibilidade: fonte */}
          <div className="hidden sm:flex items-center gap-1 bg-gray-100 dark:bg-slate-800 rounded-xl p-1" role="group" aria-label="Tamanho da fonte">
            {FONT_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setFontSize(size)}
                aria-pressed={fontSize === size}
                title={`Fonte ${FONT_LABELS[size].toLowerCase()}`}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  fontSize === size
                    ? "bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
                }`}
              >
                {size.toUpperCase()}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
            title={theme === "dark" ? "Modo claro" : "Modo escuro"}
            className="w-10 h-10 rounded-xl border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 flex items-center justify-center text-lg transition-colors"
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>

          <button
            type="button"
            onClick={() => notificationsId && onNavigate(notificationsId)}
            aria-label={`Notificações${notificationsController.unreadCount > 0 ? `, ${notificationsController.unreadCount} não lidas` : ""}`}
            className={`relative w-10 h-10 rounded-xl border flex items-center justify-center text-lg transition-colors ${
              notificationsController.unreadCount > 0
                ? "border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/50"
                : "border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800"
            }`}
          >
            🔔
            {notificationsController.unreadCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center"
                aria-hidden="true"
              >
                {notificationsController.unreadCount > 99 ? "99+" : notificationsController.unreadCount}
              </span>
            )}
          </button>
        </header>

        <a id="conteudo" tabIndex={-1} className="outline-none" />
        <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>

        <footer className="px-4 md:px-6 py-4 border-t border-gray-100 dark:border-slate-800 text-center text-xs text-gray-500 dark:text-slate-400">
          Conecta ETEC · ETEC Cravinhos — Centro Paula Souza · Técnico em Administração · 2026
        </footer>
      </div>
    </div>
  )
}