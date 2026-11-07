import { DatabaseSync } from "node:sqlite"
import { describe, it, expect, beforeAll } from "vitest"
import { makeApp, prepareDb, loginAgent, USERS, count } from "./helpers"
import { getDb } from "../db/connection"
import { ForeignKeyViolationError, foreignKeysEnabled, MIGRATIONS, runMigrations } from "../db/migrations"
import { readForeignKeyViolations, subtractViolations } from "../db/migrations/errors"
import { migration001 } from "../db/migrations/001"
import { migration002, assertSqlIdentifier } from "../db/migrations/002"
import { migration003 } from "../db/migrations/003"
import { migration004 } from "../db/migrations/004"
import { migration005 } from "../db/migrations/005"
import { migration006 } from "../db/migrations/006"
import { migration007 } from "../db/migrations/007"
import type { Migration } from "../db/migrations/types"
import { runSeed } from "../db/seed"
import { hashPassword } from "../auth/password"
import {
  createActivity,
  createAuditLog,
  createNotification,
  createRedemption,
  createSubmission,
  createTransaction,
} from "./fixtures"
import type { Express } from "express"

function versions(db: DatabaseSync): number[] {
  return (
    db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as Array<{ version: number }>
  ).map((r) => Number(r.version))
}

/** Soma dos pontos de todas as transações — o saldo dos alunos (RN04). */
function somaPontos(db: DatabaseSync): number {
  const row = db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM transactions").get() as { total: number }
  return Number(row.total)
}

function tableExists(db: DatabaseSync, name: string): boolean {
  return db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined
}

/** Linha de `PRAGMA table_info`. */
interface ColumnInfo {
  name: string
  type: string
  /** 1 quando a coluna é NOT NULL. */
  notnull: number
  /** Default declarado no DDL, como texto (null quando não há). */
  dflt_value: string | null
}

/** Nomes dos índices de uma tabela, incluindo os automáticos de UNIQUE. */
function indexes(db: DatabaseSync, table: string): string[] {
  return (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ?").all(table) as Array<{
      name: string
    }>
  ).map((r) => r.name)
}

/** Nomes das colunas de uma tabela, na ordem do DDL. */
function columns(db: DatabaseSync, table: string): string[] {
  return tableInfo(db, table).map((c) => c.name)
}

/**
 * `PRAGMA table_info` cru: nome, tipo, flag de NOT NULL e default declarado.
 * Ler o tipo e o NOT NULL (e não só o nome) é o que fecha a verificação de que
 * a coluna nova tem o tipo e a obrigatoriedade que o brief dita.
 */
function tableInfo(db: DatabaseSync, table: string): ColumnInfo[] {
  return db.prepare(`PRAGMA table_info(${assertSqlIdentifier(table)})`).all() as unknown as ColumnInfo[]
}

/** Uma coluna pelo nome; falha alto em vez de devolver `undefined` silencioso. */
function columnInfo(db: DatabaseSync, table: string, name: string): ColumnInfo {
  const found = tableInfo(db, table).find((c) => c.name === name)
  if (!found) throw new Error(`Coluna ${name} não existe em ${table}`)
  return found
}

/**
 * Linhas que já existem **antes** das migrações rodarem — a situação que elas
 * precisam cobrir (backfill de default em linha preexistente, rebuild de tabela
 * com FK RESTRICT, colunas aditivas) e, principalmente, a que a sondagem de
 * **preservação de dados** precisa: sem linhas plantadas, `count(antes) ===
 * count(depois)` passa com `0 === 0` e uma migração que recriasse a tabela
 * derrubando o histórico passaria sem ninguém notar.
 *
 * A V3 semeia o banco sem histórico, então essas linhas não vêm mais do seed de
 * demonstração: são plantadas aqui, com os mesmos ids que os testes usavam
 * (`a1`, `sub1`, `n1`, `sc1`, `sc9`, `t1`, `rd1`, `al1`). O que os testes provam
 * — defaults aplicados em linhas antigas, FK RESTRICT, nada se perde — não muda:
 * muda só de onde o dado veio.
 *
 * Todas as linhas referenciam usuários/turmas/disciplinas/recompensas que
 * existem no seed, então o banco plantado passa em `PRAGMA foreign_key_check`
 * (é o que os testes de órfão pré-existente exigem).
 */
function plantLegacyRows(db: DatabaseSync): void {
  createActivity(db, {
    id: "a1",
    title: "Atividade legada",
    description: "",
    subjectId: "s1",
    classId: "c1", // u6 é professor de c1
    deadline: "01/12/2026",
    status: "draft",
  })
  createSubmission(db, {
    id: "sub1",
    activityId: "a1",
    studentId: "u1", // aluna de c1
    status: "approved",
    submittedAt: "02/09/2026",
    validatedBy: "u6",
    validatedAt: "03/09/2026",
  })
  createNotification(db, { id: "n1", userId: "u1", title: "Aviso legado", message: "Mensagem legada." })
  const content = db.prepare(
    `INSERT INTO studyContents (id, subject, topic, icon, color, exercises) VALUES (?, ?, ?, ?, ?, ?)`,
  )
  content.run("sc1", "s2", "Reforço legado 1", "📘", "blue", 4)
  content.run("sc9", "s1", "Reforço legado 9", "📗", "green", 6)
  // Pontos: a transação que o `pointsReport`/`getBalance` leem (RN04). É a linha
  // que a 002 recria (rebuild com FK) e que a 005 não pode derrubar junto com
  // a tabela de conquistas.
  createTransaction(db, {
    id: "t1",
    studentId: "u1",
    amount: 25,
    type: "manual_adjustment",
    description: "Ajuste manual legado",
    relatedActivityId: "a1",
    createdBy: "u9",
  })
  // Resgate legado: `redemptions` também é recriada pela 002 (FK para rewards).
  createRedemption(db, { id: "rd1", studentId: "u1", rewardId: "r1", points: 50 })
  // Auditoria legada: escrita pela coordenação, então `u9` ganha histórico.
  createAuditLog(db, {
    id: "al1",
    userId: "u9",
    action: "POINTS_ADJUSTED",
    entity: "Transaction",
    entityId: "t1",
    description: "Ajuste manual legado registrado em auditoria",
  })
}

/**
 * Banco no estado imediatamente anterior à 004: 001–003 aplicadas e seed de
 * demonstração dentro (o caminho do banco legado "sujo").
 */
function dbBefore004(): DatabaseSync {
  const db = new DatabaseSync(":memory:")
  db.exec("PRAGMA foreign_keys = ON")
  runMigrations(db, [migration001, migration002, migration003])
  runSeed(db)
  plantLegacyRows(db)
  return db
}

/**
 * Banco com TODAS as migrações aplicadas (a fila completa, 001 a 005) e o seed
 * dentro. O nome antigo (`dbAfter004`) dizia "estado após a 004", mas a chamada
 * sem fila explícita já rodava a fila inteira — inclusive a 005, que derruba
 * `achievements`. O que os testes da 004 precisam é o schema com as colunas
 * novas, e o schema é o mesmo nos dois estados; quem precisar do estado
 * intermediário de verdade já usa fila explícita (`dbBefore004` + fila).
 */
function dbFullyMigrated(): DatabaseSync {
  const db = dbBefore004()
  runMigrations(db)
  return db
}

/** Migração-sonda: registra se rodou com a checagem de FK ligada ou desligada. */
function probe(version: number, needsForeignKeysOff: boolean, seen: boolean[]): Migration {
  return {
    version,
    name: `probe_${version}`,
    needsForeignKeysOff,
    run(db) {
      seen.push(foreignKeysEnabled(db))
    },
  }
}

