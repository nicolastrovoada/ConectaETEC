import { useCallback } from "react"
import type { ActivitiesByTypeRow, CompletionReportRow, PointsReportRow } from "../../lib/types"
import { api, downloadFile } from "../../lib/api"
import { useAsync } from "../../hooks/useAsync"
import { useToast } from "../../context/ToastContext"
import { Card, SectionHeader } from "../../components/ui/Card"
import { Bar } from "../../components/ui/BarChart"
import { Button } from "../../components/ui/Button"
import { EmptyState, ErrorState, LoadingBlock } from "../../components/ui/EmptyState"

export function CoordinatorReportsView() {
  const { showToast } = useToast()

  const completion = useAsync<CompletionReportRow[]>(() => api.get<CompletionReportRow[]>("/api/reports/completion"), [])
  const points = useAsync<PointsReportRow[]>(() => api.get<PointsReportRow[]>("/api/reports/points"), [])
  const byType = useAsync<ActivitiesByTypeRow[]>(() => api.get<ActivitiesByTypeRow[]>("/api/reports/activities-by-type"), [])

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
      <SectionHeader icon="📈" title="Relatórios" subtitle="Dados consolidados da escola para exportação" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conclusão */}
        <section aria-label="Relatório de conclusão">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-extrabold text-gray-800 dark:text-slate-200" style={{ fontFamily: "Nunito, sans-serif" }}>
              Conclusão por turma
            </h3>
            <Button variant="secondary" className="text-xs px-3 py-1.5" onClick={() => void handleDownload("/api/reports/completion", "Relatório de conclusão")}>
              ⬇️ CSV
            </Button>
          </div>
          {completion.loading && <LoadingBlock rows={2} label="Carregando" />}
          {!completion.loading && completion.error && <ErrorState message={completion.error} onRetry={completion.reload} />}
          {!completion.loading && !completion.error && (completion.data ?? []).length === 0 && (
            <Card>
              <EmptyState icon="📊" title="Sem dados" description="Cadastre atividades para gerar o relatório." />
            </Card>
          )}
          {!completion.loading && !completion.error && (completion.data ?? []).length > 0 && (
            <Card className="p-4 space-y-3">
              {completion.data?.map((row) => (
                <div key={`${row.className}-${row.course}`}>
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">{row.className}</p>
                    <span className="text-sm font-black text-orange-600 dark:text-orange-400">{row.pct}%</span>
                  </div>
                  <Bar pct={row.pct} color="bg-gradient-to-t from-orange-500 to-red-500" />
                </div>
              ))}
            </Card>
          )}
        </section>

        {/* Atividades por tipo */}
        <section aria-label="Relatório de atividades por tipo">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-extrabold text-gray-800 dark:text-slate-200" style={{ fontFamily: "Nunito, sans-serif" }}>
              Atividades por tipo
            </h3>
            <Button variant="secondary" className="text-xs px-3 py-1.5" onClick={() => void handleDownload("/api/reports/activities-by-type", "Relatório por tipo")}>
              ⬇️ CSV
            </Button>
          </div>
          {byType.loading && <LoadingBlock rows={2} label="Carregando" />}
          {!byType.loading && byType.error && <ErrorState message={byType.error} onRetry={byType.reload} />}
          {!byType.loading && !byType.error && (byType.data ?? []).length === 0 && (
            <Card>
              <EmptyState icon="📊" title="Sem dados" description="Crie atividades para gerar o relatório." />
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
                    <Bar pct={(row.count / Math.max(1, ...(byType.data ?? []).map((r) => r.count))) * 100} color="bg-gradient-to-t from-orange-400 to-red-500" />
                  </div>
                </div>
              ))}
            </Card>
          )}
        </section>
      </div>

      {/* Ranking */}
      <section aria-label="Relatório de pontos" className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-extrabold text-gray-800 dark:text-slate-200" style={{ fontFamily: "Nunito, sans-serif" }}>
            Ranking geral de pontos
          </h3>
          <Button variant="secondary" className="text-xs px-3 py-1.5" onClick={() => void handleDownload("/api/reports/points", "Relatório de pontos")}>
            ⬇️ CSV
          </Button>
        </div>
        {points.loading && <LoadingBlock rows={2} label="Carregando ranking" />}
        {!points.loading && points.error && <ErrorState message={points.error} onRetry={points.reload} />}
        {!points.loading && !points.error && (points.data ?? []).length === 0 && (
          <Card>
            <EmptyState icon="🏅" title="Sem pontuação" description="Alunos ganham pontos quando entregas são aprovadas." />
          </Card>
        )}
        {!points.loading && !points.error && (points.data ?? []).length > 0 && (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-400 dark:text-slate-500 border-b border-gray-100 dark:border-slate-800">
                    <th scope="col" className="px-4 py-3 font-semibold">#</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Aluno</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Turma</th>
                    <th scope="col" className="px-4 py-3 font-semibold text-right">Saldo</th>
                    <th scope="col" className="px-4 py-3 font-semibold text-right">Nível</th>
                  </tr>
                </thead>
                <tbody>
                  {points.data?.map((row, index) => (
                    <tr key={`${row.studentName}-${index}`} className="border-b border-gray-50 dark:border-slate-800/60 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 font-black text-gray-400 dark:text-slate-500">
                        {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}º`}
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-800 dark:text-slate-200">{row.studentName}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-slate-400">{row.className}</td>
                      <td className="px-4 py-3 text-right font-black text-orange-600 dark:text-orange-400">{row.balance}</td>
                      <td className="px-4 py-3 text-right text-gray-500 dark:text-slate-400">{row.level}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>
    </div>
  )
}