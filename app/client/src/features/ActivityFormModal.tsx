import { useEffect, useState, type FormEvent } from "react"
import type { Activity, ActivityType, Class, Subject } from "@shared/types"
import { ACTIVITY_TYPE_LABELS } from "@shared/types"
import { api } from "../lib/api"
import { Button } from "../components/ui/Button"
import { Field, Input, Select, Textarea } from "../components/ui/Field"
import { Modal } from "../components/ui/Modal"

export const OPERATIONAL_TYPES: ActivityType[] = ["school_action", "event", "library", "support"]

interface ActivityFormModalProps {
  open: boolean
  onClose: () => void
  onSaved: (activity: Activity, message: string) => void
  onError: (message: string) => void
  initial?: Activity | null
  role: "teacher" | "staff" | "coordinator"
  classes: Class[]
  subjects: Subject[]
}

function toDateInputValue(deadline: string): string {
  const match = deadline.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return match ? `${match[3]}-${match[2]}-${match[1]}` : ""
}

function toBrDeadline(dateValue: string): string {
  const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : ""
}

export function ActivityFormModal({ open, onClose, onSaved, onError, initial, role, classes, subjects }: ActivityFormModalProps) {
  const isEdit = Boolean(initial)

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [type, setType] = useState<ActivityType>("academic")
  const [subjectId, setSubjectId] = useState("")
  const [classId, setClassId] = useState("")
  const [points, setPoints] = useState("10")
  const [deadline, setDeadline] = useState("")
  const [lateWindowDays, setLateWindowDays] = useState("7")
  const [status, setStatus] = useState<"draft" | "active">("draft")
  const [saving, setSaving] = useState(false)
  const [fieldError, setFieldError] = useState("")

  useEffect(() => {
    if (!open) return
    setFieldError("")
    if (initial) {
      setTitle(initial.title)
      setDescription(initial.description)
      setType(initial.type)
      setSubjectId(initial.subjectId)
      setClassId(initial.classId)
      setPoints(String(initial.points))
      setDeadline(toDateInputValue(initial.deadline))
      setLateWindowDays(String(initial.lateWindowDays))
    } else {
      setTitle("")
      setDescription("")
      setType(role === "teacher" ? "academic" : "school_action")
      setSubjectId(subjects[0]?.id ?? "")
      setClassId(classes[0]?.id ?? "")
      setPoints("10")
      setDeadline("")
      setLateWindowDays("7")
      setStatus("draft")
    }
  }, [open, initial, role, subjects, classes])

  const allowedTypes: ActivityType[] = role === "staff" ? OPERATIONAL_TYPES : role === "coordinator" && initial ? [initial.type] : ["academic", "school_action", "event", "library", "support", "other"]

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFieldError("")

    if (!title.trim() || title.trim().length < 3) {
      setFieldError("O título deve ter ao menos 3 caracteres.")
      return
    }
    if (!subjectId) return setFieldError("Selecione uma disciplina.")
    if (!classId) return setFieldError("Selecione uma turma.")
    const pts = Number(points)
    if (!Number.isInteger(pts) || pts <= 0) {
      setFieldError("Pontos deve ser um número inteiro positivo.")
      return
    }
    if (!deadline) {
      setFieldError("Informe o prazo de entrega.")
      return
    }
    const br = toBrDeadline(deadline)
    if (!br) {
      setFieldError("Data inválida. Use o formato DD/MM/AAAA.")
      return
    }
    // `Number("")` é 0 — sem o teste do texto vazio, um campo limpo viraria
    // "sem tolerância" silenciosamente. Espelha o schema do servidor (0..90).
    const late = Number(lateWindowDays)
    if (lateWindowDays.trim() === "" || !Number.isInteger(late) || late < 0 || late > 90) {
      setFieldError("Tolerância de entrega deve ser um número inteiro de 0 a 90 dias.")
      return
    }

    const payload = {
      title: title.trim(),
      description: description.trim(),
      subjectId,
      classId,
      points: pts,
      deadline: br,
      lateWindowDays: late,
      type,
    }

    setSaving(true)
    try {
      if (isEdit && initial) {
        const updated = await api.patch<Activity>(`/api/activities/${initial.id}`, payload)
        onSaved(updated, "Atividade atualizada com sucesso.")
      } else {
        const created = await api.post<Activity>("/api/activities", { ...payload, status })
        onSaved(created, status === "active" ? "Atividade publicada! Turma notificada." : "Rascunho salvo.")
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Falha ao salvar atividade.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar atividade" : "Nova atividade"}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="activity-form" disabled={saving}>
            {saving ? "Salvando..." : isEdit ? "Salvar alterações" : status === "active" ? "Publicar" : "Salvar rascunho"}
          </Button>
        </>
      }
    >
      <form id="activity-form" onSubmit={handleSubmit} className="space-y-4">
        {fieldError && (
          <p role="alert" className="text-xs text-red-600 bg-red-50 dark:bg-red-950/50 border border-red-100 dark:border-red-900 rounded-lg px-3 py-2">
            ⚠️ {fieldError}
          </p>
        )}

        <Field label="Título da atividade" htmlFor="act-title" required>
          <Input
            id="act-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Lista de exercícios — Juros Compostos"
            required
          />
        </Field>

        <Field label="Descrição" htmlFor="act-desc" hint="Opcional. Instruções, materiais e critérios.">
          <Textarea id="act-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descreva o que deve ser entregue..." />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Tipo de atividade" htmlFor="act-type" required>
            <Select id="act-type" value={type} onChange={(e) => setType(e.target.value as ActivityType)} disabled={role === "coordinator" && isEdit}>
              {allowedTypes.map((t) => (
                <option key={t} value={t}>
                  {ACTIVITY_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Pontos" htmlFor="act-points" required>
            <Input id="act-points" type="number" min={1} step={1} value={points} onChange={(e) => setPoints(e.target.value)} placeholder="10" required />
          </Field>

          <Field label="Disciplina" htmlFor="act-subject" required>
            <Select id="act-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
              <option value="" disabled>
                Selecione a disciplina
              </option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon} {s.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Turma" htmlFor="act-class" required>
            <Select id="act-class" value={classId} onChange={(e) => setClassId(e.target.value)} required>
              <option value="" disabled>
                Selecione a turma
              </option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.course}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Prazo de entrega"
            htmlFor="act-deadline"
            hint="Preencha a data-limite no formato DD/MM/AAAA."
            hintId="act-deadline-hint"
            required
          >
            <Input
              id="act-deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              required
              aria-describedby="act-deadline-hint"
            />
          </Field>

          <Field
            label="Tolerância de entrega (dias)"
            htmlFor="act-late-window"
            hint="Dias extras após o prazo em que a entrega ainda é aceita. Padrão: 7 dias, máximo: 90. Com 0, o dia do prazo continua valendo, mas no dia seguinte o envio já é bloqueado."
            hintId="act-late-window-hint"
            required
          >
            <Input
              id="act-late-window"
              type="number"
              min={0}
              max={90}
              step={1}
              value={lateWindowDays}
              onChange={(e) => setLateWindowDays(e.target.value)}
              required
              aria-describedby="act-late-window-hint"
            />
          </Field>

          {!isEdit && (
            <Field label="Publicação" htmlFor="act-status" required>
              <Select id="act-status" value={status} onChange={(e) => setStatus(e.target.value as "draft" | "active")}>
                <option value="draft">Salvar como rascunho</option>
                <option value="active">Publicar imediatamente (notifica a turma)</option>
              </Select>
            </Field>
          )}
        </div>
      </form>
    </Modal>
  )
}