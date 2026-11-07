import type {
  CompletionReportRow,
  PointsReportRow,
  TeacherActivityMetricRow,
  TeacherPerformanceReport,
  TeacherRankingGroup,
} from "../../lib/types"
import { api, downloadFile } from "../../lib/api"
import { useAsync } from "../../hooks/useAsync"
import { useToast } from "../../context/ToastContext"
import { Card, SectionHeader } from "../../components/ui/Card"
import { Bar } from "../../components/ui/BarChart"
import { EmptyState, ErrorState, LoadingBlock } from "../../components/ui/EmptyState"
import { Button } from "../../components/ui/Button"

export function TeacherPerformanceView() {
  const { showToast } = useToast()

  const completion = useAsync<CompletionReportRow[]>(() => api.get<CompletionReportRow[]>("/api/reports/completion"), [])
  const points = useAsync<PointsReportRow[]>(() => api.get<PointsReportRow[]>("/api/reports/points"), [])
  const performance = useAsync<TeacherPerformanceReport>(
    () => api.get<TeacherPerformanceReport>("/api/reports/teacher-performance"),
    [],
  )

  async function handleDownload(route: string, label: string) {
    try {
      await downloadFile(`${route}?format=csv`)
      showToast(`${label} exportado em CSV.`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Falha ao exportar CSV.", "error")
    }
  }

  return (
    <div>
      <SectionHeader
        icon="📊"
        title="Desempenho"
        subtitle="Entregas das suas atividades por atividade e ranking de pontos turma por turma"
      />

      {/* Desempenho por atividade + ranking por turma (4.2). Uma única chamada
          (`/api/reports/teacher-performance`) alimenta as duas seções, então o
          erro e a recarga são UM estado só: dois `ErrorState` na mesma tela
          dariam dois `role="alert"` para o mesmo erro. */}
      {performance.loading && <LoadingBlock rows={3} label="Carregando relatório de desempenho" />}
      {!performance.loading && performance.error && (
        <ErrorState message={performance.error} onRetry={performance.reload} />
      )}
      {!performance.loading && !performance.error && performance.data && (
        <>
          <DesempenhoPorAtividade rows={performance.data.activities} />
          <RankingPorTurma groups={performance.data.ranking} />
        </>
      )}

      {/* Conclusão */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-extrabold text-gray-800 dark:text-slate-200" style={{ fontFamily: "Nunito, sans-serif" }}>
            Taxa de conclusão por turma
          </h3>
          <Button variant="secondary" className="text-xs px-3 py-1.5" onClick={() => void handleDownload("/api/reports/completion", "Relatório de conclusão")}>
            ⬇️ Exportar CSV
          </Button>
        </div>

        {completion.loading && <LoadingBlock rows={2} label="Carregando relatório" />}
        {!completion.loading && completion.error && <ErrorState message={completion.error} onRetry={completion.reload} />}
        {!completion.loading && !completion.error && (completion.data ?? []).length === 0 && (
          <Card>
            <EmptyState icon="📊" title="Sem dados de conclusão" description="Seus relatórios aparecerão quando houver atividades e entregas." />
          </Card>
        )}

        {!completion.loading && !completion.error && (completion.data ?? []).length > 0 && (
          <div className="space-y-3">
            {completion.data?.map((row) => (
              <Card key={`${row.className}-${row.course}`} className="p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{row.className} — {row.course}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      {row.done} de {row.possible} entregas possíveis · {row.students} alunos · {row.activities} atividades
                    </p>
                  </div>
                  <span className="text-lg font-black text-purple-700 dark:text-purple-300">{row.pct}%</span>
                </div>
                <div className="h-2.5 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-purple-500 to-purple-700 rounded-full" style={{ width: `${Math.min(100, Math.max(0, row.pct))}%` }} />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Ranking de pontos */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-extrabold text-gray-800 dark:text-slate-200" style={{ fontFamily: "Nunito, sans-serif" }}>
            Ranking de pontos dos alunos
          </h3>
          <Button variant="secondary" className="text-xs px-3 py-1.5" onClick={() => void handleDownload("/api/reports/points", "Relatório de pontos")}>
            ⬇️ Exportar CSV
          </Button>
        </div>

        {points.loading && <LoadingBlock rows={2} label="Carregando ranking" />}
        {!points.loading && points.error && <ErrorState message={points.error} onRetry={points.reload} />}
        {!points.loading && !points.error && (points.data ?? []).length === 0 && (
          <Card>
            <EmptyState icon="🏅" title="Sem pontuação ainda" description="Alunos ganham pontos quando você aprova entregas." />
          </Card>
        )}

        {!points.loading && !points.error && (points.data ?? []).length > 0 && (
          <Card className="p-4">
            {/* T4.2-R1: a tabela chapada saiu da tela porque as DUAS hierarquias
                discordavam sobre a turma do mesmo aluno (a legada resolve a turma
                por `classIds[0]`, `reports.ts:100`). O que sobra desta seção é a
                EXPORTAÇÃO do CSV de pontos — cujo cabeçalho `Aluno;Turma;Saldo;Nível`
                é contrato fixado em `server/src/tests/reports.test.ts`. O texto diz
                o que a seção faz; não promete tabela que não existe mais. */}
            <p className="text-sm text-gray-500 dark:text-slate-400">
              O ranking da tela é o agrupado por turma, acima. O CSV exportado aqui sai no mesmo
              formato de sempre: uma linha por aluno, com turma, saldo e nível.
            </p>
          </Card>
        )}
      </div>
    </div>
  )
}

/**
 * Janela de tolerância da atividade, por extenso.
 *
 * `0` não pode virar "0 dias" (que seria o oposto do que a regra diz): com 0 o
 * dia do prazo continua valendo e o bloqueio é no dia seguinte — a mesma
 * semântica da dica do formulário de atividade (`ActivityFormModal`). O `late`
 * do relatório conta atraso em QUALQUER estado, inclusive a entrega ainda em
 * análise dentro da janela, então a linha não diz "quantas Reprovar".
 */
function lateWindowLabel(days: number): string {
  if (days === 0) {
    return "Sem tolerância: o dia do prazo continua valendo, mas no dia seguinte o envio já é bloqueado."
  }
  return `Tolerância de ${days} ${days === 1 ? "dia" : "dias"} após o prazo.`
}

/** Sequência de dias do aluno: 0 é ausência de sequência, não "0 dias seguidos". */
function streakLabel(days: number): string {
  if (days <= 0) return "sem sequência hoje"
  return `${days} ${days === 1 ? "dia seguido" : "dias seguidos"}`
}

/** Colocação no ranking (mesma convenção da tabela de pontos que já existia). */
function posicaoLabel(index: number): string {
  return index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}º`
}

/** Tabela de métricas do relatório 4.2 — uma linha por atividade do professor. */
function ActivityMetricsTable({ rows }: { rows: TeacherActivityMetricRow[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label="Desempenho das minhas atividades">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400 border-b border-gray-100 dark:border-slate-800">
              <th scope="col" className="px-4 py-3 font-semibold">Atividade</th>
              <th scope="col" className="px-4 py-3 font-semibold">Prazo</th>
              <th scope="col" className="px-4 py-3 font-semibold text-right">Entregas</th>
              <th scope="col" className="px-4 py-3 font-semibold text-right">Aprovadas</th>
              <th scope="col" className="px-4 py-3 font-semibold text-right">Reprovadas</th>
              <th scope="col" className="px-4 py-3 font-semibold text-right">Pendentes</th>
              <th scope="col" className="px-4 py-3 font-semibold text-right">Atrasadas</th>
              <th scope="col" className="px-4 py-3 font-semibold text-right">Taxa</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.activityId}
                className="border-b border-gray-50 dark:border-slate-800/60 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors"
              >
                <th
                  scope="row"
                  className="px-4 py-3 text-left font-semibold text-gray-900 dark:text-slate-100"
                >
                  <span className="block">{row.title}</span>
                  <span className="block text-xs font-normal text-gray-500 dark:text-slate-400">
                    {row.subject} · {row.className}
                  </span>
                </th>
                <td className="px-4 py-3">
                  {/* R4.2-H: o prazo é exibido como foi gravado. `new Date(deadline)`
                      leria "10/02/2026" como 2 de OUTUBRO — data de calendário não
                      é o que o professor criou. */}
                  <span className="block font-semibold text-gray-800 dark:text-slate-200">{row.deadline}</span>
                  <span className="block text-xs text-gray-500 dark:text-slate-400">
                    {lateWindowLabel(row.lateWindowDays)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-800 dark:text-slate-200">
                  {row.deliveries}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-green-700 dark:text-green-400">
                  {row.approved}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-red-700 dark:text-red-400">
                  {row.rejected}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-slate-300">
                  {row.pending}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {/* Atraso > 0 ganha selo: a cor sozinha não pode ser o indício
                      (WCAG 1.4.1), então o número vem com a palavra "atrasada". */}
                  {row.late > 0 ? (
                    <span
                      title="Entregas atrasadas em qualquer estado (incluindo aprovadas, reprovadas ou em análise)."
                      className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-xs font-bold px-2 py-0.5"
                    >
                      {row.late} {row.late === 1 ? "atrasada" : "atrasadas"}
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
                      <span className="block font-black text-purple-700 dark:text-purple-300">
                        {row.donePct}%
                      </span>
                      <div className="ml-auto mt-1 h-1.5 w-14">
                        <Bar pct={row.donePct} color="bg-purple-600" />
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
  )
}

function DesempenhoPorAtividade({ rows }: { rows: TeacherActivityMetricRow[] }) {
  return (
    <div className="mb-8">
      <h3
        className="text-base font-extrabold text-gray-800 dark:text-slate-200 mb-3"
        style={{ fontFamily: "Nunito, sans-serif" }}
      >
        Desempenho por atividade
      </h3>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon="📈"
            title="Nenhuma atividade sua"
            description="As métricas de entrega aparecem aqui quando você publica uma atividade e os alunos começam a entregar."
          />
        </Card>
      ) : (
        <ActivityMetricsTable rows={rows} />
      )}
    </div>
  )
}

/** Uma tabela por turma do professor — a turma é a chave do grupo (4.2). */
function RankingPorTurma({ groups }: { groups: TeacherRankingGroup[] }) {
  return (
    <div className="mb-8">
      <h3
        className="text-base font-extrabold text-gray-800 dark:text-slate-200 mb-3"
        style={{ fontFamily: "Nunito, sans-serif" }}
      >
        Ranking por turma
      </h3>

      {groups.length === 0 ? (
        <Card>
          <EmptyState
            icon="🏅"
            title="Nenhuma turma sua"
            description="O ranking aparece turma por turma, assim que você for professor de uma turma ativa."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <Card key={`${group.className}-${group.course}`} className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 dark:border-slate-800">
                <h4
                  className="text-sm font-extrabold text-gray-900 dark:text-white"
                  style={{ fontFamily: "Nunito, sans-serif" }}
                >
                  {group.className}
                </h4>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  {group.course} · {group.rows.length}{" "}
                  {group.rows.length === 1 ? "aluno" : "alunos"}
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-label={`Ranking de pontos — ${group.className} — ${group.course}`}>
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400 border-b border-gray-100 dark:border-slate-800">
                      <th scope="col" className="px-4 py-3 font-semibold">#</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Aluno</th>
                      <th scope="col" className="px-4 py-3 font-semibold text-right">Saldo</th>
                      <th scope="col" className="px-4 py-3 font-semibold text-right">Nível</th>
                      <th scope="col" className="px-4 py-3 font-semibold text-right">Sequência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row, index) => (
                      <tr
                        key={`${row.studentName}-${index}`}
                        className="border-b border-gray-50 dark:border-slate-800/60 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="px-4 py-3 font-black text-gray-500 dark:text-slate-400">
                          {posicaoLabel(index)}
                        </td>
                        <th
                          scope="row"
                          className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-slate-200"
                        >
                          {row.studentName}
                        </th>
                        <td className="px-4 py-3 text-right font-black tabular-nums text-purple-700 dark:text-purple-300">
                          {row.balance}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500 dark:text-slate-400">{row.level}</td>
                        <td className="px-4 py-3 text-right text-xs text-gray-600 dark:text-slate-300">
                          {streakLabel(row.streak)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Turma sem aluno ativo: a tabela continua (o agrupamento é o dado),
                  e o aviso fica FORA dela para a linha de cabeçalho não virar uma
                  linha de dados inventada. */}
              {group.rows.length === 0 && (
                <p className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">
                  Nenhum aluno ativo nesta turma.
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}