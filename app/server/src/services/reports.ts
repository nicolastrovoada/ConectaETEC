import type { DatabaseSync } from "node:sqlite"
import { getDb } from "../db/connection"
import { mapClass, mapUser, type ClassRow, type UserRow } from "../db/rows"
import { isValidBRDate, startOfToday } from "../lib/dates"
import { getBalance } from "./points"
import { currentStreakDays } from "./streak"
import { ACTIVITY_TYPE_LABELS, levelLabel } from "../shared/types"
import type { ActivityType, Role } from "../shared/types"

/**
 * Filtros comuns aos relatórios da coordenação (Task 4.5).
 *
 * `from`/`to` são dias de calendário `YYYY-MM-DD`, inclusivos. Datas fora do
 * formato ou que não existem (ex.: `2026-02-31`) são IGNORADAS — a rota não
 * responde 400 por isso, o filtro simplesmente não é aplicado.
 */
export interface ReportFilters {
  from?: string
  to?: string
  classId?: string
  subjectId?: string
  teacherId?: string
}

/**
 * Converte `YYYY-MM-DD` para a chave `AAAAMMDD` usada pelo SQL.
 *
 * O regex sozinho não basta: `2026-02-31` tem o formato certo e não é data de
 * calendário. A conversão para `DD/MM/AAAA` passa por `isValidBRDate`, que
 * rejeita mês/dia inexistente (a mesma guarda da auditoria). Valor inválido
 * retorna `undefined` e o filtro é ignorado.
 */
export function reportDayKey(value: string | undefined): string | undefined {
  if (!value) return undefined
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return undefined
  const [, year, month, day] = match
  return isValidBRDate(`${day}/${month}/${year}`) ? `${year}${month}${day}` : undefined
}

/** Chave de dia (`AAAAMMDD`) do texto `DD/MM/AAAA, HH:MM:SS` gravado por `nowBR()`. */
function dayKeySql(column: string): string {
  return `substr(${column},7,4)||substr(${column},4,2)||substr(${column},1,2)`
}

/** Placeholders `?,?,?` para um `IN (...)` — nunca interpola valores. */
function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(",")
}

/**
 * Acrescenta ao `WHERE` os filtros de recorte de atividade (`classId`,
 * `subjectId`, `teacherId`) — sempre por bind parametrizado.
 */
function pushActivityFilters(
  where: string[],
  params: string[],
  filters: ReportFilters,
  alias = "a",
): void {
  if (filters.classId) {
    where.push(`${alias}.classId = ?`)
    params.push(filters.classId)
  }
  if (filters.subjectId) {
    where.push(`${alias}.subjectId = ?`)
    params.push(filters.subjectId)
  }
  if (filters.teacherId) {
    where.push(`${alias}.teacherId = ?`)
    params.push(filters.teacherId)
  }
}

/**
 * Acrescenta ao `WHERE` o período sobre uma coluna de data gravada como
 * `DD/MM/AAAA, HH:MM:SS`. As duas pontas são inclusivas por DIA.
 */
function pushPeriodFilters(
  where: string[],
  params: string[],
  filters: ReportFilters,
  column: string,
): void {
  const from = reportDayKey(filters.from)
  if (from) {
    where.push(`${dayKeySql(column)} >= ?`)
    params.push(from)
  }
  const to = reportDayKey(filters.to)
  if (to) {
    where.push(`${dayKeySql(column)} <= ?`)
    params.push(to)
  }
}

/** Nome dos alunos ativos entre os ids dados, numa consulta só. */
function activeStudentNames(db: DatabaseSync, ids: string[]): Map<string, string> {
  const names = new Map<string, string>()
  if (ids.length === 0) return names
  const rows = db
    .prepare(
      `SELECT id, name FROM users
       WHERE role = 'student' AND active = 1 AND id IN (${placeholders(ids.length)})`,
    )
    .all(...ids) as unknown as Array<{ id: string; name: string }>
  for (const row of rows) names.set(row.id, row.name)
  return names
}

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

/**
 * Taxa de conclusão por turma (professor vê apenas suas turmas; coord vê todas).
 *
 * Filtros da 4.5 (from/to/classId/subjectId/teacherId):
 * - `possible` = alunos ATIVOS das turmas no escopo × atividades ativas/não
 *   excluídas no escopo;
 * - `done` = entregas `approved` com `submittedAt` dentro do período (sem
 *   período, todas as aprovadas), contadas apenas para alunos que continuam no
 *   roster ATIVO da turma — o mesmo recorte de `possible`;
 * - `teacherId` NÃO amplia o escopo do professor: o conjunto de turmas dele é
 *   decidido por `class.teacherIds` antes de qualquer filtro de atividade.
 */
