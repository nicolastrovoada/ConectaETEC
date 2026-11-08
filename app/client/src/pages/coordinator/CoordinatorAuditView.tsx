import { useCallback, useState, type FormEvent } from "react"
import type { AuditLog } from "@shared/types"
import { ROLE_LABELS } from "@shared/types"
import { api } from "../../lib/api"
import { useAsync } from "../../hooks/useAsync"
import { Button } from "../../components/ui/Button"
import { Card, SectionHeader } from "../../components/ui/Card"
import { Field, Input, Select } from "../../components/ui/Field"
import { EmptyState, ErrorState, LoadingBlock } from "../../components/ui/EmptyState"
import { Pagination } from "../../components/ui/Pagination"
import { formatBrDateTimeSeconds } from "../../lib/format"

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
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  const logs = useAsync<AuditLogPage>(
    useCallback(
      () =>
        api.get<AuditLogPage>("/api/audit", {
          role: role === "all" ? undefined : role,
          from: from || undefined,
          to: to || undefined,
          search: search || undefined,
          page,
          pageSize: PAGE_SIZE,
        }),
      [role, from, to, search, page],
    ),
    [role, from, to, search, page],
  )

  const items = logs.data?.items ?? []
  const total = logs.data?.total ?? 0

  const hasFilters = role !== "all" || from !== "" || to !== "" || searchInput !== "" || search !== ""

  function changeRole(value: RoleFilter) {
    setRole(value)
    setPage(1)
  }

  function changeFrom(value: string) {
    setFrom(value)
    setPage(1)
  }

  function changeTo(value: string) {
    setTo(value)
    setPage(1)
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSearch(searchInput.trim())
    setPage(1)
  }

  function clearFilters() {
    setRole("all")
    setFrom("")
    setTo("")
    setSearchInput("")
    setSearch("")
    setPage(1)
  }

  return (
    <div>
      <SectionHeader icon="🔍" title="Auditoria" subtitle="Ações sensíveis registradas na plataforma (usuários, classes, pontuação e resgates)" />

      <Card className="p-4 mb-5">
        <form aria-label="Filtros de auditoria" onSubmit={handleSearch} className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-44">
            <Field label="Papel" htmlFor="audit-role">
              <Select id="audit-role" value={role} onChange={(e) => changeRole(e.target.value as RoleFilter)} className="py-2">
                <option value="all">Todos os papéis</option>
                <option value="student">Alunos</option>
                <option value="teacher">Professores</option>
                <option value="staff">Funcionários</option>
                <option value="coordinator">Coordenação</option>
              </Select>
            </Field>
          </div>

          <div className="w-full sm:w-40">
            <Field label="De" htmlFor="audit-from">
              <Input id="audit-from" type="date" value={from} onChange={(e) => changeFrom(e.target.value)} className="py-2" />
            </Field>
          </div>

          <div className="w-full sm:w-40">
            <Field label="Até" htmlFor="audit-to">
              <Input id="audit-to" type="date" value={to} onChange={(e) => changeTo(e.target.value)} className="py-2" />
            </Field>
          </div>

          <div className="w-full sm:min-w-56 sm:flex-1">
            <Field label="Busca" htmlFor="audit-search" hint="Nome do usuário, ação ou descrição." hintId="audit-search-hint">
              <Input
                id="audit-search"
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Ex.: LOGIN, resgate, Ana"
                aria-describedby="audit-search-hint"
                className="py-2"
              />
            </Field>
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" className="bg-orange-700 hover:bg-orange-800">
              Buscar
            </Button>
            <Button type="button" variant="secondary" onClick={clearFilters} disabled={!hasFilters}>
              Limpar filtros
            </Button>
          </div>
        </form>
      </Card>

      {logs.loading && <LoadingBlock rows={4} label="Carregando registros" />}
      {!logs.loading && logs.error && <ErrorState message={logs.error} onRetry={logs.reload} />}
      {!logs.loading && !logs.error && items.length === 0 && (
        <Card>
          {hasFilters ? (
            <EmptyState
              icon="🔍"
              title="Nenhum registro corresponde aos filtros"
              description="Ajuste ou limpe os filtros para ver mais resultados."
            />
          ) : (
            <EmptyState
              icon="🔍"
              title="Nenhum registro encontrado"
              description="Ações sensíveis aparecerão aqui assim que ocorrerem."
            />
          )}
        </Card>
      )}

      {!logs.loading && !logs.error && items.length > 0 && (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400 border-b border-gray-100 dark:border-slate-800">
                    <th scope="col" className="px-4 py-3 font-semibold">Quando</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Usuário</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Ação</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((log) => (
                    <tr key={log.id} className="border-b border-gray-50 dark:border-slate-800/60 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 text-gray-500 dark:text-slate-400 whitespace-nowrap">{formatBrDateTimeSeconds(log.timestamp)}</td>
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
          <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-2">
            Exibindo {items.length} de {total} registro(s). Papéis dos usuários mapeados via {ROLE_LABELS.student}/{ROLE_LABELS.teacher}/{ROLE_LABELS.staff}/{ROLE_LABELS.coordinator}.
          </p>
        </>
      )}
    </div>
  )
}
