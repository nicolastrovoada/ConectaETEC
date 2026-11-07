import type { DatabaseSync } from "node:sqlite"
import { getDb } from "../db/connection"
import { startOfToday } from "../lib/dates"
import { levelLabel } from "../shared/types"
import type { Class, ClassDetail, ClassDetailStudent, ClassDetailSubject } from "../shared/types"
import { studentsOfClass } from "./reports"
import { currentStreakDays } from "./streak"

/**
 * Detalhe de UMA turma para a "Minha turma" do professor (4.3): roster com
 * saldo/nível/sequência/aprovadas, média por matéria e o resumo.
 *
 * Roster vem de `studentsOfClass` (`reports.ts`), o MESMO do ranking da 4.2 —
 * duas listas de alunos da mesma turma que discordassem entre si seriam um
 * defeito, não duas visões.
 */

/** Uma casa decimal (`Math.round(x * 10) / 10`), como o resto do servidor. */
function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Saldo por aluno — UM agregado para a turma inteira (R6).
 *
 * RN04: o saldo NUNCA é campo, é sempre a soma das transações, e nunca é
 * negativo (`Math.max(0, …)`, o mesmo de `services/points.ts:67-69`). Aluno com
 * soma negativa no banco é entregue com saldo 0, e não com o saldo negativo.
 */
function balancesByStudent(db: DatabaseSync, studentIds: string[]): Map<string, number> {
  const balances = new Map<string, number>()
  if (studentIds.length === 0) return balances
  const placeholders = studentIds.map(() => "?").join(",")
  const rows = db
    .prepare(
      `SELECT studentId AS studentId, SUM(amount) AS total
       FROM transactions
       WHERE studentId IN (${placeholders})
       GROUP BY studentId`,
    )
    .all(...studentIds) as unknown as Array<{ studentId: string; total: number }>
  for (const row of rows) {
    balances.set(row.studentId, Math.max(0, Number(row.total)))
  }
  return balances
}

/**
 * Entregas APROVADAS por aluno (R3) — UM agregado para a turma inteira (R6).
 *
 * Conta só entrega cuja atividade é DESTA turma e NÃO está soft-deleted
 * (`deletedAt IS NULL`, a invariante 2.4 que `completionReport`/`pointsReport`
 * já aplicam): atividade excluída não entra em nenhuma métrica. E conta só
 * entrega — bônus, ajuste manual, sequência e reforço NÃO entram aqui, porque
 * não são entrega de aluno.
 */
function approvedByStudent(db: DatabaseSync, classId: string, studentIds: string[]): Map<string, number> {
  const approved = new Map<string, number>()
  if (studentIds.length === 0) return approved
  const placeholders = studentIds.map(() => "?").join(",")
  const rows = db
    .prepare(
      `SELECT s.studentId AS studentId, COUNT(*) AS total
       FROM submissions s
       JOIN activities a ON a.id = s.activityId
       WHERE s.status = 'approved'
         AND a.classId = ?
         AND a.deletedAt IS NULL
         AND s.studentId IN (${placeholders})
       GROUP BY s.studentId`,
    )
    .all(classId, ...studentIds) as unknown as Array<{ studentId: string; total: number }>
  for (const row of rows) {
    approved.set(row.studentId, Number(row.total))
  }
  return approved
}

interface SubjectTotalRow {
  name: string
  total: number
}

/**
 * Média de pontos por aluno NA MATÉRIA (R5) — uma linha por matéria que tenha
 * ≥1 atividade nesta turma.
 *
 * O `LEFT JOIN` das transações é o que faz uma matéria sem ponto nenhum
 * aparecer com 0 em vez de sumir da lista (o `JOIN` de `transactions` traria
 * só as matérias que alguém já pontuou).
 *
 * **CAVEAT — a média por matéria NÃO é o saldo do aluno.** Só entram as
 * transações com `relatedActivityId` apontando para uma atividade desta turma e
 * desta matéria. Bônus da coordenação, ajuste manual, resgate de recompensa,
 * bônus de sequência e reforço concluído não têm `relatedActivityId`
 * (`services/streak.ts:154`, `routes/studyContents.ts:395`), então NÃO entram
 * aqui — embora todos estejam no saldo da aba "Alunos". Esta ressalva também
 * está escrita NA TELA, porque um professor que lê "média por matéria" sem ela
 * vai concluir que a média é o saldo.
 *
 * O denominador é o nº de alunos ATIVOS da turma (`students.length`), não o nº
 * de entregas nem o nº de Transações. E a origem das matérias são as
 * ATIVIDADES da turma, nunca `subjects.classIds` — no seed as 16 disciplinas
 * declaram `["c1","c2","c3"]`, o que devolveria as 16 para qualquer turma.
 */
function subjectsOfClass(db: DatabaseSync, classId: string, studentCount: number): ClassDetailSubject[] {
  const rows = db
    .prepare(
      `SELECT sub.name AS name, COALESCE(SUM(t.amount), 0) AS total
       FROM activities a
       JOIN subjects sub ON sub.id = a.subjectId
       LEFT JOIN transactions t ON t.relatedActivityId = a.id
       WHERE a.classId = ? AND a.deletedAt IS NULL
       GROUP BY sub.id, sub.name
       ORDER BY sub.name COLLATE NOCASE ASC`,
    )
    .all(classId) as unknown as SubjectTotalRow[]
  return rows.map((row) => ({
    name: row.name,
    avg: studentCount === 0 ? 0 : round1(Number(row.total) / studentCount),
  }))
}

/**
 * Monta o detalhe da turma. `klass` vem do chamador (a rota já resolveu e já
 * autorizou), então aqui não há filtro de turma nem de professor de novo.
 *
 * Turma INATIVA é servida (R7): `GET /api/classes` não filtra `active`, então a
 * turma desativada aparece na lista que o professor vê e negar o clique seria
 * pior que serving — a invariante "inativa sai" das métricas de relatório não
 * é a do drill-down da lista.
 */
export function classDetailOf(klass: Class): ClassDetail {
  const db = getDb()
  // "Hoje" é São Paulo (R13) — o mesmo `startOfToday()` de `reports.ts:327`,
  // nunca `new Date()` cru: dois critérios de "hoje" no mesmo arquivo já
  // produziram bug real na 2.2.
  const today = startOfToday()

  const balances = balancesByStudent(db, klass.studentIds)
  const approved = approvedByStudent(db, klass.id, klass.studentIds)

  const students: ClassDetailStudent[] = studentsOfClass(db, klass.studentIds).map((student) => {
    const balance = balances.get(student.id) ?? 0
    return {
      id: student.id,
      name: student.name,
      email: student.email,
      balance,
      level: levelLabel(balance),
      streak: currentStreakDays(db, student.id, today),
      approved: approved.get(student.id) ?? 0,
    }
  })

  // R4: os três campos saem da MESMA lista `students` — somar a tabela e
  // derivar a média dela não pode discordar do saldo que o professor lê na linha.
  const total = students.reduce((acc, student) => acc + student.balance, 0)
  const stats = {
    students: students.length,
    avgBalance: students.length === 0 ? 0 : round1(total / students.length),
    total,
  }

  return {
    class: klass,
    students,
    subjects: subjectsOfClass(db, klass.id, students.length),
    stats,
  }
}