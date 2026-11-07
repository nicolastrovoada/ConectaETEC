import { useEffect, useMemo, useState, type FormEvent } from "react"
import type { Activity, Submission } from "@shared/types"
import { api } from "../lib/api"
import { useAsync } from "../hooks/useAsync"
import { useToast } from "../context/ToastContext"
import { Button } from "../components/ui/Button"
import { SubmissionStatusBadge } from "../components/ui/Badge"
import { Field, Input, Textarea } from "../components/ui/Field"
import { Modal } from "../components/ui/Modal"
import { ErrorState, LoadingBlock } from "../components/ui/EmptyState"
import { formatBrDateTime, formatBytes } from "../lib/format"
import {
  ACCEPTED_ATTACHMENT_TYPES,
  ALLOWED_ATTACHMENT_MIME,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  attachmentLimitLabel,
} from "../lib/attachments"

interface StudentSubmitModalProps {
  open: boolean
  activity: Activity | null
  onClose: () => void
  onSubmitted: () => void
}

export function StudentSubmitModal({ open, activity, onClose, onSubmitted }: StudentSubmitModalProps) {
  const { showToast } = useToast()
  const [comment, setComment] = useState("")
  const [evidence, setEvidence] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [formError, setFormError] = useState("")

  const existing = useAsync<Submission[]>(
    () => (activity ? api.get<Submission[]>("/api/submissions", { activityId: activity.id }) : Promise.resolve([])),
    [activity?.id, open],
  )

  const mySubmission = useMemo(() => (existing.data && existing.data.length > 0 ? existing.data[0] : null), [existing.data])

  useEffect(() => {
    if (!open) return
    setComment("")
    setEvidence("")
    setFiles([])
    setFormError("")
  }, [open, activity?.id])

  if (!activity) return null

  const locked = mySubmission !== null && mySubmission.status !== "revision_required"

  function handleFilesChange(fileList: FileList | null) {
    setFormError("")
    if (!fileList) {
      setFiles([])
      return
    }
    const next = Array.from(fileList).slice(0, MAX_ATTACHMENTS)
    for (const file of next) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setFormError(`O arquivo "${file.name}" excede o limite de 5 MB.`)
        return
      }
      if (!ALLOWED_ATTACHMENT_MIME.has(file.type)) {
        setFormError(`O arquivo "${file.name}" deve ser imagem (JPG, PNG, WEBP, GIF) ou PDF.`)
        return
      }
    }
    setFiles(next)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!activity) return
    setFormError("")
    if (!comment.trim() && !evidence.trim() && files.length === 0) {
      setFormError("Descreva a evidência ou anexe um arquivo antes de enviar.")
      return
    }
    const form = new FormData()
    form.set("comment", comment.trim())
    form.set("evidence", evidence.trim())
    files.forEach((file) => form.append("attachments", file, file.name))

    setSending(true)
    try {
      await api.postForm<Submission>(`/api/activities/${activity.id}/submissions`, form)
      showToast(mySubmission ? "Entrega reenviada para correção." : "Entrega enviada! Aguarde a validação.")
      onSubmitted()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Falha ao enviar a entrega.")
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mySubmission ? "Reenviar entrega" : "Enviar entrega"}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={sending}>
            Cancelar
          </Button>
          <Button type="submit" form="student-submit-form" disabled={sending || locked}>
            {sending ? "Enviando..." : mySubmission ? "Reenviar entrega" : "Enviar entrega"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-4">
          <p className="text-sm font-bold text-gray-900 dark:text-white">{activity.title}</p>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
            Prazo: {activity.deadline} · Vale {activity.points} pts ao ser aprovada.
          </p>
        </div>

        {existing.loading && <LoadingBlock rows={1} label="Verificando entrega atual" />}
        {!existing.loading && existing.error && <ErrorState message={existing.error} onRetry={existing.reload} />}

        {!existing.loading && !existing.error && mySubmission && (
          <div className="flex items-center justify-between bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3">
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-slate-400">Status da sua entrega</p>
              <p className="text-sm text-gray-800 dark:text-slate-200 mt-0.5">
                Enviada em {formatBrDateTime(mySubmission.submittedAt)}
              </p>
            </div>
            <SubmissionStatusBadge status={mySubmission.status} />
          </div>
        )}

        {locked && (
          <p role="alert" className="text-xs text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900 rounded-xl px-3 py-2">
            Você já enviou esta atividade. Reenvio é permitido apenas quando houver correção solicitada.
          </p>
        )}

        {mySubmission?.feedback && (
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 mb-1">Feedback recebido</p>
            <p className="text-sm text-gray-800 dark:text-slate-200 bg-yellow-50 dark:bg-yellow-950/40 border border-yellow-100 dark:border-yellow-900 rounded-xl p-3 whitespace-pre-wrap">
              {mySubmission.feedback}
            </p>
          </div>
        )}

        {!locked && (
          <form id="student-submit-form" onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <p role="alert" className="text-xs text-red-600 bg-red-50 dark:bg-red-950/50 border border-red-100 dark:border-red-900 rounded-lg px-3 py-2">
                ⚠️ {formError}
              </p>
            )}
            <Field label="Evidência (descrição)" htmlFor="sub-evidence" hint="Explique o que você fez para concluir a atividade.">
              <Textarea id="sub-evidence" rows={2} value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Ex: Realizei os 10 exercícios e fotografei o caderno." maxLength={3000} />
            </Field>
            <Field label="Comentário" htmlFor="sub-comment" hint="Opcional — espaço para observações.">
              <Textarea id="sub-comment" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ex: Fiz em dupla com uma colega." maxLength={3000} />
            </Field>
            <Field
              label={`Anexos (${attachmentLimitLabel()})`}
              htmlFor="sub-files"
            >
              <Input
                id="sub-files"
                type="file"
                multiple
                accept={ACCEPTED_ATTACHMENT_TYPES}
                onChange={(e) => handleFilesChange(e.target.files)}
                disabled={sending}
              />
            </Field>
            {files.length > 0 && (
              <ul className="text-xs text-gray-600 dark:text-slate-300 space-y-1" aria-label="Arquivos selecionados">
                {files.map((file) => (
                  <li key={file.name} className="flex items-center gap-2">
                    <span aria-hidden="true">📎</span>
                    <span className="truncate flex-1">{file.name}</span>
                    <span className="text-gray-400">{formatBytes(file.size)}</span>
                  </li>
                ))}
              </ul>
            )}
          </form>
        )}
      </div>
    </Modal>
  )
}