import { useCallback, useMemo, useState } from "react"
import type { StudentStudyContent } from "@shared/types"
import { ApiError, api, downloadFile } from "../../lib/api"
import { useAsync } from "../../hooks/useAsync"
import { useToast } from "../../context/ToastContext"
import { Button } from "../../components/ui/Button"
import { Card, SectionHeader } from "../../components/ui/Card"
import { EmptyState, ErrorState, LoadingBlock } from "../../components/ui/EmptyState"
import { StudyContentCard, questionsSummary } from "../../features/StudyContentCard"
import { formatBrDateTime, formatBytes, formatNumber, formatPoints } from "../../lib/format"
import { STUDY_CONTENT_LABELS, studyContentDoneLabel } from "../../lib/labels"
import type { StudyContentCompletionResult } from "../../lib/types"

/**
 * Reforço Escolar do aluno (3.2 + R31).
 *
 * A listagem vem JÁ escopada do servidor (R28/3.1): o aluno só recebe o reforço
 * de uma turma em que está, então a tela não filtra por turma nem pede
 * `?subject=` — quem decide o que aparece é a API.
 *
 * O estado de conclusão é DO ALUNO e chega pronto: `completedAt` no payload diz o
 * que o servidor já tem (R31), então o selo e o botão indisponível aparecem já no
 * primeiro carregamento, sem F5 e sem clique. O 409 `ALREADY_COMPLETED` continua
 * existindo como rede de segurança do estado concorrente (duas abas, um clique
 * velho): ele reconcilia a tela em vez de virar erro genérico.
 */
