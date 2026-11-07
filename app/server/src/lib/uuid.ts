import { randomUUID } from "node:crypto"

/** Identificador único v4 (padrão das PKs do Conecta ETEC). */
export function uuid(): string {
  return randomUUID()
}