import { useCallback, useRef, useState, type KeyboardEvent } from "react"
import type { Class, ClassDetail, ClassDetailStudent } from "@shared/types"
import { CLASS_SHIFT_LABELS } from "../../lib/labels"
import { api, downloadFile } from "../../lib/api"
import { useAsync } from "../../hooks/useAsync"
import { useUser } from "../../context/UserContext"
import { useToast } from "../../context/ToastContext"
import { Card, SectionHeader } from "../../components/ui/Card"
import { EmptyState, ErrorState, LoadingBlock } from "../../components/ui/EmptyState"
import { Button } from "../../components/ui/Button"

type Aba = "alunos" | "pontuacao" | "conteudos"

/** As três abas do detalhe da turma, na ordem em que aparecem. */
const ABAS: Array<{ id: Aba; label: string }> = [
  { id: "alunos", label: "Alunos" },
  { id: "pontuacao", label: "Pontuação" },
  { id: "conteudos", label: "Conteúdos" },
]

interface TeacherClassesViewProps {
  /**
   * Navegação do painel: **não há router**, `page` é estado do
   * `TeacherDashboard`, então a aba "Conteúdos" vira atalho por esta prop. Os
   * valores são os ids do union `Page` de lá (`reforcos` e `activities`).
   */
  onNavigate?: (page: "reforcos" | "activities") => void
}

/** Rótulo acessível da tabela: o PAR turma-curso, como nas tabelas da 4.2. */
function rotuloTabela(klass: Class): string {
  return `Alunos da turma — ${klass.name} — ${klass.course}`
}

/** Sequência em dias; 0 é ausência de sequência, nunca "0 dias seguidos". */
function rotuloSequencia(dias: number): string {
  if (dias <= 0) return "sem sequência hoje"
  return `${dias} ${dias === 1 ? "dia" : "dias"}`
}

/**
 * Tabela de alunos da turma (aba "Alunos") — o que o CSV exporta, linha a linha.
 *
 * A primeira coluna é `<th scope="row">`, que a ARIA mapeia para `rowheader` (e
 * não para `cell`) — a mesma armadilha que a tabela da 4.2 documentou.
 */
