import { getDb } from "../db/connection"
import { findClassById } from "../db/queries"
import { mapNotice, type NoticeRow } from "../db/rows"
import { withTransaction } from "../db/transaction"
import { unprocessable } from "../lib/errors"
import { nowBR } from "../lib/dates"
import { uuid } from "../lib/uuid"
import { recordAudit } from "./audit"
import { insertNotificationsForUsers } from "./notifications"
import type {
  Class,
  CoordinatorNotice,
  CoordinatorNoticePage,
  NoticeAudienceType,
  SafeUser,
} from "../shared/types"

/**
 * Avisos da coordenação (V3, Tarefa 3.5).
 *
 * O aviso é uma ENTIDADE persistente (`notices`, migração 004) que existe
 * porque o quadro da coordenação precisa mostrar o que já foi enviado, e a
 * notificação por destinatário (`coord_notice`, persistente) é o efeito colateral
 * que faz o aviso chegar a quem não está no painel.
 *
 * A separação importa: o aviso sobrevive a quem leu a notificação, e a notificação
 * é por destinatário (cada um tem a sua linha e o seu estado de leitura). Apagar a
 * notificação ao ler não pode apagar o aviso do quadro.
 *
 * Regras de público (decididas aqui, no servidor):
 * - `all`: estudantes e professores ATIVOS (a coordenação que publica não é
 *   destinatária dela própria, e funcionário não é público de aviso escolar);
 * - `classes`: os mesmos papéis, mas só os das turmas indicadas.
 *
 * Tudo em uma transação: aviso + notificações + auditoria ou nada (ver `createNotice`).
 */

/** Uma linha crua de `users`, só o que a resolução de público precisa. */
interface AudienceUserRow {
  id: string
  /** `classIds` cru do banco (JSON); o papel e `active` já vêm filtrados no WHERE. */
  classIds: string
}

/** Um aviso recém-criado e para quem ele foi notificado. */
export interface CreateNoticeResult {
  notice: CoordinatorNotice
  /** Destinatários notificados, na ordem de gravação. */
  notifiedUserIds: string[]
}

export interface CreateNoticeInput {
  title: string
  message: string
  audienceType: NoticeAudienceType
  /** Ids de turma; ignorado (e gravado vazio) quando `audienceType = 'all'`. */
  classIds: string[]
}

/**
 * Estudantes e professores ATIVOS que recebem o aviso de público amplo.
 *
 * `staff` e `coordinator` ficam de fora de propósito: o aviso é comunicação
 * escolar para quem tem turma, e quem publica não precisa ser avisado da própria
 * publicação (o quadro da coordenação já é a resposta para ele).
 */
function activeAudienceUsers(): AudienceUserRow[] {
  return getDb()
    .prepare("SELECT id, classIds FROM users WHERE active = 1 AND role IN ('student', 'teacher')")
    .all() as unknown as AudienceUserRow[]
}

function parseClassIds(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : []
  } catch {
    return []
  }
}

/**
 * Destinatários do aviso por turma, com o MESMO conjunto de papéis do público
 * amplo (estudantes e professores ativos das turmas indicadas).
 *
 * A turma é lida pelo vínculo mais forte que existe no modelo — `Class.studentIds`
 * e `Class.teacherIds` — e o `User.classIds` entra como fonte complementar.
 *
 * A soma dos dois é deliberada: o seed da V3 mantém uma divergência conhecida
 * entre os dois vínculos (o Prof. Marcelo tem `classIds = [c1,c2,c3]`, mas o
 * 3º Ano A o lista como `u7`), e o próprio repositório já trata "pertence/atuante
 * na turma" como `classIds OU teacherIds` em `routes/activities.ts`. Escolher só um
 * dos dois faria o aviso chegar (ou não chegar) a um professor diferente do que a
 * criação de atividade decide — a mesma pessoa recebendo duas verdades.
 *
 * Cada perna da união é testada ISOLADA em `tests/notices.test.ts` ("cada vínculo
 * da turma é isolado por vez"): no seed `roster ⊂ classIds`, então sem esse
 * cuidado apagar `studentIds` ou `teacherIds` aqui não quebraria teste nenhum.
 */
