// Utilitários de formatação pt-BR.

/**
 * Converte "DD/MM/AAAA" ou "DD/MM/AAAA HH:MM" (ou variantes com vírgula/segundos) em Date.
 *
 * O separador entre data e hora aceita espaço, "T" ou vírgula — com ou sem
 * espaço depois dela. A vírgula seguida de espaço não é um detalhe: é o que o
 * `toLocaleString("pt-BR")` e o `nowBR()` do servidor produzem
 * ("28/09/2026, 10:00:00"), ou seja, o formato de `createdAt`/`submittedAt`/
 * `timestamp`/`deletedAt`. Sem esse espaço opcional, a hora era descartada em
 * silêncio e a tela mostrava "28/09/2026, 00:00" (ver QA-2026-01, corrigido na
 * 2.6 ao exibir a lixeira da coordenação).
 */
export function parseBrDateTime(value: string): Date | null {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T,]\s*(\d{2}):(\d{2}))?/)
  if (!match) return null
  const [, d, m, y, h = "00", min = "00"] = match
  const date = new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min))
  return Number.isNaN(date.getTime()) ? null : date
}

/** Formata timestamp pt-BR (ex.: "08/08/2026 09:10"). Fallback para o texto original. */
export function formatBrDateTime(value: string): string {
  const date = parseBrDateTime(value)
  if (!date) return value
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * Igual a `formatBrDateTime`, mas com SEGUNDOS (ex.: "08/08/2026 09:10:27").
 *
 * Existe separada da outra de propósito: `formatBrDateTime` é o formato de tela
 * de quase todo o app (entrega, prazo, auditoria) e mudar a hora dela para todo
 * mundo seria uma alteração de contrato visual de fora da 3.5. O quadro de
 * avisos precisa da hora exata porque é o histórico da coordenação — duas
 * comunicações no mesmo minuto precisam ser ordenáveis por quem e quando.
 *
 * O parse é próprio (o de `parseBrDateTime` descarta o segundo de propósito),
 * então a entrada "29/09/2026, 14:23:45" que o `nowBR()` do servidor produz vira
 * 14:23:45 e não 14:23:00.
 */
export function formatBrDateTimeSeconds(value: string): string {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T,]\s*(\d{2}):(\d{2})(?::(\d{2}))?)/)
  if (!match) return value
  const [, d, m, y, h = "00", min = "00", s = "00"] = match
  const date = new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min), Number(s))
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

/** Formata data pt-BR (ex.: "08/08/2026"). */
export function formatBrDate(value: string): string {
  const date = parseBrDateTime(value)
  if (!date) return value
  return date.toLocaleDateString("pt-BR")
}

/**
 * `"DD/MM/AAAA"` é uma data QUE EXISTE?
 *
 * Existe porque `parseBrDateTime` é deliberadamente tolerante (QA-2026-02: ele
 * deixa `31/02/2026` rolar para 03/03, que é o que a exibição de um dado já
 * gravado precisa fazer). Um campo que o USUÁRIO digita é outro caso: "De" e
 * "Até" da aba de filtros precisam rejeitar o que não existe, senão o período
 * vira uma data inventada em silêncio.
 *
 * Os campos são lidos um a um — não existe `new Date(string)` aqui, que leria
 * "01/02/2026" como 1 de fevereiro (o brasileiro lê 2 de janeiro).
 */
export function isValidBrDate(value: string): boolean {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim())
  if (!match) return false
  const dia = Number(match[1])
  const mes = Number(match[2])
  const ano = Number(match[3])
  const date = new Date(ano, mes - 1, dia)
  return (
    date.getFullYear() === ano && date.getMonth() === mes - 1 && date.getDate() === dia
  )
}

/**
 * `"DD/MM/AAAA"` → `"AAAAMMDD"`: chave de dia que ordena como data.
 *
 * Mesma transformação que o servidor aplica em `submittedAt` com `substr`
 * (`routes/submissions.ts`, `SUBMITTED_DAY`). O cliente precisa da MESMA chave
 * para decidir se o período está invertido antes de mandá-lo: se as duas pontas
 * fossem comparadas por `Date`, a decisão dependeria de fuso e parsing — e o
 * pedido saía com `from > to`, o que o servidor responde com 400 e a tela
 * transformava em erro de tela inteira.
 *
 * Espera uma data já validada por `isValidBrDate` (os campos da aba só chamam
 * depois de validar): o recorte é posicional, sem tolerância a lixo.
 */
export function brDayKey(value: string): string {
  const v = value.trim()
  return `${v.slice(6, 10)}${v.slice(3, 5)}${v.slice(0, 2)}`
}

/** Formatação amigável de tamanho de arquivo. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: index > 0 ? 1 : 0 })} ${units[index]}`
}

/** Número inteiro em pt-BR com separador de milhar. */
export function formatNumber(value: number): string {
  return value.toLocaleString("pt-BR")
}

/** Pontuação com sinal e unidade (ex.: "+5 pts", "-30 pts"). */
export function formatPoints(amount: number): string {
  return `${amount >= 0 ? "+" : ""}${formatNumber(amount)} pts`
}

/** Converte "MM/AAAA" em rótulo por extenso (ex.: "Janeiro 2026"). */
export function formatMonthLabel(month: string): string {
  const [m, y] = month.split("/")
  const names = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ]
  const name = names[Number(m) - 1] ?? month
  return `${name} ${y}`
}

/** Dias até o prazo "DD/MM/AAAA" (hoje = 0; negativo quando o prazo já passou). */
export function daysUntil(deadlineBr: string): number | null {
  const deadline = parseBrDateTime(deadlineBr)
  if (!deadline) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(deadline)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}