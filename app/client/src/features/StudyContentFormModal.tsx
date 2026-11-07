import { useEffect, useState, type FormEvent } from "react"
import type { Class, StudyContent, Subject } from "@shared/types"
import { api } from "../lib/api"
import { Button } from "../components/ui/Button"
import { Field, Input, Select, Textarea } from "../components/ui/Field"
import { Modal } from "../components/ui/Modal"
import { STUDY_CONTENT_LABELS } from "../lib/labels"

/** Mesma janela do schema do servidor (`questions.max(20)`). */
const MAX_QUESTIONS = 20

interface StudyContentFormModalProps {
  open: boolean
  onClose: () => void
  onSaved: (content: StudyContent, message: string) => void
  onError: (message: string) => void
  initial?: StudyContent | null
  /** Turmas do professor (`GET /api/classes` já vem escopado para ele). */
  classes: Class[]
  subjects: Subject[]
}

export function StudyContentFormModal({
  open,
  onClose,
  onSaved,
  onError,
  initial,
  classes,
  subjects,
}: StudyContentFormModalProps) {
  const isEdit = Boolean(initial)

  const [topic, setTopic] = useState("")
  const [subject, setSubject] = useState("")
  const [description, setDescription] = useState("")
  const [content, setContent] = useState("")
  const [points, setPoints] = useState("5")
  const [classIds, setClassIds] = useState<string[]>([])
  const [questions, setQuestions] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [fieldError, setFieldError] = useState("")

  // Reset só quando a janela abre (ou troca de reforço): depender de
  // `classes`/`subjects` aqui apagaria o que o professor já escreveu se uma
  // busca terminasse enquanto o formulário estiver aberto.
  useEffect(() => {
    if (!open) return
    setFieldError("")
    setQuestions([])
    if (initial) {
      setTopic(initial.topic)
      setSubject(initial.subject)
      setDescription(initial.description)
      setContent(initial.content)
      setPoints(String(initial.points))
      setClassIds(initial.classIds)
      setQuestions(initial.questions.length > 0 ? initial.questions : [""])
    } else {
      setTopic("")
      setSubject("")
      setDescription("")
      setContent("")
      setPoints("5")
      // Nenhuma turma marcada de saída: em reforço o público é uma escolha
      // explícita do professor (o aluno só recebe o que o professor escolheu).
      setClassIds([])
    }
  }, [open, initial])

  function toggleClass(classId: string) {
    setClassIds((prev) =>
      prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId],
    )
  }

  function updateQuestion(index: number, value: string) {
    setQuestions((prev) => prev.map((item, i) => (i === index ? value : item)))
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFieldError("")

    if (!topic.trim()) return setFieldError("Informe o título do reforço.")
    if (!subject) return setFieldError("Selecione a disciplina.")
    if (classIds.length === 0) return setFieldError("Selecione ao menos uma turma destinatária.")
    if (!content.trim()) return setFieldError("Escreva o conteúdo da lição que o aluno vai ler.")
    const pts = Number(points)
    if (!Number.isInteger(pts) || pts < 1 || pts > 100) {
      return setFieldError("A pontuação deve ser um número inteiro de 1 a 100.")
    }

    // Só as perguntas preenchidas vão no corpo: campo vazio não é questão.
    const payload = {
      topic: topic.trim(),
      subject,
      description: description.trim(),
      content: content.trim(),
      classIds,
      points: pts,
      questions: questions.map((question) => question.trim()).filter((question) => question.length > 0),
    }

    setSaving(true)
    try {
      if (initial) {
        const updated = await api.patch<StudyContent>(`/api/study-contents/${initial.id}`, payload)
        onSaved(updated, `Reforço "${updated.topic}" atualizado.`)
      } else {
        const created = await api.post<StudyContent>("/api/study-contents", payload)
        onSaved(created, `Reforço "${created.topic}" publicado nas turmas selecionadas.`)
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Falha ao salvar o reforço.")
    } finally {
      setSaving(false)
    }
  }

  // Turma que saiu do quadro ainda aparece marcada, com o nome de fallback: sem
  // isso, salvar a edição tiraria a turma do reforço sem o professor perceber.
  const classOptions: Array<{ id: string; label: string }> = [
    ...classes.map((klass) => ({ id: klass.id, label: `${klass.name} — ${klass.course}` })),
    ...(initial?.classIds ?? [])
      .filter((id) => !classes.some((klass) => klass.id === id))
      .map((id) => ({ id, label: "Turma removida" })),
  ]
  const semTurmas = classOptions.length === 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar reforço" : "Novo reforço"}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="study-content-form" disabled={saving || semTurmas}>
            {saving ? "Salvando..." : isEdit ? "Salvar alterações" : "Publicar reforço"}
          </Button>
        </>
      }
    >
      <form id="study-content-form" onSubmit={handleSubmit} className="space-y-4">
        {fieldError && (
          <p
            role="alert"
            className="text-xs text-red-600 bg-red-50 dark:bg-red-950/50 border border-red-100 dark:border-red-900 rounded-lg px-3 py-2"
          >
            ⚠️ {fieldError}
          </p>
        )}
        {semTurmas && (
          <p
            role="alert"
            className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900 rounded-lg px-3 py-2"
          >
            ⚠️ Suas turmas não carregaram. Feche esta janela e tente de novo — sem turma não dá para publicar reforço.
          </p>
        )}

        <Field label="Título do reforço" htmlFor="sc-topic" required>
          <Input
            id="sc-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Ex: Regra dos três"
            required
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Matéria" htmlFor="sc-subject" required>
            <Select
              id="sc-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            >
              {(subject === "" || subjects.length === 0) && (
                <option value="">Selecione a disciplina</option>
              )}
              {subjects.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.icon} {item.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Pontos"
            htmlFor="sc-points"
            hint="Crédito único de quem conclui o reforço (1 a 100)."
            hintId="sc-points-hint"
            required
          >
            <Input
              id="sc-points"
              type="number"
              min={1}
              max={100}
              step={1}
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              required
              aria-describedby="sc-points-hint"
            />
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
            Turmas destinatárias<span className="text-red-500 ml-0.5">*</span>
          </legend>
          {classOptions.map((option) => (
            <label
              key={option.id}
              htmlFor={`sc-class-${option.id}`}
              className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-200 cursor-pointer"
            >
              <input
                id={`sc-class-${option.id}`}
                type="checkbox"
                checked={classIds.includes(option.id)}
                onChange={() => toggleClass(option.id)}
                className="w-4 h-4 rounded border-gray-300 text-blue-700 focus:ring-2 focus:ring-blue-100"
              />
              {option.label}
            </label>
          ))}
        </fieldset>

        <Field
          label="Resumo para o aluno"
          htmlFor="sc-description"
          hint="Uma ou duas linhas. Aparece no cartão, mesmo com a lição fechada."
        >
          <Textarea
            id="sc-description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: Como usar a regra dos três em problemas de velocidade."
            maxLength={2000}
          />
        </Field>

        <Field label="Conteúdo da lição" htmlFor="sc-content" required>
          <Textarea
            id="sc-content"
            rows={8}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Escreva aqui a lição que o aluno vai ler ao expandir o cartão."
            maxLength={20000}
            required
          />
        </Field>

        <fieldset className="space-y-2">
          <legend className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
            {STUDY_CONTENT_LABELS.questions}
          </legend>
          {questions.map((question, index) => (
            <div key={`sc-question-${index}`} className="flex items-center gap-2">
              <Input
                aria-label={`Questão ${index + 1}`}
                value={question}
                onChange={(e) => updateQuestion(index, e.target.value)}
                placeholder="Ex: Resolva 3 : 12 = x : 8."
                maxLength={500}
              />
              <Button
                variant="ghost"
                onClick={() => removeQuestion(index)}
                aria-label={`Remover questão ${index + 1}`}
                className="text-xs px-2 py-1.5 shrink-0"
              >
                <span aria-hidden="true">✕</span>
              </Button>
            </div>
          ))}
          <Button
            variant="secondary"
            onClick={() => setQuestions((prev) => [...prev, ""])}
            disabled={questions.length >= MAX_QUESTIONS}
            className="text-xs px-3 py-1.5"
          >
            <span aria-hidden="true">+</span> Adicionar questão
          </Button>
        </fieldset>
      </form>
    </Modal>
  )
}
