import type { DatabaseSync } from "node:sqlite"
import { getDb } from "../db/connection"
import { mapClass, mapUser, type ClassRow, type UserRow } from "../db/rows"
import { startOfToday } from "../lib/dates"
import { getBalance } from "./points"
import { currentStreakDays } from "./streak"
import { levelLabel } from "../shared/types"
import type { Role } from "../shared/types"

export interface CompletionRow {
  className: string
  course: string
  students: number
  activities: number
  possible: number
  done: number
  pct: number
}

export interface PointsByStudentRow {
  studentName: string
  className: string
  balance: number
  level: string
}

export interface ActivitiesByTypeRow {
  type: string
  label: string
  count: number
}

function isTeacherOrCoordinator(role: Role): boolean {
  return role === "teacher" || role === "coordinator"
}

/** Taxa de conclusão por turma (professor vê apenas suas turmas; coord vê todas). */
export function completionReport(caller: { role: Role; userId: string }): CompletionRow[] {
  if (!isTeacherOrCoordinator(caller.role)) return []
  const db = getDb()
  const classRows = db.prepare("SELECT * FROM classes").all() as unknown as ClassRow[]
  const classes = classRows.map(mapClass).filter((c) => c.active)
  const scoped = caller.role === "teacher" ? classes.filter((c) => c.teacherIds.includes(caller.userId)) : classes

  const activitiesByClass = new Map<string, string[]>()
  for (const c of scoped) {
    // Soft delete (2.4): a excluída sai do denominador de "possíveis" — contá-la
    // aqui manteria no relatório uma atividade que não existe mais para o aluno.
    const activities = db
      .prepare("SELECT id FROM activities WHERE classId = ? AND status = 'active' AND deletedAt IS NULL")
      .all(c.id) as unknown as Array<{ id: string }>
    activitiesByClass.set(c.id, activities.map((a) => a.id))
  }

  return scoped.map((c) => {
    const activityIds = activitiesByClass.get(c.id) ?? []
    const possible = c.studentIds.length * activityIds.length
    let done = 0
    if (activityIds.length > 0) {
      const placeholders = activityIds.map(() => "?").join(",")
      const subs = db
        .prepare(
          `SELECT COUNT(*) AS total FROM submissions
           WHERE status = 'approved' AND activityId IN (${placeholders})`,
        )
        .get(...activityIds) as { total: number }
      done = Number(subs.total)
    }
    const pct = possible === 0 ? 0 : Math.round((done / possible) * 100)
    return { className: c.name, course: c.course, students: c.studentIds.length, activities: activityIds.length, possible, done, pct }
  })
}

/** Pontos por aluno (professor vê apenas alunos de suas turmas; coord vê todos). */
export function pointsReport(caller: { role: Role; userId: string }): PointsByStudentRow[] {
  if (!isTeacherOrCoordinator(caller.role)) return []
  const db = getDb()
  const userRows = db
    .prepare("SELECT * FROM users WHERE role = 'student' AND active = 1")
    .all() as unknown as UserRow[]
  const students = userRows.map(mapUser)

  let allowedStudentIds: Set<string> | null = null
  if (caller.role === "teacher") {
    const classRows = db.prepare("SELECT * FROM classes").all() as unknown as ClassRow[]
    const teacherClasses = classRows
      .map(mapClass)
      .filter((c) => c.teacherIds.includes(caller.userId))
    allowedStudentIds = new Set(teacherClasses.flatMap((c) => c.studentIds))
  }

  const classById = new Map<string, string>()
  for (const c of db.prepare("SELECT * FROM classes").all() as unknown as ClassRow[]) {
    classById.set(c.id, c.name)
  }

  return students
    .filter((s) => (allowedStudentIds ? allowedStudentIds.has(s.id) : true))
    .map((s) => {
      const className = classById.get(s.classIds[0] ?? "") ?? ""
      const balance = getBalance(s.id)
      return { studentName: s.name, className, balance, level: levelLabel(balance) }
    })
    .sort((a, b) => b.balance - a.balance)
}

/** Atividades por tipo (coordenação). */
export function activitiesByTypeReport(): ActivitiesByTypeRow[] {
  const db = getDb()
  // Soft delete (2.4): a distribuição por tipo conta só o que o app mostra.
  const rows = db
    .prepare("SELECT type, COUNT(*) AS count FROM activities WHERE deletedAt IS NULL GROUP BY type ORDER BY type")
    .all() as unknown as Array<{ type: string; count: number }>
  const labels: Record<string, string> = {
    academic: "Pedagógica",
    school_action: "Ação Escolar",
    event: "Evento",
    library: "Biblioteca",
    support: "Suporte",
    other: "Outro",
  }
  return rows.map((r) => ({ type: r.type, label: labels[r.type] ?? r.type, count: Number(r.count) }))
}

