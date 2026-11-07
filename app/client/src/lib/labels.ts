// Labels de entidades que não existem em @shared/types (usadas em vários painéis).
import type { PointsTxType, RedemptionStatus } from "@shared/types"

export const POINTS_TX_LABELS: Record<PointsTxType, string> = {
  activity: "Atividade aprovada",
  bonus: "Bônus",
  streak: "Bônus de sequência",
  reward_redemption: "Resgate de recompensa",
  manual_adjustment: "Ajuste manual",
  study_content: "Reforço concluído",
}

export const POINTS_TX_ICONS: Record<PointsTxType, string> = {
  activity: "✅",
  bonus: "🎁",
  streak: "🔥",
  reward_redemption: "🏆",
  manual_adjustment: "⚙️",
  study_content: "📖",
}

export const REDEMPTION_STATUS_LABELS: Record<RedemptionStatus, string> = {
  pending: "Pendente",
  processed: "Processado",
  cancelled: "Cancelado",
}

export const REDEMPTION_STATUS_COLORS: Record<RedemptionStatus, string> = {
  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  processed: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
}

export const CLASS_SHIFT_LABELS: Record<string, string> = {
  morning: "Manhã",
  afternoon: "Tarde",
  evening: "Noite",
}

// ─── Reforço escolar (3.2) ─────────────────────────────────────────────────────

/**
 * Rótulos do reforço escolar compartilhados pelas telas de aluno e professor
 * (regra do projeto: string de rótulo em um lugar só, sem hardcode duplicado).
 *
 * Desde o R31 o estado de conclusão vem da API (`completedAt` do próprio aluno) e
 * não da sessão: o selo aparece já no primeiro carregamento, e o 409 do
 * `POST /complete` é só a rede de segurança do estado concorrente (duas abas).
 */
export const STUDY_CONTENT_LABELS = {
  completed: "Concluído",
  completeAction: "Concluir reforço",
  expand: "Ver lição",
  collapse: "Ocultar lição",
  questions: "Questões de verificação",
  attachments: "Material de apoio",
} as const

/**
 * Selo de conclusão do reforço (R31), com a data quando ela é conhecida — o
 * `completedAt` da API, ou o `completion.completedAt` do 201. O caminho do 409
 * conhece o ESTADO mas não a data (o corpo do conflito não traz a conclusão), e
 * por isso mostra o selo sem data em vez de inventar uma.
 *
 * `points` já vem formatado por `formatPoints` (ex.: "+5 pts").
 */
export function studyContentDoneLabel(completedAt: string | null, points: string): string {
  return completedAt
    ? `${STUDY_CONTENT_LABELS.completed} em ${completedAt} · ${points} no seu saldo`
    : `${STUDY_CONTENT_LABELS.completed} · ${points} no seu saldo`
}

// ─── Notificações (3.4) ───────────────────────────────────────────────────────

/**
 * Textos da tela de notificações (3.4).
 *
 * A copy do acuse em lote é o ponto: o botão **não** "marca tudo como lido" —
 * ele confirma a leitura de tudo, o que **remove** as transitórias e marca as
 * persistentes. Prometer só a segunda metade é mentir para quem lê (R35), e o
 * `hint` explica o comportamento ANTES de o aluno notar que a notificação
 * sumiu sozinha.
 */
export const NOTIFICATIONS_LABELS = {
  coordGroup: "Avisos da coordenação",
  otherGroup: "Atividades e novidades",
  confirmAll: "Confirmar leitura de tudo",
  confirmAllDone: "Leitura confirmada: as novidades saíram da lista e o que estava pendente ficou marcado como lido.",
  hint: "As novidades que você já viu somem sozinhas daqui a pouco. Atividades, correções e avisos da coordenação ficam na lista até você ler.",
  allCaughtUp: "Você está em dia 🎉",
  loading: "Carregando notificações",
  confirmError: "Falha ao confirmar a leitura.",
  emptyTitle: "Nenhuma notificação",
  emptyDescription:
    "Quando houver novidades sobre suas atividades, pontos e recompensas, elas aparecerão aqui.",
} as const

/**
 * Selo de leitura da notificação.
 *
 * Desde a 3.3 a lista mistura os dois estados **para sempre**: a persistente
 * lida continua na tela (é o comportamento do servidor). Sem um selo textual,
 * "lida" e "não lida" só se distinguiam por cor e opacidade.
 */
