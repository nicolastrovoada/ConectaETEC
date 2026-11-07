/** Datas pt-BR (mesmo formato usado pelo protótipo V1) no fuso America/Sao_Paulo. */

const SP_TZ = "America/Sao_Paulo" as const

interface SpParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

/** Componentes de relógio de parede de `date` no fuso de São Paulo (off do servidor). */
function spParts(date: Date): SpParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type)
    return Number(part ? part.value : 0)
  }
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  }
}

/** Offset SP−UTC (ms) no instante dado — calculado dinamicamente, sem assumir UTC-3 fixo. */
function spOffsetMs(date: Date): number {
  const p = spParts(date)
  const tzWall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  const utcWall = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  )
  return tzWall - utcWall
}

/** nowBR() e todayBR() formatam SEMPRE em America/Sao_Paulo — um servidor com
 * TZ=UTC não desloca a fronteira de dia (ex.: a virada do streak). */
export function nowBR(): string {
  return new Date().toLocaleString("pt-BR", { timeZone: SP_TZ })
}

export function todayBR(): string {
  return new Date().toLocaleDateString("pt-BR", { timeZone: SP_TZ })
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

/** Instante exato da meia-noite de hoje em São Paulo (independente do TZ do servidor). */
export function startOfToday(): Date {
  const now = new Date()
  const offset = spOffsetMs(now)
  const wall = new Date(now.getTime() + offset)
  wall.setUTCHours(0, 0, 0, 0)
  return new Date(wall.getTime() - offset)
}

/** Converte "DD/MM/AAAA" em Date local no zero-horário; null se a data não existir. */
export function parseBRDate(value: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim())
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return date
}

/** Valida "DD/MM/AAAA" como data de calendário real (rejeita 31/02/2026, 99/99/9999). */
export function isValidBRDate(value: string): boolean {
  return parseBRDate(value) !== null
}

/**
 * Chave de dia de calendário (dias desde 1970-01-01) a partir dos componentes
 * de data de `date`.
 *
 * Comparar DIAS, não instantes: o prazo "10/09/2026" é uma data de calendário.
 * Se a comparação fosse entre instantes (meia-noite local do prazo × meia-noite
 * de São Paulo de hoje), a fronteira ficaria deslocada em tantas horas quanto a
 * diferença de fuso do servidor — e o mesmo dia valeria como "no prazo" numa
 * máquina em São Paulo e como "atrasado" na mesma hora em uma máquina em UTC.
 */
function calendarDay(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000)
}

/** Mesma chave de `calendarDay`, porém para HOJE no fuso de São Paulo. */
function todayCalendarDay(): number {
  const p = spParts(new Date())
  return Math.floor(Date.UTC(p.year, p.month - 1, p.day) / 86_400_000)
}

/** True se a data é hoje ou depois (prazo futuro), comparando o dia de SP. */
export function isDeadlineOnOrAfterToday(value: string): boolean {
  const date = parseBRDate(value)
  return date !== null && calendarDay(date) >= todayCalendarDay()
}

/** True se a data já passou (prazo expirado). Valores inválidos contam como expirados. */
export function isDeadlineExpired(value: string): boolean {
  const date = parseBRDate(value)
  return date === null || calendarDay(date) < todayCalendarDay()
}

/** O que a janela de atraso precisa ler de uma atividade. `Activity` satisfaz. */
export interface LateWindowActivity {
  /** Prazo em DD/MM/AAAA. */
  deadline: string
  /** Dias de tolerância após o prazo; 0 = sem tolerância. */
  lateWindowDays: number
}

/**
 * Fase 2 (Tarefa 2.2) — a janela de atraso ainda está ABERTA?
 *
 * Regra: aberto enquanto `hoje <= prazo + lateWindowDays`, isto é, o último dia
 * da janela é INCLUSIVO (envio em `deadline + lateWindowDays` ainda vale, um dia
 * depois não). `lateWindowDays = 0` significa "sem tolerância": o próprio dia do
 * prazo ainda vale.
 *
 * "Hoje" é sempre o dia de São Paulo (`todayCalendarDay`), e o prazo entra como
 * dia de calendário — nada de `new Date()` cru nem de dia deslocado por UTC.
 * Esta é a ÚNICA implementação da aritmética da janela: o guard de envio e a
 * marcação `delayed` chamam esta função.
 *
 * Valor de janela fora do esperado (não inteiro, negativo, ausente) é tratado
 * como 0 dias: um dado corrompido nunca pode AMPLIAR a tolerância.
 */
export function isLateWindowOpen(activity: LateWindowActivity): boolean {
  const deadline = parseBRDate(activity.deadline)
  // Prazo ilegível: sem data-base não há janela (fail-closed). O guard de envio
  // já recusa antes, mas o helper não pode "abrir" por acidente.
  if (deadline === null) return false
  const dias = activity.lateWindowDays
  const windowDays = Number.isInteger(dias) && dias >= 0 ? dias : 0
  return todayCalendarDay() <= calendarDay(deadline) + windowDays
}

/** Data local daqui a `days` dias no formato DD/MM/AAAA (contagem no fuso SP). */
export function brDateInDays(days: number): string {
  const now = new Date()
  const p = spParts(now)
  const base = Date.UTC(p.year, p.month - 1, p.day) + days * 86_400_000
  const utc = new Date(base)
  return `${pad(utc.getUTCDate())}/${pad(utc.getUTCMonth() + 1)}/${utc.getUTCFullYear()}`
}