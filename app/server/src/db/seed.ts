import type { DatabaseSync } from "node:sqlite"
import { hashPassword } from "../auth/password"
import { withTransaction } from "./transaction"

/** Data pt-BR do início da coorte de demonstração (agosto/2026). */
function dt(day: number): string {
  return `${String(day).padStart(2, "0")}/08/2026`
}

/**
 * Grade curricular do curso Técnico em Administração (Ensino Médio) — 12
 * disciplinas da Base Nacional Comum + 4 disciplinas técnicas do curso.
 *
 * Tupla: `[id, nome, ícone, teacherIds em JSON, classIds em JSON]`.
 * `teacherIds`/`classIds` são JSON no formato que o CRUD de disciplinas
 * (`routes/subjects.ts`) consome. As técnicas são o ponto de partida: a
 * coordenação edita o quadro conforme a grade real da escola.
 */
const SUBJECTS: Array<[string, string, string, string, string]> = [
  // Base Nacional Comum (BNCC — Ensino Médio)
  ["s1", "Língua Portuguesa", "📖", '["u7"]', '["c1","c2","c3"]'],
  ["s2", "Matemática", "➕", '["u6"]', '["c1","c2","c3"]'],
  ["s3", "Língua Inglesa", "🇬🇧", '["u7"]', '["c1","c2","c3"]'],
  ["s4", "Artes", "🎨", '["u6"]', '["c1","c2","c3"]'],
  ["s5", "Educação Física", "⚽", '["u6"]', '["c1","c2","c3"]'],
  ["s6", "Filosofia", "💭", '["u7"]', '["c1","c2","c3"]'],
  ["s7", "Sociologia", "🤝", '["u6"]', '["c1","c2","c3"]'],
  ["s8", "Biologia", "🧬", '["u6"]', '["c1","c2","c3"]'],
  ["s9", "Física", "⚛️", '["u7"]', '["c1","c2","c3"]'],
  ["s10", "Química", "🧪", '["u6"]', '["c1","c2","c3"]'],
  ["s11", "História", "🏛️", '["u7"]', '["c1","c2","c3"]'],
  ["s12", "Geografia", "🌍", '["u6"]', '["c1","c2","c3"]'],
  // Técnicas do curso (editável manualmente depois pelo responsável)
  ["s13", "Administração Geral", "📊", '["u6"]', '["c1","c2","c3"]'],
  ["s14", "Contabilidade Básica", "🧾", '["u6"]', '["c1","c2","c3"]'],
  ["s15", "Matemática Financeira", "💰", '["u6"]', '["c1","c2","c3"]'],
  ["s16", "Direito Empresarial", "⚖️", '["u7"]', '["c1","c2","c3"]'],
]

/**
 * Seed idempotente com os dados de demonstração da V3: ensino médio técnico
 * (1º/2º/3º ano) com grade BNCC + disciplinas técnicas.
 *
 * **Sem histórico, por decisão de produto:** a demonstração começa zerada —
 * nenhuma atividade, entrega, transação de pontos, resgate, notificação, linha
 * de auditoria ou conteúdo de reforço é semeado. O que fica é só o cadastro
 * (usuários, turmas e disciplinas) e o catálogo de recompensas com estoque
 * cheio, para que a escola cadastre o bimestre real do zero.
 *
 * Isso também é o mecanismo de limpeza do resíduo de conquistas removido na
 * Task 1.2 (linhas de auditoria `ACHIEVEMENT_EARNED` e notificações "Nova
 * conquista desbloqueada! 🏅" em bancos já populados): o reset do banco passa
 * por recriar o arquivo e rodar o seed de novo, e o seed novo não escreve
 * nenhuma dessas linhas — o histórico antigo não é migrado, simplesmente não
 * volta a existir.
 *
 * Idempotência: a guarda `users > 0` no topo faz o seed sair sem tocar em nada
 * quando o banco já tem usuário, então rodar duas vezes não duplica cadastro
 * nem estoura sequência/estoque.
 *
 * Senhas demo `123456` são sempre gravadas com hash bcrypt (somente teste local).
 */
