import type { DatabaseSync } from "node:sqlite"

/** Linha devolvida por `PRAGMA foreign_key_check`. */
export interface FkViolation {
  /** Tabela que contém a linha órfã. */
  table: string
  /** rowid da linha órfã (null para tabelas WITHOUT ROWID). */
  rowid: number | null
  /** Tabela pai referenciada que não encontrou o alvo. */
  parent: string
  /** Índice da FK dentro da tabela pai. */
  fkid: number
}

/**
 * Integridade referencial violada no final de uma migração.
 *
 * O runner envolve cada migração em `withTransaction`: ao lançar, a transação
 * faz ROLLBACK e a versão **não** é gravada em `schema_migrations`. O banco
 * inconsistente portanto não fica marcado como migrado — o boot falha alto e o
 * operador vê as violações em vez de silenciá-las.
 *
 * `preExisting` distingue os dois diagnósticos: quando a migração criou a
 * violação, o erro a acusa; quando ela só encontrou um banco que já estava
 * sujo, o erro diz isso — a migration é inocente e quem tem que resolver é o
 * operador, orientado para os órfãos que já estavam lá.
 */
export class ForeignKeyViolationError extends Error {
  readonly violations: FkViolation[]
  /** As violações listadas já existiam antes de a migração rodar. */
  readonly preExisting: boolean

  constructor(
    migrationVersion: number,
    migrationName: string,
    violations: FkViolation[],
    options: { preExisting?: boolean } = {},
  ) {
    const preExisting = options.preExisting === true
    const sample = violations
      .slice(0, 10)
      .map((v) => `${v.table} (rowid ${v.rowid}) -> ${v.parent}`)
      .join("; ")
    const rest = violations.length > 10 ? ` (+${violations.length - 10} outras)` : ""
    super(
      preExisting
        ? `Migração ${migrationVersion} (${migrationName}): 0 violação(ões) NOVAS — as ${violations.length} ` +
            `violação(ões) de integridade referencial restantes PRÉ-DATAM esta migration (o banco já estava ` +
            `inconsistente antes dela). A migração foi revertida e o banco NÃO foi marcado como migrado — ` +
            `corrija os órfãos pré-existentes e rode de novo. Violações anteriores: ${sample}${rest}`
        : `Migração ${migrationVersion} (${migrationName}): ${violations.length} violação(ões) de integridade referencial. ` +
            `A migração foi revertida e o banco NÃO foi marcado como migrado — corrija os dados órfãos e rode de novo. ` +
            `Violações: ${sample}${rest}`,
    )
    this.name = "ForeignKeyViolationError"
    this.violations = violations
    this.preExisting = preExisting
  }
}

/**
 * Lê as violações de integridade referencial de TODO o banco.
 *
 * `PRAGMA foreign_key_check` é uma checagem explícita: funciona com a
 * `foreign_keys` da conexão ligada ou desligada, e pode ser rodada dentro de
 * uma transação — que é exatamente onde a migração precisa dela.
 */
export function readForeignKeyViolations(db: DatabaseSync): FkViolation[] {
  return db.prepare("PRAGMA foreign_key_check").all() as unknown as FkViolation[]
}

/** Identidade estável de uma violação, para comparar o conjunto antes/depois. */
function violationKey(violation: FkViolation): string {
  return `${violation.table}|${violation.rowid ?? ""}|${violation.parent}|${violation.fkid}`
}

/**
 * Violações que apareceram entre dois instantes: `after` menos `before`.
 *
 * `foreign_key_check` varre o banco inteiro, então a checagem pós-migration
 * encontra também o que já estava quebrado. Sem esta subtração, a primeira
 * migração pendente seria acusada por um órfão que veio antes dela.
 */
export function subtractViolations(after: FkViolation[], before: FkViolation[]): FkViolation[] {
  const previous = new Set(before.map(violationKey))
  return after.filter((violation) => !previous.has(violationKey(violation)))
}
