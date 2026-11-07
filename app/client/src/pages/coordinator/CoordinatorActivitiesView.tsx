import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from "react"
import type { Activity, Class, Subject } from "@shared/types"
import { api } from "../../lib/api"
import { useAsync } from "../../hooks/useAsync"
import { ActivityManager } from "../../features/ActivityManager"
import type { ActivityNamed } from "../../features/ActivityCard"
import { ActivityTypeBadge, Badge } from "../../components/ui/Badge"
import { Card, SectionHeader } from "../../components/ui/Card"
import { EmptyState, ErrorState, LoadingBlock } from "../../components/ui/EmptyState"
import { formatBrDate, formatBrDateTime } from "../../lib/format"

/** "Ativas" = a lista de verdade; "Excluídas" = a lixeira (soft delete da 2.4). */
type Aba = "ativas" | "excluidas"

const ABAS: Array<{ id: Aba; label: string }> = [
  { id: "ativas", label: "Ativas" },
  { id: "excluidas", label: "Excluídas" },
]

/**
 * Linha da lixeira: a `Activity` + o nome de quem excluiu, que o servidor
 * resolve por `?deleted=true` (LEFT JOIN em `users`).
 */
type DeletedActivity = Activity & { deletedByName: string | null }

type DeletedActivityNamed = ActivityNamed & { deletedByName: string | null }

interface CoordinatorActivitiesViewProps {
  onGoToValidations: (activityId: string) => void
}

/**
 * Quem tirou a atividade, em pt-BR, sem nunca quebrar a lixeira: `deletedBy` é
 * id SEM FK (pode apontar para usuário desativado ou que não existe mais), e é
 * por isso que o servidor devolve `deletedByName: null` nesses casos. O mesmo
 * espírito do rótulo "Ação removida" do histórico de validações do funcionário:
 * a informação some, o registro continua.
 */
function autorDaExclusao(activity: DeletedActivity): string {
  const nome = activity.deletedByName?.trim()
  if (nome) return nome
  if (activity.deletedBy) return `Usuário removido (${activity.deletedBy})`
  return "Usuário não informado"
}

/**
 * Cartão da lixeira: os mesmos detalhes do `ActivityCard` (título, disciplina,
 * turma, pontos, prazo) mais QUANDO e QUEM excluiu. Sem contagem regressiva de
 * prazo e sem badge de "Ativa" — numa atividade fora do ar, "faltam 5 dias" e
 * "Ativa" seriam mentira. Os marcadores de exclusão são texto, não só cor.
 */
