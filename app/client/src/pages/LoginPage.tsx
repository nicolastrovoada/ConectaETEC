import { useState, type FormEvent } from "react"
import { ROLE_ICONS, ROLE_LABELS, type Role } from "@shared/types"
import { Spinner } from "../components/ui/EmptyState"

const DEMO_ACCOUNTS: { role: Role; email: string }[] = [
  { role: "student", email: "ana@etec.sp.gov.br" },
  { role: "teacher", email: "marcelo@etec.sp.gov.br" },
  { role: "staff", email: "carlos@etec.sp.gov.br" },
  { role: "coordinator", email: "juliana@etec.sp.gov.br" },
]

interface LoginPageProps {
  onLogin: (email: string, password: string) => Promise<void>
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!email.trim() || !password) {
      setError("Informe e-mail e senha para entrar.")
      return
    }
    setError("")
    setSubmitting(true)
    try {
      await onLogin(email.trim().toLowerCase(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao entrar. Tente novamente.")
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle at center, white 1.5px, transparent 1.5px)",
          backgroundSize: "28px 28px",
        }}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-7">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-black text-lg">
              C
            </div>
            <span className="font-black text-2xl text-white" style={{ fontFamily: "Nunito, sans-serif" }}>
              Conecta<span className="text-blue-300">ETEC</span>
            </span>
          </div>
          <p className="text-blue-300 text-sm">Plataforma escolar de engajamento — ETEC Cravinhos</p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden">
          <div className="p-7">
            <h1 className="text-xl font-extrabold text-gray-900 dark:text-white mb-1" style={{ fontFamily: "Nunito, sans-serif" }}>
              Entrar na plataforma
            </h1>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-5">
              Use seu e-mail institucional. Contas são criadas pela coordenação.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">
                  E-mail institucional
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@etec.sp.gov.br"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>
              <div>
                <label htmlFor="login-password" className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">
                  Senha
                </label>
                <input
                  id="login-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>

              {error && (
                <p role="alert" className="text-red-600 text-xs bg-red-50 dark:bg-red-950/50 border border-red-100 dark:border-red-900 rounded-lg px-3 py-2">
                  ⚠️ {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-sm transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ fontFamily: "Nunito, sans-serif" }}
              >
                {submitting ? <Spinner className="border-white" /> : null}
                {submitting ? "Entrando..." : "Entrar na plataforma →"}
              </button>

              <div className="pt-3 border-t border-gray-100 dark:border-slate-800">
                <p className="text-xs text-gray-500 dark:text-slate-400 text-center mb-2.5">
                  Demonstração — senha de todos os perfis: <strong className="text-gray-700 dark:text-slate-200">123456</strong>
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {DEMO_ACCOUNTS.map((demo) => (
                    <button
                      key={demo.role}
                      type="button"
                      onClick={() => {
                        setEmail(demo.email)
                        setPassword("123456")
                        setError("")
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-xs font-semibold text-gray-600 dark:text-slate-300 hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-slate-800 transition-all"
                    >
                      <span aria-hidden="true">{ROLE_ICONS[demo.role]}</span>
                      {ROLE_LABELS[demo.role]}
                    </button>
                  ))}
                </div>
              </div>
            </form>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-2" aria-hidden="true">
          {(["student", "teacher", "staff", "coordinator"] as Role[]).map((role) => (
            <div
              key={role}
              className={`bg-gradient-to-br ${
                role === "student"
                  ? "from-blue-500 to-blue-700"
                  : role === "teacher"
                    ? "from-purple-500 to-purple-700"
                    : role === "staff"
                      ? "from-green-500 to-green-700"
                      : "from-orange-500 to-red-600"
              } rounded-xl p-3 text-center opacity-80`}
            >
              <div className="text-xl mb-1">{ROLE_ICONS[role]}</div>
              <div className="text-white text-xs font-semibold" style={{ fontFamily: "Nunito, sans-serif" }}>
                {ROLE_LABELS[role]}
              </div>
            </div>
          ))}
        </div>
        <p className="text-center text-blue-400 text-xs mt-4">ETEC Cravinhos — SP · Curso Técnico em Administração · 2026</p>
      </div>
    </div>
  )
}