export function StudyMaterialsView() {
  const { showToast } = useToast()
  const contents = useAsync<StudentStudyContent[]>(
    useCallback(() => api.get<StudentStudyContent[]>("/api/study-contents"), []),
    [],
  )
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  /**
   * Conclusões que ACABARAM de acontecer na tela (201 e 409). O valor é o
   * `completedAt` conhecido, ou `null` quando o 409 só revelou o estado sem a
   * data. Vive em memória porque a API já devolve o estado no próximo load — aqui
   * é só o reflexo imediato, para a lista não piscar entre o clique e o reload.
   */
  const [concluidosNaSessao, setConcluidosNaSessao] = useState<Map<string, string | null>>(() => new Map())
  const [busyId, setBusyId] = useState<string | null>(null)

  const grouped = useMemo(() => {
    const map = new Map<string, StudentStudyContent[]>()
    for (const item of contents.data ?? []) {
      const list = map.get(item.subject) ?? []
      list.push(item)
      map.set(item.subject, list)
    }
    return Array.from(map.entries())
  }, [contents.data])

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function marcarConcluido(id: string, completedAt: string | null) {
    setConcluidosNaSessao((prev) => new Map(prev).set(id, completedAt))
  }

  async function handleComplete(content: StudentStudyContent) {
    setBusyId(content.id)
    try {
      const result = await api.post<StudyContentCompletionResult>(
        `/api/study-contents/${content.id}/complete`,
      )
      marcarConcluido(content.id, result.completion.completedAt)
      // Saldo é o que o servidor devolveu depois do crédito (RN04) — a tela
      // mostra, não recalcula.
      showToast(
        `Reforço concluído! ${formatPoints(result.transaction.amount)} creditados. Saldo: ${formatNumber(result.balance)} pts.`,
      )
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Crédito único: o banco recusou porque a conclusão já existe. A UI
        // passa a mostrar o estado que o servidor já tem — em vez de um erro
        // genérico que esconderia que os pontos já entraram.
        marcarConcluido(content.id, null)
        showToast(
          `Você já concluiu este reforço: ${formatPoints(content.points)} já estão no seu saldo.`,
          "info",
        )
      } else {
        showToast(err instanceof Error ? err.message : "Falha ao concluir o reforço.", "error")
      }
    } finally {
      setBusyId(null)
    }
  }

  function renderCard(content: StudentStudyContent) {
    const isOpen = expanded.has(content.id)
    // R31: o estado vem da API; o registro da sessão só antecipa o que a próxima
    // listagem já traria (evita o botão voltar a piscar entre o clique e o reload).
    const concluidaEm = content.completedAt ?? concluidosNaSessao.get(content.id) ?? null
    const isDone = content.completedAt !== null || concluidosNaSessao.has(content.id)
    const regionId = `reforco-${content.id}-conteudo`

    return (
      <StudyContentCard
        key={content.id}
        content={content}
        footer={
          isDone ? (
            <p className="text-sm font-bold text-green-700 dark:text-green-400 flex items-center gap-1.5">
              <span aria-hidden="true">✅</span>
              {studyContentDoneLabel(
                concluidaEm === null ? null : formatBrDateTime(concluidaEm),
                formatPoints(content.points),
              )}
            </p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                variant="success"
                onClick={() => void handleComplete(content)}
                disabled={busyId === content.id}
                className="text-xs px-3 py-2"
              >
                {busyId === content.id ? (
                  "Concluindo..."
                ) : (
                  <>
                    <span aria-hidden="true">✅</span>
                    {STUDY_CONTENT_LABELS.completeAction}
                  </>
                )}
              </Button>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Vale {formatPoints(content.points)} uma única vez.
              </p>
            </div>
          )
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-gray-500 dark:text-slate-400">
            {content.questions.length > 0 ? (
              questionsSummary(content.questions.length)
            ) : (
              "Material de leitura"
            )}
          </p>
          <Button
            variant="ghost"
            onClick={() => toggleExpanded(content.id)}
            aria-expanded={isOpen}
            aria-controls={regionId}
            className="text-xs px-3 py-1.5"
          >
            <span aria-hidden="true">{isOpen ? "▲" : "▼"}</span>
            {isOpen ? STUDY_CONTENT_LABELS.collapse : STUDY_CONTENT_LABELS.expand}
          </Button>
        </div>

        {isOpen && (
          <div id={regionId} className="space-y-4 rounded-xl bg-gray-50 dark:bg-slate-800/60 p-4">
            <p className="text-sm text-gray-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
              {content.content || "O professor ainda não escreveu a lição deste reforço."}
            </p>

            {content.questions.length > 0 && (
              <div>
                <h4 className="text-xs font-extrabold text-gray-700 dark:text-slate-200 uppercase tracking-wide">
                  {STUDY_CONTENT_LABELS.questions}
                </h4>
                <ol className="list-decimal list-inside mt-1.5 space-y-1 text-sm text-gray-600 dark:text-slate-300">
                  {content.questions.map((question, index) => (
                    <li key={`${content.id}-q-${index}`}>{question}</li>
                  ))}
                </ol>
              </div>
            )}

            {content.attachments.length > 0 && (
              <div>
                <h4 className="text-xs font-extrabold text-gray-700 dark:text-slate-200 uppercase tracking-wide">
                  {STUDY_CONTENT_LABELS.attachments}
                </h4>
                <ul className="mt-1.5 space-y-1.5">
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
              </div>
            )}
          </div>
        )}
      </StudyContentCard>
    )
  }

  return (
    <div>
      <SectionHeader
        icon="📚"
        title="Reforço Escolar"
        subtitle="Materiais de estudo das suas turmas — conclua para ganhar pontos"
      />

      {contents.loading && <LoadingBlock rows={4} label="Carregando materiais" />}
      {!contents.loading && contents.error && <ErrorState message={contents.error} onRetry={contents.reload} />}

      {!contents.loading && !contents.error && grouped.length === 0 && (
        <Card>
          <EmptyState
            icon="📚"
            title="Nenhum material disponível"
            description="Os conteúdos de reforço das suas turmas aparecerão aqui assim que o professor publicar."
          />
        </Card>
      )}

      {!contents.loading && !contents.error && grouped.length > 0 && (
        <div className="space-y-6">
          {grouped.map(([subject, items]) => (
            <section key={subject} aria-label={subject}>
              <h3
                className="text-base font-extrabold text-gray-800 dark:text-slate-200 mb-3"
                style={{ fontFamily: "Nunito, sans-serif" }}
              >
                {subject}
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {items.map((item) => renderCard(item))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
