import { useState } from "react"
import type { NavItem } from "../../components/Layout"
import { Layout } from "../../components/Layout"
import { CoordinatorOverview } from "./CoordinatorOverview"
import { CoordinatorUsersView } from "./CoordinatorUsersView"
import { CoordinatorClassesView } from "./CoordinatorClassesView"
import { CoordinatorSubjectsView } from "./CoordinatorSubjectsView"
import { CoordinatorActivitiesView } from "./CoordinatorActivitiesView"
import { CoordinatorNoticesView } from "./CoordinatorNoticesView"
import { CoordinatorValidationsView } from "./CoordinatorValidationsView"
import { CoordinatorRewardsView } from "./CoordinatorRewardsView"
import { CoordinatorReportsView } from "./CoordinatorReportsView"
import { CoordinatorAuditView } from "./CoordinatorAuditView"
import { NotificationsView } from "../shared/NotificationsView"
import { ProfileView } from "../shared/ProfileView"

type Page =
  | "overview"
  | "users"
  | "classes"
  | "subjects"
  | "activities"
  | "notices"
  | "validations"
  | "rewards"
  | "reports"
  | "audit"
  | "notifications"
  | "profile"

const NAV: NavItem[] = [
  { id: "overview", label: "Visão Global", icon: "📊" },
  { id: "users", label: "Usuários", icon: "👥" },
  { id: "classes", label: "Turmas", icon: "🏫" },
  { id: "subjects", label: "Disciplinas", icon: "📖" },
  { id: "activities", label: "Atividades", icon: "📋" },
  // 3.5: comunicação com a escola fica perto de Atividades, que é de onde o
  // aluno também recebe a novidade — o item aparece no mesmo bloco da rotina.
  { id: "notices", label: "Avisos", icon: "📢" },
  { id: "validations", label: "Validações", icon: "✅" },
  { id: "rewards", label: "Pontos e Recompensas", icon: "🎁" },
  { id: "reports", label: "Relatórios", icon: "📈" },
  { id: "audit", label: "Auditoria", icon: "🔍" },
  { id: "notifications", label: "Notificações", icon: "🔔" },
  { id: "profile", label: "Perfil", icon: "👤" },
]

const PAGE_META: Record<Page, { label: string; subtitle?: string }> = {
  overview: { label: "Visão Global", subtitle: "Indicadores gerais da plataforma" },
  users: { label: "Usuários", subtitle: "Cadastre e gerencie alunos, professores e funcionários" },
  classes: { label: "Turmas", subtitle: "Monte e edite as turmas" },
  subjects: { label: "Disciplinas", subtitle: "Disciplinas oferecidas na escola" },
  activities: { label: "Atividades", subtitle: "Acompanhe tudo o que foi criado na escola" },
  notices: { label: "Avisos", subtitle: "Publique avisos para toda a escola ou para turmas específicas" },
  validations: { label: "Validações", subtitle: "Todas as entregas da escola" },
  rewards: { label: "Pontos e Recompensas", subtitle: "Catálogo, resgates e ajuste de pontos" },
  reports: { label: "Relatórios", subtitle: "Extraia relatórios em CSV" },
  audit: { label: "Auditoria", subtitle: "Registro de ações sensíveis da plataforma" },
  notifications: { label: "Notificações" },
  profile: { label: "Perfil" },
}

export function CoordinatorDashboard() {
  const [page, setPage] = useState<Page>("overview")
  const [pendingActivityId, setPendingActivityId] = useState<string | undefined>(undefined)
  const meta = PAGE_META[page]

  function goToValidations(activityId: string) {
    setPendingActivityId(activityId)
    setPage("validations")
  }

  return (
    <Layout nav={NAV} active={page} onNavigate={(id) => setPage(id as Page)} title={meta.label} subtitle={meta.subtitle}>
      {page === "overview" && <CoordinatorOverview />}
      {page === "users" && <CoordinatorUsersView />}
      {page === "classes" && <CoordinatorClassesView />}
      {page === "subjects" && <CoordinatorSubjectsView />}
      {page === "activities" && <CoordinatorActivitiesView onGoToValidations={goToValidations} />}
      {page === "notices" && <CoordinatorNoticesView />}
      {page === "validations" && <CoordinatorValidationsView preselectActivityId={pendingActivityId} />}
      {page === "rewards" && <CoordinatorRewardsView />}
      {page === "reports" && <CoordinatorReportsView />}
      {page === "audit" && <CoordinatorAuditView />}
      {page === "notifications" && <NotificationsView />}
      {page === "profile" && <ProfileView />}
    </Layout>
  )
}