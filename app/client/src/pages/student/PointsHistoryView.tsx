import { useCallback } from "react"
import type { PointsTransaction } from "@shared/types"
import { getBalance, levelLabel, nextLevelGoal } from "@shared/types"
import { api } from "../../lib/api"
import { useAsync } from "../../hooks/useAsync"
import { useUser } from "../../context/UserContext"
import { Card, SectionHeader } from "../../components/ui/Card"
import { EmptyState, ErrorState, LoadingBlock } from "../../components/ui/EmptyState"
import { POINTS_TX_ICONS, POINTS_TX_LABELS } from "../../lib/labels"
import { formatBrDateTime } from "../../lib/format"

export function PointsHistoryView() {
  const { user } = useUser()
  const transactions = useAsync<PointsTransaction[]>(
    useCallback(() => api.get<PointsTransaction[]>("/api/transactions"), []),
    [],
  )

  const balance = transactions.data ? getBalance(user.id, transactions.data) : 0
  const goal = nextLevelGoal(balance)
  const metaValue = goal.kind === "max" ? "800 ✓" : `+${goal.missing ?? 0}`
  const metaLabel =
    goal.kind === "max" ? "Meta 800 atingida" : goal.kind === "milestone" ? "Meta do Diamante (800)" : "Faltam p/ próx. nível"

  return (
    <div>
      <SectionHeader icon="⭐" title="Histórico de Pontos" subtitle="Todas as transações do seu saldo" />

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="p-4 text-center">
          <p className="text-2xl font-black text-gray-900 dark:text-white">{balance}</p>
          <p className="text-xs text-gray-500 dark:text-slate-400 font-semibold mt-0.5">Saldo (pts)</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-black text-gray-900 dark:text-white">{levelLabel(balance)}</p>
          <p className="text-xs text-gray-500 dark:text-slate-400 font-semibold mt-0.5">Nível</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-black text-gray-900 dark:text-white">{metaValue}</p>
          <p className="text-xs text-gray-500 dark:text-slate-400 font-semibold mt-0.5">{metaLabel}</p>
        </Card>
      </div>

      {transactions.loading && <LoadingBlock rows={4} label="Carregando transações" />}
      {!transactions.loading && transactions.error && <ErrorState message={transactions.error} onRetry={transactions.reload} />}

      {!transactions.loading && !transactions.error && (transactions.data ?? []).length === 0 && (
        <Card>
          <EmptyState icon="⭐" title="Sem movimentações ainda" description="Quando você ganhar ou gastar pontos, o histórico aparecerá aqui." />
        </Card>
      )}

      {!transactions.loading && !transactions.error && (transactions.data ?? []).length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-400 dark:text-slate-500 border-b border-gray-100 dark:border-slate-800">
                  <th scope="col" className="px-4 py-3 font-semibold">Data</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Descrição</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Tipo</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {transactions.data?.map((transaction) => (
                  <tr key={transaction.id} className="border-b border-gray-50 dark:border-slate-800/60 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 text-gray-500 dark:text-slate-400 whitespace-nowrap">
                      {formatBrDateTime(transaction.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-800 dark:text-slate-200">{transaction.description}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <span aria-hidden="true">{POINTS_TX_ICONS[transaction.type]}</span>
                        {POINTS_TX_LABELS[transaction.type]}
                      </span>
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-black whitespace-nowrap ${
                        transaction.amount >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {transaction.amount >= 0 ? "+" : ""}
                      {transaction.amount} pts
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}