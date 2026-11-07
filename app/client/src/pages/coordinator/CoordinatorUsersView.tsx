import { useCallback, useMemo, useState, type FormEvent } from "react"
import type { Class, Role, SafeUser } from "@shared/types"
import { ROLE_ICONS, ROLE_LABELS } from "@shared/types"
import { api } from "../../lib/api"
import { useAsync } from "../../hooks/useAsync"
import { useToast } from "../../context/ToastContext"
import { Button } from "../../components/ui/Button"
import { Card, SectionHeader } from "../../components/ui/Card"
import { Field, Input, Select } from "../../components/ui/Field"
import { Modal } from "../../components/ui/Modal"
import { EmptyState, ErrorState, LoadingBlock } from "../../components/ui/EmptyState"

const ROLE_FILTERS: Array<{ value: Role | ""; label: string }> = [
  { value: "", label: "Todos os papéis" },
  { value: "student", label: "Alunos" },
  { value: "teacher", label: "Professores" },
  { value: "staff", label: "Funcionários" },
  { value: "coordinator", label: "Coordenação" },
]

interface UserModalState {
  mode: "create" | "edit"
  user: SafeUser | null
}

export function CoordinatorUsersView() {
  const { showToast } = useToast()

  const [roleFilter, setRoleFilter] = useState<Role | "">("")
  const [search, setSearch] = useState("")
  const [modal, setModal] = useState<UserModalState | null>(null)

  const users = useAsync<SafeUser[]>(
    useCallback(
      () =>
        api.get<SafeUser[]>("/api/users", {
          role: roleFilter || undefined,
          search: search.trim() || undefined,
        }),
      [roleFilter, search],
    ),
    [roleFilter, search],
  )
  const classes = useAsync<Class[]>(
    useCallback(() => api.get<Class[]>("/api/classes"), []),
    [],
  )

  async function deleteUser(user: SafeUser) {
    if (!window.confirm(`Desativar o usuário "${user.name}"? Ele não poderá mais acessar a plataforma.`)) return
    try {
      await api.patch(`/api/users/${user.id}`, { active: false })
      showToast(`Usuário "${user.name}" desativado.`)
      users.reload()
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Falha ao desativar.", "error")
    }
  }

  async function activateUser(user: SafeUser) {
    try {
      await api.patch(`/api/users/${user.id}`, { active: true })
      showToast(`Usuário "${user.name}" ativado.`)
      users.reload()
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Falha ao ativar.", "error")
    }
  }

  return (
    <div>
      <SectionHeader
        icon="👥"
        title="Usuários"
        subtitle="Cadastre, edite e gerencie o acesso à plataforma"
        action={
          <Button onClick={() => setModal({ mode: "create", user: null })} className="bg-green-700 hover:bg-green-800">
            + Novo usuário
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="min-w-44 flex-1 sm:flex-none">
          <label htmlFor="usr-search" className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1">
            Buscar
          </label>
          <Input
            id="usr-search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); }}
            placeholder="Nome ou e-mail..."
            className="py-2"
          />
        </div>
        <div className="min-w-44 flex-1 sm:flex-none">
          <label htmlFor="usr-role" className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1">
            Papel
          </label>
          <Select id="usr-role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as Role | "")} className="py-2">
            {ROLE_FILTERS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {users.loading && <LoadingBlock rows={4} label="Carregando usuários" />}
      {!users.loading && users.error && <ErrorState message={users.error} onRetry={users.reload} />}
      {!users.loading && !users.error && (users.data ?? []).length === 0 && (
        <Card>
          <EmptyState icon="👥" title="Nenhum usuário encontrado" description="Ajuste a busca ou cadastre um novo usuário." />
        </Card>
      )}

      {!users.loading && !users.error && (users.data ?? []).length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-400 dark:text-slate-500 border-b border-gray-100 dark:border-slate-800">
                  <th scope="col" className="px-4 py-3 font-semibold">Usuário</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Papel</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Turmas</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-center">Status</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.data?.map((user) => (
                  <tr key={user.id} className="border-b border-gray-50 dark:border-slate-800/60 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center text-sm font-bold text-gray-700 dark:text-slate-200 shrink-0" aria-hidden="true">
                          {user.avatar}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 dark:text-white truncate max-w-40">{user.name}</p>
                          <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold text-gray-600 dark:text-slate-300">
                        {ROLE_ICONS[user.role]} {ROLE_LABELS[user.role]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-slate-400">{user.classIds.length > 0 ? user.classIds.join(", ") : "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${user.active ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" : "bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400"}`}>
                        {user.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Button variant="ghost" className="text-xs px-2 py-1" onClick={() => setModal({ mode: "edit", user })}>
                        Editar
                      </Button>
                      {user.active ? (
                        <Button variant="ghost" className="text-xs px-2 py-1 text-red-600 dark:text-red-400" onClick={() => void deleteUser(user)}>
                          Desativar
                        </Button>
                      ) : (
                        <Button variant="ghost" className="text-xs px-2 py-1 text-green-600 dark:text-green-400" onClick={() => void activateUser(user)}>
                          Ativar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {modal && (
        <UserFormModal
          mode={modal.mode}
          user={modal.user}
          classes={classes.data ?? []}
          onClose={() => setModal(null)}
          onSaved={(message) => {
            setModal(null)
            users.reload()
            showToast(message)
          }}
        />
      )}
    </div>
  )
}

function UserFormModal({
  mode,
  user,
  classes,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit"
  user: SafeUser | null
  classes: Class[]
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const isEdit = mode === "edit"
  const [name, setName] = useState(user?.name ?? "")
  const [email, setEmail] = useState(user?.email ?? "")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<Role>(user?.role ?? "student")
  const [active, setActive] = useState(user?.active ?? true)
  const [classId, setClassId] = useState(user?.classIds?.[0] ?? "")
  const [saving, setSaving] = useState(false)
  const [fieldError, setFieldError] = useState("")

  const isStudent = role === "student"
  const isTeacher = role === "teacher"
  const showClass = isStudent || isTeacher

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFieldError("")
    if (name.trim().length < 3) return setFieldError("Nome deve ter ao menos 3 caracteres.")
    if (!email.trim() || !email.includes("@")) return setFieldError("E-mail inválido.")
    if (!isEdit && password.length < 6) return setFieldError("Senha deve ter ao menos 6 caracteres.")
    if (showClass && classId && !classes.some((c) => c.id === classId)) return setFieldError("Turma inválida.")

    setSaving(true)
    try {
      if (isEdit && user) {
        const payload: Record<string, unknown> = { name: name.trim(), role, active }
        if (showClass) {
          payload.classIds = classId ? [classId] : []
        } else {
          payload.classIds = []
        }
        if (password) payload.password = password
        await api.patch(`/api/users/${user.id}`, payload)
        onSaved("Usuário atualizado.")
      } else {
        await api.post("/api/users", {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          role,
          classId: classId || undefined,
        })
        onSaved(`Usuário "${name.trim()}" criado com sucesso.`)
      }
    } catch (err) {
      setFieldError(err instanceof Error ? err.message : "Falha ao salvar usuário.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? `Editar ${user?.name ?? "usuário"}` : "Novo usuário"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="user-form" disabled={saving} className="bg-green-700 hover:bg-green-800">
            {saving ? "Salvando..." : isEdit ? "Salvar alterações" : "Criar usuário"}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={handleSubmit} className="space-y-4">
        {fieldError && (
          <p role="alert" className="text-xs text-red-600 bg-red-50 dark:bg-red-950/50 border border-red-100 dark:border-red-900 rounded-lg px-3 py-2">
            ⚠️ {fieldError}
          </p>
        )}
        <Field label="Nome completo" htmlFor="user-name" required>
          <Input id="user-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Ana Beatriz Silva" required />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Papel" htmlFor="user-role" required>
            <Select id="user-role" value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={isEdit && user?.role === "coordinator"}>
              <option value="student">Aluno(a)</option>
              <option value="teacher">Professor(a)</option>
              <option value="staff">Funcionário(a)</option>
              <option value="coordinator">Coordenação</option>
            </Select>
          </Field>
          {showClass && (
            <Field label={isStudent ? "Turma" : "Turma (opcional)"} htmlFor="user-class" required={isStudent}>
              <Select id="user-class" value={classId} onChange={(e) => setClassId(e.target.value)} required={isStudent}>
                <option value="">{isStudent ? "Selecione" : "Nenhuma"}</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.course}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <Field label="E-mail" htmlFor="user-email" required>
          <Input id="user-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@etec.sp.gov.br" required />
        </Field>
        <Field label={isEdit ? "Nova senha (opcional)" : "Senha"} htmlFor="user-password" required={!isEdit} hint={isEdit ? "Deixe em branco para manter a atual." : "Mínimo de 6 caracteres."}>
          <Input id="user-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" required={!isEdit} />
        </Field>
        {isEdit && (
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300 cursor-pointer">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="w-4 h-4 rounded accent-green-700" />
            Usuário ativo (pode acessar a plataforma)
          </label>
        )}
      </form>
    </Modal>
  )
}