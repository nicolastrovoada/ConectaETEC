import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Activity, SafeUser, Submission, SubmissionStatus, Subject } from "@shared/types"
import { SUBMISSION_STATUS_LABELS } from "@shared/types"
import { api } from "../lib/api"
import { useAsync } from "../hooks/useAsync"
import { useToast } from "../context/ToastContext"
import { Button } from "../components/ui/Button"
import { Card, SectionHeader } from "../components/ui/Card"
import { Field, Input, Select } from "../components/ui/Field"
import { EmptyState, ErrorState, LoadingBlock } from "../components/ui/EmptyState"
import { SubmissionStatusBadge } from "../components/ui/Badge"
import { Pagination } from "../components/ui/Pagination"
import { SubmissionDetailModal } from "./SubmissionDetailModal"
import { formatBrDateTime, isValidBrDate, brDayKey } from "../lib/format"

export type ValidationStatusFilter = "" | Submission["status"]

type ValidatorRole = "teacher" | "staff" | "coordinator"

interface SubmissionsManagerProps {
  role: ValidatorRole
  canValidateActivity: (activity: Activity) => boolean
  title?: string
  subtitle?: string
  /** Atividade a pré-selecionar na abertura (navegação vinda da lista). */
  preselectActivityId?: string
}

const PAGE_SIZE = 8

/** Os seis estados de RN03, na ordem em que o validador os lê. */
const STATUS_FILTROS: readonly SubmissionStatus[] = [
  "pending",
  "submitted",
  "under_review",
  "revision_required",
  "approved",
  "rejected",
]

/** `id` do painel revelado — o botão aponta para ele por `aria-controls`. */
const PAINEL_FILTROS = "painel-filtros-validador"

/** Textos da aba oculta (spec, decisão nº 14). Ficam num objeto só porque são lidos em bloco. */
const FILTROS = {
  toggle: "Filtros",
  panelLabel: "Filtros de validação",
  materia: "Matéria",
  materiaTodas: "Todas as matérias",
  atividade: "Atividade",
  atividadeTodas: "Todas as atividades",
  atividadeNenhuma: "Nenhuma atividade",
  status: "Status",
  statusTodos: "Todos",
  aluno: "Aluno",
  alunoPlaceholder: "Buscar por nome do aluno",
  alunoHint: "Trecho do nome: “Ana” traz Ana e Ana Luiza.",
  periodo: "Período de envio",
  periodoDe: "De",
  periodoAte: "Até",
  periodoPlaceholder: "DD/MM/AAAA",
  periodoHint: "Conta o dia inteiro, nas duas pontas.",
  periodoErro: "Data inválida: use DD/MM/AAAA.",
  periodoInvertidoErro: "Período invertido: a data inicial é posterior à final.",
  limpar: "Limpar filtros",
  ativos: (n: number) => (n === 1 ? "1 filtro ativo" : `${n} filtros ativos`),
} as const

/** `id` do texto de erro do período — é o que os dois inputs descrevem. */
const ERRO_PERIODO = "erro-periodo"

