import { useCallback, useMemo, useState } from "react"
import { levelLabel, nextLevelGoal } from "@shared/types"
import type { Reward, Redemption } from "@shared/types"
import type { RedeemResult, RewardsStoreResponse } from "../../lib/types"
import { api } from "../../lib/api"
import { useAsync } from "../../hooks/useAsync"
import { useToast } from "../../context/ToastContext"
import { Card, SectionHeader } from "../../components/ui/Card"
import { Button } from "../../components/ui/Button"
import { Modal } from "../../components/ui/Modal"
import { EmptyState, ErrorState, LoadingBlock } from "../../components/ui/EmptyState"
import { REDEMPTION_STATUS_COLORS, REDEMPTION_STATUS_LABELS } from "../../lib/labels"
import { formatBrDateTime } from "../../lib/format"

/** Micro-interação de confete (CSS puro em index.css) — exibida após o resgate. */
function ConfettiBurst() {
  const particles = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        left: `${(i * 4.2 + 5) % 100}%`,
        delay: `${(i % 6) * 0.07}s`,
        color: ["#f59e0b", "#3b82f6", "#22c55e", "#ef4444", "#a855f7"][i % 5],
      })),
    [],
  )
  return (
    <div className="confetti-burst" aria-hidden="true">
      {particles.map((p, i) => (
        <span key={i} style={{ left: p.left, animationDelay: p.delay, backgroundColor: p.color }} />
      ))}
    </div>
  )
}