function TabelaDeAlunos({ klass, students }: { klass: Class; students: ClassDetailStudent[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label={rotuloTabela(klass)}>
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400 border-b border-gray-100 dark:border-slate-800">
              <th scope="col" className="px-4 py-3 font-semibold">Aluno</th>
              <th scope="col" className="px-4 py-3 font-semibold">E-mail</th>
              <th scope="col" className="px-4 py-3 font-semibold text-right">Nível</th>
              <th scope="col" className="px-4 py-3 font-semibold text-right">Saldo</th>
              <th scope="col" className="px-4 py-3 font-semibold text-right">Sequência</th>
              <th scope="col" className="px-4 py-3 font-semibold text-right">Aprovadas</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr
                key={student.id}
                className="border-b border-gray-50 dark:border-slate-800/60 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors"
              >
                <th
                  scope="row"
                  className="px-4 py-3 text-left font-semibold text-gray-900 dark:text-slate-100"
                >
                  {student.name}
                </th>
                <td className="px-4 py-3 text-gray-600 dark:text-slate-300">{student.email}</td>
                <td className="px-4 py-3 text-right text-gray-500 dark:text-slate-400">{student.level}</td>
                <td className="px-4 py-3 text-right font-black tabular-nums text-purple-700 dark:text-purple-300">
                  {student.balance}
                </td>
                <td className="px-4 py-3 text-right text-xs text-gray-600 dark:text-slate-300">
                  {rotuloSequencia(student.streak)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-green-700 dark:text-green-400">
                  {student.approved}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/**
 * Aba "Pontuação": o resumo da turma e a média por matéria.
 *
 * A ressalva do R5 fica NA TELHA, e não só no código: bônus, ajuste, resgate,
 * sequência e reforço entram no saldo e não na média por matéria, e um professor
 * que lê "média por matéria" sem isso conclui que a média é o saldo.
 */
function AbaPontuacao({ detalhe }: { detalhe: ClassDetail }) {
  const { stats, subjects } = detalhe
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">Alunos</p>
          <p className="text-2xl font-black text-gray-900 dark:text-white">{stats.students}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">Saldo médio</p>
          <p className="text-2xl font-black text-purple-700 dark:text-purple-300">{stats.avgBalance}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">Saldo total</p>
          <p className="text-2xl font-black text-gray-900 dark:text-white">{stats.total}</p>
        </Card>
      </div>

      <Card className="p-5">
        <h3
          className="text-base font-extrabold text-gray-800 dark:text-slate-200"
          style={{ fontFamily: "Nunito, sans-serif" }}
        >
          Pontuação média por matéria
        </h3>

        {subjects.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">
            Nenhuma atividade desta turma ainda. A média por matéria aparece quando você publica uma
            atividade e os alunos começam a ganhar pontos.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {subjects.map((subject) => (
              <li
                key={subject.name}
                className="flex items-center justify-between gap-3 text-sm border-b border-gray-50 dark:border-slate-800/60 last:border-0 pb-2 last:pb-0"
              >
                <span className="font-semibold text-gray-800 dark:text-slate-200">{subject.name}</span>
                <span className="font-black tabular-nums text-purple-700 dark:text-purple-300">
                  {subject.avg}
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 text-xs text-gray-500 dark:text-slate-400">
          Média por aluno da turma em cada matéria. Contam só os pontos ligados a uma atividade desta
          turma: bônus, ajustes, resgates, bônus de sequência, reforço e os pontos de atividades
          excluídas entram no saldo do aluno (aba Alunos), mas não nesta média.
        </p>
      </Card>
    </div>
  )
}

/**
 * Aba "Conteúdos": ATALHOS, não listagem (R9).
 *
 * Uma listagem de "conteúdos da turma" é impossível hoje: `GET /api/study-contents`
 * escopa o professor por DÓ, não por turma (R28), e não existe endpoint de
 * conteúdos por turma. Preferir um link honesto a um recorte mentiroso.
 */
function AbaConteudos({ onNavigate }: { onNavigate?: (page: "reforcos" | "activities") => void }) {
  const atalhos: Array<{
    page: "reforcos" | "activities"
    icon: string
    titulo: string
    descricao: string
  }> = [
    {
      page: "reforcos",
      icon: "📚",
      titulo: "Meus Reforços",
      descricao: "Crie e acompanhe o reforço escolar que você publica para as suas turmas.",
    },
    {
      page: "activities",
      icon: "📋",
      titulo: "Atividades",
      descricao: "Crie e publique as atividades desta turma e acompanhe as entregas.",
    },
  ]

  return (
    <Card className="p-5">
      <h3
        className="text-base font-extrabold text-gray-800 dark:text-slate-200"
        style={{ fontFamily: "Nunito, sans-serif" }}
      >
        Onde estão os conteúdos desta turma
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
        Reforços e atividades são mantidos nas telas em que você os publica, não nesta lista.
      </p>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {atalhos.map((atalho) => (
          <Button
            key={atalho.page}
            variant="secondary"
            disabled={!onNavigate}
            title={onNavigate ? undefined : "Atalho disponível dentro do painel do professor."}
            onClick={() => onNavigate?.(atalho.page)}
            className="h-auto py-3 flex-col items-start text-left gap-1"
          >
            <span className="text-sm font-bold text-gray-800 dark:text-slate-100">
              {atalho.icon} {atalho.titulo}
            </span>
            <span className="text-xs font-normal text-gray-500 dark:text-slate-400">{atalho.descricao}</span>
          </Button>
        ))}
      </div>
    </Card>
  )
}

/**
 * Detalhe de UMA turma (o `key` do pai remonta tudo a cada troca de turma, então o
 * `useAsync` do filho só precisa rodar uma vez por montagem).
 */
function DetalheDaTurma({
  classId,
  aba,
  setAba,
  onVoltar,
  onNavigate,
}: {
  classId: string
  aba: Aba
  setAba: (aba: Aba) => void
  onVoltar: () => void
  onNavigate?: (page: "reforcos" | "activities") => void
}) {
  const { showToast } = useToast()
  const botoes = useRef<Record<Aba, HTMLButtonElement | null>>({ alunos: null, pontuacao: null, conteudos: null })
  const detalhe = useAsync<ClassDetail>(
    useCallback(() => api.get<ClassDetail>(`/api/classes/${classId}/detail`), [classId]),
    [classId],
  )

  const data = detalhe.data
  const klass = data?.class

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

  async function exportarCsv() {
    try {
      await downloadFile(`/api/classes/${classId}/detail?format=csv`)
      showToast("Lista de alunos exportada em CSV.")
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Falha ao exportar CSV.", "error")
    }
  }

  return (
    <div>
      <SectionHeader
        icon="🏫"
        title={klass?.name ?? "Detalhe da turma"}
        subtitle={
          klass
            ? `${klass.course} · ${CLASS_SHIFT_LABELS[klass.shift]} · ${klass.year}º ano`
            : "Carregando a turma…"
        }
        action={
          <Button variant="ghost" onClick={onVoltar}>
            ← Voltar para as turmas
          </Button>
        }
      />

      {detalhe.loading && <LoadingBlock rows={3} label="Carregando detalhe da turma" />}
      {!detalhe.loading && detalhe.error && <ErrorState message={detalhe.error} onRetry={detalhe.reload} />}

      {!detalhe.loading && !detalhe.error && data && (
        <>
          {/* Turma inativa: a lista (`GET /api/classes`) não filtra `active`, então
              ela aparece aqui e continua consultável. O aviso usa o campo que já
              vem no payload — nenhum campo novo (R7). */}
          {!data.class.active && (
            <p className="mb-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
              Turma inativa: os dados abaixo são os do último período letivo e não mudam quando a
              turma é desativada.
            </p>
          )}

          <div
            role="tablist"
            aria-label="Detalhe da turma"
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
                      ? "bg-purple-600 text-white shadow-sm ring-2 ring-purple-600/40"
                      : "text-gray-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700"
                  }`}
                >
                  {t.label}
                </button>
              )
            })}
          </div>

          {aba === "alunos" && (
            <div role="tabpanel" id="painel-alunos" aria-labelledby="aba-alunos" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  {data.stats.students} {data.stats.students === 1 ? "aluno ativo" : "alunos ativos"}
                </p>
                <Button
                  variant="secondary"
                  className="text-xs px-3 py-1.5"
                  onClick={() => void exportarCsv()}
                >
                  📥 Exportar CSV
                </Button>
              </div>

              {data.students.length === 0 ? (
                <Card>
                  <EmptyState
                    icon="👥"
                    title="Nenhum aluno ativo nesta turma"
                    description="A lista usa os alunos ativos vinculados à turma. Ajuste os vínculos na coordenação para ver os nomes aqui."
                  />
                </Card>
              ) : (
                <TabelaDeAlunos klass={data.class} students={data.students} />
              )}
            </div>
          )}

          {aba === "pontuacao" && (
            <div role="tabpanel" id="painel-pontuacao" aria-labelledby="aba-pontuacao" tabIndex={0}>
              <AbaPontuacao detalhe={data} />
            </div>
          )}

          {aba === "conteudos" && (
            <div role="tabpanel" id="painel-conteudos" aria-labelledby="aba-conteudos">
              <AbaConteudos onNavigate={onNavigate} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function TeacherClassesView({ onNavigate }: TeacherClassesViewProps = {}) {
  const { user, roleTheme } = useUser()
  const classes = useAsync<Class[]>(
    useCallback(() => api.get<Class[]>("/api/classes"), []),
    [],
  )
  // Turma e aba são estado LOCAL (R10): voltar para a lista e voltar da lista
  //para a turma funciona sem router, sem contexto e sem `localStorage`.
  const [turmaId, setTurmaId] = useState<string | null>(null)
  const [aba, setAba] = useState<Aba>("alunos")

  if (turmaId) {
    return (
      <DetalheDaTurma
        key={turmaId}
        classId={turmaId}
        aba={aba}
        setAba={setAba}
        onVoltar={() => setTurmaId(null)}
        onNavigate={onNavigate}
      />
    )
  }

  return (
    <div>
      <SectionHeader icon="🏫" title="Minhas Turmas" subtitle="Turmas em que você é professor responsável" />

      {classes.loading && <LoadingBlock rows={2} label="Carregando turmas" />}
      {!classes.loading && classes.error && <ErrorState message={classes.error} onRetry={classes.reload} />}

      {!classes.loading && !classes.error && (classes.data ?? []).length === 0 && (
        <Card>
          <EmptyState icon="🏫" title="Nenhuma turma vinculada" description="A coordenação precisa vincular você a turmas." />
        </Card>
      )}

      {!classes.loading && !classes.error && (classes.data ?? []).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.data?.map((klass) => {
            const isResponsavel = (klass.teacherIds ?? []).includes(user.id)
            return (
              <Card key={klass.id} className="p-5">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="text-base font-extrabold text-gray-900 dark:text-white" style={{ fontFamily: "Nunito, sans-serif" }}>
                    {klass.name}
                  </h3>
                  {isResponsavel && (
                    <span className="text-[11px] font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-2 py-1 rounded-full whitespace-nowrap">
                      Sou responsável
                    </span>
                  )}
                </div>
                <div className="space-y-1.5 text-sm text-gray-600 dark:text-slate-300">
                  <p className="font-semibold">{klass.course}</p>
                  <p className="text-gray-500 dark:text-slate-400 text-xs">
                    {CLASS_SHIFT_LABELS[klass.shift]} — {klass.year}º ano
                  </p>
                  <p className="text-gray-500 dark:text-slate-400 text-xs">👥 {klass.studentIds?.length ?? 0} alunos</p>
                  {!klass.active && (
                    <p className="text-amber-700 dark:text-amber-300 text-xs font-bold">Turma inativa</p>
                  )}
                </div>
                <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-800">
                  <p className="text-xs text-gray-400 dark:text-slate-500 mb-2">Professores:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(klass.teacherIds as string[] ?? []).map((teacherId) => (
                      <span
                        key={teacherId}
                        title={teacherId === user.id ? "Você" : undefined}
                        className={`text-xs font-semibold px-2 py-1 rounded-full ${
                          teacherId === user.id
                            ? `text-white bg-gradient-to-r ${roleTheme.avatar}`
                            : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300"
                        }`}
                      >
                        {teacherId === user.id ? "Você" : `Professor ${teacherId.slice(-4).toUpperCase()}`}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-800">
                  <Button
                    variant="secondary"
                    className="w-full"
                    aria-label={`Ver detalhes da turma ${klass.name}`}
                    onClick={() => setTurmaId(klass.id)}
                  >
                    Ver detalhes
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}