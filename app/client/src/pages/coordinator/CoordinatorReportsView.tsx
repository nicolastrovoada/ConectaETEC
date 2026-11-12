import { useCallback, useState, type FormEvent, type ReactNode } from "react"
import type { Class, SafeUser, Subject } from "@shared/types"
import type {
  ActivitiesByTypeRow,
  ActivityDetailReportRow,
  ClassRankingGroup,
  CompletionReportRow,
  SubjectRankingGroup,
  TeacherSummaryRow,
} from "../../lib/types"
import { api, buildQuery, downloadFile } from "../../lib/api"
import { useAsync } from "../../hooks/useAsync"
import { useToast } from "../../context/ToastContext"
import { Card, SectionHeader } from "../../components/ui/Card"
import { Bar } from "../../components/ui/BarChart"
import { Button } from "../../components/ui/Button"
import { Field, Input, Select } from "../../components/ui/Field"
import { EmptyState, ErrorState, LoadingBlock } from "../../components/ui/EmptyState"

interface ReportFilters {
  from: string
  to: string
  classId: string
  subjectId: string
  teacherId: string
}

const EMPTY_FILTERS: ReportFilters = {
  from: "",
  to: "",
  classId: "",
  subjectId: "",
  teacherId: "",
}

/** Só os filtros preenchidos viram query string — data vazia é omitida. */
function filterQuery(filters: ReportFilters): Record<string, string> {
  const query: Record<string, string> = {}
  if (filters.from) query.from = filters.from
  if (filters.to) query.to = filters.to
  if (filters.classId) query.classId = filters.classId
  if (filters.subjectId) query.subjectId = filters.subjectId
  if (filters.teacherId) query.teacherId = filters.teacherId
  return query
}

function csvPath(route: string, filters: ReportFilters): string {
  return `${route}${buildQuery({ ...filterQuery(filters), format: "csv" })}`
}

