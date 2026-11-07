/**
 * Rate limit em memória para o login (sem dependência externa).
 * Chave: `ip|email`. Janela de 5 minutos, máximo de 5 tentativas falhas.
 * O contador é limpo quando o login daquele e-mail/ip é bem-sucedido.
 */

import { tooMany } from "../lib/errors"

const WINDOW_MS = 5 * 60 * 1000
const MAX_FAILURES = 5

interface Attempt {
  failures: number
  firstFailureAt: number
}

const attempts = new Map<string, Attempt>()

function key(ip: string, email: string): string {
  return `${ip}|${email.toLowerCase()}`
}

function isExpired(attempt: Attempt): boolean {
  return Date.now() - attempt.firstFailureAt > WINDOW_MS
}

/** Remove entradas expiradas para o Map não crescer indefinidamente. */
function prune(): void {
  for (const [k, attempt] of attempts) {
    if (isExpired(attempt)) attempts.delete(k)
  }
}

export function isLoginBlocked(ip: string, email: string): boolean {
  prune()
  const attempt = attempts.get(key(ip, email))
  if (!attempt) return false
  if (isExpired(attempt)) {
    attempts.delete(key(ip, email))
    return false
  }
  return attempt.failures >= MAX_FAILURES
}

export function recordLoginFailure(ip: string, email: string): void {
  const k = key(ip, email)
  const existing = attempts.get(k)
  if (existing && !isExpired(existing)) {
    existing.failures += 1
  } else {
    attempts.set(k, { failures: 1, firstFailureAt: Date.now() })
  }
}

export function clearLoginFailures(ip: string, email: string): void {
  attempts.delete(key(ip, email))
}

/**
 * Rate limit genérico (além do login) para mutações autenticadas:
 * - 120 requisições POST/PATCH/DELETE por minuto por usuário
 * - 600 requisições por minuto por IP (teto global, evita abuso de contas paralelas)
 * Aplicado dentro do requireAuth — as rotas públicas (health, login) não passam por aqui.
 */

const USER_MUTATION_LIMIT = 120
const USER_MUTATION_WINDOW_MS = 60_000
const IP_MUTATION_LIMIT = 600
const IP_MUTATION_WINDOW_MS = 60_000

interface WindowState {
  count: number
  startedAt: number
}

const userWindows = new Map<string, WindowState>()
const ipWindows = new Map<string, WindowState>()

function consume(map: Map<string, WindowState>, mapKey: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const state = map.get(mapKey)
  if (!state || now - state.startedAt >= windowMs) {
    map.set(mapKey, { count: 1, startedAt: now })
    return true
  }
  state.count += 1
  return state.count <= limit
}

/** Lança AppError 429 quando o limite de mutações por usuário/IP é excedido. */
export function enforceApiRateLimit(userId: string, ip: string): void {
  if (!consume(userWindows, `u:${userId}`, USER_MUTATION_LIMIT, USER_MUTATION_WINDOW_MS)) {
    throw tooMany(
      "Muitas requisições. Aguarde um instante antes de continuar.",
      "API_RATE_LIMITED",
    )
  }
  if (!consume(ipWindows, `ip:${ip}`, IP_MUTATION_LIMIT, IP_MUTATION_WINDOW_MS)) {
    throw tooMany(
      "Muitas requisições deste endereço. Aguarde um instante antes de continuar.",
      "IP_RATE_LIMITED",
    )
  }
}

/** Limpa as janelas do rate limit genérico (usado nos testes de isolamento). */
export function resetApiRateLimits(): void {
  userWindows.clear()
  ipWindows.clear()
}