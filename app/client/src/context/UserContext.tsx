import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import type { SafeUser, Role } from "@shared/types"
import { api } from "../lib/api"
import { ROLE_THEME } from "../lib/theme"

interface UserContextValue {
  user: SafeUser
  roleTheme: (typeof ROLE_THEME)[Role]
  setUser: (user: SafeUser) => void
  refreshUser: () => Promise<void>
  logout: () => Promise<void>
}

const UserContext = createContext<UserContextValue | null>(null)

export function UserProvider({ user, onLogout, children }: { user: SafeUser; onLogout: () => void; children: ReactNode }) {
  const [current, setCurrent] = useState<SafeUser>(user)

  const refreshUser = useCallback(async () => {
    const fresh = await api.get<SafeUser>("/api/auth/me")
    setCurrent(fresh)
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post<{ ok: boolean }>("/api/auth/logout")
    } catch {
      // segue para a tela de login mesmo se o servidor não responder
    }
    onLogout()
  }, [onLogout])

  const roleTheme = useMemo(() => ROLE_THEME[current.role], [current.role])

  const value = useMemo(
    () => ({ user: current, roleTheme, setUser: setCurrent, refreshUser, logout }),
    [current, roleTheme, refreshUser, logout],
  )

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error("useUser deve ser usado dentro de UserProvider")
  return ctx
}