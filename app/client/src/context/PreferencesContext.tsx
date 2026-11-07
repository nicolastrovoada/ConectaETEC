import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"

export type Theme = "light" | "dark"
export type FontSize = "md" | "lg" | "xl"

interface PreferencesContextValue {
  theme: Theme
  fontSize: FontSize
  toggleTheme: () => void
  setFontSize: (size: FontSize) => void
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

const STORAGE_KEY = "conectaetec-prefs"

function loadPrefs(): { theme: Theme; fontSize: FontSize } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<{ theme: Theme; fontSize: FontSize }>
      const theme: Theme =
        parsed.theme === "dark" ? "dark" : parsed.theme === "light" ? "light" : "light"
      const fontSize: FontSize =
        parsed.fontSize === "lg" || parsed.fontSize === "xl" ? parsed.fontSize : "md"
      return { theme, fontSize }
    }
  } catch {
    // armazenamento indisponível — usa padrões
  }
  return { theme: "light", fontSize: "md" }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(loadPrefs)

  const apply = useCallback((next: { theme: Theme; fontSize: FontSize }) => {
    const root = document.documentElement
    root.classList.toggle("dark", next.theme === "dark")
    root.setAttribute("data-font-size", next.fontSize)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // sem persistência — segue sem erro
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setState((prev) => {
      const next = { ...prev, theme: prev.theme === "dark" ? ("light" as Theme) : ("dark" as Theme) }
      apply(next)
      return next
    })
  }, [apply])

  const setFontSize = useCallback(
    (size: FontSize) => {
      setState((prev) => {
        const next = { ...prev, fontSize: size }
        apply(next)
        return next
      })
    },
    [apply],
  )

  const value = useMemo(
    () => ({ theme: state.theme, fontSize: state.fontSize, toggleTheme, setFontSize }),
    [state, toggleTheme, setFontSize],
  )

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext)
  if (!ctx) throw new Error("usePreferences deve ser usado dentro de PreferencesProvider")
  return ctx
}