export function runSeed(db: DatabaseSync): void {
  const count = db.prepare("SELECT COUNT(*) AS total FROM users").get() as { total: number }
  if (Number(count.total) > 0) return

  const demoHash = hashPassword("123456")

  withTransaction(db, () => {
    // ─── Usuários demo ──────────────────────────────────────────────────────
    // Tupla: [id, nome, e-mail, papel, ativo, avatar, classIds JSON, criado em].
    // `avatar` mantém o formato do app: iniciais (ou par de iniciais do nome).
    const insertUser = db.prepare(
      `INSERT INTO users (id, name, email, password, role, active, avatar, classIds, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const users: Array<[string, string, string, string, number, string, string, string]> = [
      ["u1", "Ana Luiza Ribeiro", "ana@etec.sp.gov.br", "student", 1, "A", '["c1"]', dt(1)],
      ["u2", "Mateus Oliveira", "mateus@etec.sp.gov.br", "student", 1, "M", '["c1"]', dt(1)],
      ["u3", "Beatriz Souza", "beatriz@etec.sp.gov.br", "student", 1, "B", '["c2"]', dt(1)],
      ["u4", "Ricardo Lima", "ricardo@etec.sp.gov.br", "student", 1, "R", '["c2"]', dt(1)],
      ["u5", "Fernanda Costa", "fernanda@etec.sp.gov.br", "student", 1, "F", '["c3"]', dt(1)],
      // C1 — o plano diverge de si mesmo neste vínculo, e a divergência é mantida
      // de propósito (reconciliar é decisão de produto/coordenação, não do seed):
      // o Step 1 define `c3.teacherIds = [u7]` (só a Prof. Sandra no 3º Ano A),
      // enquanto o Step 4 dá ao Prof. Marcelo as três turmas em `classIds`. Dois
      // consumidores leem o mesmo vínculo e respondem de forma diferente:
      //  - `routes/activities.ts` (criar atividade) libera o professor quando
      //    `creator.classIds` OU `klass.teacherIds` o contém — então o Prof.
      //    Marcelo pode criar atividade no 3º Ano A;
      //  - `services/reports.ts` (relatórios) escopa por `c.teacherIds` — então
      //    o relatório de conclusão e o de pontos dele não cobrem o 3º Ano A.
      // `seed.test.ts` trava os dois lados em testes separados, então qualquer
      // reconciliação futura quebra a suíte e a decisão não passa despercebida.
      ["u6", "Prof. Marcelo Ferreira", "marcelo@etec.sp.gov.br", "teacher", 1, "MF", '["c1", "c2", "c3"]', dt(1)],
      ["u7", "Prof. Sandra Alves", "sandra@etec.sp.gov.br", "teacher", 1, "SA", '["c2", "c3"]', dt(1)],
      ["u8", "Carlos Henrique", "carlos@etec.sp.gov.br", "staff", 1, "CH", "[]", dt(1)],
      ["u9", "Juliana Santos", "juliana@etec.sp.gov.br", "coordinator", 1, "JS", "[]", dt(1)],
    ]
    for (const u of users) {
      const [id, name, email, role, active, avatar, classIds, createdAt] = u
      insertUser.run(id, name, email, demoHash, role, active, avatar, classIds, createdAt)
    }

    // ─── Turmas (1º, 2º e 3º ano do Técnico em Administração) ───────────────
    // Tupla: [id, nome, curso, ano, turno, ativo, studentIds JSON, teacherIds JSON].
    const insertClass = db.prepare(
      `INSERT INTO classes (id, name, course, year, shift, active, studentIds, teacherIds)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const classes: Array<[string, string, string, number, string, number, string, string]> = [
      ["c1", "1º Ano A", "Técnico em Administração", 1, "morning", 1, '["u1","u2"]', '["u6"]'],
      ["c2", "2º Ano A", "Técnico em Administração", 2, "afternoon", 1, '["u3","u4"]', '["u6","u7"]'],
      ["c3", "3º Ano A", "Técnico em Administração", 3, "evening", 1, '["u5"]', '["u7"]'],
    ]
    for (const c of classes) insertClass.run(...c)

    // ─── Disciplinas: 12 da BNCC + 4 técnicas do curso ──────────────────────
    const insertSubject = db.prepare(
      `INSERT INTO subjects (id, name, icon, teacherIds, classIds) VALUES (?, ?, ?, ?, ?)`,
    )
    for (const s of SUBJECTS) insertSubject.run(...s)

    // ─── Recompensas: catálogo com estoque cheio ────────────────────────────
    // Tupla: [id, ícone, rótulo, pontos, estoque].
    const insertReward = db.prepare(
      `INSERT INTO rewards (id, icon, label, points, stock) VALUES (?, ?, ?, ?, ?)`,
    )
    const rewards: Array<[string, string, string, number, number]> = [
      ["r1", "🎮", "Acesso a jogos eletrônicos", 50, 10],
      ["r2", "🍫", "Máquina de lanche grátis", 100, 5],
      ["r3", "🎉", "Ingresso para evento especial", 200, 3],
      ["r4", "⭐", "Reconhecimento público", 350, 2],
      ["r5", "📚", "Material escolar extra", 80, 8],
      ["r6", "🏅", "Certificado de destaque", 300, 4],
    ]
    for (const r of rewards) insertReward.run(...r)

    // ─── Onde o histórico de demonstração entraria ───────────────────────────
    // A V3 entrega o banco zerado, então nada abaixo é executado. As listas de
    // coluna ficam registradas aqui para quem for reativar um histórico de
    // demonstração no futuro (a V1 semeava tudo isso em runSeed), sem precisar
    // redescobrir o formato das tabelas:
    //
    //   activities    (id, title, description, subjectId, teacherId, classId,
    //                  points, deadline, type, status, createdAt)
    //                 + 004: lateWindowDays, deletedAt, deletedBy
    //   submissions   (id, activityId, studentId, submittedAt, status, evidence,
    //                  comment, validatedBy, validatedAt, feedback)
    //                 + 004: delayed
    //   transactions  (id, studentId, amount, type, description,
    //                  relatedActivityId, createdBy, createdAt)
    //   redemptions   (id, studentId, rewardId, rewardLabel, rewardIcon, points,
    //                  status, redeemedAt, processedBy)
    //   notifications (id, userId, title, message, type, read, createdAt)
    //                 + 004: transient
    //   auditLogs     (id, userId, action, entity, entityId, description, timestamp)
    //   studyContents (id, subject, topic, icon, color, exercises)
    //                 + 004: description, content, teacherId, classIds, points, questions
    //
    // Ordem obrigatória de inserção: activities → submissions → transactions,
    // porque `submissions` e `transactions` têm FK para as tabelas anteriores.
  })
}