export function CoordinatorReportsView() {
  const { showToast } = useToast()

  // `draft` é o que está nos campos; `applied` é o que foi para a API. Assim a
  // digitação não dispara consulta e os cinco blocos usam o mesmo recorte.
  const [draft, setDraft] = useState<ReportFilters>(EMPTY_FILTERS)
  const [applied, setApplied] = useState<ReportFilters>(EMPTY_FILTERS)

  // CSV usa `applied`; se o formulário mostra outro recorte, exportar daria um
  // arquivo diferente do que está na tela. Enquanto `dirty`, os botões ficam
  // desabilitados até "Aplicar filtros".
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied)

  const classes = useAsync<Class[]>(useCallback(() => api.get<Class[]>("/api/classes"), []), [])
  const subjects = useAsync<Subject[]>(useCallback(() => api.get<Subject[]>("/api/subjects"), []), [])
  const teachers = useAsync<SafeUser[]>(
    useCallback(() => api.get<SafeUser[]>("/api/users", { role: "teacher" }), []),
    [],
  )

  const completion = useAsync<CompletionReportRow[]>(
    () => api.get<CompletionReportRow[]>("/api/reports/completion", filterQuery(applied)),
    [applied],
  )
  const byType = useAsync<ActivitiesByTypeRow[]>(
    () => api.get<ActivitiesByTypeRow[]>("/api/reports/activities-by-type", filterQuery(applied)),
    [applied],
  )
  const activityDetail = useAsync<ActivityDetailReportRow[]>(
    () => api.get<ActivityDetailReportRow[]>("/api/reports/activity-detail", filterQuery(applied)),
    [applied],
  )
  const teacherSummary = useAsync<TeacherSummaryRow[]>(
    () => api.get<TeacherSummaryRow[]>("/api/reports/teacher-summary", filterQuery(applied)),
    [applied],
  )
  const classRanking = useAsync<ClassRankingGroup[]>(
    () => api.get<ClassRankingGroup[]>("/api/reports/rankings/classes", filterQuery(applied)),
    [applied],
  )
  const subjectRanking = useAsync<SubjectRankingGroup[]>(
    () => api.get<SubjectRankingGroup[]>("/api/reports/rankings/subjects", filterQuery(applied)),
    [applied],
  )

  const optionsError = classes.error ?? subjects.error ?? teachers.error

  function changeFilter(key: keyof ReportFilters, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  function handleApply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setApplied({ ...draft })
  }

  function handleClear() {
    setDraft({ ...EMPTY_FILTERS })
    setApplied({ ...EMPTY_FILTERS })
  }

  function retryOptions() {
    if (classes.error) classes.reload()
    if (subjects.error) subjects.reload()
    if (teachers.error) teachers.reload()
  }

  async function handleDownload(route: string, label: string) {
    try {
      await downloadFile(csvPath(route, applied))
      showToast(`${label} exportado em CSV.`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Falha ao exportar CSV.", "error")
    }
  }

  return (
    <div>
      <SectionHeader
        icon="📈"
        title="Relatórios"
        subtitle="Dados consolidados da escola por período, turma, matéria e professor"
      />

      <Card className="p-4 sm:p-5 mb-6">
        <form aria-label="Filtros dos relatórios" onSubmit={handleApply} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <Field label="De" htmlFor="reports-from">
              <Input
                id="reports-from"
                type="date"
                value={draft.from}
                onChange={(e) => changeFilter("from", e.target.value)}
                className="py-2"
              />
            </Field>

            <Field label="Até" htmlFor="reports-to">
              <Input
                id="reports-to"
                type="date"
                value={draft.to}
                onChange={(e) => changeFilter("to", e.target.value)}
                className="py-2"
              />
            </Field>

            <Field label="Turma" htmlFor="reports-class">
              <Select
                id="reports-class"
                value={draft.classId}
                onChange={(e) => changeFilter("classId", e.target.value)}
                className="py-2"
              >
                <option value="">Todas as turmas</option>
                {(classes.data ?? []).map((klass) => (
                  <option key={klass.id} value={klass.id}>
                    {klass.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Matéria" htmlFor="reports-subject">
              <Select
                id="reports-subject"
                value={draft.subjectId}
                onChange={(e) => changeFilter("subjectId", e.target.value)}
                className="py-2"
              >
                <option value="">Todas as matérias</option>
                {(subjects.data ?? []).map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Professor" htmlFor="reports-teacher">
              <Select
                id="reports-teacher"
                value={draft.teacherId}
                onChange={(e) => changeFilter("teacherId", e.target.value)}
                className="py-2"
              >
                <option value="">Todos os professores</option>
                {(teachers.data ?? []).map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Os filtros valem para todos os relatórios e para as exportações CSV.
              </p>
              {dirty && (
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-300" role="status">
                  Aplique os filtros para exportar os relatórios em CSV.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" className="bg-orange-700 hover:bg-orange-800">
                Aplicar filtros
              </Button>
              <Button type="button" variant="secondary" onClick={handleClear}>
                Limpar filtros
              </Button>
            </div>
          </div>
        </form>

        {optionsError && (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-300" role="status">
            Algumas opções de filtro não puderam ser carregadas. Os demais relatórios continuam disponíveis.{" "}
            <button type="button" onClick={retryOptions} className="font-semibold underline underline-offset-2 hover:no-underline">
              Tentar novamente
            </button>
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ReportSection
          title="Conclusão por turma"
          description="Entregas concluídas em relação ao total possível de cada turma."
          className="mb-0"
          onExport={() => void handleDownload("/api/reports/completion", "Relatório de conclusão")}
          exportDisabled={dirty}
        >
          {completion.loading && <LoadingBlock rows={2} label="Carregando conclusão por turma" />}
          {!completion.loading && completion.error && <ErrorState message={completion.error} onRetry={completion.reload} />}
          {!completion.loading && !completion.error && (completion.data ?? []).length === 0 && (
            <Card>
              <EmptyState icon="📊" title="Sem dados de conclusão" description="Ajuste os filtros ou cadastre atividades para gerar o relatório." />
            </Card>
          )}
          {!completion.loading && !completion.error && (completion.data ?? []).length > 0 && (
            <Card className="p-4 space-y-3">
              {completion.data?.map((row) => (
                <div key={`${row.className}-${row.course}`}>
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">
                      {row.className} — {row.course}
                    </p>
                    <span className="text-sm font-black text-orange-600 dark:text-orange-400">{row.pct}%</span>
                  </div>
                  <div className="h-8">
                    <Bar pct={row.pct} color="bg-gradient-to-t from-orange-500 to-red-500" />
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">
                    {row.done} de {row.possible} entregas possíveis · {row.students} alunos · {row.activities} atividades
                  </p>
                </div>
              ))}
            </Card>
          )}
        </ReportSection>

        <ReportSection
          title="Atividades por tipo"
          description="Distribuição das atividades cadastradas pelos tipos do projeto."
          className="mb-0"
          onExport={() => void handleDownload("/api/reports/activities-by-type", "Relatório por tipo")}
          exportDisabled={dirty}
        >
          {byType.loading && <LoadingBlock rows={2} label="Carregando atividades por tipo" />}
          {!byType.loading && byType.error && <ErrorState message={byType.error} onRetry={byType.reload} />}
          {!byType.loading && !byType.error && (byType.data ?? []).length === 0 && (
            <Card>
              <EmptyState icon="📊" title="Sem atividades no recorte" description="Ajuste os filtros ou crie atividades para gerar o relatório." />
            </Card>
          )}
          {!byType.loading && !byType.error && (byType.data ?? []).length > 0 && (
            <Card className="p-4 space-y-3">
              {byType.data?.map((row) => (
                <div key={row.type}>
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">{row.label}</p>
                    <span className="text-sm font-black text-orange-600 dark:text-orange-400">{row.count}</span>
                  </div>
                  <div className="flex items-end gap-3" style={{ height: 28 }}>
                    <Bar
                      pct={(row.count / Math.max(1, ...(byType.data ?? []).map((r) => r.count))) * 100}
                      color="bg-gradient-to-t from-orange-400 to-red-500"
                    />
                  </div>
                </div>
              ))}
            </Card>
          )}
        </ReportSection>
      </div>

      <div className="mt-8">
        <ReportSection
          title="Atrasos por atividade"
          description="Entregas, aprovações, pendências e atrasos de cada atividade no recorte."
          onExport={() => void handleDownload("/api/reports/activity-detail", "Relatório de atrasos por atividade")}
          exportDisabled={dirty}
        >
          {activityDetail.loading && <LoadingBlock rows={3} label="Carregando atrasos por atividade" />}
          {!activityDetail.loading && activityDetail.error && (
            <ErrorState message={activityDetail.error} onRetry={activityDetail.reload} />
          )}
          {!activityDetail.loading && !activityDetail.error && (activityDetail.data ?? []).length === 0 && (
            <Card>
              <EmptyState
                icon="⏰"
                title="Nenhuma atividade no recorte"
                description="Ajuste ou limpe os filtros para ver as entregas por atividade."
              />
            </Card>
          )}
          {!activityDetail.loading && !activityDetail.error && (activityDetail.data ?? []).length > 0 && (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-label="Atrasos por atividade">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400 border-b border-gray-100 dark:border-slate-800">
                      <th scope="col" className="px-4 py-3 font-semibold">Atividade</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Professor</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Turma</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Matéria</th>
                      <th scope="col" className="px-4 py-3 font-semibold text-right">Entregas</th>
                      <th scope="col" className="px-4 py-3 font-semibold text-right">Aprovadas</th>
                      <th scope="col" className="px-4 py-3 font-semibold text-right">Pendentes</th>
                      <th scope="col" className="px-4 py-3 font-semibold text-right">Atrasadas</th>
                      <th scope="col" className="px-4 py-3 font-semibold text-right">Aprovação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityDetail.data?.map((row) => (
                      <tr
                        key={row.activityId}
                        className="border-b border-gray-50 dark:border-slate-800/60 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <th scope="row" className="px-4 py-3 text-left font-semibold text-gray-900 dark:text-slate-100">
                          <span className="block">{row.title}</span>
                          <span className="block text-xs font-normal text-gray-500 dark:text-slate-400">Prazo: {row.deadline}</span>
                        </th>
                        <td className="px-4 py-3 text-gray-600 dark:text-slate-300">{row.teacherName}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-slate-300">{row.className}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-slate-300">{row.subject}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-800 dark:text-slate-200">{row.deliveries}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-green-700 dark:text-green-400">{row.approved}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-slate-300">{row.pending}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {row.late > 0 ? (
                            <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-xs font-bold px-2 py-0.5">
                              {row.late}
                              <span className="sr-only"> atrasadas</span>
                            </span>
                          ) : (
                            <span className="text-gray-500 dark:text-slate-400">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {row.deliveries === 0 ? (
                            <>
                              <span className="block font-black text-gray-500 dark:text-slate-400">0%</span>
                              <span className="block text-xs text-gray-500 dark:text-slate-400">sem entregas</span>
                            </>
                          ) : (
                            <>
                              <span className="block font-black text-orange-600 dark:text-orange-400">{row.donePct}%</span>
                              <div className="ml-auto mt-1 h-1.5 w-14">
                                <Bar pct={row.donePct} color="bg-orange-600" />
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </ReportSection>
      </div>

      <ReportSection
        title="Conclusão e atraso por professor"
        description="Atividades, entregas, aprovações e atrasos agregados por professor."
        onExport={() => void handleDownload("/api/reports/teacher-summary", "Resumo por professor")}
        exportDisabled={dirty}
      >
        {teacherSummary.loading && <LoadingBlock rows={3} label="Carregando resumo por professor" />}
        {!teacherSummary.loading && teacherSummary.error && (
          <ErrorState message={teacherSummary.error} onRetry={teacherSummary.reload} />
        )}
        {!teacherSummary.loading && !teacherSummary.error && (teacherSummary.data ?? []).length === 0 && (
          <Card>
            <EmptyState
              icon="👩‍🏫"
              title="Nenhum professor no recorte"
              description="Ajuste ou limpe os filtros para ver a conclusão e o atraso por professor."
            />
          </Card>
        )}
        {!teacherSummary.loading && !teacherSummary.error && (teacherSummary.data ?? []).length > 0 && (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Conclusão e atraso por professor">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400 border-b border-gray-100 dark:border-slate-800">
                    <th scope="col" className="px-4 py-3 font-semibold">Professor</th>
                    <th scope="col" className="px-4 py-3 font-semibold text-right">Atividades</th>
                    <th scope="col" className="px-4 py-3 font-semibold text-right">Entregas</th>
                    <th scope="col" className="px-4 py-3 font-semibold text-right">Aprovadas</th>
                    <th scope="col" className="px-4 py-3 font-semibold text-right">Atrasadas</th>
                    <th scope="col" className="px-4 py-3 font-semibold text-right">Aprovação %</th>
                  </tr>
                </thead>
                <tbody>
                  {teacherSummary.data?.map((row) => (
                    <tr
                      key={row.teacherName}
                      className="border-b border-gray-50 dark:border-slate-800/60 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <th scope="row" className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-slate-200">
                        {row.teacherName}
                      </th>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-800 dark:text-slate-200">{row.activities}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-800 dark:text-slate-200">{row.deliveries}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-green-700 dark:text-green-400">{row.approved}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-amber-700 dark:text-amber-300">{row.late}</td>
                      <td className="px-4 py-3 text-right font-black tabular-nums text-orange-600 dark:text-orange-400">{row.approvalPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </ReportSection>

      <ReportSection
        title="Ranking por turma"
        description="Pontos e nível de cada aluno, agrupados pela turma."
        onExport={() => void handleDownload("/api/reports/rankings/classes", "Ranking por turma")}
        exportDisabled={dirty}
      >
        {classRanking.loading && <LoadingBlock rows={3} label="Carregando ranking por turma" />}
        {!classRanking.loading && classRanking.error && <ErrorState message={classRanking.error} onRetry={classRanking.reload} />}
        {!classRanking.loading && !classRanking.error && (classRanking.data ?? []).length === 0 && (
          <Card>
            <EmptyState
              icon="🏅"
              title="Sem ranking por turma"
              description="O ranking aparece quando houver alunos com pontos no recorte selecionado."
            />
          </Card>
        )}
        {!classRanking.loading && !classRanking.error && (classRanking.data ?? []).length > 0 && (
          <div className="space-y-4">
            {classRanking.data?.map((group) => (
              <Card key={`${group.className}-${group.course}`} className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 dark:border-slate-800">
                  <h4 className="text-sm font-extrabold text-gray-900 dark:text-white" style={{ fontFamily: "Nunito, sans-serif" }}>
                    {group.className}
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    {group.course} · {group.rows.length} {group.rows.length === 1 ? "aluno" : "alunos"}
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm" aria-label={`Ranking de pontos — ${group.className} — ${group.course}`}>
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400 border-b border-gray-100 dark:border-slate-800">
                        <th scope="col" className="px-4 py-3 font-semibold">Aluno</th>
                        <th scope="col" className="px-4 py-3 font-semibold text-right">Pontos</th>
                        <th scope="col" className="px-4 py-3 font-semibold text-right">Nível</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row, index) => (
                        <tr
                          key={`${row.studentName}-${index}`}
                          className="border-b border-gray-50 dark:border-slate-800/60 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <th scope="row" className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-slate-200">
                            {row.studentName}
                          </th>
                          <td className="px-4 py-3 text-right font-black tabular-nums text-orange-600 dark:text-orange-400">{row.points}</td>
                          <td className="px-4 py-3 text-right text-gray-500 dark:text-slate-400">{row.level}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {group.rows.length === 0 && (
                  <p className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">Nenhum aluno ativo nesta turma.</p>
                )}
              </Card>
            ))}
          </div>
        )}
      </ReportSection>

      <ReportSection
        title="Ranking por matéria"
        description="Pontos e nível dos alunos em cada matéria."
        onExport={() => void handleDownload("/api/reports/rankings/subjects", "Ranking por matéria")}
        exportDisabled={dirty}
      >
        {subjectRanking.loading && <LoadingBlock rows={3} label="Carregando ranking por matéria" />}
        {!subjectRanking.loading && subjectRanking.error && (
          <ErrorState message={subjectRanking.error} onRetry={subjectRanking.reload} />
        )}
        {!subjectRanking.loading && !subjectRanking.error && (subjectRanking.data ?? []).length === 0 && (
          <Card>
            <EmptyState
              icon="🏅"
              title="Sem ranking por matéria"
              description="O ranking aparece quando houver pontos lançados nas matérias do recorte."
            />
          </Card>
        )}
        {!subjectRanking.loading && !subjectRanking.error && (subjectRanking.data ?? []).length > 0 && (
          <div className="space-y-4">
            {subjectRanking.data?.map((group) => (
              <Card key={group.subjectId} className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="text-lg" aria-hidden="true">
                      {group.icon}
                    </span>
                    <h4 className="text-sm font-extrabold text-gray-900 dark:text-white" style={{ fontFamily: "Nunito, sans-serif" }}>
                      {group.subjectName}
                    </h4>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    {group.rows.length} {group.rows.length === 1 ? "aluno" : "alunos"}
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm" aria-label={`Ranking por matéria — ${group.subjectName}`}>
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400 border-b border-gray-100 dark:border-slate-800">
                        <th scope="col" className="px-4 py-3 font-semibold">Aluno</th>
                        <th scope="col" className="px-4 py-3 font-semibold">Turma</th>
                        <th scope="col" className="px-4 py-3 font-semibold text-right">Pontos</th>
                        <th scope="col" className="px-4 py-3 font-semibold text-right">Nível</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row, index) => (
                        <tr
                          key={`${row.studentName}-${index}`}
                          className="border-b border-gray-50 dark:border-slate-800/60 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <th scope="row" className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-slate-200">
                            {row.studentName}
                          </th>
                          <td className="px-4 py-3 text-gray-600 dark:text-slate-300">{row.className}</td>
                          <td className="px-4 py-3 text-right font-black tabular-nums text-orange-600 dark:text-orange-400">{row.points}</td>
                          <td className="px-4 py-3 text-right text-gray-500 dark:text-slate-400">{row.level}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {group.rows.length === 0 && (
                  <p className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">Nenhum aluno com pontos nesta matéria.</p>
                )}
              </Card>
            ))}
          </div>
        )}
      </ReportSection>
    </div>
  )
}

interface ReportSectionProps {
  title: string
  description?: string
  className?: string
  onExport: () => void
  /** Desabilita o CSV enquanto o formulário mostra filtros ainda não aplicados. */
  exportDisabled?: boolean
  children: ReactNode
}

function ReportSection({
  title,
  description,
  className = "mb-8",
  onExport,
  exportDisabled = false,
  children,
}: ReportSectionProps) {
  return (
    <section aria-label={title} className={className}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-base font-extrabold text-gray-800 dark:text-slate-200" style={{ fontFamily: "Nunito, sans-serif" }}>
            {title}
          </h3>
          {description && <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{description}</p>}
        </div>
        <Button
          variant="secondary"
          className="text-xs px-3 py-1.5 whitespace-nowrap"
          onClick={onExport}
          disabled={exportDisabled}
          title={exportDisabled ? "Aplique os filtros para exportar" : undefined}
          aria-label={`Exportar CSV — ${title}`}
        >
          <span aria-hidden="true">⬇️</span> CSV
        </Button>
      </div>
      {children}
    </section>
  )
}
