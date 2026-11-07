import { useState } from "react"
import type { NavItem } from "../../components/Layout"
import { Layout } from "../../components/Layout"
import { StudentHome } from "./StudentHome"
import { StudentActivities } from "./StudentActivities"
import { StudyMaterialsView } from "./StudyMaterialsView"
import { RewardsStoreView } from "./RewardsStoreView"
import { PointsHistoryView } from "./PointsHistoryView"
import { NotificationsView } from "../shared/NotificationsView"
import { ProfileView } from "../shared/ProfileView"

type Page = "inicio" | "atividades" | "reforco" | "recompensas" | "pontos" | "notificacoes" | "perfil"

const NAV: NavItem[] = [
  { id: "inicio", label: "Início", icon: "🏠" },
  { id: "atividades", label: "Atividades", icon: "📋" },
  { id: "reforco", label: "Reforço Escolar", icon: "📚" },
  { id: "recompensas", label: "Recompensas", icon: "🏆" },
  { id: "pontos", label: "Meus Pontos", icon: "⭐" },
  { id: "notificacoes", label: "Notificações", icon: "🔔" },
  { id: "perfil", label: "Perfil", icon: "👤" },
]

const PAGE_META: Record<Page, { label: string; subtitle?: string }> = {
  inicio: { label: "Início" },
  atividades: { label: "Atividades", subtitle: "Atividades da sua turma com prazo aberto" },
  reforco: { label: "Reforço Escolar", subtitle: "Conteúdos de estudo por disciplina" },
  recompensas: { label: "Recompensas", subtitle: "Troque seus pontos por prêmios" },
  pontos: { label: "Meus Pontos", subtitle: "Histórico de transações e saldo" },
  notificacoes: { label: "Notificações" },
  perfil: { label: "Perfil" },
}

export function StudentDashboard() {
  const [page, setPage] = useState<Page>("inicio")
  const meta = PAGE_META[page]

  return (
    <Layout nav={NAV} active={page} onNavigate={(id) => setPage(id as Page)} title={meta.label} subtitle={meta.subtitle}>
      {page === "inicio" && <StudentHome onNavigate={setPage} />}
      {page === "atividades" && <StudentActivities onNavigate={setPage} />}
      {page === "reforco" && <StudyMaterialsView />}
      {page === "recompensas" && <RewardsStoreView />}
      {page === "pontos" && <PointsHistoryView />}
      {page === "notificacoes" && <NotificationsView />}
      {page === "perfil" && <ProfileView />}
    </Layout>
  )
}