/** Uma atividade do professor com as contagens de entrega (Task 4.2). */
export interface TeacherActivityMetricRow {
  activityId: string
  title: string
  subject: string
  className: string
  /** Prazo como está gravado (`DD/MM/AAAA`) — o relatório não converte nada. */
  deadline: string
  /** Dias de tolerância após o prazo; `0` = sem tolerância. */
  lateWindowDays: number
  /** Total de entregas da atividade, qualquer que seja o estado (RN03). */
  deliveries: number
  approved: number
  rejected: number
  /** Tudo que não é aprovado nem reprovado (RN03): `deliveries - approved - rejected`. */
  pending: number
  /** Entregas com prazo vencido na hora do envio (`delayed = 1`), qualquer estado. */
  late: number
  /** `Math.round(approved / deliveries * 100)`, e `0` quando não há entrega. */
  donePct: number
}

/** Uma linha do ranking de pontos: um aluno. */
export interface TeacherRankingRow {
  studentName: string
  balance: number
  level: string
  streak: number
}

/** Ranking agrupado por turma — a turma é a chave, não um campo da linha. */
export interface TeacherRankingGroup {
  className: string
  course: string
  rows: TeacherRankingRow[]
}

export interface TeacherPerformanceReport {
  activities: TeacherActivityMetricRow[]
  ranking: TeacherRankingGroup[]
}

/**
 * `activities` + nome da disciplina e da turma, numa consulta só (nada de N+1
 * para o rótulo). `teacherId` é o recorte e `deletedAt IS NULL` é a invariante
 * 2.4 — a mesma prazo de `completionReport`/`pointsReport`: atividade excluída
 * não entra em NENHUMA métrica, nem como linha e nem nas contagens de entrega
 * das outras.
 */
interface TeacherActivityJoinRow {
  activityId: string
  title: string
  deadline: string
  lateWindowDays: number
  subject: string
  className: string
}

/** Agregado de `submissions` por atividade. */
interface SubmissionCountRow {
  activityId: string
  deliveries: number
  approved: number
  rejected: number
  late: number
}

/**
 * Contagens de entrega de todas as atividades dadas, em UMA varredura.
 *
 * `late` sai de `delayed = 1` e NÃO é derivado de `approved`: uma entrega
 * atrasada aprovada é as duas coisas ao mesmo tempo (é a que recebeu
 * `ceil(pontos/2)`), e uma atrasada ainda em análise também conta. As três
 * contagens vêm do mesmo agregado, então nenhuma delas é subtraída da outra.
 */
function countSubmissionsByActivity(
  db: DatabaseSync,
  activityIds: string[],
): Map<string, SubmissionCountRow> {
  const counts = new Map<string, SubmissionCountRow>()
  if (activityIds.length === 0) return counts
  const placeholders = activityIds.map(() => "?").join(",")
  const rows = db
    .prepare(
      `SELECT activityId AS activityId,
              COUNT(*) AS deliveries,
              SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
              SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
              SUM(CASE WHEN delayed = 1 THEN 1 ELSE 0 END) AS late
       FROM submissions
       WHERE activityId IN (${placeholders})
       GROUP BY activityId`,
    )
    .all(...activityIds) as unknown as SubmissionCountRow[]
  for (const row of rows) {
    counts.set(row.activityId, {
      activityId: row.activityId,
      deliveries: Number(row.deliveries),
      approved: Number(row.approved),
      rejected: Number(row.rejected),
      late: Number(row.late),
    })
  }
  return counts
}

/**
 * Métricas das atividades do professor (4.2), uma linha por atividade.
 *
 * Ordenação por prazo tratando `DD/MM/AAAA` como data de calendário — a mesma
 * expressão de `routes/activities.ts` (aqui repetida de propósito: importar uma
 * constante de uma rota para um serviço inverteria a camada), com o título
 * desempatando para a lista não depender da ordem física do índice.
 */
function activityMetricsOf(db: DatabaseSync, teacherId: string): TeacherActivityMetricRow[] {
  const rows = db
    .prepare(
      `SELECT a.id AS activityId,
              a.title AS title,
              a.deadline AS deadline,
              a.lateWindowDays AS lateWindowDays,
              sub.name AS subject,
              cls.name AS className
       FROM activities a
       JOIN subjects sub ON sub.id = a.subjectId
       JOIN classes cls ON cls.id = a.classId
       WHERE a.teacherId = ? AND a.deletedAt IS NULL
       ORDER BY substr(a.deadline, 7, 4) || substr(a.deadline, 4, 2) || substr(a.deadline, 1, 2) ASC,
                a.title ASC`,
    )
    .all(teacherId) as unknown as TeacherActivityJoinRow[]
  const counts = countSubmissionsByActivity(
    db,
    rows.map((r) => r.activityId),
  )
  return rows.map((row) => {
    const count = counts.get(row.activityId)
    const deliveries = count?.deliveries ?? 0
    const approved = count?.approved ?? 0
    const rejected = count?.rejected ?? 0
    const late = count?.late ?? 0
    // RN03 tem 6 estados e 3 deles (`pending`, `submitted`, `under_review`,
    // `revision_required`) ainda não são veredito: `pending` é o RESTO, e é por
    // isso que approved + rejected + pending = deliveries em toda linha.
    const pending = deliveries - approved - rejected
    // `Math.round` como em `completionReport`; sem entrega, 0 — e nunca `NaN`
    // (0/0), que a tela renderizaria como "NaN%".
    const donePct = deliveries === 0 ? 0 : Math.round((approved / deliveries) * 100)
    return {
      activityId: row.activityId,
      title: row.title,
      subject: row.subject,
      className: row.className,
      deadline: row.deadline,
      lateWindowDays: row.lateWindowDays,
      deliveries,
      approved,
      rejected,
      pending,
      late,
      donePct,
    }
  })
}

