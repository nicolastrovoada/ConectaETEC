import { useState } from "react"
import type { NavItem } from "../../components/Layout"
import { Layout } from "../../components/Layout"
import { TeacherOverview } from "./TeacherOverview"
import { TeacherActivitiesView } from "./TeacherActivitiesView"
import { TeacherStudyContentsView } from "./TeacherStudyContentsView"
import { TeacherClassesView } from "./TeacherClassesView"
import { TeacherValidateView } from "./TeacherValidateView"
import { TeacherPerformanceView } from "./TeacherPerformanceView"
import { NotificationsView } from "../shared/NotificationsView"
import { ProfileView } from "../shared/ProfileView"

type Page =
  | "overview"
  | "activities"
  | "reforcos"
  | "classes"
  | "validate"
  | "performance"
  | "notifications"
  | "profile"

const NAV: NavItem[] = [
  { id: "overview", label: "Visão Geral", icon: "🏠" },
  { id: "activities", label: "Atividades", icon: "📋" },
  { id: "reforcos", label: "Meus Reforços", icon: "📚" },
  { id: "classes", label: "Minhas Turmas", icon: "🏫" },
  { id: "validate", label: "Validar Entregas", icon: "✅" },
  { id: "performance", label: "Desempenho", icon: "📊" },
  { id: "notifications", label: "Notificações", icon: "🔔" },
  { id: "profile", label: "Perfil", icon: "👤" },
]

const PAGE_META: Record<Page, { label: string; subtitle?: string }> = {
  overview: { label: "Visão Geral", subtitle: "Resumo das suas atividades e turmas" },
  activities: { label: "Atividades", subtitle: "Crie, publique e gerencie suas atividades" },
  reforcos: { label: "Meus Reforços", subtitle: "Crie e gerencie o reforço escolar das suas turmas" },
  classes: { label: "Minhas Turmas", subtitle: "Turmas e disciplinas que você acompanha" },
  validate: { label: "Validar Entregas", subtitle: "Aprove, reprove ou peça correção" },
  performance: { label: "Desempenho", subtitle: "Relatórios de conclusão e pontos dos alunos" },
  notifications: { label: "Notificações" },
  profile: { label: "Perfil" },
}

export function TeacherDashboard() {
  const [page, setPage] = useState<Page>("overview")
  const [pendingActivityId, setPendingActivityId] = useState<string | undefined>(undefined)
  const meta = PAGE_META[page]

  function goToValidate(activityId: string) {
    setPendingActivityId(activityId)
    setPage("validate")
  }

  return (
    <Layout nav={NAV} active={page} onNavigate={(id) => setPage(id as Page)} title={meta.label} subtitle={meta.subtitle}>
      {page === "overview" && <TeacherOverview onNavigate={setPage} />}
      {page === "activities" && <TeacherActivitiesView onGoToValidate={goToValidate} />}
      {page === "reforcos" && <TeacherStudyContentsView />}
      {page === "classes" && <TeacherClassesView onNavigate={setPage} />}
      {page === "validate" && <TeacherValidateView preselectActivityId={pendingActivityId} />}
      {page === "performance" && <TeacherPerformanceView />}
      {page === "notifications" && <NotificationsView />}
      {page === "profile" && <ProfileView />}
    </Layout>
  )
}