function classAudienceUsers(classes: Class[]): string[] {
  const selected = new Set(classes.map((klass) => klass.id))
  const roster = new Set<string>()
  for (const klass of classes) {
    for (const studentId of klass.studentIds) roster.add(studentId)
    for (const teacherId of klass.teacherIds) roster.add(teacherId)
  }

  // Uma linha por destinatário: o laço externo itera usuários do banco (uma vez
  // cada), e o `Set` é a rede de segurança caso a consulta passe a devolver
  // repetido. Ver `tests/notices.test.ts`, que fixa "um aviso, um coord_notice".
  const ids = new Set<string>()
  for (const user of activeAudienceUsers()) {
    const turmasDoUsuario = parseClassIds(user.classIds)
    if (roster.has(user.id) || turmasDoUsuario.some((classId) => selected.has(classId))) {
      ids.add(user.id)
    }
  }
  return [...ids]
}

/**
 * Todas as turmas de `classIds` existem (e estão ativas)?
 *
 * `422` listando as inválidas, e não `404`: aqui a turma não é o recurso sendo
 * pedido — o recurso é o aviso, e ele existe. O 404 fica reservado para "esse
 * aviso não existe" (que ainda não é rota). A alternativa seria criar o aviso sem
 * notificar ninguém, que é o pior desfeço possível para quem confia no quadro.
 */
function assertNoticesClassesExist(classIds: string[]): Class[] {
  const db = getDb()
  const found: Class[] = []
  const invalid: string[] = []
  for (const classId of classIds) {
    const klass = findClassById(db, classId)
    if (klass && klass.active) {
      found.push(klass)
      continue
    }
    invalid.push(classId)
  }
  if (invalid.length > 0) {
    throw unprocessable(
      `Turma não encontrada ou inativa: ${invalid.join(", ")}.`,
      "CLASSES_NOT_FOUND",
    )
  }
  return found
}

/**
 * Cria o aviso e notifica os destinatários — as três escritas na MESMA transação.
 *
 * O agrupamento é o ponto: existe um estado intermediário ruim em que o aviso está
 * no quadro mas ninguém foi notificado (a coordenação acredita que comunicou), e
 * outro em que o aviso não está no quadro mas os alunos receberam algo (o
 * quadro mente). `withTransaction` fecha os dois: ou as três escritas existem, ou
 * nenhuma.
 *
 * A auditoria entra na transação de propósito (RN06): um aviso gravado sem
 * registro é uma comunicação sem rastro.
 */
