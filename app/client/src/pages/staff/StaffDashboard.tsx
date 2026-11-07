import { useState } from "react"
import type { NavItem } from "../../components/Layout"
import { Layout } from "../../components/Layout"
import { StaffOverview } from "./StaffOverview"
import { StaffActivitiesView } from "./StaffActivitiesView"
import { StaffValidateView } from "./StaffValidateView"
import { StaffHistoryView } from "./StaffHistoryView"
import { NotificationsView } from "../shared/NotificationsView"
import { ProfileView } from "../shared/ProfileView"

type Page = "overview" | "activities" | "validate" | "history" | "notifications" | "profile"

const NAV: NavItem[] = [
  { id: "overview", label: "Visão Geral", icon: "🏠" },
  { id: "activities", label: "Ações", icon: "📋" },
  { id: "validate", label: "Validar", icon: "✅" },
  { id: "history", label: "Histórico", icon: "🕘" },
  { id: "notifications", label: "Notificações", icon: "🔔" },
  { id: "profile", label: "Perfil", icon: "👤" },
]

const PAGE_META: Record<Page, { label: string; subtitle?: string }> = {
  overview: { label: "Visão Geral", subtitle: "Resumo das ações escolares e validações" },
  activities: { label: "Ações escolares", subtitle: "Ações operacionais, eventos e suportes" },
  validate: { label: "Validar", subtitle: "Aprove, reprove ou peça correção nas entregas" },
  history: { label: "Histórico", subtitle: "Todas as entregas e validações realizadas" },
  notifications: { label: "Notificações" },
  profile: { label: "Perfil" },
}

export function StaffDashboard() {
  const [page, setPage] = useState<Page>("overview")
  const [pendingActivityId, setPendingActivityId] = useState<string | undefined>(undefined)
  const meta = PAGE_META[page]

  function goToValidate(activityId: string) {
    setPendingActivityId(activityId)
    setPage("validate")
  }

  return (
    <Layout nav={NAV} active={page} onNavigate={(id) => setPage(id as Page)} title={meta.label} subtitle={meta.subtitle}>
      {page === "overview" && <StaffOverview onNavigate={setPage} />}
      {page === "activities" && <StaffActivitiesView onGoToValidate={goToValidate} />}
      {page === "validate" && <StaffValidateView preselectActivityId={pendingActivityId} />}
      {page === "history" && <StaffHistoryView />}
      {page === "notifications" && <NotificationsView />}
      {page === "profile" && <ProfileView />}
    </Layout>
  )
}