describe("Migrações versionadas (Frente 5 — item A/B/D)", () => {
  it("cria schema_migrations com as versões 1 a 7 aplicadas", () => {
    prepareDb()
    const db = getDb()
    const versions = (
      db.prepare("SELECT version, name FROM schema_migrations ORDER BY version").all() as Array<{
        version: number
        name: string
      }>
    ).map((r) => r.version)
    expect(versions).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it("rodar as migrações de novo é idempotente (sem duplicar dados)", () => {
    prepareDb()
    const db = getDb()
    // A V3 não semeia histórico: as linhas legadas são plantadas aqui porque a
    // sondagem só quer dizer alguma coisa com o que perder. Sem elas, `0 === 0`
    // passaria mesmo se uma migração rebuildasse a tabela e perdesse tudo.
    plantLegacyRows(db)
    const usersBefore = count(db, "users")
    const logsBefore = count(db, "auditLogs")
    expect(logsBefore, "a linha de auditoria plantada sumiu antes das migrações").toBe(1)

    runMigrations(db)
    runMigrations(db)

    expect(count(db, "users")).toBe(usersBefore)
    expect(count(db, "auditLogs")).toBe(logsBefore)
    // 001, 002, 003, 004 (V3), 005 (drop de conquistas), 006 (anexo do reforço)
    // e 007 (a notificação passa a dizer a que atividade se refere).
    expect(count(db, "schema_migrations")).toBe(7)
  })

  it("FK nativa bloqueia insert órfão e delete de pai referenciado", () => {
    prepareDb()
    const db = getDb()
    const foreignKeys = db.prepare("PRAGMA foreign_key_list(activities)").all()
    expect(foreignKeys.length).toBeGreaterThan(0)

    // Insert órfão (subjectId inexistente) viola FK
    expect(() =>
      db
        .prepare(
          `INSERT INTO activities (id, title, description, subjectId, teacherId, classId, points, deadline, type, status, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run("a-orphan", "Órfã", "", "nope", "u6", "c1", 10, "01/01/2099", "academic", "draft", "now"),
    ).toThrow()

    // DELETE de pai referenciado (subjects com activities) é bloqueado por RESTRICT
    // A V3 não semeia atividades: a que referencia `s1` é plantada aqui só para
    // haver o vínculo que o RESTRICT precisa recusar.
    createActivity(db, { id: "a-restrict", teacherId: "u6", classId: "c1", subjectId: "s1" })
    expect(() => db.prepare("DELETE FROM subjects WHERE id = 's1'").run()).toThrow()
  })

  it("ON DELETE CASCADE remove sessões quando o usuário é excluído", () => {
    prepareDb()
    const db = getDb()
    const id = "u-tmp"
    db.prepare(
      `INSERT INTO users (id, name, email, password, role, active, avatar, classIds, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, "Temporário", "tmp@etec.sp.gov.br", hashPassword("123456"), "student", 1, "T", "[]", "01/01/2026")
    db.prepare(`INSERT INTO sessions (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)`).run(
      "tok-tmp",
      id,
      1_800_000_000_000,
      1_900_000_000_000,
    )

    db.prepare("DELETE FROM users WHERE id = ?").run(id)
    const left = db.prepare("SELECT COUNT(*) AS total FROM sessions WHERE token = 'tok-tmp'").get() as {
      total: number
    }
    expect(Number(left.total)).toBe(0)
  })

  it("banco antigo (sem schema_migrations e sem FKs) sobe via migrações sem perder dados", () => {
    const legacy = new DatabaseSync(":memory:")
    // Simula um banco criado pela versão anterior (DDL da migração 001 apenas).
    migration001.run(legacy)
    runSeed(legacy)
    // O que havia nesse banco antes das migrações: o cadastro do seed mais as
    // linhas legadas plantadas. `activities`/`submissions`/`redemptions` são as
    // tabelas que a 002 recria (DROP + RENAME) — a sondagem abaixo é o que
    // impede um rebuild cego de passar levando as linhas junto.
    plantLegacyRows(legacy)

    const dataBefore = {
      users: count(legacy, "users"),
      activities: count(legacy, "activities"),
      submissions: count(legacy, "submissions"),
      transactions: count(legacy, "transactions"),
      redemptions: count(legacy, "redemptions"),
      auditLogs: count(legacy, "auditLogs"),
    }
    // Baseline não vazio: `X === X` com X = 0 não prova preservação nenhuma.
    for (const [tabela, total] of Object.entries(dataBefore)) {
      expect(total, `baseline de ${tabela} vazia: a sondagem não prova nada`).toBeGreaterThan(0)
    }
    expect(legacy.prepare("PRAGMA foreign_key_list(activities)").all().length).toBe(0)

    runMigrations(legacy)

    // FKs aplicadas e dados preservados
    expect(legacy.prepare("PRAGMA foreign_key_list(activities)").all().length).toBeGreaterThan(0)
    expect(legacy.prepare("PRAGMA foreign_key_list(redemptions)").all().length).toBeGreaterThan(0)
    for (const [tabela, total] of Object.entries(dataBefore)) {
      expect(count(legacy, tabela), `contagem de ${tabela} depois das migrações`).toBe(total)
    }

    const versions = (
      legacy.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as Array<{
        version: number
      }>
    ).map((r) => r.version)
    expect(versions).toEqual([1, 2, 3, 4, 5, 6, 7])
    legacy.close()
  })

  it("migração 002 é defensiva: reload depois de aplicar não recria tabelas", () => {
    const legacy = new DatabaseSync(":memory:")
    migration001.run(legacy)
    runSeed(legacy)
    // `transactions` é uma das tabelas que a 002 recria: sem linhas dentro, o
    // reload abaixo seria `0 === 0` e o "não recria" não teria o que preservar.
    plantLegacyRows(legacy)

    runMigrations(legacy)
    // Snapshot ANTES do reload: o que importa é que nada se perca na reaplicação.
    const usersBefore = count(legacy, "users")
    const txBefore = count(legacy, "transactions")
    expect(txBefore, "nenhuma transação plantada: a sondagem não prova nada").toBeGreaterThan(0)
    // Remove o registro de versão para simular falha após aplicar — 002 verifica
    // PRAGMA foreign_key_list e não recria, então dados continuam íntegros.
    legacy.prepare("DELETE FROM schema_migrations WHERE version = 2").run()
    legacy.exec("PRAGMA foreign_keys = ON")
    runMigrations(legacy)

    expect(count(legacy, "users")).toBe(usersBefore)
    expect(legacy.prepare("PRAGMA foreign_key_list(activities)").all().length).toBeGreaterThan(0)
    expect(count(legacy, "transactions")).toBe(txBefore)
    // A linha continua legível — não é só a contagem que sobreviveu.
    const tx = legacy.prepare("SELECT amount FROM transactions WHERE id = 't1'").get() as
      | { amount: number }
      | undefined
    expect(Number(tx?.amount)).toBe(25)
    legacy.close()
  })
})

// ─── Fix round 1: robustez do runner de migrações (I1, I2, I3, M1, M2) ───────

describe("I1 — 002 não é marcada aplicada em banco legado com violação de FK", () => {
  it("lança, NÃO grava a versão 2 e não silencia a violação", () => {
    const legacy = new DatabaseSync(":memory:")
    migration001.run(legacy)

    // Órfão real: a tabela `transactions` legada (001) não tem FK, então aceita.
    legacy.exec(`INSERT INTO transactions (id, studentId, amount, type, description, relatedActivityId, createdBy, createdAt)
                 VALUES ('t-orphan', 'aluno-que-nao-existe', 50, 'bonus', 'transação órfã', NULL, 'u9', '01/01/2026')`)

    // Sem a checagem, o rebuild copiaria a linha cegamente, a 002 seria gravada
    // em schema_migrations e NUNCA MAIS RODARIA — inconsistência permanente.
    expect(() => runMigrations(legacy)).toThrow(ForeignKeyViolationError)

    // A versão 2 não pode ter sido registrada.
    expect(versions(legacy)).not.toContain(2)
    expect(versions(legacy)).toEqual([1])

    // A migração foi revertida: a tabela voltou ao DDL legado (sem FKs) e a
    // linha órfã continua lá — nada foi apagado nem "reparado" em silêncio.
    expect(legacy.prepare("PRAGMA foreign_key_list(transactions)").all()).toHaveLength(0)
    const orphan = legacy.prepare("SELECT id FROM transactions WHERE id = 't-orphan'").get() as
      | { id: string }
      | undefined
    expect(orphan?.id).toBe("t-orphan")

    // O operador corrige o órfão e roda de novo: agora a 002 aplica de verdade.
    legacy.prepare("DELETE FROM transactions WHERE id = 't-orphan'").run()
    runMigrations(legacy)
    expect(versions(legacy)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(legacy.prepare("PRAGMA foreign_key_check").all()).toHaveLength(0)

    legacy.close()
  })

  it("a mensagem de erro nomeia a migração e as violações (operador vê a inconsistência)", () => {
    const legacy = new DatabaseSync(":memory:")
    migration001.run(legacy)
    // Aluno existe para que a ÚNICA violação seja a atividade órfã.
    legacy.exec(`INSERT INTO users (id, name, email, password, role, active, avatar, classIds, createdAt)
                 VALUES ('u1','Ana','ana@etec.sp.gov.br','x','student',1,'','[]','01/01/2026')`)
    legacy.exec(`INSERT INTO submissions (id, activityId, studentId, submittedAt, status, evidence, comment, validatedBy, validatedAt, feedback)
                 VALUES ('s-orphan', 'atividade-inexistente', 'u1', '01/01/2026', 'submitted', '', '', NULL, NULL, '')`)

    let caught: unknown
    try {
      runMigrations(legacy)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(ForeignKeyViolationError)
    const err = caught as ForeignKeyViolationError
    expect(err.violations).toHaveLength(1)
    expect(err.violations[0].table).toBe("submissions")
    expect(err.violations[0].parent).toBe("activities")
    expect(err.message).toContain("2") // versão
    expect(err.message).toContain("foreign_keys_and_indexes") // nome
    expect(err.message).toContain("integridade referencial")
    expect(err.message).toContain("NÃO foi marcado como migrado")
    expect(err.message).toContain("submissions")
    legacy.close()
  })
})

describe("I2 — janela de PRAGMA foreign_keys só cobre quem pede", () => {
  it("migrations sem o flag rodam com FKs ligadas; a com o flag roda desligada", () => {
    const db = new DatabaseSync(":memory:")
    db.exec("PRAGMA foreign_keys = ON")
    const seen: boolean[] = []

    // Mesmo formato da fila real: 001 (sem flag), 002 (flag), 003 (sem flag).
    runMigrations(db, [probe(1, false, seen), probe(2, true, seen), probe(3, false, seen)])

    // 001 e 003 NÃO podem herdar a janela OFF — era exatamente o bug.
    expect(seen).toEqual([true, false, true])
    // E o estado original é restaurado ao final.
    expect(foreignKeysEnabled(db)).toBe(true)
    expect(versions(db)).toEqual([1, 2, 3])
    db.close()
  })

  it("não força ON: chamador que chegou com FKs desligadas continua assim", () => {
    const db = new DatabaseSync(":memory:")
    db.exec("PRAGMA foreign_keys = OFF")
    expect(foreignKeysEnabled(db)).toBe(false)
    const seen: boolean[] = []

    runMigrations(db, [probe(1, true, seen), probe(2, false, seen)])

    expect(seen).toEqual([false, false])
    expect(foreignKeysEnabled(db)).toBe(false)
    db.close()
  })

  it("só quem recria tabela é marcado needsForeignKeysOff (002 e 006; 001/003/004/005/007 não)", () => {
    expect(migration001.needsForeignKeysOff).toBeUndefined()
    expect(migration002.needsForeignKeysOff).toBe(true)
    expect(migration003.needsForeignKeysOff).toBeUndefined()
    expect(migration004.needsForeignKeysOff).toBeUndefined()
    expect(migration005.needsForeignKeysOff).toBeUndefined()
    // A 006 recria `transactions` para abrir o CHECK do tipo `study_content`.
    expect(migration006.needsForeignKeysOff).toBe(true)
    // A 007 é só `ALTER TABLE ... ADD COLUMN` (com default NULL, que é o que o
    // SQLite exige de coluna nova com REFERENCES) — nada de rebuild, então ela
    // roda com as FKs ligadas.
    expect(migration007.needsForeignKeysOff).toBeUndefined()
  })

  it("fila só com migrations comuns não mexe na pragma da conexão", () => {
    const db = new DatabaseSync(":memory:")
    db.exec("PRAGMA foreign_keys = ON")
    const seen: boolean[] = []
    runMigrations(db, [probe(1, false, seen), probe(2, false, seen)])
    expect(seen).toEqual([true, true])
    expect(foreignKeysEnabled(db)).toBe(true)
    db.close()
  })
})

describe("I3 — falha no meio da migração faz ROLLBACK completo", () => {
  it("a tabela da sonda não fica criada e a versão não é gravada", () => {
    const db = new DatabaseSync(":memory:")
    db.exec("PRAGMA foreign_keys = ON")
    const boom: Migration = {
      version: 901,
      name: "sonda_explode",
      run(d) {
        d.exec("CREATE TABLE sonda (x)")
        d.exec("INSERT INTO sonda (x) VALUES (1)")
        throw new Error("boom no meio da migração")
      },
    }

    expect(() => runMigrations(db, [boom])).toThrow(/boom no meio da migração/)

    // O CREATE e o INSERT estavam dentro da transação → desfeitos no ROLLBACK.
    expect(tableExists(db, "sonda")).toBe(false)
    // A versão não pode ter sido gravada (o INSERT em schema_migrations vem
    // depois de run() e dentro da mesma transação).
    expect(versions(db)).not.toContain(901)
    expect(versions(db)).toEqual([])
    // E a conexão segue utilizável.
    expect(foreignKeysEnabled(db)).toBe(true)
    db.close()
  })

  it("migrations que já rodaram antes da falha permanecem aplicadas", () => {
    const db = new DatabaseSync(":memory:")
    db.exec("PRAGMA foreign_keys = ON")
    const seen: boolean[] = []
    const boom: Migration = {
      version: 902,
      name: "sonda_explode_2",
      run() {
        throw new Error("boom")
      },
    }

    runMigrations(db, [probe(1, false, seen)])
    expect(() => runMigrations(db, [boom])).toThrow(/boom/)

    expect(versions(db)).toEqual([1])
    db.close()
  })
})

/** DDL legado de `redemptions` SEM o status 'cancelled' no CHECK. */
const LEGACY_REDEMPTIONS_DDL = `
  CREATE TABLE redemptions (
    id TEXT PRIMARY KEY,
    studentId TEXT NOT NULL,
    rewardId TEXT NOT NULL,
    rewardLabel TEXT NOT NULL,
    rewardIcon TEXT NOT NULL DEFAULT '',
    points INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed')),
    redeemedAt TEXT NOT NULL,
    processedBy TEXT
  );
`

const LEGACY_REDEMPTION_ROW = `INSERT INTO redemptions (id, studentId, rewardId, rewardLabel, points, status, redeemedAt)
  VALUES ('r1','u1','rw1','Bônus',50,'processed','01/01/2026')`

describe("M1 — guard de recriação de redemptions na 001", () => {
  it("recria a tabela quando o CHECK legado não tem 'cancelled', preservando dados", () => {
    const legacy = new DatabaseSync(":memory:")
    legacy.exec(LEGACY_REDEMPTIONS_DDL)
    legacy.exec(LEGACY_REDEMPTION_ROW)

    migration001.run(legacy)

    const def = legacy
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'redemptions'")
      .get() as { sql: string }
    expect(def.sql).toContain("'cancelled'")
    expect(count(legacy, "redemptions")).toBe(1)
    // O status novo passou a ser aceito.
    expect(() =>
      legacy.exec(`INSERT INTO redemptions (id, studentId, rewardId, rewardLabel, points, status, redeemedAt)
                   VALUES ('r2','u1','rw1','Cancelada',10,'cancelled','02/01/2026')`),
    ).not.toThrow()
    expect(count(legacy, "redemptions")).toBe(2)
    legacy.close()
  })

  it("um redemptions_v2 órfão de uma run abortada não trava a 001", () => {
    const legacy = new DatabaseSync(":memory:")
    legacy.exec(LEGACY_REDEMPTIONS_DDL)
    legacy.exec(LEGACY_REDEMPTION_ROW)
    // Resíduo de uma tentativa anterior que morreu no meio do rebuild.
    legacy.exec(`CREATE TABLE redemptions_v2 (id TEXT PRIMARY KEY, lixo TEXT)`)
    legacy.exec(`INSERT INTO redemptions_v2 (id, lixo) VALUES ('residuo', 'x')`)

    expect(() => migration001.run(legacy)).not.toThrow()

    // A tabela temporária some (foi renomeada para redemptions).
    expect(tableExists(legacy, "redemptions_v2")).toBe(false)
    expect(count(legacy, "redemptions")).toBe(1)
    legacy.close()
  })

  it("redemptions já com 'cancelled' não é recriada (guard continua defensivo)", () => {
    const db = new DatabaseSync(":memory:")
    migration001.run(db)
    const first = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'redemptions'").get() as {
      sql: string
    }
    migration001.run(db)
    const second = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'redemptions'").get() as {
      sql: string
    }
    expect(second.sql).toBe(first.sql)
    db.close()
  })
})

describe("M2 — guarda de identificador na interpolação de PRAGMA/DDL", () => {
  it("aceita identificadores SQL válidos", () => {
    expect(assertSqlIdentifier("transactions")).toBe("transactions")
    expect(assertSqlIdentifier("redemptions_v2")).toBe("redemptions_v2")
    expect(assertSqlIdentifier("_tmp9")).toBe("_tmp9")
  })

  it("rejeita qualquer coisa que não seja identificador (fecha o caminho de injeção)", () => {
    const bad = [
      "users; DROP TABLE users",
      "users--",
      "1users",
      'users"',
      "",
      "a b",
      "usérs",
    ]
    for (const name of bad) {
      expect(() => assertSqlIdentifier(name)).toThrow(/identificador de tabela inválido/)
    }
  })
})

// ─── Task 1.1: migração 004 (base de schema da V3) ──────────────────────────

describe("004 — colunas novas, avisos e conclusão do reforço", () => {
  it("004 adiciona lateWindowDays, deletedAt, transient, notices e cria study_content_completions", () => {
    const db = dbFullyMigrated()
    const names = columns(db, "activities")
    expect(names).toContain("lateWindowDays")
    expect(names).toContain("deletedAt")
    const notifCols = columns(db, "notifications")
    expect(notifCols).toContain("transient")
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='notices'").get()).toBeTruthy()
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='study_content_completions'").get(),
    ).toBeTruthy()
    db.close()
  })

  it("adiciona também deletedBy, delayed e as colunas do reforço em studyContents", () => {
    const db = dbFullyMigrated()
    expect(columns(db, "activities")).toContain("deletedBy")
    expect(columns(db, "submissions")).toContain("delayed")
    const sc = columns(db, "studyContents")
    for (const column of ["description", "content", "teacherId", "classIds", "points", "questions"]) {
      expect(sc).toContain(column)
    }
    db.close()
  })

  it("cria os três índices que o brief exige: notices.createdAt e os dois do reforço", () => {
    const db = dbFullyMigrated()
    expect(indexes(db, "notices")).toContain("idx_notices_createdAt")
    const scc = indexes(db, "study_content_completions")
    expect(scc).toContain("idx_scc_studentId")
    expect(scc).toContain("idx_scc_contentId")
    db.close()
  })

  it("grava o nome da 004 em schema_migrations (o arquivo não é anônimo)", () => {
    const db = dbFullyMigrated()
    const row = db.prepare("SELECT version, name FROM schema_migrations WHERE version = 4").get() as {
      version: number
      name: string
    }
    expect(Number(row.version)).toBe(4)
    expect(row.name).toBe("v3_features")
    expect(row.name).toBe(migration004.name)
    db.close()
  })

  it("as colunas novas têm tipo, NOT NULL e default exatamente como o brief dita", () => {
    const db = dbFullyMigrated()
    // [tabela, coluna, tipo, notnull, default como aparece no DDL]
    const esperado: Array<[string, string, string, number, string | null]> = [
      ["activities", "lateWindowDays", "INTEGER", 1, "7"],
      ["activities", "deletedAt", "TEXT", 0, null],
      ["activities", "deletedBy", "TEXT", 0, null],
      ["submissions", "delayed", "INTEGER", 1, "0"],
      ["notifications", "transient", "INTEGER", 1, "0"],
      ["studyContents", "description", "TEXT", 1, "''"],
      ["studyContents", "content", "TEXT", 1, "''"],
      ["studyContents", "teacherId", "TEXT", 0, null],
      ["studyContents", "classIds", "TEXT", 1, "'[]'"],
      ["studyContents", "points", "INTEGER", 1, "5"],
      ["studyContents", "questions", "TEXT", 1, "'[]'"],
      ["notices", "title", "TEXT", 1, null],
      ["notices", "message", "TEXT", 1, null],
      ["notices", "audienceType", "TEXT", 1, "'all'"],
      ["notices", "classIds", "TEXT", 1, "'[]'"],
      ["notices", "createdBy", "TEXT", 1, null],
      ["notices", "createdAt", "TEXT", 1, null],
      ["study_content_completions", "studentId", "TEXT", 1, null],
      ["study_content_completions", "studyContentId", "TEXT", 1, null],
      ["study_content_completions", "completedAt", "TEXT", 1, null],
    ]
    for (const [tabela, coluna, tipo, notnull, dflt] of esperado) {
      const info = columnInfo(db, tabela, coluna)
      expect(info.type, `${tabela}.${coluna} — tipo`).toBe(tipo)
      expect(Number(info.notnull), `${tabela}.${coluna} — NOT NULL`).toBe(notnull)
      expect(info.dflt_value, `${tabela}.${coluna} — default`).toBe(dflt)
    }
    db.close()
  })

  it("os defaults valem para as linhas que JÁ EXISTIAM quando a 004 rodou", () => {
    const db = dbBefore004()
    // Prova de que o teste acima não é decorativo: antes da 004 as colunas não
    // existem, então os defaults têm de ter sido aplicados nas linhas do seed.
    expect(columns(db, "activities")).not.toContain("lateWindowDays")
    expect(columns(db, "studyContents")).not.toContain("questions")

    runMigrations(db)

    const activity = db.prepare("SELECT lateWindowDays, deletedAt, deletedBy FROM activities WHERE id = 'a1'").get() as {
      lateWindowDays: number
      deletedAt: string | null
      deletedBy: string | null
    }
    expect(Number(activity.lateWindowDays)).toBe(7) // janela padrão de 7 dias
    expect(activity.deletedAt).toBeNull() // atividade não nasce apagada
    expect(activity.deletedBy).toBeNull()

    const submission = db.prepare("SELECT delayed FROM submissions WHERE id = 'sub1'").get() as { delayed: number }
    expect(Number(submission.delayed)).toBe(0) // entrega do seed não é atrasada

    const notification = db.prepare("SELECT transient FROM notifications WHERE id = 'n1'").get() as {
      transient: number
    }
    expect(Number(notification.transient)).toBe(0) // notificação do seed é permanente

    const content = db
      .prepare("SELECT description, content, teacherId, classIds, points, questions FROM studyContents WHERE id = 'sc9'")
      .get() as {
      description: string
      content: string
      teacherId: string | null
      classIds: string
      points: number
      questions: string
    }
    expect(content.description).toBe("")
    expect(content.content).toBe("")
    expect(content.teacherId).toBeNull()
    expect(content.classIds).toBe("[]")
    expect(Number(content.points)).toBe(5)
    expect(content.questions).toBe("[]")
    db.close()
  })

  it("aplica em banco legado com dados dentro sem alterar nenhuma coluna preexistente", () => {
    const db = dbBefore004()
    const activityBefore = db.prepare("SELECT * FROM activities WHERE id = 'a1'").get() as Record<string, unknown>
    const contentBefore = db.prepare("SELECT * FROM studyContents WHERE id = 'sc1'").get() as Record<string, unknown>
    const countsBefore = {
      users: count(db, "users"),
      activities: count(db, "activities"),
      submissions: count(db, "submissions"),
      transactions: count(db, "transactions"),
      notifications: count(db, "notifications"),
      studyContents: count(db, "studyContents"),
    }

    runMigrations(db)

    for (const [table, total] of Object.entries(countsBefore)) {
      expect(count(db, table), `contagem de ${table}`).toBe(total)
    }
    // Cada valor antigo continua idêntico — o ADD COLUMN só acrescenta.
    const activityAfter = db.prepare("SELECT * FROM activities WHERE id = 'a1'").get() as Record<string, unknown>
    for (const [column, value] of Object.entries(activityBefore)) {
      expect(activityAfter[column], `activities.${column}`).toEqual(value)
    }
    const contentAfter = db.prepare("SELECT * FROM studyContents WHERE id = 'sc1'").get() as Record<string, unknown>
    for (const [column, value] of Object.entries(contentBefore)) {
      expect(contentAfter[column], `studyContents.${column}`).toEqual(value)
    }
    db.close()
  })

  it("é idempotente: re-aplicar não duplica coluna nem sobrescreve o que foi configurado", () => {
    const db = dbFullyMigrated()
    db.prepare("UPDATE activities SET lateWindowDays = 2, deletedAt = '05/09/2026', deletedBy = 'u9' WHERE id = 'a1'").run()

    // Simula o registro de versão perdido (ex.: queda logo depois do COMMIT):
    // a 004 roda de novo e, sem a guarda de hasColumn, o SQLite lançaria
    // "duplicate column name" — e sem o IF NOT EXISTS, as tabelas novas
    // quebrariam o boot.
    db.prepare("DELETE FROM schema_migrations WHERE version = 4").run()
    runMigrations(db)

    expect(columns(db, "activities").filter((c) => c === "lateWindowDays")).toHaveLength(1)
    const activity = db.prepare("SELECT lateWindowDays, deletedAt, deletedBy FROM activities WHERE id = 'a1'").get() as {
      lateWindowDays: number
      deletedAt: string
      deletedBy: string
    }
    expect(Number(activity.lateWindowDays)).toBe(2)
    expect(activity.deletedAt).toBe("05/09/2026")
    expect(activity.deletedBy).toBe("u9")
    expect(versions(db)).toEqual([1, 2, 3, 4, 5, 6, 7])
    db.close()
  })

  it("notices: autor tem de existir e o público padrão é toda a escola", () => {
    const db = dbFullyMigrated()
    const insert = db.prepare("INSERT INTO notices (id, title, message, createdBy, createdAt) VALUES (?, ?, ?, ?, ?)")
    insert.run("nt1", "Aviso geral", "Reunião às 8h no pátio.", "u9", "01/09/2026")
    const broad = db.prepare("SELECT audienceType, classIds FROM notices WHERE id = 'nt1'").get() as {
      audienceType: string
      classIds: string
    }
    expect(broad.audienceType).toBe("all")
    expect(broad.classIds).toBe("[]")

    // Aviso por turma.
    db.prepare(
      "INSERT INTO notices (id, title, message, audienceType, classIds, createdBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run("nt2", "Recesso", "Aula suspensa na sexta.", "classes", '["c1"]', "u9", "02/09/2026")
    const byClass = db.prepare("SELECT classIds FROM notices WHERE id = 'nt2'").get() as { classIds: string }
    expect(JSON.parse(byClass.classIds)).toEqual(["c1"])

    // Autor inexistente viola a FK (o aviso não pode ficar sem responsável).
    expect(() => insert.run("nt3", "X", "Y", "u-inexistente", "03/09/2026")).toThrow()
    expect(count(db, "notices")).toBe(2)
    db.close()
  })

  it("study_content_completions: uma conclusão por aluno/reforço, com FK para aluno e conteúdo", () => {
    const db = dbFullyMigrated()
    const insert = db.prepare(
      "INSERT INTO study_content_completions (id, studentId, studyContentId, completedAt) VALUES (?, ?, ?, ?)",
    )
    insert.run("scc1", "u1", "sc1", "01/09/2026")
    // Segundo envio do MESMO aluno no MESMO reforço: o UNIQUE é o que garante
    // os +5 pontos uma vez só (inclusive sob requisições simultâneas).
    expect(() => insert.run("scc2", "u1", "sc1", "01/09/2026")).toThrow()
    // Outro aluno no mesmo reforço é normal.
    insert.run("scc3", "u2", "sc1", "01/09/2026")
    expect(count(db, "study_content_completions")).toBe(2)

    // Órfãos bloqueados nos dois lados.
    expect(() => insert.run("scc4", "u-inexistente", "sc1", "01/09/2026")).toThrow()
    expect(() => insert.run("scc5", "u1", "sc-inexistente", "01/09/2026")).toThrow()
    expect(count(db, "study_content_completions")).toBe(2)

    // Apagar o reforço com conclusão é RESTRICT: o histórico dos pontos fica.
    expect(() => db.prepare("DELETE FROM studyContents WHERE id = 'sc1'").run()).toThrow()
    db.close()
  })

  it("NÃO derruba a tabela de conquistas — a 004 é puramente aditiva", () => {
    // Fila explícita até a 004: a fila completa inclui a 005, que é quem derruba
    // a tabela (e o teste da 005 morre se esta garantia da 004 se perder).
    const db = dbBefore004()
    expect(tableExists(db, "achievements")).toBe(true) // criada pela 003

    runMigrations(db, [migration001, migration002, migration003, migration004])

    expect(tableExists(db, "achievements")).toBe(true)
    expect(versions(db)).toEqual([1, 2, 3, 4])
    db.close()
  })

  it("as FKs novas são RESTRICT: apagar o autor não leva o aviso, nem o aluno leva a conclusão", () => {
    const db = dbFullyMigrated()
    // Usuários novos e sem nenhuma outra dependência: assim o único motivo do
    // DELETE ser recusado é a FK nova. (u9 tem auditLogs e u1 tem transactions,
    // então apagar qualquer um dos dois throwing por tabela alheia não provaria
    // nada sobre `notices`/`study_content_completions`.)
    const insertUser = db.prepare(
      "INSERT INTO users (id, name, email, password, role, active, avatar, classIds, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    insertUser.run("u-aviso", "Coordenação autora", "autor@etec.sp.gov.br", "x", "coordinator", 1, "CA", "[]", "01/09/2026")
    insertUser.run("u-reforco", "Aluno do reforço", "reforco@etec.sp.gov.br", "x", "student", 1, "AR", '["c1"]', "01/09/2026")
    db.prepare("INSERT INTO notices (id, title, message, createdBy, createdAt) VALUES (?, ?, ?, ?, ?)").run(
      "nt-restrict",
      "Aviso assinado",
      "Assinado pela coordenação autora.",
      "u-aviso",
      "01/09/2026",
    )
    db.prepare(
      "INSERT INTO study_content_completions (id, studentId, studyContentId, completedAt) VALUES (?, ?, ?, ?)",
    ).run("scc-restrict", "u-reforco", "sc1", "01/09/2026")

    // RESTRICT, não CASCADE: o aviso não pode sumir junto com o autor, e a
    // conclusão é a âncora dos +5 pts do aluno.
    expect(() => db.prepare("DELETE FROM users WHERE id = 'u-aviso'").run()).toThrow()
    expect(() => db.prepare("DELETE FROM users WHERE id = 'u-reforco'").run()).toThrow()

    expect(count(db, "notices")).toBe(1)
    expect(count(db, "study_content_completions")).toBe(1)
    // Os usuários continuam lá: RESTRICT bloqueou, não apagou em silêncio.
    expect(tableExists(db, "users")).toBe(true)
    const restantes = db.prepare("SELECT COUNT(*) AS total FROM users WHERE id IN ('u-aviso','u-reforco')").get() as {
      total: number
    }
    expect(Number(restantes.total)).toBe(2)
    db.close()
  })
})

describe("Migração 005 — remove a tabela de conquistas (poda da feature)", () => {
  it("derruba a tabela criada pela 003 e preserva o resto do schema", () => {
    const db = dbBefore004()
    expect(tableExists(db, "achievements")).toBe(true)
    const usersBefore = count(db, "users")
    const transactionsBefore = count(db, "transactions")
    // O saldo é a SOMA das transações (RN04), então é ela que prova que os
    // pontos dos alunos continuam intactos — e ela só vale se havia ponto.
    const pontosBefore = somaPontos(db)

    runMigrations(db)

    expect(tableExists(db, "achievements")).toBe(false)
    expect(versions(db)).toEqual([1, 2, 3, 4, 5, 6, 7])
    // A poda é da tabela de conquistas e nada mais: os pontos dos alunos, que
    // são derivados das transações (RN04), continuam intactos.
    expect(count(db, "users")).toBe(usersBefore)
    expect(transactionsBefore, "nenhuma transação plantada: a sondagem não prova nada").toBeGreaterThan(0)
    expect(count(db, "transactions")).toBe(transactionsBefore)
    expect(pontosBefore, "saldo plantado zerado: a sondagem não prova nada").toBeGreaterThan(0)
    expect(somaPontos(db)).toBe(pontosBefore)
    db.close()
  })

  it("é idempotente: re-run não derruba nada duas vezes nem duplica a versão", () => {
    const db = dbBefore004()
    runMigrations(db)
    // Simula o registro de versão perdido (queda logo depois do COMMIT): a 005
    // roda de novo sobre um banco que já não tem a tabela — sem o IF NOT EXISTS
    // do resto do repo, `DROP TABLE` sem guarda levantaria "no such table".
    db.prepare("DELETE FROM schema_migrations WHERE version = 5").run()
    runMigrations(db)

    expect(tableExists(db, "achievements")).toBe(false)
    expect(versions(db)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(count(db, "schema_migrations")).toBe(7)
    db.close()
  })

  it("grava o nome da 005 em schema_migrations (o arquivo não é anônimo)", () => {
    const db = dbBefore004()
    runMigrations(db)
    const row = db.prepare("SELECT version, name FROM schema_migrations WHERE version = 5").get() as {
      version: number
      name: string
    }
    expect(Number(row.version)).toBe(5)
    expect(row.name).toBe("drop_achievements")
    expect(row.name).toBe(migration005.name)
    db.close()
  })

  it("a fila é 001, 002, 003, 004, 005, 006, 007 e a 005 continua nela", () => {
    expect(MIGRATIONS.map((m) => m.version)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(MIGRATIONS).toContain(migration005)
    expect(MIGRATIONS[MIGRATIONS.length - 1]).toBe(migration007)
  })
})

/**
 * Banco no estado imediatamente anterior à 006: 001–005 aplicadas, seed dentro e
 * linhas legadas plantadas — o caminho do banco que já roda o sistema e chega
 * para a 006 com histórico de pontos. A fila é explícita de propósito: sem
 * argumento, `runMigrations` aplicaria a 006 também e o estado "antes" não
 * existiria.
 */
function dbBefore006(): DatabaseSync {
  const db = dbBefore004()
  runMigrations(db, [migration001, migration002, migration003, migration004, migration005])
  return db
}

// ─── Task 3.1: migração 006 (anexo do reforço + crédito `study_content`) ──────

describe("Migração 006 — anexo do reforço e o CHECK de transactions.type", () => {
  it("cria study_content_attachments com as colunas e o índice do contrato", () => {
    const db = dbFullyMigrated()
    expect(tableExists(db, "study_content_attachments")).toBe(true)
    expect(columns(db, "study_content_attachments")).toEqual([
      "id",
      "studyContentId",
      "filename",
      "storedName",
      "mimeType",
      "size",
      "uploadedAt",
    ])
    // O índice do brief: carregar os anexos de uma listagem sem N+1.
    expect(indexes(db, "study_content_attachments")).toContain("idx_sca_studyContentId")
    db.close()
  })

  it("o anexo é CASCADE do reforço e o storedName é único DENTRO da tabela", () => {
    const db = dbFullyMigrated()
    const fk = db.prepare("PRAGMA foreign_key_list(study_content_attachments)").all() as Array<{
      table: string
      from: string
      on_delete: string
    }>
    const doReforco = fk.find((f) => f.from === "studyContentId")
    expect(doReforco?.table).toBe("studyContents")
    expect(doReforco?.on_delete).toBe("CASCADE")

    const insert = db.prepare(
      `INSERT INTO study_content_attachments (id, studyContentId, filename, storedName, mimeType, size, uploadedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    insert.run("sca1", "sc1", "a.png", "unico-1.png", "image/png", 10, "01/09/2026")
    expect(() => insert.run("sca2", "sc1", "b.png", "unico-1.png", "image/png", 10, "01/09/2026")).toThrow()
    expect(count(db, "study_content_attachments")).toBe(1)
    db.close()
  })

  it("o UNIQUE é POR TABELA: o mesmo nome pode existir em anexo de entrega e de reforço", () => {
    // O UNIQUE do SQLite é por tabela, e as duas tabelas de arquivo não se
    // enxergam. A colisão entre elas é praticamente impossível (o `storedName` é
    // um uuid) — mas o schema NÃO a impede, então a rota `/uploads` trata o
    // arquivo ambíguo como inexistente em vez de escolher um dos dois (ver o
    // teste "nome ambíguo" em studyContents.test.ts).
    const db = dbFullyMigrated()
    db.prepare(
      `INSERT INTO attachments (id, submissionId, filename, storedName, mimeType, size, uploadedAt)
       VALUES ('at-mesmo-nome', 'sub1', 'evidencia.png', 'mesmo-nome.png', 'image/png', 10, '01/09/2026')`,
    ).run()
    expect(() =>
      db
        .prepare(
          `INSERT INTO study_content_attachments (id, studyContentId, filename, storedName, mimeType, size, uploadedAt)
           VALUES ('sca-mesmo-nome', 'sc1', 'reforco.png', 'mesmo-nome.png', 'image/png', 10, '01/09/2026')`,
        )
        .run(),
    ).not.toThrow()
    expect(count(db, "attachments")).toBe(1)
    expect(count(db, "study_content_attachments")).toBe(1)
    db.close()
  })

  it("apagar o reforço leva o anexo junto, e a conclusão segura o histórico", () => {
    const db = dbFullyMigrated()
    db.prepare(
      `INSERT INTO study_content_attachments (id, studyContentId, filename, storedName, mimeType, size, uploadedAt)
       VALUES ('sca-restrict', 'sc1', 'figura.png', 'restrito.png', 'image/png', 10, '01/09/2026')`,
    ).run()
    db.prepare("INSERT INTO study_content_completions (id, studentId, studyContentId, completedAt) VALUES (?, ?, ?, ?)").run(
      "scc-restrict",
      "u1",
      "sc1",
      "01/09/2026",
    )
    // A conclusão é RESTRICT: o reforço com pontos já creditados não some.
    expect(() => db.prepare("DELETE FROM studyContents WHERE id = 'sc1'").run()).toThrow()
    expect(count(db, "study_content_attachments")).toBe(1)

    // Sem conclusão, o mesmo DELETE passa e o anexo vai junto (CASCADE).
    db.prepare(
      `INSERT INTO study_content_attachments (id, studyContentId, filename, storedName, mimeType, size, uploadedAt)
       VALUES ('sca-cascade', 'sc9', 'figura.png', 'cascata.png', 'image/png', 10, '01/09/2026')`,
    ).run()
    expect(count(db, "study_content_attachments")).toBe(2)
    db.prepare("DELETE FROM studyContents WHERE id = 'sc9'").run()
    expect(count(db, "study_content_attachments")).toBe(1)
    db.close()
  })

  it("abre o CHECK de type para 'study_content' preservando as transações existentes", () => {
    const db = dbBefore006()
    // Antes da 006 o crédito do reforço é REJEITADO pelo CHECK herdado da 002.
    expect(() =>
      db
        .prepare(
          `INSERT INTO transactions (id, studentId, amount, type, description, relatedActivityId, createdBy, createdAt)
           VALUES ('t-study', 'u1', 5, 'study_content', 'Reforço concluído: Frações', NULL, 'u6', '01/09/2026')`,
        )
        .run(),
    ).toThrow()

    const antes = count(db, "transactions")
    const somaAntes = somaPontos(db)
    expect(antes, "nenhuma transação plantada: a sondagem não prova nada").toBeGreaterThan(0)

    runMigrations(db)

    // O histórico sobreviveu ao rebuild (o saldo é a SOMA das transações, RN04).
    expect(count(db, "transactions")).toBe(antes)
    expect(somaPontos(db)).toBe(somaAntes)
    const legada = db.prepare("SELECT amount, type, relatedActivityId FROM transactions WHERE id = 't1'").get() as {
      amount: number
      type: string
      relatedActivityId: string | null
    }
    expect(Number(legada.amount)).toBe(25)
    expect(legada.type).toBe("manual_adjustment")
    expect(legada.relatedActivityId).toBe("a1")

    // E agora o tipo novo é aceito — é isso que a conclusão do reforço grava.
    expect(() =>
      db
        .prepare(
          `INSERT INTO transactions (id, studentId, amount, type, description, relatedActivityId, createdBy, createdAt)
           VALUES ('t-study', 'u1', 5, 'study_content', 'Reforço concluído: Frações', NULL, 'u6', '01/09/2026')`,
        )
        .run(),
    ).not.toThrow()
    // Os tipos antigos continuam válidos (a lista só cresceu).
    expect(() =>
      db
        .prepare(
          `INSERT INTO transactions (id, studentId, amount, type, description, relatedActivityId, createdBy, createdAt)
           VALUES ('t-bonus', 'u1', 10, 'bonus', 'Bônus', NULL, 'u9', '01/09/2026')`,
        )
        .run(),
    ).not.toThrow()
    // Tipo inventado segue barrado — o CHECK não virou "texto livre".
    expect(() =>
      db
        .prepare(
          `INSERT INTO transactions (id, studentId, amount, type, description, relatedActivityId, createdBy, createdAt)
           VALUES ('t-fake', 'u1', 10, 'dinheiro', 'Tipo inventado', NULL, 'u9', '01/09/2026')`,
        )
        .run(),
    ).toThrow()
    db.close()
  })

  it("o rebuild mantém as FKs de transactions (RESTRICT/SET NULL) e os dois índices", () => {
    const db = dbFullyMigrated()
    const fk = db.prepare("PRAGMA foreign_key_list(transactions)").all() as Array<{
      from: string
      table: string
      on_delete: string
    }>
    const byColumn = new Map(fk.map((f) => [f.from, f]))
    expect(byColumn.get("studentId")).toMatchObject({ table: "users", on_delete: "RESTRICT" })
    expect(byColumn.get("createdBy")).toMatchObject({ table: "users", on_delete: "RESTRICT" })
    expect(byColumn.get("relatedActivityId")).toMatchObject({ table: "activities", on_delete: "SET NULL" })
    // O DROP da tabela antiga leva os índices junto: os dois são recriados.
    const idx = indexes(db, "transactions")
    expect(idx).toContain("idx_transactions_studentId")
    expect(idx).toContain("idx_transactions_type")
    db.close()
  })

  it("é idempotente: re-run não recria a tabela nem perde transação", () => {
    const db = dbBefore006()
    runMigrations(db)
    db.prepare(
      `INSERT INTO transactions (id, studentId, amount, type, description, relatedActivityId, createdBy, createdAt)
       VALUES ('t-study2', 'u1', 5, 'study_content', 'Reforço concluído: Juros', NULL, 'u6', '01/09/2026')`,
    ).run()
    const antes = count(db, "transactions")

    // Registro de versão perdido (queda logo depois do COMMIT): a 006 roda de
    // novo. O guard olha o DDL gravado, então o rebuild NÃO acontece uma segunda
    // vez — sem ele, a cópia cegamente deixaria de fora a linha recém-criada.
    db.prepare("DELETE FROM schema_migrations WHERE version = 6").run()
    runMigrations(db)

    expect(count(db, "transactions")).toBe(antes)
    expect(versions(db)).toEqual([1, 2, 3, 4, 5, 6, 7])
    const linha = db.prepare("SELECT amount, type FROM transactions WHERE id = 't-study2'").get() as {
      amount: number
      type: string
    }
    expect(linha.type).toBe("study_content")
    expect(Number(linha.amount)).toBe(5)
    db.close()
  })

  it("grava o nome da 006 em schema_migrations (o arquivo não é anônimo)", () => {
    const db = dbBefore006()
    runMigrations(db)
    const row = db.prepare("SELECT version, name FROM schema_migrations WHERE version = 6").get() as {
      version: number
      name: string
    }
    expect(Number(row.version)).toBe(6)
    expect(row.name).toBe("study_content_attachments")
    expect(row.name).toBe(migration006.name)
    db.close()
  })
})

/**
 * Banco no estado imediatamente anterior à 007: 001–006 aplicadas, seed dentro e
 * a notificação legada plantada — o caminho do banco que já roda o sistema.
 * Fila explícita de propósito: sem argumento, `runMigrations` aplicaria a 007
 * também e o estado "antes" não existiria.
 */
function dbBefore007(): DatabaseSync {
  const db = dbBefore004()
  runMigrations(db, [migration001, migration002, migration003, migration004, migration005, migration006])
  return db
}

// ─── Task 3.3: migração 007 (a notificação passa a dizer a que atividade) ─────

describe("Migração 007 — a notificação passa a dizer a que atividade se refere", () => {
  it("adiciona relatedActivityId em notifications, nullable e com default NULL", () => {
    const db = dbFullyMigrated()
    expect(columns(db, "notifications")).toContain("relatedActivityId")
    const info = columnInfo(db, "notifications", "relatedActivityId")
    expect(info.type).toBe("TEXT")
    // NULL é obrigatório, não conveniência: notificação de nível, bônus,
    // sequência e resgate NÃO se referem a uma atividade.
    expect(Number(info.notnull)).toBe(0)
    expect(info.dflt_value).toBeNull()
    db.close()
  })

  it("a coluna é mesmo uma FK para activities, com SET NULL", () => {
    const db = dbFullyMigrated()
    const fk = db.prepare("PRAGMA foreign_key_list(notifications)").all() as Array<{
      table: string
      from: string
      on_delete: string
    }>
    const daAtividade = fk.find((f) => f.from === "relatedActivityId")
    expect(daAtividade?.table).toBe("activities")
    // SET NULL, não CASCADE/RESTRICT: a notificação sobrevive à atividade —
    // perder a referência é informação, não a morte do registro.
    expect(daAtividade?.on_delete).toBe("SET NULL")

    // Prova de que a FK é nativa (e não um TEXT solto): órfão é recusado.
    expect(() =>
      db
        .prepare(
          `INSERT INTO notifications (id, userId, title, message, type, read, transient, relatedActivityId, createdAt)
           VALUES ('n-orfa', 'u1', 'Correção', 'msg', 'activity_revision', 0, 0, 'a-inexistente', '01/09/2026')`,
        )
        .run(),
    ).toThrow()
    db.close()
  })

  it("as notificações existentes sobrevivem e a coluna nasce NULL nelas", () => {
    const db = dbBefore007()
    // Prova de que o teste acima não é decorativo: antes da 007 a coluna não
    // existe, então não há como o backfill ter acontecido.
    expect(columns(db, "notifications")).not.toContain("relatedActivityId")
    const antes = count(db, "notifications")
    expect(antes, "a linha legada plantada sumiu antes das migrações").toBe(1)

    runMigrations(db)

    expect(count(db, "notifications")).toBe(antes)
    const legada = db
      .prepare("SELECT title, type, transient, relatedActivityId FROM notifications WHERE id = 'n1'")
      .get() as { title: string; type: string; transient: number; relatedActivityId: string | null }
    expect(legada.title).toBe("Aviso legado")
    expect(legada.type).toBe("system")
    expect(Number(legada.transient)).toBe(0) // default da 004, preservado
    expect(legada.relatedActivityId).toBeNull() // sem referência é NULL, não ""
    db.close()
  })

  it("SET NULL na prática: apagar a atividade deixa a notificação órfã, não a perde", () => {
    const db = dbBefore007()
    // Atividade nova, sem entrega nem transação: o único vínculo é a notificação,
    // então um CASCADE (ou um RESTRICT) apareceria aqui.
    createActivity(db, { id: "a-notif", teacherId: "u6", classId: "c1" })
    runMigrations(db)
    db.prepare(
      `INSERT INTO notifications (id, userId, title, message, type, read, transient, relatedActivityId, createdAt)
       VALUES ('n-da-atividade', 'u1', 'Correção solicitada', 'msg', 'activity_revision', 0, 0, 'a-notif', '01/09/2026')`,
    ).run()

    db.prepare("DELETE FROM activities WHERE id = 'a-notif'").run()

    const sobrou = db
      .prepare("SELECT title, relatedActivityId FROM notifications WHERE id = 'n-da-atividade'")
      .get() as { title: string; relatedActivityId: string | null } | undefined
    expect(sobrou, "a notificação não pode ser levada junto com a atividade").toBeDefined()
    expect(sobrou?.title).toBe("Correção solicitada")
    expect(sobrou?.relatedActivityId).toBeNull()
    db.close()
  })

  it("é idempotente: re-run não duplica coluna nem perde notificação", () => {
    const db = dbBefore007()
    runMigrations(db)
    db.prepare(
      `INSERT INTO notifications (id, userId, title, message, type, read, transient, relatedActivityId, createdAt)
       VALUES ('n-idempotente', 'u1', 'Nova atividade', 'msg', 'new_activity', 0, 0, 'a1', '02/09/2026')`,
    ).run()
    const antes = count(db, "notifications")

    // Registro de versão perdido (queda logo depois do COMMIT): a 007 roda de
    // novo e, sem a guarda de `hasColumn`, o SQLite lançaria "duplicate column
    // name" — e sem ela, a migração derrubaria o boot.
    db.prepare("DELETE FROM schema_migrations WHERE version = 7").run()
    runMigrations(db)

    expect(columns(db, "notifications").filter((c) => c === "relatedActivityId")).toHaveLength(1)
    expect(count(db, "notifications")).toBe(antes)
    expect(versions(db)).toEqual([1, 2, 3, 4, 5, 6, 7])
    // E o dado gravado na coluna continua lá (o guard não recria a tabela).
    const linha = db.prepare("SELECT relatedActivityId FROM notifications WHERE id = 'n-idempotente'").get() as {
      relatedActivityId: string | null
    }
    expect(linha.relatedActivityId).toBe("a1")
    db.close()
  })

  it("grava o nome da 007 em schema_migrations (o arquivo não é anônimo)", () => {
    const db = dbBefore007()
    runMigrations(db)
    const row = db.prepare("SELECT version, name FROM schema_migrations WHERE version = 7").get() as {
      version: number
      name: string
    }
    expect(Number(row.version)).toBe(7)
    expect(row.name).toBe("notification_related_activity")
    expect(row.name).toBe(migration007.name)
    db.close()
  })
})

describe("R16.1 — integridade referencial verificada depois de CADA migração", () => {
  it("órfão criado por uma migração nova (fora de REBUILD_SPECS) faz o runner lançar e não grava a versão", () => {
    const db = new DatabaseSync(":memory:")
    // Conexão com FKs desligadas (o runner NÃO força ON): é assim que um órfão
    // entra no banco durante uma migração — com a FK ligada o próprio SQLite
    // rejeita o INSERT, e por isso o check pós-migration continua necessário.
    db.exec("PRAGMA foreign_keys = OFF")
    const orfa: Migration = {
      version: 4,
      name: "sonda_orfa",
      run(d) {
        d.exec("CREATE TABLE sonda_fk (id TEXT PRIMARY KEY, parentId TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT)")
        d.exec("INSERT INTO sonda_fk (id, parentId) VALUES ('x', 'usuario-que-nao-existe')")
      },
    }

    let caught: unknown
    try {
      runMigrations(db, [migration001, migration002, migration003, orfa])
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(ForeignKeyViolationError)
    const err = caught as ForeignKeyViolationError
    expect(err.violations[0].table).toBe("sonda_fk")
    expect(err.message).toContain("4") // versão
    expect(err.message).toContain("sonda_orfa") // nome
    // A SONDA é a culpada: a mensagem acusa a delta, não o que já existia.
    expect(err.preExisting).toBe(false)
    expect(err.message).toContain("1 violação(ões) de integridade referencial")
    expect(err.message).not.toContain("PRÉ-DATAM")

    // A versão 4 não foi registrada e a tabela da sonda não sobrou (ROLLBACK).
    expect(versions(db)).toEqual([1, 2, 3])
    expect(tableExists(db, "sonda_fk")).toBe(false)
    expect(foreignKeysEnabled(db)).toBe(false) // estado original da conexão, restaurado
    db.close()
  })

  it("órfão inserido dentro da janela OFF (o padrão de um rebuild) também é pego", () => {
    const db = dbBefore004()
    const submissionsBefore = count(db, "submissions")
    let fkSeenInside = true
    const rebuildLike: Migration = {
      version: 5,
      name: "sonda_rebuild",
      needsForeignKeysOff: true,
      run(d) {
        fkSeenInside = foreignKeysEnabled(d)
        // Com as FKs desligadas o INSERT órfão passa: é exatamente o que a 002
        // fazia ao copiar as linhas sem olhar as referências.
        d.exec(
          `INSERT INTO submissions (id, activityId, studentId, submittedAt, status, evidence, comment, validatedBy, validatedAt, feedback)
           VALUES ('sub-orfa', 'atividade-inexistente', 'u1', '01/01/2026', 'submitted', '', '', NULL, NULL, '')`,
        )
      },
    }

    expect(() => runMigrations(db, [rebuildLike])).toThrow(ForeignKeyViolationError)
    expect(fkSeenInside).toBe(false) // a sonda rodou mesmo na janela OFF
    expect(versions(db)).toEqual([1, 2, 3]) // 5 não foi gravada
    expect(count(db, "submissions")).toBe(submissionsBefore) // a linha órfã foi desfeita
    expect(foreignKeysEnabled(db)).toBe(true)
    db.close()
  })

  it("linha íntegra passa: o guard não é um throw permanente", () => {
    const db = new DatabaseSync(":memory:")
    db.exec("PRAGMA foreign_keys = ON")
    const ok: Migration = {
      version: 2,
      name: "sonda_ok",
      run(d) {
        d.exec("CREATE TABLE sonda_ok (id TEXT PRIMARY KEY, parentId TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT)")
        d.exec(
          "INSERT INTO users (id, name, email, password, role, active, avatar, classIds, createdAt) VALUES ('u1','A','a@x','h','student',1,'','[]','now')",
        )
        d.exec("INSERT INTO sonda_ok (id, parentId) VALUES ('x', 'u1')")
      },
    }

    expect(() => runMigrations(db, [migration001, ok])).not.toThrow()
    expect(versions(db)).toEqual([1, 2])
    expect(db.prepare("PRAGMA foreign_key_check").all()).toHaveLength(0)
    db.close()
  })
})

describe("I-3 — órfão pré-existente não é atribuído à migration inocente", () => {
  /** Banco já em [1,2,3] com um órfão que NÃO foi criado por migration nenhuma. */
  function dbComOrfaoPreexistente(): DatabaseSync {
    const db = dbBefore004()
    // Entra com a FK desligada — o órfão passa e ninguém o detecta na hora.
    db.exec("PRAGMA foreign_keys = OFF")
    db.exec(
      `INSERT INTO redemptions (id, studentId, rewardId, rewardLabel, points, status, redeemedAt)
       VALUES ('rd-orfa', 'aluno-que-nao-existe', 'r1', 'Bônus', 50, 'pending', '01/01/2026')`,
    )
    db.exec("PRAGMA foreign_keys = ON")
    expect(db.prepare("PRAGMA foreign_key_check").all()).toHaveLength(1) // sujo ANTES de rodar a 004
    return db
  }

  it("bloqueia a 004, mas a mensagem diz que a violação PRÉ-DATA a migration", () => {
    const db = dbComOrfaoPreexistente()
    const redemptionsBefore = count(db, "redemptions") // seed V3 não tem resgate

    let caught: unknown
    try {
      runMigrations(db)
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(ForeignKeyViolationError)
    const err = caught as ForeignKeyViolationError
    expect(err.preExisting).toBe(true)
    // A contagem do que antecede a migration, com a migração nomeada.
    expect(err.violations).toHaveLength(1)
    expect(err.violations[0].table).toBe("redemptions")
    expect(err.message).toContain("4")
    expect(err.message).toContain("v3_features")
    expect(err.message).toContain("0 violação(ões) NOVAS")
    expect(err.message).toContain("1 violação(ões) de integridade referencial restantes PRÉ-DATAM esta migration")
    // E a mensagem NÃO pode acusar a 004 de ter criado o que ela não criou.
    expect(err.message).not.toContain("corrija os dados órfãos e rode de novo")

    // Falha alto do mesmo jeito: ROLLBACK, versão não gravada, órfão intacto.
    expect(versions(db)).toEqual([1, 2, 3])
    expect(columns(db, "activities")).not.toContain("lateWindowDays")
    expect(tableExists(db, "notices")).toBe(false)
    expect(count(db, "redemptions")).toBe(redemptionsBefore) // rd-orfa, que continua lá
    expect(foreignKeysEnabled(db)).toBe(true)

    // O operador limpa o órfão e a 004 aplica de verdade.
    db.prepare("DELETE FROM redemptions WHERE id = 'rd-orfa'").run()
    runMigrations(db)
    expect(versions(db)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(columns(db, "activities")).toContain("lateWindowDays")
    db.close()
  })

  it("a subtração separa o que é delta do que já estava lá", () => {
    const db = dbComOrfaoPreexistente()
    const antes = readForeignKeyViolations(db)
    expect(antes).toHaveLength(1)
    expect(subtractViolations(antes, antes)).toHaveLength(0) // delta vazia: nada é novo
    expect(subtractViolations(antes, [])).toHaveLength(1) // sem snapshot, tudo pareceria novo
    // Violação de outra tabela conta como delta, a de mesmo id/key não.
    const outra = [...antes, { table: "submissions", rowid: 7, parent: "activities", fkid: 0 }]
    expect(subtractViolations(outra, antes).map((v) => v.table)).toEqual(["submissions"])
    db.close()
  })
})

describe("R16.2 — a fila de migrações é validada antes de rodar", () => {
  it("rejeita versão duplicada sem rodar nem registrar nada", () => {
    const db = new DatabaseSync(":memory:")
    const seen: boolean[] = []
    expect(() => runMigrations(db, [probe(1, false, seen), probe(1, false, seen)])).toThrow(/versão 1 duplicada/)
    expect(seen).toEqual([]) // nem a primeira migração da fila rodou
    expect(tableExists(db, "schema_migrations")).toBe(false) // validação antes de qualquer escrita
    db.close()
  })

  it("rejeita fila fora de ordem crescente", () => {
    const db = new DatabaseSync(":memory:")
    const seen: boolean[] = []
    expect(() => runMigrations(db, [probe(2, false, seen), probe(1, false, seen)])).toThrow(/fora de ordem/)
    expect(seen).toEqual([])
    db.close()
  })

  it("rejeita versão não inteira (o schema_migrations.version é INTEGER PK)", () => {
    const db = new DatabaseSync(":memory:")
    const meia: Migration = { version: 1.5, name: "meia_versao", run() {} }
    expect(() => runMigrations(db, [meia])).toThrow(/não é um inteiro/)
    // A validação acontece antes de qualquer escrita — nem a tabela de controle
    // é criada, quanto mais a versão ser gravada.
    expect(tableExists(db, "schema_migrations")).toBe(false)
    db.close()
  })

  it("fila válida e crescente é aplicada normalmente (com a janela de FK por trecho)", () => {
    const db = new DatabaseSync(":memory:")
    db.exec("PRAGMA foreign_keys = ON")
    const seen: boolean[] = []
    runMigrations(db, [probe(1, false, seen), probe(2, true, seen), probe(3, false, seen)])
    expect(seen).toEqual([true, false, true])
    expect(versions(db)).toEqual([1, 2, 3])
    expect(foreignKeysEnabled(db)).toBe(true)
    db.close()
  })
})

describe("Auditoria paginada (Frente 5 — item C)", () => {
  let app: Express

  beforeAll(() => {
    const db = prepareDb()
    // A V3 não semeia auditoria: as linhas abaixo são o que a paginação e o
    // filtro por `action` precisam encontrar (4 aprovações + 2 outras ações).
    for (let i = 1; i <= 4; i++) {
      createAuditLog(db, {
        userId: "u6",
        action: "SUBMISSION_APPROVED",
        entity: "Submission",
        entityId: `fx-sub-pag-${i}`,
        description: `Entrega ${i} aprovada pelo fixture de paginação`,
      })
    }
    createAuditLog(db, { userId: "u1", action: "LOGIN", description: "Login do fixture" })
    createAuditLog(db, { userId: "u9", action: "POINTS_ADJUSTED", description: "Ajuste do fixture" })
    app = makeApp()
  })

  it("page/pageSize retorna { items, total, page, pageSize }", async () => {
    const coord = await loginAgent(app, USERS.juliana.email)
    const res = await coord.get("/api/audit?page=1&pageSize=3")
    expect(res.status).toBe(200)
    const data = res.body.data as { items: unknown[]; total: number; page: number; pageSize: number }
    expect(data.items).toHaveLength(3)
    expect(data.total).toBeGreaterThanOrEqual(6) // 4 aprovações + 2 outras, do fixture
    expect(data.page).toBe(1)
    expect(data.pageSize).toBe(3)
  })

  it("pageSize é limitado a 200 e page mínima é 1", async () => {
    const coord = await loginAgent(app, USERS.juliana.email)
    const res = await coord.get("/api/audit?page=0&pageSize=1000")
    expect(res.status).toBe(200)
    const data = res.body.data as { page: number; pageSize: number }
    expect(data.page).toBe(1)
    expect(data.pageSize).toBe(200)
  })

  it("sem page/pageSize mantém o formato legado (array)", async () => {
    const coord = await loginAgent(app, USERS.juliana.email)
    const res = await coord.get("/api/audit?action=SUBMISSION_APPROVED")
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  it("filtro combinado com paginação respeita action e total", async () => {
    const coord = await loginAgent(app, USERS.juliana.email)
    const res = await coord.get("/api/audit?action=SUBMISSION_APPROVED&page=1&pageSize=2")
    expect(res.status).toBe(200)
    const data = res.body.data as { items: Array<{ action: string }>; total: number; pageSize: number }
    expect(data.pageSize).toBe(2)
    expect(data.total).toBe(4) // fixture: 4 aprovações, e só elas
    expect(data.items).toHaveLength(2) // pageSize=2 corta a lista, o total não
    for (const item of data.items) expect(item.action).toBe("SUBMISSION_APPROVED")
  })

  it("não-coordenação continua recebendo 403 na rota paginada", async () => {
    const teacher = await loginAgent(app, USERS.marcelo.email)
    const res = await teacher.get("/api/audit?page=1&pageSize=10")
    expect(res.status).toBe(403)
  })
})