export const NOTIFICATION_READ_LABELS = {
  unread: "Não lida",
  read: "Lida",
} as const

/** Cores do selo de leitura (o mesmo par de `labels.ts` usado nos outros status). */
export const NOTIFICATION_READ_COLORS = {
  unread: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  read: "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300",
} as const

/** "1 não lida" / "3 não lidas" — sem o "(s)" do contador genérico. */
export function notificationsUnreadLabel(count: number): string {
  return count === 1 ? "1 não lida" : `${count} não lidas`
}

/** Quantos títulos o anúncio do sumiço nomeia antes de resumir em "e mais N". */
const MAX_TITULOS_ANUNCIADOS = 3

/**
 * Anúncio do sumiço de uma notificação transitória (região `aria-live`).
 *
 * O item some **sozinho**, então a tela muda sem ninguém pedir: para o leitor
 * de tela isso precisa virar palavra, senão o aluno perde "você ganhou +15 pts"
 * entre um clique de teclado e outro. O título vai no anúncio porque "saiu 1
 * notificação" não diz o quê.
 */
export function notificationsRemovedLabel(titles: string[]): string {
  const nomes = titles.slice(0, MAX_TITULOS_ANUNCIADOS).map((t) => `“${t}”`)
  const resto = titles.length - nomes.length
  const lista = resto > 0 ? `${nomes.join(", ")} e mais ${resto}` : nomes.join(", ")
  if (titles.length === 1) return `A novidade ${lista} saiu da lista depois que você viu.`
  return `As novidades ${lista} saíram da lista depois que você as viu.`
}

// ─── Avisos da coordenação (3.5) ───────────────────────────────────────────────

/**
 * Textos do quadro de avisos da coordenação (3.5).
 *
 * O `hint` do formulário diz o que o aluno/professor vai receber ANTES de
 * publicar, porque "público: turmas" é ambíguo demais para quem não está
 * publicando: quantas pessoas serão avisadas é a informação que falta para
 * decidir entre "toda a escola" e uma turma só.
 *
 * A confirmação de sucesso traz o número **que a resposta do servidor devolveu**
 * (`notifiedUserIds.length`) — a tela nunca conta destinatário por conta própria,
 * porque a regra do público mora no servidor.
 */
export const NOTICE_LABELS = {
  loading: "Carregando avisos",
  loadingClasses: "Carregando turmas",
  emptyTitle: "Nenhum aviso publicado",
  emptyDescription: "Os avisos que você publicar aparecem aqui e chegam na notificação de cada destinatário.",
  formTitle: "Publicar aviso",
  titleLabel: "Título do aviso",
  titlePlaceholder: "Ex.: Reunião de pais",
  messageLabel: "Mensagem",
  messagePlaceholder: "Ex.: Sexta-feira, 19h, na biblioteca.",
  audienceLabel: "Quem recebe",
  audienceAll: "Toda a escola (estudantes e professores ativos)",
  audienceClasses: "Turmas específicas",
  classesLabel: "Turmas destinatárias",
  noClasses: "Selecione ao menos uma turma.",
  noActiveClasses:
    "Não há turma ativa para receber aviso. Cadastre uma turma em Turmas ou publique para toda a escola.",
  publish: "Publicar aviso",
  publishing: "Publicando...",
  published: (quantidade: number): string =>
    quantidade === 1
      ? "Aviso publicado: 1 pessoa notificada."
      : `Aviso publicado: ${quantidade} pessoas notificadas.`,
  publishError: "Falha ao publicar o aviso.",
  audienceAllHint: "Todos os estudantes e professores ativos recebem o aviso como notificação persistente.",
  audienceClassesHint: (turmas: number): string =>
    turmas === 0
      ? "Escolha uma ou mais turmas: estudantes e professores delas recebem o aviso."
      : `${turmas} turma(s) selecionada(s): estudantes e professores delas recebem o aviso.`,
  listTitle: "Avisos publicados",
  authorFallback: "Coordenação (usuário removido)",
  publishedAt: (quando: string): string => `Publicado em ${quando}`,
  audienceBadgeAll: "Toda a escola",
  audienceBadgeClasses: (turmas: number): string => `${turmas} turma(s)`,
  countLabel: (total: number): string => `${total} aviso(s) no quadro`,
} as const
