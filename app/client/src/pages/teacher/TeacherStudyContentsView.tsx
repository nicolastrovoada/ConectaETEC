import { useCallback, useMemo, useState } from "react"
import type { Class, StudyContent, Subject } from "@shared/types"
import { api, downloadFile } from "../../lib/api"
import { useAsync } from "../../hooks/useAsync"
import { useToast } from "../../context/ToastContext"
import { useUser } from "../../context/UserContext"
import { Button } from "../../components/ui/Button"
import { Card, SectionHeader } from "../../components/ui/Card"
import { EmptyState, ErrorState, LoadingBlock } from "../../components/ui/EmptyState"
import { Field, Input } from "../../components/ui/Field"
import { Modal } from "../../components/ui/Modal"
import { StudyContentCard, questionsSummary } from "../../features/StudyContentCard"
import { StudyContentFormModal } from "../../features/StudyContentFormModal"
import { STUDY_CONTENT_LABELS } from "../../lib/labels"
import { formatBrDateTime, formatBytes } from "../../lib/format"
import {
  ACCEPTED_ATTACHMENT_TYPES,
  ALLOWED_ATTACHMENT_MIME,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  attachmentLimitLabel,
} from "../../lib/attachments"

/**
 * "Meus reforços" do professor (3.2).
 *
 * A listagem JÁ vem escopada pelo servidor (R28/3.1: professor vê só o reforço
 * que é dele), então a tela não filtra nada — mas as ações de editar/excluir
 * seguem o dono (`teacherId`), que é a mesma regra de `canManageStudyContent`.
 * Um reforço concluído por aluno não pode ser removido (409 do servidor, os
 * pontos já foram creditados): isso vira mensagem de negócio, não tela quebrada.
 */
