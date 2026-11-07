import { useCallback, useState } from "react"
import type { AuditLog } from "@shared/types"
import { ROLE_LABELS } from "@shared/types"
import { api } from "../../lib/api"
import { useAsync } from "../../hooks/useAsync"
import { Card, SectionHeader } from "../../components/ui/Card"
import { Select } from "../../components/ui/Field"
import { EmptyState, ErrorState, LoadingBlock } from "../../components/ui/EmptyState"
import { Pagination } from "../../components/ui/Pagination"
import { formatBrDateTime } from "../../lib/format"

type Role = "student" | "teacher" | "staff" | "coordinator"
type RoleFilter = "all" | Role

/** A API retorna também o nome do autor do log (sufixo na entidade). */
type AuditLogRow = AuditLog & { userName: string }

/** Resposta da API com paginação server-side (Frente 5 — item C). */
type AuditLogPage = {
  items: AuditLogRow[]
  total: number
  page: number
  pageSize: number
}

const PAGE_SIZE = 15

export function CoordinatorAuditView() {
  const [role, setRole] = useState<RoleFilter>("all")
  const [page, setPage] = useState(1)

  const logs = useAsync<AuditLogPage>(
    useCallback(
      () =>
        api.get<AuditLogPage>("/api/audit", {
          role: role === "all" ? undefined : role,
          page,
          pageSize: PAGE_SIZE,
        }),
      [role, page],
    ),
    [role, page],
  )

  const items = logs.data?.items ?? []
  const total = logs.data?.total ?? 0

  return (
    <div>
      <SectionHeader icon="🔍" title="Auditoria" subtitle="Ações sensíveis registradas na plataforma (usuários, classes, pontuação e resgates)" />

      <div className="min-w-44 mb-5 max-w-52">
        <label htmlFor="audit-role" className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1">
          Papel
        </label>
        <Select id="audit-role" value={role} onChange={(e) => { setRole(e.target.value as RoleFilter); setPage(1) }} className="py-2">
          <option value="all">Todos os papéis</option>
          <option value="student">Alunos</option>
          <option value="teacher">Professores</option>
          <option value="staff">Funcionários</option>
          <option value="coordinator">Coordenação</option>
        </Select>
      </div>

      {logs.loading && <LoadingBlock rows={4} label="Carregando registros" />}
      {!logs.loading && logs.error && <ErrorState message={logs.error} onRetry={logs.reload} />}
      {!logs.loading && !logs.error && items.length === 0 && (
        <Card>
          <EmptyState icon="🔍" title="Nenhum registro encontrado" description="Ações sensíveis aparecerão aqui assim que ocorrerem." />
        </Card>
      )}

      {!logs.loading && !logs.error && items.length > 0 && (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-400 dark:text-slate-500 border-b border-gray-100 dark:border-slate-800">
                    <th scope="col" className="px-4 py-3 font-semibold">Quando</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Usuário</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Ação</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((log) => (
                    <tr key={log.id} className="border-b border-gray-50 dark:border-slate-800/60 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 text-gray-500 dark:text-slate-400 whitespace-nowrap">{formatBrDateTime(log.timestamp)}</td>
                      <td className="px-4 py-3 font-semibold text-gray-800 dark:text-slate-200">{log.userName}</td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] font-bold text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/60 px-2 py-0.5 rounded-full whitespace-nowrap">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-slate-400">{log.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Pagination total={total} pageSize={PAGE_SIZE} current={page} onChange={setPage} />
          <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-2">
            Exibindo {items.length} de {total} registro(s). Papéis dos usuários mapeados via {ROLE_LABELS.student}/{ROLE_LABELS.teacher}/{ROLE_LABELS.staff}/{ROLE_LABELS.coordinator}.
          </p>
        </>
      )}
    </div>
  )
}