export function SubmissionsManager({ role, canValidateActivity, title = "Validações", subtitle = "Entregas dos alunos aguardando validação", preselectActivityId }: SubmissionsManagerProps) {
  const { showToast } = useToast()

  const [aberto, setAberto] = useState(false)
  const [activityId, setActivityId] = useState(preselectActivityId ?? "")
  const [statusFilter, setStatusFilter] = useState<ValidationStatusFilter>("")
  const [subjectId, setSubjectId] = useState("")
  const [studentName, setStudentName] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<Submission | null>(null)
  const [detailActivity, setDetailActivity] = useState<Activity | null>(null)

  const activities = useAsync<Activity[]>(useCallback(() => api.get<Activity[]>("/api/activities"), []), [])
  const allActivities = useMemo(() => activities.data ?? [], [activities.data])

  // Nomes das disciplinas, só para rotular o select de Matéria. O ERRO deste
  // lookup não vira erro de tela (mesma degradação dos lookups da 2.6): sem o
  // nome, o filtro continua funcionando e a opção mostra o id da disciplina.
  const subjects = useAsync<Subject[]>(useCallback(() => api.get<Subject[]>("/api/subjects"), []), [])
  const subjectById = useMemo(() => new Map((subjects.data ?? []).map((s) => [s.id, s])), [subjects.data])

  // Matérias que o PAPEL realmente enxerga: as das atividades que vieram em
  // `GET /api/activities`, que já é a lista do escopo (só as próprias para
  // professor/funcionário, todas para a coordenação — 2.5). Uma lista global de
  // disciplinas aqui ofereceria escolhas que o filtro nunca acha, que é pior do
  // que não ter o filtro.
  const materiasDoEscopo = useMemo(() => {
    const nomes = new Map<string, string>()
    for (const activity of allActivities) {
      if (!nomes.has(activity.subjectId)) {
        nomes.set(activity.subjectId, subjectById.get(activity.subjectId)?.name ?? activity.subjectId)
      }
    }
    return [...nomes.entries()]
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
  }, [allActivities, subjectById])

  // Período digitado pelo usuário: data que EXISTE, não string que o
  // `Date` deixaria passar. O que não é data não vai para a query (e o campo
  // mostra o erro) — o servidor também recusa, mas o erro chega como falha da
  // tela inteira, e um erro de campo é melhor que isso.
  const fromValido = from !== "" && isValidBrDate(from)
  const toValido = to !== "" && isValidBrDate(to)
  // `from > to` é erro de DIGITAÇÃO, e o cliente tem de enxergar isso antes de
  // mandar o pedido: o servidor responde 400 `PERIOD_REVERSED` e o `ErrorState`
  // escondia a tabela inteira — que ainda estava útil com os outros quatro
  // filtros funcionando (é o Ruling 2 do implementador). As duas pontas são
  // data válida aqui, então a comparação é só de chave de dia (`AAAAMMDD`, a
  // mesma que o SQL deriva de `submittedAt`): sem `Date`, sem fuso, sem parsing.
  const periodoInvertido = fromValido && toValido && brDayKey(from) > brDayKey(to)
  // Invertido suprime as DUAS pontas: mandar só a `from` ou só a `to` de um
  // período invertido seria um filtro diferente do que o usuário digitou.
  const fromNaQuery = fromValido && !periodoInvertido
  const toNaQuery = toValido && !periodoInvertido
  const periodoInvalido = (from !== "" && !fromValido) || (to !== "" && !toValido) || periodoInvertido
  const descritoPeriodo = periodoInvalido ? `hint-periodo ${ERRO_PERIODO}` : "hint-periodo"

  const submissions = useAsync<Submission[]>(
    useCallback(
      () =>
        api.get<Submission[]>("/api/submissions", {
          activityId: activityId || undefined,
          status: statusFilter || undefined,
          subjectId: subjectId || undefined,
          studentName: studentName.trim() || undefined,
          from: fromNaQuery ? from : undefined,
          to: toNaQuery ? to : undefined,
        }),
      [activityId, statusFilter, subjectId, studentName, fromNaQuery, from, toNaQuery, to],
    ),
    [activityId, statusFilter, subjectId, studentName, fromNaQuery, from, toNaQuery, to],
  )

  // Mapa de nome de estudantes (coordenação consegue listar usuários).
  const usersForCoord = useAsync<SafeUser[]>(
    useCallback(
      () => (role === "coordinator" ? api.get<SafeUser[]>("/api/users", { role: "student" }) : Promise.resolve([])),
      [role],
    ),
    [role],
  )
  const studentsByName = useMemo(() => {
    const map = new Map<string, string>()
    for (const u of usersForCoord.data ?? []) map.set(u.id, u.name)
    return map
  }, [usersForCoord.data])

  useEffect(() => {
    setPage(1)
  }, [activityId, statusFilter, subjectId, studentName, from, to])

  // A primeira atividade é pré-selecionada quando a lista chega — é o padrão da
  // tela (o validador entra para validar UMA atividade). O `ref` existe porque
  // escolher "Todas as atividades" na aba deixaria o campo vazio e este efeito
  // re-selecionaria a primeira na hora. Tratar a atividade como filtro de
  // verdade exige que "todas" sobreviva ao clique.
  const autoSelecionou = useRef(false)
  useEffect(() => {
    if (autoSelecionou.current) return
    if (allActivities.length > 0) {
      autoSelecionou.current = true
      if (!activityId) setActivityId(allActivities[0].id)
    }
  }, [allActivities, activityId])

  useEffect(() => {
    if (preselectActivityId) setActivityId(preselectActivityId)
  }, [preselectActivityId])

  const activityById = useMemo(() => new Map(allActivities.map((a) => [a.id, a])), [allActivities])

  /** Atividade que a tela abre: a pré-selecionada, senão a primeira da lista. */
  const atividadePadrao = preselectActivityId ?? allActivities[0]?.id ?? ""
  // Conta o que REALMENTE sai na query: uma data digitada que não existe (ou um
  // período invertido) não é filtro nenhum, e anunciar "1 filtro ativo" para um
  // botão de "Limpar filtros" que não tem o que desfazer é pior que não anunciar.
  const filtrosAtivos =
    (activityId !== atividadePadrao ? 1 : 0) +
    [statusFilter, subjectId, studentName.trim()].filter((valor) => valor !== "").length +
    (fromNaQuery ? 1 : 0) +
    (toNaQuery ? 1 : 0)

  /**
   * Matéria escolhida pelo usuário.
   *
   * Matéria e Atividade são E na query, e a atividade padrão é uma restrição
   * herdada da tela (o validador entra para validar UMA atividade). Escolher
   * outra Matéria deixava essa restrição presa a uma atividade de outra
   * matéria: par impossível, lista vazia sem explicação, e o contador dizia
   * "1 filtro ativo" sem contar nem a atividade nem a matéria. Zerar a
   * atividade é a leitura do que o usuário pediu — mas nunca a escolha explícita
   * do usuário quando não há colisão.
   */
  function escolherMateria(valor: string) {
    if (valor === subjectId) return
    setSubjectId(valor)
    const atividadeAtual = activityId
    // Preserva a atividade escolhida à mão se ela não for a atividade padrão
    // e não colide com a nova matéria. Quando vai para "Todas as matérias"
    // (valor vazio), não há colisão - a atividade explícita sobrevive.
    if (valor !== "" && atividadeAtual && atividadeAtual !== atividadePadrao) {
      const atividade = activityById.get(atividadeAtual)
      if (atividade && atividade.subjectId === valor) {
        return
      }
    }
    if (valor === "") {
      // Vai para "Todas as matérias" - preserva atividade escolhida à mão
      if (atividadeAtual && atividadeAtual !== atividadePadrao) {
        return
      }
    }
    setActivityId("")
  }

  function limparFiltros() {
    setActivityId(atividadePadrao)
    setStatusFilter("")
    setSubjectId("")
    setStudentName("")
    setFrom("")
    setTo("")
  }

  const list = submissions.data ?? []
  const pageItems = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function studentLabel(submission: Submission): string {
    return studentsByName.get(submission.studentId) ?? `Aluno ${submission.studentId}`
  }

  function openDetail(submission: Submission) {
    setDetail(submission)
    setDetailActivity(activityById.get(submission.activityId) ?? null)
  }

  const loading = activities.loading || (submissions.loading && !submissions.error)
  const error = activities.error || submissions.error

  return (
    <div>
      <SectionHeader icon="✅" title={title} subtitle={subtitle} />

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Button
          variant="secondary"
          className="py-2"
          aria-expanded={aberto}
          aria-controls={PAINEL_FILTROS}
          onClick={() => setAberto((valor) => !valor)}
        >
          <span aria-hidden="true">{aberto ? "▴" : "▾"}</span>
          {FILTROS.toggle}
        </Button>
        {filtrosAtivos > 0 && (
          <span className="text-xs font-medium text-gray-500 dark:text-slate-400">{FILTROS.ativos(filtrosAtivos)}</span>
        )}
        <div className="sm:ml-auto text-sm text-gray-500 dark:text-slate-400">
          {list.length} {list.length === 1 ? "entrega" : "entregas"}
        </div>
      </div>

      {/* Fica MONTADO mesmo fechado (é o atributo `hidden` que esconde): o
          `aria-controls` do botão sempre aponta para um elemento que existe, e
          os valores digitados sobrevivem a fechar e reabrir a aba. */}
      <Card
        id={PAINEL_FILTROS}
        role="group"
        aria-label={FILTROS.panelLabel}
        hidden={!aberto}
        className="mb-5 p-4 sm:p-5"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={FILTROS.materia} htmlFor="val-filtro-materia">
            <Select
              id="val-filtro-materia"
              value={subjectId}
              onChange={(e) => escolherMateria(e.target.value)}
              className="py-2"
            >
              <option value="">{FILTROS.materiaTodas}</option>
              {materiasDoEscopo.map((materia) => (
                <option key={materia.id} value={materia.id}>
                  {materia.nome}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={FILTROS.atividade} htmlFor="val-filtro-atividade">
            <Select
              id="val-filtro-atividade"
              value={activityId}
              onChange={(e) => setActivityId(e.target.value)}
              className="py-2"
            >
              {/* Sem atividade não existe "todas": as duas opções seriam
                  idênticas (mesmo `value`) e o select mostraria "Todas" num
                  lista que não tem nenhuma. */}
              {allActivities.length === 0 ? (
                <option value="">{FILTROS.atividadeNenhuma}</option>
              ) : (
                <option value="">{FILTROS.atividadeTodas}</option>
              )}
              {allActivities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={FILTROS.status} htmlFor="val-filtro-status">
            <Select
              id="val-filtro-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ValidationStatusFilter)}
              className="py-2"
            >
              <option value="">{FILTROS.statusTodos}</option>
              {STATUS_FILTROS.map((status) => (
                <option key={status} value={status}>
                  {SUBMISSION_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={FILTROS.aluno} htmlFor="val-filtro-aluno" hint={FILTROS.alunoHint} hintId="hint-aluno">
            <Input
              id="val-filtro-aluno"
              type="search"
              value={studentName}
              placeholder={FILTROS.alunoPlaceholder}
              aria-describedby="hint-aluno"
              onChange={(e) => setStudentName(e.target.value)}
              className="py-2"
            />
          </Field>

          <fieldset className="sm:col-span-2">
            <legend className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
              {FILTROS.periodo}
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="val-filtro-de"
                  className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1"
                >
                  {FILTROS.periodoDe}
                </label>
                <Input
                  id="val-filtro-de"
                  value={from}
                  inputMode="numeric"
                  maxLength={10}
                  placeholder={FILTROS.periodoPlaceholder}
                  aria-describedby={descritoPeriodo}
                  aria-invalid={(from !== "" && !fromValido) || periodoInvertido ? true : undefined}
                  onChange={(e) => setFrom(e.target.value)}
                  className="py-2"
                />
              </div>
              <div>
                <label
                  htmlFor="val-filtro-ate"
                  className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1"
                >
                  {FILTROS.periodoAte}
                </label>
                <Input
                  id="val-filtro-ate"
                  value={to}
                  inputMode="numeric"
                  maxLength={10}
                  placeholder={FILTROS.periodoPlaceholder}
                  aria-describedby={descritoPeriodo}
                  aria-invalid={(to !== "" && !toValido) || periodoInvertido ? true : undefined}
                  onChange={(e) => setTo(e.target.value)}
                  className="py-2"
                />
              </div>
            </div>
            <p id="hint-periodo" className="mt-1.5 text-xs text-gray-500 dark:text-slate-400">
              {FILTROS.periodoHint}
            </p>
            {/* A mensagem é DESCRITA pelos dois inputs (`aria-describedby`): um
                `role="alert"` solto no fim do fieldset é anunciado quando
                aparece, mas não fica associado ao campo quando o foco volta
                para ele. */}
            {periodoInvalido && (
              <p id={ERRO_PERIODO} role="alert" className="mt-1.5 text-xs text-red-500">
                {periodoInvertido ? FILTROS.periodoInvertidoErro : FILTROS.periodoErro}
              </p>
            )}
          </fieldset>

          <div className="flex justify-end sm:col-span-2 lg:col-span-3">
            <Button variant="ghost" onClick={limparFiltros} disabled={filtrosAtivos === 0} className="text-xs py-2">
              {FILTROS.limpar}
            </Button>
          </div>
        </div>
      </Card>

      {error && <ErrorState message={error} onRetry={() => { activities.reload(); submissions.reload() }} />}
      {loading && !error && <LoadingBlock rows={4} label="Carregando entregas" />}

      {!loading && !error && list.length === 0 && (
        <Card>
          <EmptyState icon="📭" title="Nenhuma entrega aqui" description="Nenhuma entrega corresponde aos filtros selecionados." />
        </Card>
      )}

      {!loading && !error && list.length > 0 && (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-400 dark:text-slate-500 border-b border-gray-100 dark:border-slate-800">
                    <th scope="col" className="px-4 py-3 font-semibold">Aluno</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Enviada em</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Evidência</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Anexos</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((submission) => (
                    <tr key={submission.id} className="border-b border-gray-50 dark:border-slate-800/60 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 font-semibold text-gray-800 dark:text-slate-200">{studentLabel(submission)}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-slate-400">{formatBrDateTime(submission.submittedAt)}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-slate-300 max-w-52 truncate">{submission.evidence || submission.comment || "—"}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-slate-400">{submission.attachments.length}</td>
                      <td className="px-4 py-3">
                        <SubmissionStatusBadge status={submission.status} />
                      </td>
                      <td className="px-4 py-3">
                        <Button onClick={() => openDetail(submission)} className="text-xs px-3 py-1.5">
                          Ver detalhes
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Pagination total={list.length} pageSize={PAGE_SIZE} current={page} onChange={setPage} />
        </>
      )}

      <SubmissionDetailModal
        submission={detail}
        activity={detailActivity}
        studentLabel={detail ? studentLabel(detail) : ""}
        canValidate={detailActivity !== null && canValidateActivity(detailActivity)}
        onClose={() => setDetail(null)}
        onValidated={(updated, message) => {
          setDetail(null)
          submissions.reload()
          showToast(message)
        }}
        onError={(message) => showToast(message, "error")}
      />
    </div>
  )
}
