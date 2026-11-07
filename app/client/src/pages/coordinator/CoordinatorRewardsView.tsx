import { useCallback, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import type { Redemption, Reward, SafeUser } from "@shared/types"
import { api } from "../../lib/api"
import { useAsync } from "../../hooks/useAsync"
import { useToast } from "../../context/ToastContext"
import { useUser } from "../../context/UserContext"
import { Button } from "../../components/ui/Button"
import { Card, SectionHeader } from "../../components/ui/Card"
import { Field, Input, Select, Textarea } from "../../components/ui/Field"
import { Modal } from "../../components/ui/Modal"
import { EmptyState, ErrorState, LoadingBlock } from "../../components/ui/EmptyState"
import { formatBrDateTime } from "../../lib/format"
import { REDEMPTION_STATUS_COLORS, REDEMPTION_STATUS_LABELS } from "../../lib/labels"

type Tab = "rewards" | "redemptions" | "points"

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "rewards", label: "Recompensas", icon: "🎁" },
  { id: "redemptions", label: "Resgates", icon: "🛍️" },
  { id: "points", label: "Ajuste de pontos", icon: "⭐" },
]

export function CoordinatorRewardsView() {
  const [tab, setTab] = useState<Tab>("rewards")
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({
    rewards: null,
    redemptions: null,
    points: null,
  })

  // Padrão APG de abas: navegação por setas ←/→ e Home/End com roving tabindex.
  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: Tab) {
    const order: Tab[] = ["rewards", "redemptions", "points"]
    const index = order.indexOf(id)
    let next = index
    if (event.key === "ArrowRight") next = (index + 1) % order.length
    else if (event.key === "ArrowLeft") next = (index - 1 + order.length) % order.length
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = order.length - 1
    else return
    event.preventDefault()
    setTab(order[next])
    tabRefs.current[order[next]]?.focus()
  }

  return (
    <div>
      <SectionHeader icon="🎁" title="Pontos e Recompensas" subtitle="Catálogo de prêmios, resgates e ajuste de saldo" />

      <div role="tablist" aria-label="Seções de reward e pontos" className="flex flex-wrap gap-2 mb-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`rw-tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            aria-controls={`rw-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            ref={(el) => {
              tabRefs.current[t.id] = el
            }}
            onClick={() => setTab(t.id)}
            onKeyDown={(event) => handleTabKeyDown(event, t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
              tab === t.id
                ? "bg-orange-600 text-white shadow"
                : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700"
            }`}
          >
            <span aria-hidden="true">{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {tab === "rewards" && (
        <div role="tabpanel" id="rw-panel-rewards" aria-labelledby="rw-tab-rewards" tabIndex={0}>
          <RewardsTab onSwitch={setTab} />
        </div>
      )}
      {tab === "redemptions" && (
        <div role="tabpanel" id="rw-panel-redemptions" aria-labelledby="rw-tab-redemptions" tabIndex={0}>
          <RedemptionsTab />
        </div>
      )}
      {tab === "points" && (
        <div role="tabpanel" id="rw-panel-points" aria-labelledby="rw-tab-points" tabIndex={0}>
          <PointsAdjustTab />
        </div>
      )}
    </div>
  )
}

function RewardsTab({ onSwitch }: { onSwitch: (tab: Tab) => void }) {
  const { showToast } = useToast()
  const rewards = useAsync<Reward[]>(useCallback(() => api.get<Reward[]>("/api/rewards"), []), [])
  const [modal, setModal] = useState<{ mode: "create" | "edit"; reward: Reward | null } | null>(null)

  async function removeReward(reward: Reward) {
    if (!window.confirm(`Excluir a recompensa "${reward.label}"?`)) return
    try {
      await api.delete(`/api/rewards/${reward.id}`)
      showToast(`Recompensa "${reward.label}" excluída.`)
      rewards.reload()
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Falha ao excluir.", "error")
    }
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={() => setModal({ mode: "create", reward: null })} className="bg-green-700 hover:bg-green-800">
          + Nova recompensa
        </Button>
      </div>

      {rewards.loading && <LoadingBlock rows={3} label="Carregando recompensas" />}
      {!rewards.loading && rewards.error && <ErrorState message={rewards.error} onRetry={rewards.reload} />}
      {!rewards.loading && !rewards.error && (rewards.data ?? []).length === 0 && (
        <Card>
          <EmptyState
            icon="🎁"
            title="Nenhuma recompensa cadastrada"
            description="Crie prêmios para os alunos resgatarem com seus pontos."
            action={
              <Button onClick={() => setModal({ mode: "create", reward: null })} className="bg-green-700 hover:bg-green-800">
                + Nova recompensa
              </Button>
            }
          />
        </Card>
      )}

      {!rewards.loading && !rewards.error && (rewards.data ?? []).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {rewards.data?.map((reward) => (
            <Card key={reward.id} className="p-4 flex flex-col">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-11 h-11 rounded-xl bg-yellow-100 dark:bg-yellow-900/40 flex items-center justify-center text-2xl" aria-hidden="true">
                  {reward.icon}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-extrabold text-gray-900 dark:text-white truncate" style={{ fontFamily: "Nunito, sans-serif" }}>
                    {reward.label}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400">{reward.stock > 0 ? `${reward.stock} em estoque` : "Esgotado"}</p>
                </div>
              </div>
              <div className="mt-auto flex items-center justify-between pt-3 border-t border-gray-100 dark:border-slate-800">
                <span className="text-base font-black text-orange-600 dark:text-orange-400">{reward.points} pts</span>
                <div className="flex gap-1">
                  <Button
                    variant="secondary"
                    className="text-xs px-2 py-1"
                    aria-label="Editar recompensa"
                    onClick={() => setModal({ mode: "edit", reward })}
                  >
                    ✏️
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-xs px-2 py-1 text-red-600 dark:text-red-400"
                    aria-label="Excluir recompensa"
                    onClick={() => void removeReward(reward)}
                  >
                    🗑️
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {modal && (
        <RewardFormModal
          mode={modal.mode}
          reward={modal.reward}
          onClose={() => setModal(null)}
          onSaved={(message) => {
            setModal(null)
            rewards.reload()
            showToast(message)
          }}
        />
      )}
    </>
  )
}

function RedemptionsTab() {
  const { user } = useUser()
  const { showToast } = useToast()
  const redemptions = useAsync<Redemption[]>(useCallback(() => api.get<Redemption[]>("/api/redemptions"), []), [])

  async function processRedemption(redemption: Redemption) {
    if (!window.confirm(`Confirmar a entrega de "${redemption.rewardLabel}" ao aluno?`)) return
    try {
      await api.patch(`/api/redemptions/${redemption.id}`, { status: "processed", processedBy: user.name })
      showToast("Resgate processado com sucesso.")
      redemptions.reload()
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Falha ao processar.", "error")
    }
  }

  async function cancelRedemption(redemption: Redemption) {
    if (!window.confirm(`Cancelar o resgate de "${redemption.rewardLabel}"? Os pontos serão devolvidos ao aluno.`)) return
    try {
      await api.patch(`/api/redemptions/${redemption.id}/cancel`)
      showToast("Resgate cancelado. Pontos devolvidos.")
      redemptions.reload()
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Falha ao cancelar.", "error")
    }
  }

  return (
    <div>
      {redemptions.loading && <LoadingBlock rows={3} label="Carregando resgates" />}
      {!redemptions.loading && redemptions.error && <ErrorState message={redemptions.error} onRetry={redemptions.reload} />}
      {!redemptions.loading && !redemptions.error && (redemptions.data ?? []).length === 0 && (
        <Card>
          <EmptyState icon="🛍️" title="Nenhum resgate realizado" description="Os resgates dos alunos aparecerão aqui." />
        </Card>
      )}

      {!redemptions.loading && !redemptions.error && (redemptions.data ?? []).length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-400 dark:text-slate-500 border-b border-gray-100 dark:border-slate-800">
                  <th scope="col" className="px-4 py-3 font-semibold">Recompensa</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Aluno</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Custo</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Data</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {redemptions.data?.map((redemption) => (
                  <tr key={redemption.id} className="border-b border-gray-50 dark:border-slate-800/60 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-semibold text-gray-800 dark:text-slate-200">{redemption.rewardIcon} {redemption.rewardLabel}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-slate-400">Aluno {redemption.studentId.slice(-4).toUpperCase()}</td>
                    <td className="px-4 py-3 text-orange-600 dark:text-orange-400 font-bold">{redemption.points} pts</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-slate-400 whitespace-nowrap">{formatBrDateTime(redemption.redeemedAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${REDEMPTION_STATUS_COLORS[redemption.status]}`}>
                        {REDEMPTION_STATUS_LABELS[redemption.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {redemption.status === "pending" ? (
                        <div className="flex justify-end gap-1.5">
                          <Button variant="success" className="text-xs px-3 py-1.5" onClick={() => void processRedemption(redemption)}>
                            ✓ Processar
                          </Button>
                          <Button
                            variant="ghost"
                            className="text-xs px-2 py-1.5 text-red-600 dark:text-red-400"
                            onClick={() => void cancelRedemption(redemption)}
                          >
                            ✕ Cancelar
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-slate-500">—</span>
                      )}
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

function PointsAdjustTab() {
  const { user } = useUser()
  const { showToast } = useToast()
  const students = useAsync<SafeUser[]>(
    useCallback(() => api.get<SafeUser[]>("/api/users", { role: "student" }), []),
    [],
  )
  const [studentId, setStudentId] = useState("")
  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("")
  const [mode, setMode] = useState<"bonus" | "adjust">("bonus")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const modeRefs = useRef<Record<"bonus" | "adjust", HTMLButtonElement | null>>({
    bonus: null,
    adjust: null,
  })

  // Padrão APG de abas: navegação por setas ←/→ e Home/End com roving tabindex.
  function handleModeKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: "bonus" | "adjust") {
    const order: Array<"bonus" | "adjust"> = ["bonus", "adjust"]
    const index = order.indexOf(id)
    let next = index
    if (event.key === "ArrowRight") next = (index + 1) % order.length
    else if (event.key === "ArrowLeft") next = (index - 1 + order.length) % order.length
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = order.length - 1
    else return
    event.preventDefault()
    setMode(order[next])
    modeRefs.current[order[next]]?.focus()
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError("")
    if (!studentId) return setError("Selecione um aluno.")
    const pts = Number(amount)
    if (!Number.isInteger(pts)) return setError("Valor deve ser um número inteiro.")
    if (mode === "adjust" && pts === 0) return setError("Ajuste deve ser diferente de zero.")
    if (mode === "bonus" && pts <= 0) return setError("Bônus deve ser um inteiro positivo.")
    if (description.trim().length < (mode === "adjust" ? 3 : 1)) return setError("Descreva a justificativa.")

    setSaving(true)
    try {
      if (mode === "bonus") {
        await api.post("/api/points/bonus", { studentId, amount: pts, description: description.trim() })
        showToast(`Bônus de ${pts} pts concedido!`)
      } else {
        await api.post("/api/points/adjust", { studentId, amount: pts, description: description.trim() })
        showToast(`Ajuste de ${pts} pts aplicado.`)
      }
      setAmount("")
      setDescription("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao aplicar pontos.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-xl">
      <div
        role="tabpanel"
        id="pts-panel"
        aria-labelledby={mode === "bonus" ? "pts-tab-bonus" : "pts-tab-adjust"}
        tabIndex={0}
      >
        <Card className="p-6">
        <h3 className="text-sm font-extrabold text-gray-900 dark:text-white mb-4" style={{ fontFamily: "Nunito, sans-serif" }}>
          {mode === "bonus" ? "Conceder bônus de pontos" : "Ajustar saldo do aluno"}
        </h3>
        <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
          {mode === "bonus"
            ? "Conceda um bônus por ações especiais (o aluno recebe notificação e o registro entra na auditoria)."
            : "Subtraia ou credite pontos para corrigir saldo (o saldo nunca fica negativo)."}
        </p>

        <div role="tablist" aria-label="Tipo de transação" className="flex flex-wrap gap-2 mb-5">
          <button
            type="button"
            role="tab"
            id="pts-tab-bonus"
            aria-selected={mode === "bonus"}
            aria-controls="pts-panel"
            tabIndex={mode === "bonus" ? 0 : -1}
            ref={(el) => {
              modeRefs.current.bonus = el
            }}
            onClick={() => setMode("bonus")}
            onKeyDown={(event) => handleModeKeyDown(event, "bonus")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${mode === "bonus" ? "bg-orange-600 text-white" : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300"}`}
          >
            ➕ Bônus
          </button>
          <button
            type="button"
            role="tab"
            id="pts-tab-adjust"
            aria-selected={mode === "adjust"}
            aria-controls="pts-panel"
            tabIndex={mode === "adjust" ? 0 : -1}
            ref={(el) => {
              modeRefs.current.adjust = el
            }}
            onClick={() => setMode("adjust")}
            onKeyDown={(event) => handleModeKeyDown(event, "adjust")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${mode === "adjust" ? "bg-orange-600 text-white" : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300"}`}
          >
            ➖ Ajuste
          </button>
        </div>

        {students.loading && <LoadingBlock rows={1} label="Carregando alunos" />}
        {!students.loading && students.error && <ErrorState message={students.error} onRetry={students.reload} />}

        {!students.loading && !students.error && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p role="alert" className="text-xs text-red-600 bg-red-50 dark:bg-red-950/50 border border-red-100 dark:border-red-900 rounded-lg px-3 py-2">
                ⚠️ {error}
              </p>
            )}
            <Field label="Aluno" htmlFor="pts-student" required>
              <Select id="pts-student" value={studentId} onChange={(e) => setStudentId(e.target.value)} required>
                <option value="" disabled>
                  Selecione o aluno
                </option>
                {(students.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {s.email}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label={mode === "bonus" ? "Pontos de bônus" : "Valor (negativo subtrai)"} htmlFor="pts-amount" required>
                <Input id="pts-amount" type="number" step={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Ex: 10" required />
              </Field>
              <div className="flex items-end pb-1">
                <Button type="submit" disabled={saving} className="w-full bg-orange-600 hover:bg-orange-700">
                  {saving ? "Aplicando..." : mode === "bonus" ? "Conceder bônus" : "Aplicar ajuste"}
                </Button>
              </div>
            </div>
            <Field label="Justificativa" htmlFor="pts-desc" required>
              <Textarea
                id="pts-desc"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={mode === "bonus" ? "Ex: Destaque na feira de ciências" : "Ex: Correção de atividade reprovada por engano"}
                required
              />
            </Field>
            <p className="text-[11px] text-gray-400 dark:text-slate-500">
              Registrado por {user.name} na auditoria.
            </p>
          </form>
        )}
      </Card>
      </div>
    </div>
  )
}

function RewardFormModal({
  mode,
  reward,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit"
  reward: Reward | null
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const isEdit = mode === "edit"
  const [label, setLabel] = useState(reward?.label ?? "")
  const [icon, setIcon] = useState(reward?.icon ?? "🏆")
  const [points, setPoints] = useState(String(reward?.points ?? 50))
  const [stock, setStock] = useState(String(reward?.stock ?? 5))
  const [saving, setSaving] = useState(false)
  const [fieldError, setFieldError] = useState("")

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFieldError("")
    if (label.trim().length < 3) return setFieldError("O nome deve ter ao menos 3 caracteres.")
    const pts = Number(points)
    const stk = Number(stock)
    if (!Number.isInteger(pts) || pts <= 0) return setFieldError("Preço deve ser um inteiro positivo.")
    if (!Number.isInteger(stk) || stk < 0) return setFieldError("Estoque não pode ser negativo.")

    setSaving(true)
    try {
      const payload = { label: label.trim(), icon, points: pts, stock: stk }
      if (isEdit && reward) {
        await api.patch(`/api/rewards/${reward.id}`, payload)
        onSaved("Recompensa atualizada.")
      } else {
        await api.post("/api/rewards", payload)
        onSaved(`Recompensa "${label.trim()}" criada.`)
      }
    } catch (err) {
      setFieldError(err instanceof Error ? err.message : "Falha ao salvar recompensa.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? "Editar recompensa" : "Nova recompensa"}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="reward-form" disabled={saving} className="bg-green-700 hover:bg-green-800">
            {saving ? "Salvando..." : isEdit ? "Salvar alterações" : "Criar recompensa"}
          </Button>
        </>
      }
    >
      <form id="reward-form" onSubmit={handleSubmit} className="space-y-4">
        {fieldError && (
          <p role="alert" className="text-xs text-red-600 bg-red-50 dark:bg-red-950/50 border border-red-100 dark:border-red-900 rounded-lg px-3 py-2">
            ⚠️ {fieldError}
          </p>
        )}
        <Field label="Nome da recompensa" htmlFor="rw-label" required>
          <Input id="rw-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex: Isenção de uniforme no mês" required />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Preço (pontos)" htmlFor="rw-points" required>
            <Input id="rw-points" type="number" min={1} step={1} value={points} onChange={(e) => setPoints(e.target.value)} required />
          </Field>
          <Field label="Estoque" htmlFor="rw-stock" required>
            <Input id="rw-stock" type="number" min={0} step={1} value={stock} onChange={(e) => setStock(e.target.value)} required />
          </Field>
        </div>
        <Field label="Ícone" htmlFor="rw-icon">
          <Input id="rw-icon" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🏆" maxLength={8} />
        </Field>
      </form>
    </Modal>
  )
}