/**
 * Alunos ATIVOS de uma turma, por nome — `id`, `name` e `email` (nada de hash em
 * memória). Exportada desde a 4.3, que a reutiliza no detalhe da turma: a lista
 * de alunos da "Minha turma" e a do ranking têm de ser o MESMO roster.
 */
export function studentsOfClass(db: DatabaseSync, studentIds: string[]): Array<{ id: string; name: string; email: string }> {
  if (studentIds.length === 0) return []
  const placeholders = studentIds.map(() => "?").join(",")
  return db
    .prepare(
      `SELECT id, name, email FROM users
       WHERE role = 'student' AND active = 1 AND id IN (${placeholders})
       ORDER BY name COLLATE NOCASE ASC`,
    )
    .all(...studentIds) as unknown as Array<{ id: string; name: string; email: string }>
}

/**
 * Ranking de pontos do professor, AGRUPADO POR TURMA (4.2).
 *
 * O recorte das turmas é o MESMO de `pointsReport` (`class.teacherIds`), e não o
 * de `routes/activities.ts` (`classIds`/`subject.teacherIds`) — a divergência C1
 * do seed faz o Prof. Marcelo ser autorizado a criar atividade no 3º Ano A sem
 * que ele seja `teacherIds` dele, e as DUAS telas de professor têm de contar a
 * mesma história. Reconciliar os dois é decisão de produto/coordenação em aberto
 * (vai para o resumo final, Task F.1): aqui o critério não muda.
 *
 * Diferença de forma em relação ao `pointsReport` (que é chapado e resolve a
 * turma por `classIds[0]`, o que é errado para aluno em mais de uma turma): aqui
 * a turma é a chave de agrupamento, e um aluno em duas turmas do professor
 * aparece nos dois grupos — uma linha por (turma, aluno).
 *
 * `getBalance` por aluno (N+1) é a mesma convenção de `pointsReport:98`.
 */
function rankingOf(db: DatabaseSync, teacherId: string): TeacherRankingGroup[] {
  const classRows = db
    .prepare("SELECT * FROM classes ORDER BY name COLLATE NOCASE ASC")
    .all() as unknown as ClassRow[]
  // "Hoje" em São Paulo (R4/R34): o mesmo `startOfToday()` de `routes/users.ts`,
  // nunca `new Date()` cru — dois critérios de "hoje" no mesmo arquivo já
  // produziram bug real na 2.2.
  const today = startOfToday()
  const groups: TeacherRankingGroup[] = []
  for (const klass of classRows.map(mapClass).filter((c) => c.active && c.teacherIds.includes(teacherId))) {
    const rows = studentsOfClass(db, klass.studentIds)
      .map((student) => {
        const balance = getBalance(student.id, db)
        return {
          studentName: student.name,
          balance,
          level: levelLabel(balance),
          streak: currentStreakDays(db, student.id, today),
        }
      })
      .sort((a, b) => b.balance - a.balance)
    groups.push({ className: klass.name, course: klass.course, rows })
  }
  return groups
}

/**
 * Desempenho do professor (4.2) — o que a decisão 16 da spec pede: "métricas por
 * atividade + ranking", ISOLADO POR DONO (decisão 16, e o mesmo isolamento de
 * 2.5 em `GET /api/activities`: o recorte é `teacherId`, não turma nem disciplina).
 *
 * Teacher-only: a coordenação tem o relatório geral da Fase 4.5. A rota já barra
 * por papel (`requireRoles("teacher")`); o guard aqui é a mesma defesa em
 * profundidade que `completionReport`/`pointsReport` fazem, para o serviço não
 * depender de o chamador ter lembrado do filtro.
 */
export function teacherPerformanceReport(caller: {
  role: Role
  userId: string
}): TeacherPerformanceReport {
  if (caller.role !== "teacher") return { activities: [], ranking: [] }
  const db = getDb()
  return {
    activities: activityMetricsOf(db, caller.userId),
    ranking: rankingOf(db, caller.userId),
  }
}

function escapeCsv(value: string | number): string {
  const s = String(value)
  if (s.includes(";") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replaceAll('"', '""')}"`
  }
  return s
}

/** Serializa linhas para CSV (pt-BR: separator `;` + BOM para Excel). */
export function toCsv(headers: string[], rows: Array<Array<string | number>>): string {
  const lines = [headers.map(escapeCsv).join(";")]
  for (const row of rows) lines.push(row.map(escapeCsv).join(";"))
  return `\uFEFF${lines.join("\r\n")}`
}