function CartaoExcluida({ activity }: { activity: DeletedActivityNamed }) {
  return (
    <Card className="p-5 flex flex-col gap-3 border-red-100 dark:border-red-900/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-extrabold text-gray-500 dark:text-slate-400 leading-snug" style={{ fontFamily: "Nunito, sans-serif" }}>
            {activity.title}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <ActivityTypeBadge type={activity.type} />
            <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
              <span aria-hidden="true">🗑️</span> Excluída
            </Badge>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-black text-blue-700 dark:text-blue-400">{activity.points} pts</p>
        </div>
      </div>

      {activity.description && (
        <p className="text-sm text-gray-500 dark:text-slate-400 line-clamp-2">{activity.description}</p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500 dark:text-slate-400">
        <span>
          {activity.subjectIcon ? `${activity.subjectIcon} ` : ""}
          {activity.subjectName ?? "Disciplina removida"}
        </span>
        <span>🏫 {activity.className ?? "Turma removida"}</span>
        <span>
          📅 Prazo: <strong className="text-gray-700 dark:text-slate-200">{formatBrDate(activity.deadline)}</strong>
        </span>
      </div>

      <div className="mt-auto pt-3 border-t border-red-50 dark:border-red-900/30 text-xs space-y-1">
        <p className="font-semibold text-orange-700 dark:text-orange-300">
          <span aria-hidden="true">🗑️</span> Excluída em{" "}
          {activity.deletedAt ? formatBrDateTime(activity.deletedAt) : "data não informada"}
        </p>
        <p className="text-gray-500 dark:text-slate-400">
          Excluída por{" "}
          <strong className="text-gray-700 dark:text-slate-200">{autorDaExclusao(activity)}</strong>
        </p>
      </div>
    </Card>
  )
}

/**
 * Lixeira da coordenação (2.6). A coordenação não é escopada por dono (2.5):
 * `?deleted=true` devolve TODAS as atividades excluídas da escola, e é isso que
 * a aba mostra — sem filtro de "minhas" e sem nada de edição: o plano não tem
 * restauração, e a API já responde 404 em atividade excluída.
 */
function AtividadesExcluidas() {
  const classes = useAsync<Class[]>(useCallback(() => api.get<Class[]>("/api/classes"), []), [])
  const subjects = useAsync<Subject[]>(useCallback(() => api.get<Subject[]>("/api/subjects"), []), [])
  const excluidas = useAsync<DeletedActivity[]>(
    useCallback(() => api.get<DeletedActivity[]>("/api/activities", { deleted: true }), []),
    [],
  )

  const classById = useMemo(() => new Map((classes.data ?? []).map((c) => [c.id, c])), [classes.data])
  const subjectById = useMemo(() => new Map((subjects.data ?? []).map((s) => [s.id, s])), [subjects.data])

  function decorar(activity: DeletedActivity): DeletedActivityNamed {
    const klass = classById.get(activity.classId)
    const subject = subjectById.get(activity.subjectId)
    return {
      ...activity,
      className: klass ? `${klass.name}${klass.course ? ` — ${klass.course}` : ""}` : undefined,
      subjectName: subject?.name,
      subjectIcon: subject?.icon,
    }
  }

  const itens = excluidas.data ?? []
  // Só a lixeira é dado principal: `classes`/`subjects` são enfeite e cada um já tem
  // fallback ("Turma removida"/"Disciplina removida"). Se um deles falhasse, o
  // ErrorState ficaria preso para sempre (o retry só recarrega `excluidas`, e o hook
  // que falhou guarda o erro) escondendo atividades que carregaram normalmente.
  const erro = excluidas.error
  const carregando = (excluidas.loading || classes.loading || subjects.loading) && !erro

  return (
    <div>
      {carregando && <LoadingBlock rows={3} label="Carregando atividades excluídas" />}

      {!carregando && erro && <ErrorState message={erro} onRetry={excluidas.reload} />}

      {!carregando && !erro && itens.length === 0 && (
        <Card>
          <EmptyState
            icon="🗑️"
            title="Nenhuma atividade excluída"
            description="Quando alguém excluir uma atividade, ela aparece aqui com data, autor e detalhes."
          />
        </Card>
      )}

      {!carregando && !erro && itens.length > 0 && (
        <>
          <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">
            {itens.length} atividade(s) excluída(s) — a exclusão é lógica: entregas, notas e auditoria continuam
            registrados, e não há como restaurar por esta tela.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {itens.map((activity) => (
              <CartaoExcluida key={activity.id} activity={decorar(activity)} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function CoordinatorActivitiesView({ onGoToValidations }: CoordinatorActivitiesViewProps) {
  const [aba, setAba] = useState<Aba>("ativas")
  const botoes = useRef<Record<Aba, HTMLButtonElement | null>>({ ativas: null, excluidas: null })

  function selecionar(proximoIndex: number) {
    setAba(ABAS[proximoIndex].id)
    botoes.current[ABAS[proximoIndex].id]?.focus()
  }

  /** Setas/Home/End do tablist: o teclado troca de aba sem sair da lista. */
  function onTecla(event: KeyboardEvent<HTMLButtonElement>, id: Aba) {
    const atual = ABAS.findIndex((t) => t.id === id)
    let proximo: number | null = null
    if (event.key === "ArrowRight") proximo = (atual + 1) % ABAS.length
    else if (event.key === "ArrowLeft") proximo = (atual - 1 + ABAS.length) % ABAS.length
    else if (event.key === "Home") proximo = 0
    else if (event.key === "End") proximo = ABAS.length - 1
    if (proximo === null) return
    event.preventDefault()
    selecionar(proximo)
  }

  return (
    <div>
      <SectionHeader
        icon="📋"
        title="Atividades da escola"
        subtitle="Todas as atividades, ações e eventos criados"
      />

      <div
        role="tablist"
        aria-label="Atividades da escola"
        className="inline-flex items-center gap-1 p-1 mb-5 rounded-xl bg-gray-100 dark:bg-slate-800"
      >
        {ABAS.map((t) => {
          const selecionada = t.id === aba
          return (
            <button
              key={t.id}
              ref={(el) => {
                botoes.current[t.id] = el
              }}
              type="button"
              role="tab"
              id={`aba-${t.id}`}
              aria-selected={selecionada}
              aria-controls={`painel-${t.id}`}
              tabIndex={selecionada ? 0 : -1}
              onClick={() => setAba(t.id)}
              onKeyDown={(event) => onTecla(event, t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                selecionada
                  ? "bg-orange-600 text-white shadow-sm ring-2 ring-orange-600/40"
                  : "text-gray-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700"
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {aba === "ativas" && (
        <div role="tabpanel" id="painel-ativas" aria-labelledby="aba-ativas">
          <ActivityManager
            role="coordinator"
            canCreate={false}
            canManageActivity={() => true}
            onGoToSubmissions={onGoToValidations}
            showHeader={false}
          />
        </div>
      )}

      {aba === "excluidas" && (
        // `tabIndex` de propósito: o painel da lixeira é tudo texto (cartões sem
        // botão nenhum, 2.6), então sem isso não tinha nada focável por teclado.
        <div role="tabpanel" id="painel-excluidas" aria-labelledby="aba-excluidas" tabIndex={0}>
          <AtividadesExcluidas />
        </div>
      )}
    </div>
  )
}