export function RewardsStoreView() {
  const { showToast } = useToast()
  const [confirmReward, setConfirmReward] = useState<Reward | null>(null)
  const [redeeming, setRedeeming] = useState(false)
  const [celebrate, setCelebrate] = useState(false)

  const store = useAsync<RewardsStoreResponse>(
    useCallback(async () => {
      const raw = await api.get<unknown>("/api/rewards")
      return raw as RewardsStoreResponse
    }, []),
    [],
  )
  const redemptions = useAsync<Redemption[]>(
    useCallback(() => api.get<Redemption[]>("/api/redemptions"), []),
    [],
  )

  const rewards = store.data?.rewards ?? []
  const balance = store.data?.balance ?? 0
  const goal = nextLevelGoal(balance)
  const metaValue = goal.kind === "max" ? "800 ✓" : `+${goal.missing ?? 0}`
  const metaLabel =
    goal.kind === "max" ? "Meta 800 atingida" : goal.kind === "milestone" ? "Meta do Diamante (800)" : "Faltam p/ próx. nível"

  async function handleRedeem() {
    if (!confirmReward) return
    setRedeeming(true)
    try {
      const result = await api.post<RedeemResult>(`/api/rewards/${confirmReward.id}/redeem`)
      setConfirmReward(null)
      store.reload()
      redemptions.reload()
      setCelebrate(true)
      window.setTimeout(() => setCelebrate(false), 3200)
      showToast(`Recompensa "${result.redemption.rewardLabel}" resgatada! Saldo: ${result.balance} pts.`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Falha ao resgatar recompensa.", "error")
      setConfirmReward(null)
    } finally {
      setRedeeming(false)
    }
  }

  const loading = store.loading
  const error = store.error

  return (
    <div>
      <SectionHeader icon="🏆" title="Loja de Recompensas" subtitle="Troque seus pontos conquistados por prêmios" />

      {celebrate && <ConfettiBurst />}

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className={`p-4 text-center ${celebrate ? "balance-pop" : ""}`}>
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

      {loading && <LoadingBlock rows={3} label="Carregando recompensas" />}
      {!loading && error && <ErrorState message={error} onRetry={store.reload} />}

      {!loading && !error && rewards.length === 0 && (
        <Card>
          <EmptyState icon="🏆" title="Nenhuma recompensa disponível" description="A coordenação vai cadastrar recompensas em breve." />
        </Card>
      )}

      {!loading && !error && rewards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rewards.map((reward) => {
            const outOfStock = reward.stock <= 0
            const cannotAfford = balance < reward.points
            return (
              <Card key={reward.id} className="p-5 flex flex-col">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-14 h-14 rounded-2xl bg-yellow-100 dark:bg-yellow-900/40 flex items-center justify-center text-3xl" aria-hidden="true">
                    {reward.icon}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-extrabold text-gray-900 dark:text-white leading-snug" style={{ fontFamily: "Nunito, sans-serif" }}>
                      {reward.label}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                      {reward.stock > 0 ? `${reward.stock} disponível(is)` : "Esgotado"}
                    </p>
                  </div>
                </div>
                <div className="mt-auto flex items-center justify-between pt-3 border-t border-gray-100 dark:border-slate-800">
                  <span className="text-lg font-black text-blue-700 dark:text-blue-400">{reward.points} pts</span>
                  <Button
                    variant="primary"
                    disabled={outOfStock || cannotAfford}
                    onClick={() => setConfirmReward(reward)}
                    className="text-xs px-3 py-2 bg-blue-700 hover:bg-blue-800"
                  >
                    {outOfStock ? "Esgotado" : cannotAfford ? "Pontos insuf." : "Resgatar"}
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Resgates anteriores */}
      <div className="mt-8">
        <h3 className="text-base font-extrabold text-gray-800 dark:text-slate-200 mb-3" style={{ fontFamily: "Nunito, sans-serif" }}>
          Meus resgates
        </h3>
        {redemptions.loading && <LoadingBlock rows={1} label="Carregando resgates" />}
        {!redemptions.loading && (redemptions.data ?? []).length === 0 && (
          <Card>
            <EmptyState icon="🎁" title="Você ainda não resgatou nada" description="Seus resgates aparecerão aqui depois que gastar seus pontos." />
          </Card>
        )}
        {!redemptions.loading && (redemptions.data ?? []).length > 0 && (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-400 dark:text-slate-500 border-b border-gray-100 dark:border-slate-800">
                    <th scope="col" className="px-4 py-3 font-semibold">Recompensa</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Custo</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Data</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {redemptions.data?.map((redemption) => (
                    <tr key={redemption.id} className="border-b border-gray-50 dark:border-slate-800/60 last:border-0">
                      <td className="px-4 py-3 font-semibold text-gray-800 dark:text-slate-200">
                        {redemption.rewardIcon} {redemption.rewardLabel}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-slate-300">- {redemption.points} pts</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-slate-400">{formatBrDateTime(redemption.redeemedAt)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${REDEMPTION_STATUS_COLORS[redemption.status]}`}>
                          {REDEMPTION_STATUS_LABELS[redemption.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      <Modal
        open={confirmReward !== null}
        onClose={() => setConfirmReward(null)}
        title="Confirmar resgate"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmReward(null)} disabled={redeeming}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={() => void handleRedeem()} disabled={redeeming} className="bg-blue-700 hover:bg-blue-800">
              {redeeming ? "Resgatando..." : "Confirmar resgate"}
            </Button>
          </>
        }
      >
        {confirmReward && (
          <div className="text-sm text-gray-600 dark:text-slate-300 space-y-3">
            <div className="flex items-center gap-4 bg-gray-50 dark:bg-slate-800 rounded-xl p-4">
              <span className="text-4xl" aria-hidden="true">{confirmReward.icon}</span>
              <div>
                <p className="font-extrabold text-gray-900 dark:text-white">{confirmReward.label}</p>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Será debitado do seu saldo</p>
              </div>
            </div>
            <p>
              Seu saldo atual é <strong className="text-gray-900 dark:text-white">{balance} pts</strong>. Após o resgate, ficará com{" "}
              <strong className="text-gray-900 dark:text-white">{balance - confirmReward.points} pts</strong>.
            </p>
            <p className="text-xs text-gray-500 dark:text-slate-400">A retirada do prêmio é feita na coordenação.</p>
          </div>
        )}
      </Modal>
    </div>
  )
}