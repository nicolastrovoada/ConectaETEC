// Tema visual por papel (Cores por papel — convenção Conecta ETEC).
import type { Role } from "@shared/types"

export interface RoleTheme {
  /** Gradiente do avatar do usuário. */
  avatar: string
  /** Fundo do toast de feedback. */
  toast: string
  /** Cor principal de ações/nav ativa. */
  accent: string
  /** Texto da logo/sidebar. */
  accentText: string
  /** Sidebar: fundo escuro do painel. */
  sidebar: string
  /** Classe de texto do nome/email na sidebar. */
  sidebarMuted: string
  /** Anel de foco para inputs. */
  ring: string
  /** Cor de destaque para links/links hover. */
  text: string
}

export const ROLE_THEME: Record<Role, RoleTheme> = {
  student: {
    avatar: "from-blue-500 to-blue-700",
    toast: "bg-blue-700",
    accent: "bg-blue-600",
    accentText: "text-blue-700",
    sidebar: "bg-blue-950",
    sidebarMuted: "text-blue-300",
    ring: "focus:ring-blue-100 focus:border-blue-400",
    text: "text-blue-700",
  },
  teacher: {
    avatar: "from-purple-500 to-purple-700",
    toast: "bg-purple-700",
    accent: "bg-purple-600",
    accentText: "text-purple-700",
    sidebar: "bg-purple-950",
    sidebarMuted: "text-purple-300",
    ring: "focus:ring-purple-100 focus:border-purple-400",
    text: "text-purple-700",
  },
  staff: {
    avatar: "from-green-500 to-green-700",
    toast: "bg-green-700",
    accent: "bg-green-600",
    accentText: "text-green-700",
    sidebar: "bg-green-950",
    sidebarMuted: "text-green-300",
    ring: "focus:ring-green-100 focus:border-green-400",
    text: "text-green-700",
  },
  coordinator: {
    avatar: "from-orange-500 to-red-600",
    toast: "bg-orange-600",
    accent: "bg-orange-600",
    accentText: "text-orange-600",
    sidebar: "bg-slate-950",
    sidebarMuted: "text-slate-400",
    ring: "focus:ring-orange-100 focus:border-orange-400",
    text: "text-orange-600",
  },
}