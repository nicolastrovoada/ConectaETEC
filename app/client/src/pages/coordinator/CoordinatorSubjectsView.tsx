import { useCallback, useState, type FormEvent } from "react"
import type { Subject } from "@shared/types"
import { api } from "../../lib/api"
import { useAsync } from "../../hooks/useAsync"
import { useToast } from "../../context/ToastContext"
import { Button } from "../../components/ui/Button"
import { Card, SectionHeader } from "../../components/ui/Card"
import { Field, Input } from "../../components/ui/Field"
import { Modal } from "../../components/ui/Modal"
import { EmptyState, ErrorState, LoadingBlock } from "../../components/ui/EmptyState"

const EMOJI_OPTIONS = ["📘", "📕", "📗", "📙", "📐", "🧪", "💻", "🌎", "✍️", "🎨", "🎵", "🧠", "⚽", "📚", "🔬", "🗣️"]

export function CoordinatorSubjectsView() {
  const { showToast } = useToast()
  const subjects = useAsync<Subject[]>(useCallback(() => api.get<Subject[]>("/api/subjects"), []), [])
  const [modal, setModal] = useState<{ mode: "create" | "edit"; subject: Subject | null } | null>(null)

  async function removeSubject(subject: Subject) {
    if (!window.confirm(`Excluir a disciplina "${subject.name}"?`)) return
    try {
      await api.delete(`/api/subjects/${subject.id}`)
      showToast(`Disciplina "${subject.name}" excluída.`)
      subjects.reload()
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Falha ao excluir.", "error")
    }
  }

  return (
    <div>
      <SectionHeader
        icon="📖"
        title="Disciplinas"
        subtitle="Disciplinas oferecidas na escola"
        action={
          <Button onClick={() => setModal({ mode: "create", subject: null })} className="bg-green-700 hover:bg-green-800">
            + Nova disciplina
          </Button>
        }
      />

      {subjects.loading && <LoadingBlock rows={4} label="Carregando disciplinas" />}
      {!subjects.loading && subjects.error && <ErrorState message={subjects.error} onRetry={subjects.reload} />}
      {!subjects.loading && !subjects.error && (subjects.data ?? []).length === 0 && (
        <Card>
          <EmptyState icon="📖" title="Nenhuma disciplina cadastrada" description="Cadastre a primeira disciplina da escola." />
        </Card>
      )}

      {!subjects.loading && !subjects.error && (subjects.data ?? []).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {subjects.data?.map((subject) => (
            <Card key={subject.id} className="p-4 flex flex-col">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-slate-800 flex items-center justify-center text-xl" aria-hidden="true">
                  {subject.icon}
                </div>
                <h3 className="text-sm font-extrabold text-gray-900 dark:text-white leading-snug" style={{ fontFamily: "Nunito, sans-serif" }}>
                  {subject.name}
                </h3>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">
                {subject.teacherIds.length} professor(es) · {subject.classIds.length} turma(s)
              </p>
              <div className="mt-auto flex gap-2">
                <Button variant="secondary" className="text-xs px-3 py-1.5" onClick={() => setModal({ mode: "edit", subject })}>
                  ✏️ Editar
                </Button>
                <Button variant="ghost" className="text-xs px-3 py-1.5 text-red-600 dark:text-red-400" onClick={() => void removeSubject(subject)}>
                  🗑️ Excluir
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {modal && (
        <SubjectFormModal
          mode={modal.mode}
          subject={modal.subject}
          onClose={() => setModal(null)}
          onSaved={(message) => {
            setModal(null)
            subjects.reload()
            showToast(message)
          }}
        />
      )}
    </div>
  )
}

function SubjectFormModal({
  mode,
  subject,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit"
  subject: Subject | null
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const isEdit = mode === "edit"
  const [name, setName] = useState(subject?.name ?? "")
  const [icon, setIcon] = useState(subject?.icon ?? "📘")
  const [saving, setSaving] = useState(false)
  const [fieldError, setFieldError] = useState("")

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFieldError("")
    if (name.trim().length < 1) return setFieldError("Informe o nome da disciplina.")

    setSaving(true)
    try {
      const payload = { name: name.trim(), icon }
      if (isEdit && subject) {
        await api.patch(`/api/subjects/${subject.id}`, payload)
        onSaved("Disciplina atualizada.")
      } else {
        await api.post("/api/subjects", payload)
        onSaved(`Disciplina "${name.trim()}" criada.`)
      }
    } catch (err) {
      setFieldError(err instanceof Error ? err.message : "Falha ao salvar disciplina.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? `Editar ${subject?.name ?? "disciplina"}` : "Nova disciplina"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="subject-form" disabled={saving} className="bg-green-700 hover:bg-green-800">
            {saving ? "Salvando..." : isEdit ? "Salvar alterações" : "Criar disciplina"}
          </Button>
        </>
      }
    >
      <form id="subject-form" onSubmit={handleSubmit} className="space-y-4">
        {fieldError && (
          <p role="alert" className="text-xs text-red-600 bg-red-50 dark:bg-red-950/50 border border-red-100 dark:border-red-900 rounded-lg px-3 py-2">
            ⚠️ {fieldError}
          </p>
        )}
        <Field label="Nome da disciplina" htmlFor="subj-name" required>
          <Input id="subj-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Matemática" required />
        </Field>
        <fieldset>
          <legend className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-2">Ícone</legend>
          <div className="flex flex-wrap gap-2">
            {EMOJI_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setIcon(option)}
                aria-label={`Usar ícone ${option}`}
                aria-pressed={icon === option}
                className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-colors ${
                  icon === option
                    ? "bg-green-100 dark:bg-green-900/50 ring-2 ring-green-500"
                    : "bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </fieldset>
      </form>
    </Modal>
  )
}