export function completionReport(
  caller: { role: Role; userId: string },
  filters: ReportFilters = {},
): CompletionRow[] {
  if (!isTeacherOrCoordinator(caller.role)) return []
  // Escopo do professor é por TURMA (`class.teacherIds`), nunca por autoria:
  // `teacherId` na query não pode virar uma janela para os agregados de outro
  // professor nas turmas compartilhadas. Ignorar (em vez de forçar o próprio
  // id) preserva o comportamento padrão de "todas as atividades das minhas
  // turmas"; a coordenação continua usando `teacherId` como recorte.
  if (caller.role === "teacher") filters = { ...filters, teacherId: undefined }
  const db = getDb()
  const classRows = db
    .prepare("SELECT * FROM classes ORDER BY name COLLATE NOCASE ASC")
    .all() as unknown as ClassRow[]
  let classes = classRows.map(mapClass).filter((c) => c.active)
  if (caller.role === "teacher") {
    classes = classes.filter((c) => c.teacherIds.includes(caller.userId))
  }
  if (filters.classId) classes = classes.filter((c) => c.id === filters.classId)
  if (classes.length === 0) return []

  const classIds = classes.map((c) => c.id)

  // Atividades ativas e não excluídas por turma — UMA consulta agregada.
  const activityWhere = ["a.classId IN (" + placeholders(classIds.length) + ")", "a.status = 'active'", "a.deletedAt IS NULL"]
  const activityParams: string[] = [...classIds]
  if (filters.subjectId) {
    activityWhere.push("a.subjectId = ?")
    activityParams.push(filters.subjectId)
  }
  if (filters.teacherId) {
    activityWhere.push("a.teacherId = ?")
    activityParams.push(filters.teacherId)
  }
  const activityRows = db
    .prepare(
      `SELECT a.classId AS classId, COUNT(*) AS total
       FROM activities a
       WHERE ${activityWhere.join(" AND ")}
       GROUP BY a.classId`,
    )
    .all(...activityParams) as unknown as Array<{ classId: string; total: number }>
  const activitiesByClass = new Map(activityRows.map((r) => [r.classId, Number(r.total)]))

  // Alunos ativos do escopo — uma consulta, e a contagem por turma respeita o
  // roster de `classes.studentIds` (que pode ter ids inativos ou não-alunos).
  const allStudentIds = [...new Set(classes.flatMap((c) => c.studentIds))]
  const activeStudents = activeStudentNames(db, allStudentIds)

  // Entregas aprovadas por turma; período é sobre `submittedAt`.
  const doneWhere = [
    "s.status = 'approved'",
    "a.status = 'active'",
    "a.deletedAt IS NULL",
    "a.classId IN (" + placeholders(classIds.length) + ")",
  ]
  const doneParams: string[] = [...classIds]
  if (filters.subjectId) {
    doneWhere.push("a.subjectId = ?")
    doneParams.push(filters.subjectId)
  }
  if (filters.teacherId) {
    doneWhere.push("a.teacherId = ?")
    doneParams.push(filters.teacherId)
  }
  pushPeriodFilters(doneWhere, doneParams, filters, "s.submittedAt")
  const doneRows = db
    .prepare(
      `SELECT a.classId AS classId, s.studentId AS studentId, COUNT(*) AS total
       FROM submissions s
       JOIN activities a ON a.id = s.activityId
       WHERE ${doneWhere.join(" AND ")}
       GROUP BY a.classId, s.studentId`,
    )
    .all(...doneParams) as unknown as Array<{ classId: string; studentId: string; total: number }>
  // Roster ATIVO por turma — o MESMO recorte de `possible` (`activeStudents`).
  // `done` é somado por (turma, aluno) e só para quem ainda está no roster: um
  // aluno aprovado que depois saiu da turma ou foi desativado não pode seguir
  // contando enquanto `possible` deixa de contá-lo. Sem isso `done` excede
  // `possible` e `pct` passa de 100%.
  const activeRosterByClass = new Map(
    classes.map((c) => [c.id, new Set([...new Set(c.studentIds)].filter((id) => activeStudents.has(id)))]),
  )
  const doneByClass = new Map<string, number>()
  for (const row of doneRows) {
    if (!activeRosterByClass.get(row.classId)?.has(row.studentId)) continue
    doneByClass.set(row.classId, (doneByClass.get(row.classId) ?? 0) + Number(row.total))
  }

  return classes.map((c) => {
    const students = activeRosterByClass.get(c.id)?.size ?? 0
    const activities = activitiesByClass.get(c.id) ?? 0
    const possible = students * activities
    const done = doneByClass.get(c.id) ?? 0
    // Clamp de segurança: com o roster restrito `done <= possible`; o teto
    // garante que nenhuma inconsistência futura renderize mais de 100%.
    const pct = possible === 0 ? 0 : Math.min(100, Math.round((done / possible) * 100))
    return { className: c.name, course: c.course, students, activities, possible, done, pct }
  })
}