export function createNotice(input: CreateNoticeInput, coordinator: SafeUser): CreateNoticeResult {
  const db = getDb()
  // Público 'all' não tem turma: `classIds` enviado junto é normalizado para vazio
  // em vez de ser gravado, porque gravar diria ao quadro que o aviso foi para
  // turmas específicas quando na verdade foi para a escola inteira.
  //
  // E a lista é deduplicada AQUI, antes da validação, do INSERT e do texto da
  // auditoria: `{classIds: ["c1","c1"]}` guardava a mesma turma duas vezes e o
  // quadro dizia "2 turma(s)" para UMA turma — afirmação falsa na tela. Deduplicar
  // antes de `assertNoticesClassesExist` também evita o 422 listar a mesma turma
  // inválida duas vezes. Normalizar (e não recusar com 400) é o mesmo tratamento
  // que o público 'all' já recebia acima.
  const classIds = input.audienceType === "all" ? [] : [...new Set(input.classIds)]
  const classes = classIds.length > 0 ? assertNoticesClassesExist(classIds) : []
  const recipients = input.audienceType === "all" ? activeAudienceUsers().map((u) => u.id) : classAudienceUsers(classes)
  const id = uuid()
  const createdAt = nowBR()

  return withTransaction(db, (): CreateNoticeResult => {
    db.prepare(
      `INSERT INTO notices (id, title, message, audienceType, classIds, createdBy, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, input.title, input.message, input.audienceType, JSON.stringify(classIds), coordinator.id, createdAt)

    const notifications = insertNotificationsForUsers(recipients, {
      title: input.title,
      message: input.message,
      type: "coord_notice",
    })

    recordAudit({
      userId: coordinator.id,
      action: "NOTICE_CREATED",
      entity: "Notice",
      entityId: id,
      description: `${coordinator.name} publicou o aviso '${input.title}' para ${
        input.audienceType === "all" ? "toda a escola" : classIds.length + " turma(s)"
      } (${notifications.length} notificação(ões))`,
    })

    return {
      notice: { ...loadNotice(id), createdByName: coordinator.name },
      notifiedUserIds: notifications.map((n) => n.userId),
    }
  })
}

/** Uma linha de `notices` + o nome do autor, como o quadro da coordenação lê. */
const NOTICE_SELECT = `
  SELECT n.*, u.name AS createdByName
  FROM notices n
  LEFT JOIN users u ON u.id = n.createdBy AND u.active = 1
`

function loadNotice(id: string): CoordinatorNotice {
  const row = getDb().prepare(`${NOTICE_SELECT} WHERE n.id = ?`).get(id) as
    | (NoticeRow & { createdByName: string | null })
    | undefined
  if (!row) throw new Error(`notices: aviso ${id} desapareceu no meio da requisição`)
  return mapNotice(row)
}

/**
 * Inteiro positivo, ou o padrão quando o valor não serve.
 *
 * `Math.max(1, Math.floor(x))` não basta: `Math.floor(NaN)` é `NaN` e
 * `Math.max(1, NaN)` também — o `NaN` sobrevive e chega ao bind do `OFFSET`,
 * onde o SQLite responde "datatype mismatch". Aqui o `NaN` (e o `Infinity`, e o
 * negativo, e o `0.5`) caem no padrão antes de virarem query.
 */
function positiveInt(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  const floored = Math.floor(value)
  return floored >= 1 ? floored : fallback
}

/**
 * Quadro de avisos, mais recente primeiro, paginado no servidor.
 *
 * A ordem é por `rowid` (ordem de gravação) e **não** por `createdAt`: o
 * `createdAt` é uma string pt-BR ("30/09/2026, 23:40:00") e ordenar
 * alfabeticamente por ela botaria "01/10/2026" antes de "30/09/2026". O índice
 * `idx_notices_createdAt` continua existindo (a coluna é consultável), mas a
 * listagem do quadro não depende dele.
 *
 * O `LEFT JOIN` filtra `u.active = 1` **no ON**, não no WHERE: com o filtro no
 * WHERE, um aviso de autor desativado virava linha órfã e sumia do quadro — o
 * registro da coordenação tem de continuar legível depois de uma troca de quadro
 * funcional. Com o filtro no ON, o aviso continua na lista com `createdByName`
 * `null`, que é o que a tela sabe renderizar.
 */
export function listNoticesPage(pagination: { page?: number; pageSize?: number } = {}): CoordinatorNoticePage {
  const db = getDb()
  const page = positiveInt(pagination.page, 1)
  const pageSize = Math.min(positiveInt(pagination.pageSize, 20), 100)
  const total = Number(
    (db.prepare("SELECT COUNT(*) AS total FROM notices").get() as { total: number }).total,
  )
  const rows = db
    .prepare(`${NOTICE_SELECT} ORDER BY n.rowid DESC LIMIT ? OFFSET ?`)
    .all(pageSize, (page - 1) * pageSize) as unknown as Array<NoticeRow & { createdByName: string | null }>

  return { items: rows.map(mapNotice), total, page, pageSize }
}
