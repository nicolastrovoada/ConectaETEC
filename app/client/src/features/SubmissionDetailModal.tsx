import { useState } from "react"
import type { Activity, Attachment, Submission } from "@shared/types"
import { api, downloadFile } from "../lib/api"
import { useToast } from "../context/ToastContext"
import { Button } from "../components/ui/Button"
import { SubmissionStatusBadge } from "../components/ui/Badge"
import { Field, Textarea } from "../components/ui/Field"
import { Modal } from "../components/ui/Modal"
import { formatBrDateTime, formatBytes } from "../lib/format"

interface SubmissionDetailModalProps {
  submission: Submission | null
  activity: Activity | null
  studentLabel: string
  /** true quando o papel do usuário pode validar (=validador). */
  canValidate: boolean
  onClose: () => void
  onValidated: (submission: Submission, message: string) => void
  onError: (message: string) => void
}

export function SubmissionDetailModal({ submission, activity, studentLabel, canValidate, onClose, onValidated, onError }: SubmissionDetailModalProps) {
  const { showToast } = useToast()
  const [feedback, setFeedback] = useState("")
  const [action, setAction] = useState<"approve" | "reject" | "revision" | null>(null)
  const [saving, setSaving] = useState(false)

  if (!submission) return null

  const validatable = ["pending", "submitted", "under_review", "revision_required"].includes(submission.status)

  function reset() {
    setFeedback("")
    setAction(null)
  }

  async function handleValidate(next: "approve" | "reject" | "revision") {
    if (!submission) return
    if (next !== "approve" && !feedback.trim()) {
      setAction(next)
      showToast("Feedback obrigatório para reprovar ou solicitar correção.", "error")
      return
    }
    setAction(next)
    setSaving(true)
    try {
      const updated = await api.post<Submission>(`/api/submissions/${submission.id}/validate`, {
        action: next,
        feedback: feedback.trim(),
      })
      onValidated(updated, next === "approve" ? "Entrega aprovada! Pontos creditados." : next === "reject" ? "Entrega reprovada." : "Correção solicitada ao aluno.")
      reset()
    } catch (err) {
      onError(err instanceof Error ? err.message : "Falha ao validar entrega.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={submission !== null} onClose={onClose} title="Detalhes da entrega" wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div>
            <p className="text-sm text-gray-500 dark:text-slate-400">Atividade</p>
            <p className="text-sm font-bold text-gray-900 dark:text-white">{activity?.title ?? submission.activityId}</p>
          </div>
          <div className="flex items-center gap-2">
            <SubmissionStatusBadge status={submission.status} />
            {activity && <span className="text-sm font-black text-blue-700 dark:text-blue-400">{activity.points} pts</span>}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm bg-gray-50 dark:bg-slate-800 rounded-xl p-4">
          <div>
            <dt className="text-xs font-semibold text-gray-500 dark:text-slate-400">Aluno</dt>
            <dd className="text-gray-800 dark:text-slate-200 font-semibold mt-0.5">{studentLabel}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-gray-500 dark:text-slate-400">Enviada em</dt>
            <dd className="text-gray-800 dark:text-slate-200 mt-0.5">{formatBrDateTime(submission.submittedAt)}</dd>
          </div>
        </dl>

        {submission.comment && (
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 mb-1">Comentário do aluno</p>
            <p className="text-sm text-gray-800 dark:text-slate-200 bg-gray-50 dark:bg-slate-800 rounded-xl p-3 whitespace-pre-wrap">{submission.comment}</p>
          </div>
        )}
        {submission.evidence && (
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 mb-1">Descrição da evidência</p>
            <p className="text-sm text-gray-800 dark:text-slate-200 bg-gray-50 dark:bg-slate-800 rounded-xl p-3 whitespace-pre-wrap">{submission.evidence}</p>
          </div>
        )}

        {submission.attachments.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 mb-2">
              Anexos ({submission.attachments.length})
            </p>
            <ul className="space-y-2">
              {submission.attachments.map((attachment: Attachment) => (
                <li key={attachment.id}>
                  <button
                    type="button"
                    onClick={() => downloadFile(`/api/submissions/${submission.id}/attachments/${attachment.id}`)}
                    className="w-full flex items-center gap-3 bg-gray-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 rounded-xl px-3 py-2 text-left transition-colors"
                  >
                    <span aria-hidden="true">📎</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-gray-800 dark:text-slate-200 truncate">{attachment.filename}</span>
                      <span className="block text-xs text-gray-500 dark:text-slate-400">
                        {formatBytes(attachment.size)} · subido em {formatBrDateTime(attachment.uploadedAt)}
                      </span>
                    </span>
                    <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">Baixar ↓</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {submission.feedback && (
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 mb-1">Feedback do validador</p>
            <p className="text-sm text-gray-800 dark:text-slate-200 bg-yellow-50 dark:bg-yellow-950/40 border border-yellow-100 dark:border-yellow-900 rounded-xl p-3 whitespace-pre-wrap">
              {submission.feedback}
            </p>
          </div>
        )}

        {canValidate && validatable && (
          <div className="border-t border-gray-100 dark:border-slate-800 pt-4 space-y-3">
            <p className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wide">Validar entrega</p>
            <Field label="Feedback (obrigatório para reprovar ou solicitar correção)" htmlFor="val-feedback">
              <Textarea
                id="val-feedback"
                rows={3}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Mensagem ao aluno..."
                maxLength={2000}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button variant="success" disabled={saving} onClick={() => void handleValidate("approve")}>
                {saving && action === "approve" ? "Processando..." : "✅ Aprovar"}
              </Button>
              <Button variant="danger" disabled={saving} onClick={() => void handleValidate("reject")}>
                {saving && action === "reject" ? "Processando..." : "❌ Reprovar"}
              </Button>
              <Button variant="secondary" disabled={saving} onClick={() => void handleValidate("revision")}>
                {saving && action === "revision" ? "Processando..." : "✏️ Solicitar correção"}
              </Button>
            </div>
          </div>
        )}

        {canValidate && !validatable && (
          <p className="text-xs text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-800 rounded-xl px-3 py-2">
            Esta entrega já foi validada e não pode mais ser alterada.
          </p>
        )}
      </div>
    </Modal>
  )
}