import { useEffect, useState } from "react"
import type { SafeUser, Role } from "@shared/types"
import { api } from "./lib/api"
import { PreferencesProvider } from "./context/PreferencesContext"
import { ToastProvider } from "./context/ToastContext"
import { UserProvider, useUser } from "./context/UserContext"
import { NotificationsProvider } from "./context/NotificationsContext"
import { ToastHost } from "./components/ui/Toast"
import { Spinner } from "./components/ui/EmptyState"
import { LoginPage } from "./pages/LoginPage"
import { StudentDashboard } from "./pages/student/StudentDashboard"
import { TeacherDashboard } from "./pages/teacher/TeacherDashboard"
import { StaffDashboard } from "./pages/staff/StaffDashboard"
import { CoordinatorDashboard } from "./pages/coordinator/CoordinatorDashboard"

type SessionState = "loading" | SafeUser | null

export default function App() {
  return (
    <PreferencesProvider>
      <ToastProvider>
        <AppGate />
      </ToastProvider>
    </PreferencesProvider>
  )
}

function AppGate() {
  const [session, setSession] = useState<SessionState>("loading")

  useEffect(() => {
    api
      .get<SafeUser>("/api/auth/me")
      .then((user) => setSession(user))
      .catch(() => setSession(null))
  }, [])

  if (session === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400">
          <Spinner />
          <span className="text-sm font-semibold" style={{ fontFamily: "Nunito, sans-serif" }}>
            Carregando Conecta ETEC...
          </span>
        </div>
      </div>
    )
  }

  if (session === null) {
    return (
      <>
        <LoginPage
          onLogin={async (email, password) => {
            const user = await api.post<SafeUser>("/api/auth/login", { email, password })
            setSession(user)
          }}
        />
        <ToastHost />
      </>
    )
  }

  function handleLogout() {
    setSession(null)
  }

  return (
    <UserProvider user={session} onLogout={handleLogout}>
      <NotificationsProvider>
        <AuthenticatedApp />
      </NotificationsProvider>
    </UserProvider>
  )
}

function AuthenticatedApp() {
  const { user, roleTheme } = useUser()

  function renderDashboard(role: Role) {
    switch (role) {
      case "student":
        return <StudentDashboard />
      case "teacher":
        return <TeacherDashboard />
      case "staff":
        return <StaffDashboard />
      case "coordinator":
        return <CoordinatorDashboard />
      default:
        return <StudentDashboard />
    }
  }

  return (
    <>
      <ToastHost accentClassName={roleTheme.toast} />
      {renderDashboard(user.role)}
    </>
  )
}