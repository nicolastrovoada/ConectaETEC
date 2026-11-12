import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react"
import type { Class, SafeUser, Subject } from "@shared/types"
import {
  ROLE_ICONS,
  ROLE_LABELS,
  getBalance,
  levelLabel,
  nextLevelGoal,
  type PointsTransaction,
} from "@shared/types"
import { useUser } from "../../context/UserContext"
import { useToast } from "../../context/ToastContext"
import { ApiError, api } from "../../lib/api"
import { useAsync } from "../../hooks/useAsync"
import { Button } from "../../components/ui/Button"
import { Card, SectionHeader } from "../../components/ui/Card"
import { Field, Input } from "../../components/ui/Field"
import { ErrorState, LoadingBlock } from "../../components/ui/EmptyState"
import { UserAvatar } from "../../components/ui/UserAvatar"
import { formatBrDate } from "../../lib/format"

interface UserPointsResponse {
  balance: number
  levelLabel: string
  currentStreakDays: number
  transactions: PointsTransaction[]
}

export function ProfileView() {
  const { user, roleTheme, setUser, refreshUser } = useUser()
  const { showToast } = useToast()

  const points = useAsync<UserPointsResponse>(
    useCallback(() => api.get<UserPointsResponse>(`/api/users/${user.id}/points`), [user.id]),
    [],
  )

  // Turma/curso (aluno) e matérias (professor). As duas listagens já vêm
  // escopadas pelo servidor; o filtro local só evita mostrar vínculo de outra
  // pessoa caso a rota mude de escopo no futuro.
  const classes = useAsync<Class[]>(useCallback(() => api.get<Class[]>("/api/classes"), []), [])
  const subjects = useAsync<Subject[]>(useCallback(() => api.get<Subject[]>("/api/subjects"), []), [])

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user.name)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const previewRef = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const balance = points.data?.balance ?? getBalance(user.id, points.data?.transactions ?? [])
  const goal = nextLevelGoal(balance)
  const metaValue = goal.kind === "max" ? "800 ✓" : `+${goal.missing ?? 0}`
  const metaLabel =
    goal.kind === "max" ? "Meta 800 atingida" : goal.kind === "milestone" ? "Meta do Diamante (800)" : "Faltam p/ próx. nível"

  const minhasTurmas = (classes.data ?? []).filter((klass) => user.classIds.includes(klass.id))
  const minhasMaterias = (subjects.data ?? []).filter((subject) => subject.teacherIds.includes(user.id))

  // Preview local do arquivo (blob:) é revogado ao trocar de foto e no unmount.
  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    }
  }, [])

  function resetForm() {
    setName(user.name)
    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
    setFormError(null)
  }

  function startEditing() {
    resetForm()
    setEditing(true)
  }

  function cancelEditing() {
    resetForm()
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current)
      previewRef.current = null
    }
    setAvatarPreview(null)
    setEditing(false)
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    if (!file.type.startsWith("image/")) {
      setFormError("Escolha um arquivo de imagem (JPEG/PNG/WebP/GIF).")
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setFormError("A foto deve ter no máximo 2 MB.")
      return
    }

    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    const preview = URL.createObjectURL(file)
    previewRef.current = preview
    setAvatarPreview(preview)
    setFormError(null)
    setUploading(true)

    try {
      const form = new FormData()
      form.append("avatar", file)
      const updated = await api.postForm<SafeUser>("/api/users/me/avatar", form)
      setUser(updated)
      await refreshUser().catch(() => undefined)
      showToast("Foto de perfil atualizada.")
    } catch (error) {
      // A prévia de um arquivo que não foi salvo não deve continuar na tela.
      if (previewRef.current) {
        URL.revokeObjectURL(previewRef.current)
        previewRef.current = null
      }
      setAvatarPreview(null)
      setFormError(error instanceof ApiError ? error.message : "Não foi possível enviar a foto.")
    } finally {
      setUploading(false)
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    if (newPassword && newPassword !== confirmPassword) {
      setFormError("A confirmação não confere com a nova senha.")
      return
    }
    if (newPassword && !currentPassword) {
      setFormError("Informe a senha atual para definir uma nova senha.")
      return
    }

    const payload: { name?: string; currentPassword?: string; newPassword?: string } = {}
    if (name.trim() !== user.name) payload.name = name.trim()
    if (newPassword) {
      payload.currentPassword = currentPassword
      payload.newPassword = newPassword
    }
    if (Object.keys(payload).length === 0) {
      setFormError("Nenhuma alteração para salvar.")
      return
    }

    setSaving(true)
    try {
      const updated = await api.patch<SafeUser>("/api/users/me", payload)
      setUser(updated)
      await refreshUser().catch(() => undefined)
      showToast("Perfil atualizado.")
      cancelEditing()
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : "Não foi possível salvar o perfil.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <SectionHeader
        icon="👤"
        title="Meu Perfil"
        subtitle="Seus dados de acesso e resumo de participação"
        action={
          !editing ? (
            <Button onClick={startEditing}>Editar perfil</Button>
          ) : (
            <Button variant="secondary" onClick={cancelEditing} disabled={saving || uploading}>
              Cancelar edição
            </Button>
          )
        }
      />

      <Card className="p-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          {avatarPreview ? (
            <img
              src={avatarPreview}
              alt="Prévia da nova foto de perfil"
              className={`w-20 h-20 rounded-full object-cover shrink-0 shadow-lg ${roleTheme.avatar}`}
            />
          ) : (
            <UserAvatar
              user={user}
              className={`w-20 h-20 rounded-full bg-gradient-to-br ${roleTheme.avatar} flex items-center justify-center text-white text-3xl font-black shrink-0 shadow-lg`}
              textClassName="text-3xl font-black"
            />
          )}
          <div className="text-center sm:text-left flex-1">
            <h2 className="text-xl font-extrabold text-gray-900 dark:text-white" style={{ fontFamily: "Nunito, sans-serif" }}>
              {user.name}
            </h2>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">{user.email}</p>
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300">
              <span aria-hidden="true">{ROLE_ICONS[user.role]}</span>
              {ROLE_LABELS[user.role]}
            </p>
            {editing && (
              <div className="mt-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="sr-only"
                  aria-label="Escolher foto de perfil"
                  onChange={(event) => void handleAvatarChange(event)}
                />
                <Button
                  variant="secondary"
                  className="text-xs px-3 py-1.5"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? "Enviando foto..." : "Trocar foto"}
                </Button>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  JPEG, PNG, WebP ou GIF — até 2 MB.
                </p>
              </div>
            )}
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm border-t border-gray-100 dark:border-slate-800 pt-5">
          <div>
            <dt className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Cadastro em</dt>
            <dd className="text-gray-800 dark:text-slate-200 mt-0.5">{formatBrDate(user.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Situação</dt>
            <dd className="text-green-600 dark:text-green-400 mt-0.5 font-semibold">Ativo</dd>
          </div>
        </dl>

        {user.role === "student" && minhasTurmas.length > 0 && (
          <div className="mt-5 border-t border-gray-100 dark:border-slate-800 pt-5 text-sm">
            <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Turma e curso</p>
            {minhasTurmas.map((klass) => (
              <p key={klass.id} className="text-gray-800 dark:text-slate-200 mt-0.5">
                {klass.name} — {klass.course}
              </p>
            ))}
          </div>
        )}

        {user.role === "teacher" && minhasMaterias.length > 0 && (
          <div className="mt-5 border-t border-gray-100 dark:border-slate-800 pt-5 text-sm">
            <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Matérias</p>
            <p className="text-gray-800 dark:text-slate-200 mt-0.5">
              {minhasMaterias.map((subject) => subject.name).join(", ")}
            </p>
          </div>
        )}

        {editing && (
          <form onSubmit={handleSave} className="mt-6 border-t border-gray-100 dark:border-slate-800 pt-5 space-y-4">
            <h3 className="text-base font-extrabold text-gray-900 dark:text-white" style={{ fontFamily: "Nunito, sans-serif" }}>
              Editar dados
            </h3>
            <Field label="Nome" htmlFor="profile-name" required>
              <Input
                id="profile-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                minLength={3}
                required
                autoComplete="name"
              />
            </Field>

            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold text-gray-700 dark:text-slate-300">
                Alterar senha (opcional)
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Senha atual" htmlFor="profile-current-password">
                  <Input
                    id="profile-current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    autoComplete="current-password"
                  />
                </Field>
                <Field label="Nova senha" htmlFor="profile-new-password">
                  <Input
                    id="profile-new-password"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    minLength={6}
                    autoComplete="new-password"
                  />
                </Field>
                <Field label="Confirmar nova senha" htmlFor="profile-confirm-password">
                  <Input
                    id="profile-confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    minLength={6}
                    autoComplete="new-password"
                  />
                </Field>
              </div>
            </fieldset>

            {formError && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {formError}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving || uploading}>
                {saving ? "Salvando..." : "Salvar alterações"}
              </Button>
              <Button variant="secondary" onClick={cancelEditing} disabled={saving || uploading}>
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </Card>

      <Card className="p-6 mt-5">
        <h3 className="text-base font-extrabold text-gray-900 dark:text-white mb-4" style={{ fontFamily: "Nunito, sans-serif" }}>
          Meus pontos
        </h3>
        {points.loading && <LoadingBlock rows={1} label="Carregando pontos" />}
        {!points.loading && points.error && <ErrorState message={points.error} onRetry={points.reload} />}
        {!points.loading && !points.error && points.data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-4">
              <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{balance}</p>
              <p className="text-xs text-gray-500 dark:text-slate-400 font-semibold mt-1">Saldo (pts)</p>
            </div>
            <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-4">
              <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{levelLabel(balance)}</p>
              <p className="text-xs text-gray-500 dark:text-slate-400 font-semibold mt-1">Nível atual</p>
            </div>
            <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-4">
              <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{points.data.currentStreakDays}</p>
              <p className="text-xs text-gray-500 dark:text-slate-400 font-semibold mt-1">Dias seguidos</p>
            </div>
            <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-4">
              <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{metaValue}</p>
              <p className="text-xs text-gray-500 dark:text-slate-400 font-semibold mt-1">{metaLabel}</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}