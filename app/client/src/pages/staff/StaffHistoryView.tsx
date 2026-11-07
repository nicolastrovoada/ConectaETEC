import { useCallback, useEffect, useMemo, useState } from "react"
import type { Activity, Submission } from "@shared/types"
import { api } from "../../lib/api"
import { useAsync } from "../../hooks/useAsync"
import { useUser } from "../../context/UserContext"
import { Card, SectionHeader } from "../../components/ui/Card"
import { Select } from "../../components/ui/Field"
import { EmptyState, ErrorState, LoadingBlock } from "../../components/ui/EmptyState"
import { Pagination } from "../../components/ui/Pagination"
import { SUBMISSION_STATUS_COLORS, SUBMISSION_STATUS_LABELS } from "@shared/types"
import { formatBrDateTime } from "../../lib/format"

type StatusFilter = "" | Submission["status"]

const PAGE_SIZE = 8

export function StaffHistoryView() {
  const { user } = useUser()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("")
  const [page, setPage] = useState(1)

  const activities = useAsync<Activity[]>(
    useCallback(() => api.get<Activity[]>("/api/activities", { status: "closed" }), []),
    [],
  )
  const submissions = useAsync<Submission[]>(
    useCallback(
      () =>
        api.get<Submission[]>("/api/submissions", {
          status: statusFilter || undefined,
        }),
      [statusFilter],
    ),
    [statusFilter],
  )

  const activityById = useMemo(() => new Map((activities.data ?? []).map((a) => [a.id, a])), [activities.data])

  useEffect(() => {
    setPage(1)
  }, [statusFilter])

  const visible = (submissions.data ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const stats = useMemo(() => {
    const list = submissions.data ?? []
    return {
      total: list.length,
      approved: list.filter((s) => s.status === "approved").length,
      rejected: list.filter((s) => s.status === "rejected").length,
      revision: list.filter((s) => s.status === "revision_required").length,
      pending: list.filter((s) => s.status === "pending").length,
    }
  }, [submissions.data])

  return (
    <div>
      <SectionHeader icon="🕘" title="Histórico de validações" subtitle="Todas as entregas das suas ações, com o resultado da validação" />

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="min-w-44">
          <label htmlFor="hist-status" className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1">
            Status
          </label>
          <Select id="hist-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="py-2">
            <option value="">Todos</option>
            <option value="pending">Pendente</option>
            <option value="approved">Aprovada</option>
            <option value="rejected">Rejeitada</option>
            <option value="revision_required">Correção solicitada</option>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="px-2.5 py-1.5 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 rounded-full">Total: {stats.total}</span>
          <span className="px-2.5 py-1.5 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded-full">Aprovadas: {stats.approved}</span>
          <span className="px-2.5 py-1.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded-full">Rejeitadas: {stats.rejected}</span>
          <span className="px-2.5 py-1.5 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 rounded-full">Correções: {stats.revision}</span>
        </div>
      </div>

      {submissions.loading && <LoadingBlock rows={4} label="Carregando histórico" />}
      {!submissions.loading && submissions.error && <ErrorState message={submissions.error} onRetry={submissions.reload} />}

      {!submissions.loading && !submissions.error && visible.length === 0 && (
        <Card>
          <EmptyState icon="🕘" title="Nenhuma entrega encontrada" description="Ajuste os filtros para ver o histórico." />
        </Card>
      )}

      {!submissions.loading && !submissions.error && visible.length > 0 && (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-400 dark:text-slate-500 border-b border-gray-100 dark:border-slate-800">
                    <th scope="col" className="px-4 py-3 font-semibold">Ação</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Aluno</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Entregue em</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((submission) => {
                    const activity = activityById.get(submission.activityId)
                    return (
                      <tr key={submission.id} className="border-b border-gray-50 dark:border-slate-800/60 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3 font-semibold text-gray-800 dark:text-slate-200">{activity?.title ?? "Ação removida"}</td>
                        <td className="px-4 py-3 text-gray-500 dark:text-slate-400">
                          {user.id === submission.studentId ? "Você" : `Aluno ${submission.studentId.slice(-4).toUpperCase()}`}
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-slate-400 whitespace-nowrap">{formatBrDateTime(submission.submittedAt)}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SUBMISSION_STATUS_COLORS[submission.status]}`}>
                            {SUBMISSION_STATUS_LABELS[submission.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-slate-400 max-w-52 truncate">
                          {submission.feedback || "—"}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          <Pagination total={submissions.data?.length ?? 0} pageSize={PAGE_SIZE} current={page} onChange={setPage} />
        </>
      )}
    </div>
  )
}