/**
 * Pontos por aluno (professor vê apenas alunos de suas turmas; coord vê todos).
 *
 * Filtros da 4.5:
 * - `classId` restringe o roster à turma (interseção com o escopo do professor);
 * - `from`/`to` somam apenas as transações do período (`transactions.createdAt`);
 * - `subjectId`/`teacherId` restringem às transações ligadas por
 *   `relatedActivityId` a atividades da matéria/professor.
 *
 * Sem filtros, o saldo é o mesmo de `getBalance` (todas as transações). O
 * cálculo fica em `pointsByStudent` para a rota e os rankings usarem a MESMA
 * regra de soma e de piso em zero (RN04).
 */
export function pointsReport(
  caller: { role: Role; userId: string },
  filters: ReportFilters = {},
): PointsByStudentRow[] {
  if (!isTeacherOrCoordinator(caller.role)) return []
  // Mesmo motivo de `completionReport`: o recorte do professor é a TURMA dele,
  // e `teacherId` de terceiro é ignorado para não expor agregados alheios.
  if (caller.role === "teacher") filters = { ...filters, teacherId: undefined }
  const db = getDb()
  const userRows = db
    .prepare("SELECT * FROM users WHERE role = 'student' AND active = 1")
    .all() as unknown as UserRow[]
  const students = userRows.map(mapUser)

  const classRows = db.prepare("SELECT * FROM classes").all() as unknown as ClassRow[]
  const classes = classRows.map(mapClass)
  const classById = new Map(classes.map((c) => [c.id, c.name]))

  let allowedStudentIds: Set<string> | null = null
  if (caller.role === "teacher") {
    const teacherClasses = classes.filter((c) => c.teacherIds.includes(caller.userId))
    allowedStudentIds = new Set(teacherClasses.flatMap((c) => c.studentIds))
  }
  if (filters.classId) {
    const klass = classes.find((c) => c.id === filters.classId)
    const classStudents = new Set(klass?.studentIds ?? [])
    allowedStudentIds = allowedStudentIds
      ? new Set([...allowedStudentIds].filter((id) => classStudents.has(id)))
      : classStudents
  }

  const scoped = students.filter((s) => (allowedStudentIds ? allowedStudentIds.has(s.id) : true))
  const points = pointsByStudent(db, scoped.map((s) => s.id), filters)

  return scoped
    .map((s) => {
      const className = filters.classId
        ? classById.get(filters.classId) ?? ""
        : classById.get(s.classIds[0] ?? "") ?? ""
      const balance = points.get(s.id) ?? 0
      return { studentName: s.name, className, balance, level: levelLabel(balance) }
    })
    // Desempate por nome: sem ele, empates de saldo dependem da ordem física
    // do banco e a lista "muda" entre execuções sem nenhum dado novo.
    .sort(
      (a, b) =>
        b.balance - a.balance ||
        a.studentName.localeCompare(b.studentName, "pt-BR", { sensitivity: "base" }),
    )
}

/**
 * Atividades por tipo (coordenação).
 *
 * Filtros da 4.5: classId/subjectId/teacherId recortam a atividade e from/to
 * recorta o DIA de `activities.createdAt` (as duas pontas inclusivas). Sem
 * filtros, mantém a distribuição de todas as atividades não excluídas —
 * qualquer status, como antes.
 */
