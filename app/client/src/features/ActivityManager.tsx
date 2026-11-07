import { useCallback, useEffect, useMemo, useState } from "react"
import type { Activity, ActivityType, Class, Subject } from "@shared/types"
import { api } from "../lib/api"
import { useAsync } from "../hooks/useAsync"
import { useToast } from "../context/ToastContext"
import { Button } from "../components/ui/Button"
import { Card, SectionHeader } from "../components/ui/Card"
import { Select } from "../components/ui/Field"
import { EmptyState, ErrorState, LoadingBlock } from "../components/ui/EmptyState"
import { Modal } from "../components/ui/Modal"
import { ActivityCard, type ActivityNamed } from "./ActivityCard"
import { ActivityCalendar } from "./ActivityCalendar"
import { ActivityFormModal } from "./ActivityFormModal"
import { ACTIVITY_TYPE_LABELS } from "@shared/types"

export type ActivityStatusFilter = "" | Activity["status"]

interface ActivityManagerProps {
  role: "teacher" | "staff" | "coordinator"
  canCreate: boolean
  canManageActivity: (activity: Activity) => boolean
  onGoToSubmissions: (activityId: string) => void
  title?: string
  subtitle?: string
  /**
   * A coordenação desenha o cabeçalho da tela acima do switch "Ativas |
   * Excluídas" e passa `showHeader={false}` aqui (2.6) — o título precisa ficar
   * acima das abas, não dentro do painel. Padrão `true` mantém professor e
   * funcionário exatamente como estavam.
   */
  showHeader?: boolean
}

/** Filtráveis por tipo para o select de filtro. */
const FILTER_TYPES: Array<{ value: ActivityType; label: string }> = [
  "academic",
  "school_action",
  "event",
  "library",
  "support",
  "other",
].map((t) => ({ value: t as ActivityType, label: ACTIVITY_TYPE_LABELS[t as ActivityType] }))

