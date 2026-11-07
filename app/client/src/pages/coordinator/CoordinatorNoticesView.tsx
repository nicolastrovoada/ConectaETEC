import { useCallback, useMemo, useState, type FormEvent } from "react"
import type { Class, CoordinatorNotice, CoordinatorNoticePage, NoticeAudienceType } from "@shared/types"
import { api } from "../../lib/api"
import { useAsync } from "../../hooks/useAsync"
import { useToast } from "../../context/ToastContext"
import { Button } from "../../components/ui/Button"
import { Card, SectionHeader } from "../../components/ui/Card"
import { Field, Input, Select, Textarea } from "../../components/ui/Field"
import { EmptyState, ErrorState, LoadingBlock } from "../../components/ui/EmptyState"
import { Pagination } from "../../components/ui/Pagination"
import { NOTICE_LABELS } from "../../lib/labels"
import { formatBrDateTimeSeconds } from "../../lib/format"

/**
 * Quadro de avisos da coordenação (V3, 3.5).
 *
 * Duas coisas na mesma tela, nesta ordem: o formulário de publicação e o
 * histórico. O quadro é o que dá sentido ao formulário — quem publica precisa
 * ver o que já foi comunicado, e o que já foi comunicado é a memória da
 * coordenação (por isso a listagem é paginada no servidor e traz autor + hora).
 *
 * O formulário NÃO é quem decide o público: ele monta `{ audienceType, classIds }`
 * e o servidor resolve os destinatários e devolve `notifiedUserIds`. A tela
 * mostra a quantidade que veio de lá — prometer "5 pessoas" por conta própria
 * seria inventar a resposta da regra que mora no servidor.
 */

const PAGE_SIZE = 10

/** Resposta do POST: o aviso criado e quem foi notificado. */
interface CreateNoticeResponse {
  notice: CoordinatorNotice
  notifiedUserIds: string[]
}

