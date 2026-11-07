import { useCallback, useState, type FormEvent } from "react"
import type { Class, ClassShift } from "@shared/types"
import { CLASS_SHIFT_LABELS } from "../../lib/labels"
import { api } from "../../lib/api"
import { useAsync } from "../../hooks/useAsync"
import { useToast } from "../../context/ToastContext"
import { Button } from "../../components/ui/Button"
import { Card, SectionHeader } from "../../components/ui/Card"
import { Field, Input, Select } from "../../components/ui/Field"
import { Modal } from "../../components/ui/Modal"
import { EmptyState, ErrorState, LoadingBlock } from "../../components/ui/EmptyState"

export function CoordinatorClassesView() {
  const { showToast } = useToast()
  const classes = useAsync<Class[]>(useCallback(() => api.get<Class[]>("/api/classes"), []), [])
  const [modal, setModal] = useState<{ mode: "create" | "edit"; klass: Class | null } | null>(null)

  async function removeClass(klass: Class) {
    if (!window.confirm(`Excluir a turma "${klass.name}"? Os vínculos de alunos e professores serão removidos.`)) return
    try {
      await api.delete(`/api/classes/${klass.id}`)
      showToast(`Turma "${klass.name}" excluída.`)
      classes.reload()
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Falha ao excluir.", "error")
    }
  }

  return (
    <div>
      <SectionHeader
        icon="🏫"
        title="Turmas"
        subtitle="Monte e gerencie as turmas da escola"
        action={
          <Button onClick={() => setModal({ mode: "create", klass: null })} className="bg-green-700 hover:bg-green-800">
            + Nova turma
          </Button>
        }
      />

      {classes.loading && <LoadingBlock rows={4} label="Carregando turmas" />}
      {!classes.loading && classes.error && <ErrorState message={classes.error} onRetry={classes.reload} />}
      {!classes.loading && !classes.error && (classes.data ?? []).length === 0 && (
        <Card>
          <EmptyState icon="🏫" title="Nenhuma turma cadastrada" description="Crie a primeira turma para começar." />
        </Card>
      )}

      {!classes.loading && !classes.error && (classes.data ?? []).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.data?.map((klass) => (
            <Card key={klass.id} className="p-5">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <h3 className="text-base font-extrabold text-gray-900 dark:text-white truncate" style={{ fontFamily: "Nunito, sans-serif" }}>
                    {klass.name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-slate-400 font-semibold">{klass.course}</p>
                </div>
                <span className={`text-[11px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${klass.active ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" : "bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400"}`}>
                  {klass.active ? "Ativa" : "Inativa"}
                </span>
              </div>
              <div className="text-xs text-gray-500 dark:text-slate-400 space-y-1 mb-4">
                <p>{CLASS_SHIFT_LABELS[klass.shift]} — {klass.year}º ano</p>
                <p>👥 {klass.studentIds.length} aluno(s) · 👩‍🏫 {klass.teacherIds.length} professor(es)</p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" className="text-xs px-3 py-1.5" onClick={() => setModal({ mode: "edit", klass })}>
                  ✏️ Editar
                </Button>
                <Button variant="ghost" className="text-xs px-3 py-1.5 text-red-600 dark:text-red-400" onClick={() => void removeClass(klass)}>
                  🗑️ Excluir
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {modal && (
        <ClassFormModal
          mode={modal.mode}
          klass={modal.klass}
          onClose={() => setModal(null)}
          onSaved={(message) => {
            setModal(null)
            classes.reload()
            showToast(message)
          }}
        />
      )}
    </div>
  )
}

function ClassFormModal({
  mode,
  klass,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit"
  klass: Class | null
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const isEdit = mode === "edit"
  const [name, setName] = useState(klass?.name ?? "")
  const [course, setCourse] = useState(klass?.course ?? "")
  const [year, setYear] = useState(String(klass?.year ?? 1))
  const [shift, setShift] = useState<ClassShift>(klass?.shift ?? "morning")
  const [active, setActive] = useState(klass?.active ?? true)
  const [saving, setSaving] = useState(false)
  const [fieldError, setFieldError] = useState("")

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFieldError("")
    if (name.trim().length < 1) return setFieldError("Informe o nome da turma.")
    if (course.trim().length < 1) return setFieldError("Informe o curso.")
    const yr = Number(year)
    if (!Number.isInteger(yr) || yr < 1 || yr > 5) return setFieldError("Ano deve ser entre 1 e 5.")

    setSaving(true)
    try {
      const payload = { name: name.trim(), course: course.trim(), year: yr, shift, active }
      if (isEdit && klass) {
        await api.patch(`/api/classes/${klass.id}`, payload)
        onSaved("Turma atualizada.")
      } else {
        await api.post("/api/classes", payload)
        onSaved(`Turma "${name.trim()}" criada.`)
      }
    } catch (err) {
      setFieldError(err instanceof Error ? err.message : "Falha ao salvar turma.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? `Editar turma ${klass?.name ?? ""}` : "Nova turma"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="class-form" disabled={saving} className="bg-green-700 hover:bg-green-800">
            {saving ? "Salvando..." : isEdit ? "Salvar alterações" : "Criar turma"}
          </Button>
        </>
      }
    >
      <form id="class-form" onSubmit={handleSubmit} className="space-y-4">
        {fieldError && (
          <p role="alert" className="text-xs text-red-600 bg-red-50 dark:bg-red-950/50 border border-red-100 dark:border-red-900 rounded-lg px-3 py-2">
            ⚠️ {fieldError}
          </p>
        )}
        <Field label="Nome da turma" htmlFor="cls-name" required>
          <Input id="cls-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: 2º DS — Manhã" required />
        </Field>
        <Field label="Curso" htmlFor="cls-course" required>
          <Input id="cls-course" value={course} onChange={(e) => setCourse(e.target.value)} placeholder="Ex: Desenvolvimento de Sistemas" required />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Ano" htmlFor="cls-year" required>
            <Select id="cls-year" value={year} onChange={(e) => setYear(e.target.value)}>
              {[1, 2, 3, 4, 5].map((y) => (
                <option key={y} value={y}>
                  {y}º ano
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Período" htmlFor="cls-shift" required>
            <Select id="cls-shift" value={shift} onChange={(e) => setShift(e.target.value as ClassShift)}>
              <option value="morning">Manhã</option>
              <option value="afternoon">Tarde</option>
              <option value="evening">Noite</option>
            </Select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300 cursor-pointer">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="w-4 h-4 rounded accent-green-700" />
          Turma ativa
        </label>
      </form>
    </Modal>
  )
}