export function ActivityManager({
  role,
  canCreate,
  canManageActivity,
  onGoToSubmissions,
  title = "Atividades",
  subtitle = "Crie, publique e acompanhe as atividades da escola",
  showHeader = true,
}: ActivityManagerProps) {
  const { showToast } = useToast()

  const [statusFilter, setStatusFilter] = useState<ActivityStatusFilter>("")
  const [typeFilter, setTypeFilter] = useState<ActivityType | "">("")
  const [classFilter, setClassFilter] = useState("")
  const [calendarMode, setCalendarMode] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Activity | null>(null)
  const [confirmTransition, setConfirmTransition] = useState<{ activity: Activity; nextStatus: "active" | "closed" } | null>(null)
  // Exclusão lógica (V3, 2.4): guarda a atividade aguardando confirmação — o
  // botão sozinho não apaga nada, igual às transições de status acima.
  const [confirmDelete, setConfirmDelete] = useState<Activity | null>(null)

  // Lookups (turmas e disciplinas)
  const classes = useAsync<Class[]>(useCallback(() => api.get<Class[]>("/api/classes"), []), [])
  const subjects = useAsync<Subject[]>(useCallback(() => api.get<Subject[]>("/api/subjects"), []), [])

  const classById = useMemo(
    () => new Map((classes.data ?? []).map((c) => [c.id, c])),
    [classes.data],
  )
  const subjectById = useMemo(
    () => new Map((subjects.data ?? []).map((s) => [s.id, s])),
    [subjects.data],
  )

  // Lista de atividades com filtros
  const activitiesFetch = useAsync<Activity[]>(
    useCallback(
      () =>
        api.get<Activity[]>("/api/activities", {
          status: statusFilter || undefined,
          type: typeFilter || undefined,
          classId: classFilter || undefined,
        }),
      [statusFilter, typeFilter, classFilter],
    ),
    [statusFilter, typeFilter, classFilter],
  )

  // Calendário (agrupado por mês de prazo)
  const calendarFetch = useAsync<{ calendar: Array<{ month: string; activities: Activity[] }> }>(
    useCallback(() => api.get<{ calendar: Array<{ month: string; activities: Activity[] }> }>("/api/activities", { calendar: true }), []),
    [],
  )

  useEffect(() => {
    if (calendarMode) void calendarFetch.reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarMode])

  function decorate(activity: Activity): ActivityNamed {
    const klass = classById.get(activity.classId)
    const subject = subjectById.get(activity.subjectId)
    return {
      ...activity,
      className: klass ? `${klass.name}${klass.course ? ` — ${klass.course}` : ""}` : undefined,
      subjectName: subject?.name,
      subjectIcon: subject?.icon,
    }
  }

  async function handleStatusTransition(activity: Activity, nextStatus: "active" | "closed") {
    // RN: transições permitidas → confirmadas pelo servidor (draft→active→closed)
    try {
      const updated = await api.patch<Activity>(`/api/activities/${activity.id}/status`, { status: nextStatus })
      setConfirmTransition(null)
      activitiesFetch.reload()
      showToast(nextStatus === "active" ? `Atividade "${updated.title}" publicada. Turma notificada.` : `Atividade "${updated.title}" encerrada.`)
    } catch (err) {
      setConfirmTransition(null)
      showToast(err instanceof Error ? err.message : "Falha ao alterar o status.", "error")
    }
  }

  /**
   * Exclusão lógica (V3, 2.4): o servidor marca `deletedAt`/`deletedBy` e a
   * atividade sai da listagem. O `reload()` — e não um refresh de página — é o
   * que faz o card sumir; se a chamada falhar, a lista continua como estava e o
   * motivo da falha (ex.: 409 "Atividade já excluída.") chega no toast de erro.
   */
  async function handleDelete(activity: Activity) {
    try {
      await api.delete(`/api/activities/${activity.id}`)
      setConfirmDelete(null)
      activitiesFetch.reload()
      showToast(`Atividade "${activity.title}" excluída.`)
    } catch (err) {
      setConfirmDelete(null)
      showToast(err instanceof Error ? err.message : "Falha ao excluir a atividade.", "error")
    }
  }

  const activeError = activitiesFetch.error ?? classes.error ?? subjects.error
  const activeLoading = (activitiesFetch.loading || classes.loading || subjects.loading) && !activeError
  const hasFilters = statusFilter !== "" || typeFilter !== "" || classFilter !== ""

  function renderActions(activity: Activity) {
    const canManage = canManageActivity(activity)
    return (
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button variant="secondary" onClick={() => onGoToSubmissions(activity.id)} className="text-xs px-3 py-1.5">
          📥 Entregas
        </Button>
        {canManage && (
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setEditing(activity)
                setFormOpen(true)
              }}
              className="text-xs px-3 py-1.5"
            >
              ✏️ Editar
            </Button>
            {activity.status === "draft" && (
              <Button
                variant="success"
                onClick={() => setConfirmTransition({ activity, nextStatus: "active" })}
                className="text-xs px-3 py-1.5"
              >
                🚀 Publicar
              </Button>
            )}
            {activity.status === "active" && (
              <Button
                variant="secondary"
                onClick={() => setConfirmTransition({ activity, nextStatus: "closed" })}
                className="text-xs px-3 py-1.5"
              >
                ⏹ Encerrar
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => setConfirmDelete(activity)}
              className="text-xs px-3 py-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
            >
              🗑️ Excluir
            </Button>
          </>
        )}
      </div>
    )
  }

  return (
    <div>
      {showHeader && (
        <SectionHeader
          icon="📋"
          title={title}
          subtitle={subtitle}
          action={
            canCreate ? (
              <Button onClick={() => { setEditing(null); setFormOpen(true) }} className="bg-blue-700 hover:bg-blue-800">
                + Criar atividade
              </Button>
            ) : undefined
          }
        />
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div className="min-w-40 flex-1 sm:flex-none">
          <label htmlFor="flt-status" className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1">
            Status
          </label>
          <Select
            id="flt-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ActivityStatusFilter)}
            className="py-2"
          >
            <option value="">Todos</option>
            <option value="draft">Rascunho</option>
            <option value="active">Ativa</option>
            <option value="closed">Encerrada</option>
          </Select>
        </div>
        <div className="min-w-40 flex-1 sm:flex-none">
          <label htmlFor="flt-type" className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1">
            Tipo
          </label>
          <Select id="flt-type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as ActivityType | "")} className="py-2">
            <option value="">Todos</option>
            {FILTER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-40 flex-1 sm:flex-none">
          <label htmlFor="flt-class" className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1">
            Turma
          </label>
          <Select id="flt-class" value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="py-2">
            <option value="">Todas</option>
            {(classes.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-40">
          <button
            type="button"
            onClick={() => setCalendarMode((v) => !v)}
            aria-pressed={calendarMode}
            className={`w-full px-4 py-2 rounded-xl border text-sm font-semibold transition-colors ${
              calendarMode
                ? "bg-blue-700 border-blue-700 text-white"
                : "border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800"
            }`}
          >
            {calendarMode ? "🗓️ Visão em lista" : "🗓️ Visão calendário"}
          </button>
        </div>
      </div>

      {activeLoading && <LoadingBlock rows={4} label="Carregando atividades" />}

      {!activeLoading && activeError && <ErrorState message={activeError} onRetry={activitiesFetch.reload} />}

      {!activeLoading && !activeError && !calendarMode && activitiesFetch.data && activitiesFetch.data.length === 0 && (
        <Card>
          <EmptyState
            icon="🗂️"
            title="Nenhuma atividade encontrada"
            description={hasFilters ? "Nenhuma atividade corresponde aos filtros selecionados." : "Crie uma nova atividade para começar."}
            action={
              hasFilters ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setStatusFilter("")
                    setTypeFilter("")
                    setClassFilter("")
                  }}
                >
                  🧹 Limpar filtros
                </Button>
              ) : undefined
            }
          />
        </Card>
      )}

      {!activeLoading && !activeError && !calendarMode && activitiesFetch.data && activitiesFetch.data.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {activitiesFetch.data.map((activity) => (
            <ActivityCard key={activity.id} activity={decorate(activity)}>
              {renderActions(activity)}
            </ActivityCard>
          ))}
        </div>
      )}

      {!activeLoading && !activeError && calendarMode && (
        <ActivityCalendar
          calendar={calendarFetch}
          renderActivity={(activity) => (
            <ActivityCard key={activity.id} activity={decorate(activity)}>
              {renderActions(activity)}
            </ActivityCard>
          )}
        />
      )}

      <ActivityFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        onSaved={(activity, message) => {
          setFormOpen(false)
          setEditing(null)
          activitiesFetch.reload()
          showToast(message)
        }}
        onError={(message) => showToast(message, "error")}
        initial={editing}
        role={role}
        classes={classes.data ?? []}
        subjects={subjects.data ?? []}
      />

      <Modal
        open={confirmTransition !== null}
        onClose={() => setConfirmTransition(null)}
        title={confirmTransition?.nextStatus === "active" ? "Publicar atividade" : "Encerrar atividade"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmTransition(null)}>
              Cancelar
            </Button>
            <Button
              variant={confirmTransition?.nextStatus === "active" ? "success" : "danger"}
              onClick={() => {
                if (confirmTransition) void handleStatusTransition(confirmTransition.activity, confirmTransition.nextStatus)
              }}
            >
              {confirmTransition?.nextStatus === "active" ? "🚀 Publicar agora" : "⏹ Confirmar encerramento"}
            </Button>
          </>
        }
      >
        {confirmTransition && (
          <div className="text-sm text-gray-600 dark:text-slate-300">
            {confirmTransition.nextStatus === "active" ? (
              <p>
                Publicar <strong className="text-gray-900 dark:text-white">{confirmTransition.activity.title}</strong> torna a
                atividade visível para a turma e notifica todos os alunos do prazo ({confirmTransition.activity.deadline}).
              </p>
            ) : (
              <p>
                Encerrar <strong className="text-gray-900 dark:text-white">{confirmTransition.activity.title}</strong> impede novos
                envios pelos alunos.
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* Exclusão lógica (2.4): a confirmação diz o que acontece com o histórico,
          porque a atividade some das telas mas NÃO é apagada do banco. */}
      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Excluir atividade"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirmDelete) void handleDelete(confirmDelete)
              }}
            >
              🗑️ Confirmar exclusão
            </Button>
          </>
        }
      >
        {confirmDelete && (
          <div className="text-sm text-gray-600 dark:text-slate-300 space-y-3">
            <p>
              Excluir <strong className="text-gray-900 dark:text-white">{confirmDelete.title}</strong> tira a atividade
              das listas, do calendário e dos painéis.
            </p>
            <p>
              A exclusão é lógica: entregas já feitas, notas e a auditoria continuam registrados, e esta tarefa não traz
              botão de restaurar.
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}