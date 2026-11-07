import type { DatabaseSync } from "node:sqlite"
import type {
  Activity,
  Attachment,
  Class,
  PointsTransaction,
  Redemption,
  Reward,
  SafeUser,
  StudyContent,
  Submission,
  Subject,
  User,
} from "../shared/types"
import {
  mapActivity,
  mapAttachment,
  mapClass,
  mapRedemption,
  mapReward,
  mapSafeUser,
  mapStudyContent,
  mapSubmission,
  mapSubject,
  mapUser,
  type ActivityRow,
  type AttachmentRow,
  type ClassRow,
  type RedemptionRow,
  type RewardRow,
  type StudyContentAttachmentRow,
  type StudyContentRow,
  type SubmissionRow,
  type SubjectRow,
  type TransactionRow,
  type UserRow,
} from "./rows"
import { mapTransaction } from "./rows"
import { getDb } from "./connection"

/** Query helpers reutilizados pelas rotas e serviços. */

export function findUserByEmail(db: DatabaseSync, email: string): User | null {
  const row = db
    .prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE")
    .get(email) as UserRow | undefined
  return row ? mapUser(row) : null
}

export function findUserById(db: DatabaseSync, id: string): User | null {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined
  return row ? mapUser(row) : null
}

export function findSafeUserById(db: DatabaseSync, id: string): SafeUser | null {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined
  return row ? mapSafeUser(row) : null
}

export function findClassById(db: DatabaseSync, id: string): Class | null {
  const row = db.prepare("SELECT * FROM classes WHERE id = ?").get(id) as ClassRow | undefined
  return row ? mapClass(row) : null
}

export function findSubjectById(db: DatabaseSync, id: string): Subject | null {
  const row = db.prepare("SELECT * FROM subjects WHERE id = ?").get(id) as SubjectRow | undefined
  return row ? mapSubject(row) : null
}

export interface FindActivityOptions {
  /**
   * Traz a atividade mesmo com `deletedAt` preenchido. Só quem administra a
   * lixeira usa isto — hoje, apenas `DELETE /api/activities/:id`, que precisa
   * distinguir "não existe" (404) de "já excluída" (409). Toda leitura que
   * MOSTRA a atividade ao usuário passa pelo filtro e devolve `null`.
   */
  includeDeleted?: boolean
}

/**
 * Atividade por id. Soft delete (2.4): por padrão a linha carregada é a que o
 * app enxerga — `deletedAt IS NULL`. A exclusão é marcação, não remoção, então a
 * linha continua no banco (entregas e pontosCreditados continuam amarrados nela);
 * o que some é a ATIVIDADE das listagens e do detalhe.
 */
export function findActivityById(
  db: DatabaseSync,
  id: string,
  options: FindActivityOptions = {},
): Activity | null {
  const row = db
    .prepare(
      `SELECT * FROM activities WHERE id = ?${options.includeDeleted ? "" : " AND deletedAt IS NULL"}`,
    )
    .get(id) as ActivityRow | undefined
  return row ? mapActivity(row) : null
}

export function findSubmissionById(db: DatabaseSync, id: string): Submission | null {
  const row = db.prepare("SELECT * FROM submissions WHERE id = ?").get(id) as SubmissionRow | undefined
  if (!row) return null
  const attachments = listAttachmentsForSubmission(db, id)
  return mapSubmission(row, attachments)
}

export function findSubmissionByActivityAndStudent(
  db: DatabaseSync,
  activityId: string,
  studentId: string,
): Submission | null {
  const row = db
    .prepare("SELECT * FROM submissions WHERE activityId = ? AND studentId = ?")
    .get(activityId, studentId) as SubmissionRow | undefined
  if (!row) return null
  return mapSubmission(row, listAttachmentsForSubmission(db, row.id))
}

export function listAttachmentsForSubmission(db: DatabaseSync, submissionId: string): Attachment[] {
  const rows = db
    .prepare("SELECT * FROM attachments WHERE submissionId = ? ORDER BY rowid ASC")
    .all(submissionId) as unknown as AttachmentRow[]
  return rows.map(mapAttachment)
}

/**
 * Anexos de vários reforços numa única consulta (3.1).
 *
 * A listagem carrega todos os reforços de uma vez; buscar os anexos um a um
 * faria N+1 (uma consulta por reforço). O `Map` já vem com chave para todos os
 * ids pedidos — um reforço sem anexo tem lista vazia, e não "faltando".
 */