export function activitiesByTypeReport(filters: ReportFilters = {}): ActivitiesByTypeRow[] {
  const db = getDb()
  // Soft delete (2.4): a distribuição por tipo conta só o que o app mostra.
  const where = ["a.deletedAt IS NULL"]
  const params: string[] = []
  pushActivityFilters(where, params, filters)
  pushPeriodFilters(where, params, filters, "a.createdAt")
  const rows = db
    .prepare(
      `SELECT a.type AS type, COUNT(*) AS count
       FROM activities a
       WHERE ${where.join(" AND ")}
       GROUP BY a.type
       ORDER BY a.type`,
    )
    .all(...params) as unknown as Array<{ type: string; count: number }>
  // Rótulo único do domínio (`shared/types`): um mapa local aqui já divergiu
  // uma vez do que a UI exibe.
  return rows.map((r) => ({
    type: r.type,
    label: ACTIVITY_TYPE_LABELS[r.type as ActivityType] ?? r.type,
    count: Number(r.count),
  }))
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
  period: { from?: string; to?: string } = {},
): Map<string, SubmissionCountRow> {
  const counts = new Map<string, SubmissionCountRow>()
  if (activityIds.length === 0) return counts
  const where = ["activityId IN (" + placeholders(activityIds.length) + ")"]
  const params: string[] = [...activityIds]
  pushPeriodFilters(where, params, period, "submittedAt")
  const rows = db
    .prepare(
      `SELECT activityId AS activityId,
              COUNT(*) AS deliveries,
              SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
              SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
              SUM(CASE WHEN delayed = 1 THEN 1 ELSE 0 END) AS late
       FROM submissions
       WHERE ${where.join(" AND ")}
       GROUP BY activityId`,
    )
    .all(...params) as unknown as SubmissionCountRow[]
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

// ─── Task 4.5 — relatório completo da coordenação ───────────────────────────

/** Uma atividade no relatório detalhado da coordenação. */
export interface ActivityDetailRow {
  activityId: string
  title: string
  type: string
  subject: string
  className: string
  teacherName: string
  deadline: string
  createdAt: string
  deliveries: number
  approved: number
  rejected: number
  pending: number
  late: number
  donePct: number
}

interface ActivityDetailJoinRow {
  activityId: string
  title: string
  type: string
  subject: string
  className: string
  teacherName: string | null
  teacherId: string
  deadline: string
  createdAt: string
}

/**
 * `GET /api/reports/activity-detail` (4.5) — uma linha por atividade ativa e
 * não excluída, com as contagens de entrega no período.
 *
 * Ordenação determinística: prazo (dia de calendário), depois título e id. O
 * prazo é `DD/MM/AAAA`, então a ordenação usa a mesma chave `AAAAMMDD` do
 * filtro — nunca comparação textual do formato brasileiro.
 */
export function activityDetailReport(filters: ReportFilters = {}): ActivityDetailRow[] {
  const db = getDb()
  const where = ["a.status = 'active'", "a.deletedAt IS NULL"]
  const params: string[] = []
  pushActivityFilters(where, params, filters)
  const rows = db
    .prepare(
      `SELECT a.id AS activityId,
              a.title AS title,
              a.type AS type,
              sub.name AS subject,
              cls.name AS className,
              u.name AS teacherName,
              a.teacherId AS teacherId,
              a.deadline AS deadline,
              a.createdAt AS createdAt
       FROM activities a
       JOIN subjects sub ON sub.id = a.subjectId
       JOIN classes cls ON cls.id = a.classId
       LEFT JOIN users u ON u.id = a.teacherId
       WHERE ${where.join(" AND ")}
       ORDER BY ${dayKeySql("a.deadline")} ASC,
                a.title COLLATE NOCASE ASC,
                a.id ASC`,
    )
    .all(...params) as unknown as ActivityDetailJoinRow[]

  const counts = countSubmissionsByActivity(
    db,
    rows.map((r) => r.activityId),
    filters,
  )
  return rows.map((row) => {
    const count = counts.get(row.activityId)
    const deliveries = count?.deliveries ?? 0
    const approved = count?.approved ?? 0
    const rejected = count?.rejected ?? 0
    // RN03: `pending` é tudo que não recebeu veredito final.
    const pending = deliveries - approved - rejected
    const late = count?.late ?? 0
    const donePct = deliveries === 0 ? 0 : Math.round((approved / deliveries) * 100)
    return {
      activityId: row.activityId,
      title: row.title,
      type: row.type,
      subject: row.subject,
      className: row.className,
      teacherName: row.teacherName ?? row.teacherId,
      deadline: row.deadline,
      createdAt: row.createdAt,
      deliveries,
      approved,
      rejected,
      pending,
      late,
      donePct,
    }
  })
}

/** Uma linha do resumo por professor (conclusão e atraso agregados). */
export interface TeacherSummaryRow {
  teacherName: string
  activities: number
  deliveries: number
  approved: number
  late: number
  /** `Math.round(approved / deliveries * 100)`; 0 quando não há entrega. */
  approvalPct: number
}

/**
 * `GET /api/reports/teacher-summary` (4.5) — conclusão e atraso POR PROFESSOR.
 *
 * Reutiliza `activityDetailReport` (mesmos filtros, mesmo período e mesmo
 * recorte de atividade ativa/não excluída) e agrega em memória por
 * `teacherName`. Não há SQL próprio de propósito: duplicar o WHERE faria os
 * dois relatórios divergirem com o tempo. Ordenação por nome em pt-BR.
 */
export function teacherSummaryReport(filters: ReportFilters = {}): TeacherSummaryRow[] {
  const byTeacher = new Map<string, Omit<TeacherSummaryRow, "teacherName" | "approvalPct">>()
  for (const row of activityDetailReport(filters)) {
    const acc = byTeacher.get(row.teacherName) ?? { activities: 0, deliveries: 0, approved: 0, late: 0 }
    acc.activities += 1
    acc.deliveries += row.deliveries
    acc.approved += row.approved
    acc.late += row.late
    byTeacher.set(row.teacherName, acc)
  }
  return [...byTeacher.entries()]
    .map(([teacherName, acc]) => ({
      teacherName,
      ...acc,
      approvalPct: acc.deliveries === 0 ? 0 : Math.round((acc.approved / acc.deliveries) * 100),
    }))
    .sort((a, b) => a.teacherName.localeCompare(b.teacherName, "pt-BR", { sensitivity: "base" }))
}

export interface ClassRankingRow {
  studentName: string
  points: number
  level: string
}

export interface ClassRankingGroup {
  className: string
  course: string
  rows: ClassRankingRow[]
}

/**
 * Soma de pontos por aluno no recorte da 4.5.
 *
 * Sem `subjectId`/`teacherId`, soma TODAS as transações do aluno (o saldo
 * líquido, como `getBalance`). Com um dos dois, restringe às transações ligadas
 * por `relatedActivityId` a atividades da matéria/professor — bônus, ajuste,
 * resgate e sequência não têm vínculo de atividade e por isso não entram.
 *
 * O saldo nunca é negativo (RN04): soma negativa é entregue como 0.
 */
function pointsByStudent(
  db: DatabaseSync,
  studentIds: string[],
  filters: ReportFilters,
): Map<string, number> {
  const points = new Map<string, number>()
  if (studentIds.length === 0) return points

  const joins: string[] = []
  const where = ["t.studentId IN (" + placeholders(studentIds.length) + ")"]
  const params: string[] = [...studentIds]
  const scopedToActivity = Boolean(filters.subjectId || filters.teacherId)
  if (scopedToActivity) {
    // Decisão 3 do V3: pontos de atividade excluída PERMANECEM. O JOIN existe
    // só para atribuir matéria/professor à transação — filtrar `deletedAt`
    // aqui faria o saldo do recorte divergir de `getBalance` e do ranking por
    // turma, que mantêm o ponto.
    joins.push("JOIN activities a ON a.id = t.relatedActivityId")
    if (filters.subjectId) {
      where.push("a.subjectId = ?")
      params.push(filters.subjectId)
    }
    if (filters.teacherId) {
      where.push("a.teacherId = ?")
      params.push(filters.teacherId)
    }
    if (filters.classId) {
      where.push("a.classId = ?")
      params.push(filters.classId)
    }
  }
  pushPeriodFilters(where, params, filters, "t.createdAt")

  const rows = db
    .prepare(
      `SELECT t.studentId AS studentId, SUM(t.amount) AS total
       FROM transactions t
       ${joins.join(" ")}
       WHERE ${where.join(" AND ")}
       GROUP BY t.studentId`,
    )
    .all(...params) as unknown as Array<{ studentId: string; total: number }>
  for (const row of rows) points.set(row.studentId, Math.max(0, Number(row.total)))
  return points
}

/**
 * `GET /api/reports/rankings/classes` (4.5) — ranking por turma.
 *
 * Turmas ativas; alunos ativos das turmas. Um aluno em duas turmas aparece nos
 * dois grupos (uma linha por turma/aluno), que é o que "ranking por turma"
 * significa. Grupos por nome da turma; linhas por pontos desc e nome asc.
 */
export function classRankingsReport(filters: ReportFilters = {}): ClassRankingGroup[] {
  const db = getDb()
  let classes = (
    db.prepare("SELECT * FROM classes ORDER BY name COLLATE NOCASE ASC").all() as unknown as ClassRow[]
  )
    .map(mapClass)
    .filter((c) => c.active)
  if (filters.classId) classes = classes.filter((c) => c.id === filters.classId)
  if (classes.length === 0) return []

  const allStudentIds = [...new Set(classes.flatMap((c) => c.studentIds))]
  const names = activeStudentNames(db, allStudentIds)
  const points = pointsByStudent(db, allStudentIds, filters)

  return classes.map((klass) => {
    const rows = [...new Set(klass.studentIds)]
      .filter((id) => names.has(id))
      .map((id) => {
        const balance = points.get(id) ?? 0
        return {
          studentName: names.get(id) ?? id,
          points: balance,
          level: levelLabel(balance),
        }
      })
      .sort(
        (a, b) =>
          b.points - a.points ||
          a.studentName.localeCompare(b.studentName, "pt-BR", { sensitivity: "base" }),
      )
    return { className: klass.name, course: klass.course, rows }
  })
}

export interface SubjectRankingRow {
  studentName: string
  className: string
  points: number
  level: string
}

export interface SubjectRankingGroup {
  subjectId: string
  subjectName: string
  icon: string
  rows: SubjectRankingRow[]
}

interface SubjectRankingJoinRow {
  subjectId: string
  subjectName: string
  icon: string
  studentName: string
  className: string
  total: number
}

/**
 * `GET /api/reports/rankings/subjects` (4.5) — pontos por matéria.
 *
 * Só transações `type = 'activity'` com `relatedActivityId`, no período de
 * `transactions.createdAt`, com os filtros classId/subjectId/teacherId
 * aplicados à atividade. Grupos por matéria (só os que têm linha), linhas por
 * pontos desc e nome asc.
 */
export function subjectRankingsReport(filters: ReportFilters = {}): SubjectRankingGroup[] {
  const db = getDb()
  // Atividade soft-deleted continua no JOIN (decisão 3: os pontos permanecem);
  // o JOIN só serve para descobrir a matéria/professor da transação. Já o
  // ranking é de pessoas: aluno inativo/não-aluno e turma inativa saem, em
  // paridade com `classRankingsReport`.
  const where = [
    "t.type = 'activity'",
    "t.relatedActivityId IS NOT NULL",
    "u.active = 1",
    "u.role = 'student'",
    "cls.active = 1",
  ]
  const params: string[] = []
  if (filters.classId) {
    where.push("a.classId = ?")
    params.push(filters.classId)
  }
  if (filters.subjectId) {
    where.push("a.subjectId = ?")
    params.push(filters.subjectId)
  }
  if (filters.teacherId) {
    where.push("a.teacherId = ?")
    params.push(filters.teacherId)
  }
  pushPeriodFilters(where, params, filters, "t.createdAt")

  const rows = db
    .prepare(
      `SELECT sub.id AS subjectId,
              sub.name AS subjectName,
              sub.icon AS icon,
              u.name AS studentName,
              cls.name AS className,
              SUM(t.amount) AS total
       FROM transactions t
       JOIN activities a ON a.id = t.relatedActivityId
       JOIN subjects sub ON sub.id = a.subjectId
       JOIN users u ON u.id = t.studentId
       JOIN classes cls ON cls.id = a.classId
       WHERE ${where.join(" AND ")}
       GROUP BY sub.id, sub.name, sub.icon, u.id, u.name, cls.id, cls.name
       ORDER BY sub.name COLLATE NOCASE ASC,
                total DESC,
                u.name COLLATE NOCASE ASC`,
    )
    .all(...params) as unknown as SubjectRankingJoinRow[]

  const groups = new Map<string, SubjectRankingGroup>()
  for (const row of rows) {
    let group = groups.get(row.subjectId)
    if (!group) {
      group = {
        subjectId: row.subjectId,
        subjectName: row.subjectName,
        icon: row.icon,
        rows: [],
      }
      groups.set(row.subjectId, group)
    }
    const points = Math.max(0, Number(row.total))
    group.rows.push({
      studentName: row.studentName,
      className: row.className,
      points,
      level: levelLabel(points),
    })
  }
  return [...groups.values()]
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