export function CoordinatorNoticesView() {
  const { showToast } = useToast()
  const [page, setPage] = useState(1)
  const [titulo, setTitulo] = useState("")
  const [mensagem, setMensagem] = useState("")
  const [publico, setPublico] = useState<NoticeAudienceType>("all")
  const [turmas, setTurmas] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const avisos = useAsync<CoordinatorNoticePage>(
    useCallback(() => api.get<CoordinatorNoticePage>("/api/notices", { page, pageSize: PAGE_SIZE }), [page]),
    [page],
  )
  const classes = useAsync<Class[]>(useCallback(() => api.get<Class[]>("/api/classes"), []), [])

  const turmasAtivas = useMemo(() => (classes.data ?? []).filter((c) => c.active), [classes.data])
  const items = avisos.data?.items ?? []
  const total = avisos.data?.total ?? 0

  function alternarTurma(classId: string) {
    setTurmas((atuais) =>
      atuais.includes(classId) ? atuais.filter((id) => id !== classId) : [...atuais, classId],
    )
  }

  async function publicar(event: FormEvent) {
    event.preventDefault()
    setErro(null)
    if (publico === "classes" && turmas.length === 0) {
      setErro(NOTICE_LABELS.noClasses)
      return
    }
    setEnviando(true)
    try {
      const resposta = await api.post<CreateNoticeResponse>("/api/notices", {
        title: titulo.trim(),
        message: mensagem.trim(),
        audienceType: publico,
        // No público amplo não vai `classIds`: o servidor normaliza para vazio e
        // mandar a lista aqui seria descrever mal o que o aviso é.
        classIds: publico === "classes" ? turmas : [],
      })
      setTitulo("")
      setMensagem("")
      setTurmas([])
      showToast(NOTICE_LABELS.published(resposta.notifiedUserIds.length))
      // O aviso novo é o primeiro da lista: volta para a página 1 para mostrá-lo.
      setPage(1)
      avisos.reload()
    } catch (err) {
      setErro(err instanceof Error ? err.message : NOTICE_LABELS.publishError)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div>
      <SectionHeader
        icon="📢"
        title="Avisos"
        subtitle="Publique um aviso para toda a escola ou para turmas específicas. Quem recebe vê na notificação até ler."
      />

      <Card className="p-5 mb-6">
        <h2
          id="notice-form-title"
          className="text-base font-extrabold text-gray-900 dark:text-white mb-4"
          style={{ fontFamily: "Nunito, sans-serif" }}
        >
          {NOTICE_LABELS.formTitle}
        </h2>
        {/* `aria-labelledby` dá NOME ao formulário: sem ele, `<form>` não é
            landmark nomeado e o leitor de tela só acha os campos soltos. */}
        <form onSubmit={publicar} className="space-y-4" aria-labelledby="notice-form-title">
          {erro && (
            <p role="alert" className="text-xs text-red-600 bg-red-50 dark:bg-red-950/50 border border-red-100 dark:border-red-900 rounded-lg px-3 py-2">
              ⚠️ {erro}
            </p>
          )}

          <Field label={NOTICE_LABELS.titleLabel} htmlFor="notice-title" required>
            <Input
              id="notice-title"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder={NOTICE_LABELS.titlePlaceholder}
              maxLength={120}
              required
            />
          </Field>

          <Field label={NOTICE_LABELS.messageLabel} htmlFor="notice-message" required>
            <Textarea
              id="notice-message"
              rows={4}
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder={NOTICE_LABELS.messagePlaceholder}
              maxLength={1000}
              required
            />
          </Field>

          <fieldset>
            <legend id="notice-audience-legend" className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
              {NOTICE_LABELS.audienceLabel}
              <span className="text-red-500 ml-0.5">*</span>
            </legend>
            {/* A legenda nomeia o GRUPO e o controle: sem o `aria-labelledby`, o
                `<select>` ficaria sem nome acessível (a `legend` de um `fieldset`
                não rotula o controle que está dentro). */}
            <Select
              aria-labelledby="notice-audience-legend"
              value={publico}
              onChange={(e) => setPublico(e.target.value as NoticeAudienceType)}
              aria-describedby="notice-audience-hint"
            >
              <option value="all">{NOTICE_LABELS.audienceAll}</option>
              <option value="classes">{NOTICE_LABELS.audienceClasses}</option>
            </Select>
            <p id="notice-audience-hint" className="text-xs text-gray-500 dark:text-slate-400 mt-1.5">
              {publico === "all" ? NOTICE_LABELS.audienceAllHint : NOTICE_LABELS.audienceClassesHint(turmas.length)}
            </p>
          </fieldset>

          {publico === "classes" && (
            <fieldset>
              <legend className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
                {NOTICE_LABELS.classesLabel}
                <span className="text-red-500 ml-0.5">*</span>
              </legend>
              {classes.loading && <LoadingBlock rows={2} label={NOTICE_LABELS.loadingClasses} />}
              {!classes.loading && classes.error && <ErrorState message={classes.error} onRetry={classes.reload} />}
              {!classes.loading && !classes.error && turmasAtivas.length === 0 && (
                <p className="text-xs text-gray-500 dark:text-slate-400">{NOTICE_LABELS.noActiveClasses}</p>
              )}
              {!classes.loading && !classes.error &&
                turmasAtivas.map((klass) => (
                  <label
                    key={klass.id}
                    htmlFor={`notice-class-${klass.id}`}
                    className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-200 cursor-pointer py-0.5"
                  >
                    <input
                      id={`notice-class-${klass.id}`}
                      type="checkbox"
                      checked={turmas.includes(klass.id)}
                      onChange={() => alternarTurma(klass.id)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-700 focus:ring-2 focus:ring-blue-100"
                    />
                    {klass.name}
                  </label>
                ))}
            </fieldset>
          )}

          <Button type="submit" disabled={enviando} className="bg-green-700 hover:bg-green-800">
            {enviando ? NOTICE_LABELS.publishing : NOTICE_LABELS.publish}
          </Button>
        </form>
      </Card>

      <h2 className="text-base font-extrabold text-gray-900 dark:text-white mb-3" style={{ fontFamily: "Nunito, sans-serif" }}>
        {NOTICE_LABELS.listTitle}
      </h2>

      {avisos.loading && <LoadingBlock rows={3} label={NOTICE_LABELS.loading} />}
      {!avisos.loading && avisos.error && <ErrorState message={avisos.error} onRetry={avisos.reload} />}
      {!avisos.loading && !avisos.error && items.length === 0 && (
        <Card>
          <EmptyState icon="📢" title={NOTICE_LABELS.emptyTitle} description={NOTICE_LABELS.emptyDescription} />
        </Card>
      )}

      {!avisos.loading && !avisos.error && items.length > 0 && (
        <>
          <ul className="space-y-3">
            {items.map((notice) => (
              <li key={notice.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-sm font-extrabold text-gray-900 dark:text-white" style={{ fontFamily: "Nunito, sans-serif" }}>
                      {notice.title}
                    </h3>
                    <span className="text-[11px] font-bold px-2 py-1 rounded-full whitespace-nowrap bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                      {notice.audienceType === "all"
                        ? NOTICE_LABELS.audienceBadgeAll
                        : NOTICE_LABELS.audienceBadgeClasses(notice.classIds.length)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-slate-300 mt-1.5 whitespace-pre-line">{notice.message}</p>
                  <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-2">
                    {/* O rótulo diz QUANDO (com segundos, via `formatBrDateTimeSeconds`)
                        e QUEM: sem autor o quadro mostra o fallback em vez de sumir. */}
                    {NOTICE_LABELS.publishedAt(formatBrDateTimeSeconds(notice.createdAt))} ·{" "}
                    {notice.createdByName ?? NOTICE_LABELS.authorFallback}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
          <Pagination total={total} pageSize={PAGE_SIZE} current={page} onChange={setPage} />
          <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-2">{NOTICE_LABELS.countLabel(total)}</p>
        </>
      )}
    </div>
  )
}