export function listAttachmentsForStudyContents(
  db: DatabaseSync,
  studyContentIds: string[],
): Map<string, Attachment[]> {
  const grouped = new Map<string, Attachment[]>(studyContentIds.map((id) => [id, []]))
  if (studyContentIds.length === 0) return grouped
  const placeholders = studyContentIds.map(() => "?").join(",")
  const rows = db
    .prepare(
      `SELECT * FROM study_content_attachments WHERE studyContentId IN (${placeholders}) ORDER BY rowid ASC`,
    )
    .all(...studyContentIds) as unknown as StudyContentAttachmentRow[]
  for (const row of rows) {
    grouped.get(row.studyContentId)?.push(mapAttachment(row))
  }
  return grouped
}

export function findStudyContentById(db: DatabaseSync, id: string): StudyContent | null {
  const row = db.prepare("SELECT * FROM studyContents WHERE id = ?").get(id) as
    | StudyContentRow
    | undefined
  if (!row) return null
  const attachments = listAttachmentsForStudyContents(db, [id]).get(id) ?? []
  return mapStudyContent(row, attachments)
}

/** Há conclusão registrada para este reforço? Usado como guarda do DELETE. */
export function hasStudyContentCompletions(db: DatabaseSync, studyContentId: string): boolean {
  const row = db
    .prepare("SELECT 1 AS found FROM study_content_completions WHERE studyContentId = ? LIMIT 1")
    .get(studyContentId)
  return row !== undefined
}

/**
 * Estado de conclusão DE UM ALUNO para vários reforços, numa única consulta (R31).
 *
 * Mesma forma de `listAttachmentsForStudyContents` — `IN (...)` com placeholders e
 * um `Map` indexado por `studyContentId` — porque a listagem carrega N reforços e
 * consultar um a um seria N+1. Reforço sem conclusão **não** ganha chave: quem
 * chama decide o `null` do contrato.
 *
 * O filtro é `studentId` E `studyContentId`: o `studentId` é sempre o do usuário
 * autenticado (vem da sessão, nunca de parâmetro da requisição), então um reforço
 * não expõe — nem por diferença de tempo — a conclusão de outro aluno.
 */
export function listCompletionsForStudent(
  db: DatabaseSync,
  studentId: string,
  studyContentIds: string[],
): Map<string, string> {
  const completedAtByContent = new Map<string, string>()
  if (studyContentIds.length === 0) return completedAtByContent
  const placeholders = studyContentIds.map(() => "?").join(",")
  const rows = db
    .prepare(
      `SELECT studyContentId, completedAt FROM study_content_completions
        WHERE studentId = ? AND studyContentId IN (${placeholders})`,
    )
    .all(studentId, ...studyContentIds) as unknown as Array<{
    studyContentId: string
    completedAt: string
  }>
  for (const row of rows) completedAtByContent.set(row.studyContentId, row.completedAt)
  return completedAtByContent
}

/**
 * Nomes em disco dos anexos do reforço — a lista que o DELETE precisa ler ANTES
 * do CASCADE, porque depois dela não há mais metadado dizendo o que existe no
 * `uploadsDir`. Mora aqui com as outras queries do reforço (e não na rota) porque
 * é dela que a limpeza de byte depende.
 */
export function listAttachmentStoredNamesForStudyContent(db: DatabaseSync, studyContentId: string): string[] {
  const rows = db
    .prepare("SELECT storedName FROM study_content_attachments WHERE studyContentId = ?")
    .all(studyContentId) as unknown as Array<{ storedName: string }>
  return rows.map((row) => row.storedName)
}

export function findTransactionById(db: DatabaseSync, id: string): PointsTransaction | null {
  const row = db.prepare("SELECT * FROM transactions WHERE id = ?").get(id) as TransactionRow | undefined
  return row ? mapTransaction(row) : null
}

export function findRewardById(db: DatabaseSync, id: string): Reward | null {
  const row = db.prepare("SELECT * FROM rewards WHERE id = ?").get(id) as RewardRow | undefined
  return row ? mapReward(row) : null
}

export function findRedemptionById(db: DatabaseSync, id: string): Redemption | null {
  const row = db.prepare("SELECT * FROM redemptions WHERE id = ?").get(id) as RedemptionRow | undefined
  return row ? mapRedemption(row) : null
}

/** Soma das transações do aluno — o saldo é sempre derivado (RN04). */
export function sumTransactions(db: DatabaseSync, studentId: string): number {
  const row = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE studentId = ?")
    .get(studentId) as { total: number }
  return Number(row.total)
}