export function TeacherStudyContentsView() {
  const { user } = useUser()
  const { showToast } = useToast()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<StudyContent | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<StudyContent | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  /** Arquivos escolhidos por reforço, esperando o clique em "Anexar". */
  const [pendingFiles, setPendingFiles] = useState<Record<string, File[]>>({})

  const contents = useAsync<StudyContent[]>(
    useCallback(() => api.get<StudyContent[]>("/api/study-contents"), []),
    [],
  )
  const classes = useAsync<Class[]>(useCallback(() => api.get<Class[]>("/api/classes"), []), [])
  const subjects = useAsync<Subject[]>(useCallback(() => api.get<Subject[]>("/api/subjects"), []), [])

  const classById = useMemo(() => new Map((classes.data ?? []).map((c) => [c.id, c])), [classes.data])

  /** Espelha `canManageStudyContent` do servidor: quem criou é quem gerencia. */
  const canManage = useCallback(
    (content: StudyContent) => content.teacherId === user.id,
    [user.id],
  )

  function classNamesOf(content: StudyContent): string {
    return content.classIds
      .map((id) => classById.get(id)?.name ?? "Turma removida")
      .join(", ")
  }

  async function handleDelete(content: StudyContent) {
    try {
      await api.delete(`/api/study-contents/${content.id}`)
      setConfirmDelete(null)
      contents.reload()
      showToast(`Reforço "${content.topic}" excluído.`)
    } catch (err) {
      setConfirmDelete(null)
      showToast(err instanceof Error ? err.message : "Falha ao excluir o reforço.", "error")
    }
  }

  function handleFilesChange(contentId: string, fileList: FileList | null) {
    if (!fileList) {
      setPendingFiles((prev) => ({ ...prev, [contentId]: [] }))
      return
    }
    const files = Array.from(fileList)
    const invalid = files.find(
      (file) => file.size > MAX_ATTACHMENT_BYTES || !ALLOWED_ATTACHMENT_MIME.has(file.type),
    )
    if (invalid) {
      showToast(`"${invalid.name}" não é aceito: use imagem ou PDF de até 5 MB.`, "error")
      setPendingFiles((prev) => ({ ...prev, [contentId]: [] }))
      return
    }
    setPendingFiles((prev) => ({ ...prev, [contentId]: files.slice(0, MAX_ATTACHMENTS) }))
  }

  async function handleUpload(content: StudyContent) {
    const files = pendingFiles[content.id] ?? []
    if (files.length === 0) return
    const form = new FormData()
    files.forEach((file) => form.append("attachments", file, file.name))

    setUploadingId(content.id)
    try {
      await api.postForm(`/api/study-contents/${content.id}/attachments`, form)
      setPendingFiles((prev) => ({ ...prev, [content.id]: [] }))
      contents.reload()
      showToast(
        files.length === 1
          ? `Material anexado a "${content.topic}".`
          : `${files.length} arquivos anexados a "${content.topic}".`,
      )
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Falha ao anexar o material.", "error")
    } finally {
      setUploadingId(null)
    }
  }

  function renderCard(content: StudyContent) {
    const mine = canManage(content)
    const selected = pendingFiles[content.id] ?? []

    return (
      <StudyContentCard
        key={content.id}
        content={content}
        footer={
          mine ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditing(content)
                    setFormOpen(true)
                  }}
                  className="text-xs px-3 py-1.5"
                >
                  <span aria-hidden="true">✏️</span> Editar
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setConfirmDelete(content)}
                  className="text-xs px-3 py-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  <span aria-hidden="true">🗑️</span> Excluir
                </Button>
              </div>

              <div className="space-y-2">
                {content.attachments.length > 0 && (
                  <ul className="space-y-1.5" aria-label={STUDY_CONTENT_LABELS.attachments}>
                    {content.attachments.map((attachment) => (
                      <li key={attachment.id}>
                        <Button
                          variant="secondary"
                          onClick={() => void downloadFile(`/uploads/${attachment.storedName}`)}
                          className="w-full justify-between text-xs px-3 py-2"
                        >
                          <span className="truncate">
                            <span aria-hidden="true">📄</span> {attachment.filename}
                          </span>
                          <span className="text-gray-400 dark:text-slate-400 shrink-0 ml-2">
                            {formatBytes(attachment.size)} · {formatBrDateTime(attachment.uploadedAt)}
                          </span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-48">
                    <Field
                      label="Anexar material de apoio"
                      htmlFor={`sc-files-${content.id}`}
                      hint={attachmentLimitLabel()}
                    >
                      <Input
                        id={`sc-files-${content.id}`}
                        type="file"
                        multiple
                        accept={ACCEPTED_ATTACHMENT_TYPES}
                        onChange={(e) => handleFilesChange(content.id, e.target.files)}
                        disabled={uploadingId === content.id}
                      />
                    </Field>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => void handleUpload(content)}
                    disabled={selected.length === 0 || uploadingId === content.id}
                  >
                    {uploadingId === content.id ? "Enviando..." : "Anexar"}
                  </Button>
                </div>
              </div>
            </div>
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-slate-400">
          <span>🏫 {classNamesOf(content)}</span>
          {content.questions.length > 0 && <span>{questionsSummary(content.questions.length)}</span>}
        </div>
      </StudyContentCard>
    )
  }

  const list = contents.data ?? []

  return (
    <div>
      <SectionHeader
        icon="📚"
        title="Meus reforços"
        subtitle="Reforço escolar que você publica nas suas turmas"
        action={
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
            className="bg-blue-700 hover:bg-blue-800"
          >
            <span aria-hidden="true">+</span> Novo reforço
          </Button>
        }
      />

      {contents.loading && <LoadingBlock rows={3} label="Carregando reforços" />}
      {!contents.loading && contents.error && <ErrorState message={contents.error} onRetry={contents.reload} />}

      {!contents.loading && !contents.error && list.length === 0 && (
        <Card>
          <EmptyState
            icon="📚"
            title="Você ainda não criou nenhum reforço"
            description="Escreva a lição da disciplina, escolha as turmas e o aluno ganha pontos ao concluir."
            action={
              <Button
                onClick={() => {
                  setEditing(null)
                  setFormOpen(true)
                }}
              >
                <span aria-hidden="true">+</span> Novo reforço
              </Button>
            }
          />
        </Card>
      )}

      {!contents.loading && !contents.error && list.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {list.map((content) => renderCard(content))}
        </div>
      )}

      <StudyContentFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        onSaved={(content, message) => {
          setFormOpen(false)
          setEditing(null)
          contents.reload()
          showToast(message)
        }}
        onError={(message) => showToast(message, "error")}
        initial={editing}
        classes={classes.data ?? []}
        subjects={subjects.data ?? []}
      />

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Excluir reforço"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirmDelete) void handleDelete(confirmDelete)
              }}
            >
              🗑️ Confirmar exclusão
            </Button>
          </>
        }
      >
        {confirmDelete && (
          <div className="text-sm text-gray-600 dark:text-slate-300 space-y-3">
            <p>
              Excluir <strong className="text-gray-900 dark:text-white">{confirmDelete.topic}</strong> tira o
              reforço das telas de {classNamesOf(confirmDelete)} e apaga o material de apoio junto.
            </p>
            <p>
              Reforço já concluído por alunos não pode ser removido: os pontos creditados e o histórico de
              conclusão continuam registrados.
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
