import { DatabaseSync } from "node:sqlite"
import { describe, it, expect, beforeEach } from "vitest"
import { runMigrations } from "../db/migrations"
import { runSeed } from "../db/seed"
import { count } from "./helpers"

/**
 * Banco novo, no mesmo caminho do boot: schema (fila completa de migrações)
 * e DEPOIS o seed. Nada de `prepareDb()` aqui de propósito — o arquivo precisa
 * provar o contrato do seed, não o estado de um banco compartilhado.
 */
function freshDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:")
  db.exec("PRAGMA foreign_keys = ON")
  runMigrations(db)
  runSeed(db)
  return db
}

describe("Seed da V3 — cadastro e zero histórico", () => {
  let db: DatabaseSync

  beforeEach(() => {
    db = freshDb()
  })

  it("não semeia nenhum histórico: entrega do bimestre começa do zero", () => {
    // RN04/RN05 continuam válidas, mas não há ponto, entrega ou registro de
    // auditoria de mentira no banco de demonstração: a escola cadastra o bimestre
    // real. Cobre também o resíduo de conquistas da feature removida na Task 1.2
    // (`ACHIEVEMENT_EARNED` na auditoria e o aviso "Nova conquista desbloqueada!
    // 🏅"), que um banco re-semeado não pode carregar.
    for (const table of [
      "activities",
      "submissions",
      "transactions",
      "redemptions",
      "notifications",
      "auditLogs",
      "studyContents",
    ]) {
      expect(count(db, table), `tabela ${table} deveria estar vazia`).toBe(0)
    }
  })

  it("não deixa anexo nem conclusão de reforço órfãos do histórico removido", () => {
    expect(count(db, "attachments")).toBe(0)
    expect(count(db, "study_content_completions")).toBe(0)
    expect(count(db, "sessions")).toBe(0)
  })

  it("o seed realmente rodou: cadastro e recompensas existem (contraste positivo)", () => {
    // Sem este bloco, o teste de zero acima passaria num banco vazio — e um banco
    // vazio não é o produto, é um seed quebrado. O zero só significa alguma coisa
    // ao lado de um cadastro presente.
    expect(count(db, "users")).toBeGreaterThan(0)
    expect(count(db, "classes")).toBeGreaterThan(0)
    expect(count(db, "subjects")).toBeGreaterThan(0)
    expect(count(db, "rewards")).toBeGreaterThan(0)
  })

  it("toda recompensa semeada é resgatável: as seis do catálogo, com estoque e preço", () => {
    // "Resgatável" é o que o aluno encontra na tela: recompensa com estoque > 0
    // e pontos > 0. Um catálogo em que nada dá para resgatar não é catálogo — por
    // isso os dois campos são conferidos, e não só a contagem das linhas.
    const rows = db.prepare("SELECT id, points, stock FROM rewards ORDER BY id").all() as Array<{
      id: string
      points: number
      stock: number
    }>
    expect(rows.map((r) => r.id)).toEqual(["r1", "r2", "r3", "r4", "r5", "r6"])
    for (const row of rows) {
      expect(Number(row.stock), `recompensa ${row.id} sem estoque`).toBeGreaterThan(0)
      expect(Number(row.points), `recompensa ${row.id} sem custo em pontos`).toBeGreaterThan(0)
    }
  })

  it("é idempotente: rodar duas vezes não duplica nem estoura", () => {
    const antes = {
      users: count(db, "users"),
      classes: count(db, "classes"),
      subjects: count(db, "subjects"),
      rewards: count(db, "rewards"),
    }

    runSeed(db)
    runSeed(db)

    expect(count(db, "users")).toBe(antes.users)
    expect(count(db, "classes")).toBe(antes.classes)
    expect(count(db, "subjects")).toBe(antes.subjects)
    expect(count(db, "rewards")).toBe(antes.rewards)
  })
})

describe("Seed da V3 — turmas do ensino médio técnico", () => {
  it("c1/c2/c3 são 1º, 2º e 3º ano A, nos turnos da manhã, tarde e noite", () => {
    const db = freshDb()
    const rows = db
      .prepare("SELECT id, name, course, year, shift, active, studentIds, teacherIds FROM classes ORDER BY id")
      .all() as Array<{
      id: string
      name: string
      course: string
      year: number
      shift: string
      active: number
      studentIds: string
      teacherIds: string
    }>

    expect(rows).toHaveLength(3)
    const c1 = rows.find((c) => c.id === "c1")
    const c2 = rows.find((c) => c.id === "c2")
    const c3 = rows.find((c) => c.id === "c3")
    expect(c1).toMatchObject({ name: "1º Ano A", year: 1, shift: "morning", active: 1 })
    expect(c2).toMatchObject({ name: "2º Ano A", year: 2, shift: "afternoon", active: 1 })
    expect(c3).toMatchObject({ name: "3º Ano A", year: 3, shift: "evening", active: 1 })
    for (const c of rows) expect(c.course).toBe("Técnico em Administração")
    db.close()
  })

  it("alunos e professores ficam distribuídos pelas turmas certainadas", () => {
    const db = freshDb()
    const studentIds = (classId: string): string[] => {
      const row = db.prepare("SELECT studentIds FROM classes WHERE id = ?").get(classId) as { studentIds: string }
      return JSON.parse(row.studentIds) as string[]
    }
    const teacherIds = (classId: string): string[] => {
      const row = db.prepare("SELECT teacherIds FROM classes WHERE id = ?").get(classId) as { teacherIds: string }
      return JSON.parse(row.teacherIds) as string[]
    }

    expect(studentIds("c1")).toEqual(["u1", "u2"])
    expect(studentIds("c2")).toEqual(["u3", "u4"])
    expect(studentIds("c3")).toEqual(["u5"])
    expect(teacherIds("c1")).toEqual(["u6"])
    expect(teacherIds("c2")).toEqual(["u6", "u7"])
    expect(teacherIds("c3")).toEqual(["u7"])
    db.close()
  })
})

describe("Seed da V3 — grade BNCC + disciplinas técnicas", () => {
  it("as 16 disciplinas do plano estão presentes, com nome, ícone, professor e turmas exatos", () => {
    const db = freshDb()
    const rows = db.prepare("SELECT id, name, icon, teacherIds, classIds FROM subjects ORDER BY id").all() as Array<{
      id: string
      name: string
      icon: string
      teacherIds: string
      classIds: string
    }>
    expect(rows).toHaveLength(16)

    const byId = new Map(rows.map((s) => [s.id, s]))
    // 12 da BNCC + 4 técnicas do curso: nome, emoji e professor de cada uma, do
    // jeito que o Step 2 do plano define. A grade é decisão de produto da V3 e
    // este é o único guard dela — por isso confere os pares exatos, e não
    // "algum emoji" / "um professor qualquer".
    const esperadas: Array<[string, string, string, string]> = [
      // [id, nome, ícone, professor]
      ["s1", "Língua Portuguesa", "📖", "u7"],
      ["s2", "Matemática", "➕", "u6"],
      ["s3", "Língua Inglesa", "🇬🇧", "u7"],
      ["s4", "Artes", "🎨", "u6"],
      ["s5", "Educação Física", "⚽", "u6"],
      ["s6", "Filosofia", "💭", "u7"],
      ["s7", "Sociologia", "🤝", "u6"],
      ["s8", "Biologia", "🧬", "u6"],
      ["s9", "Física", "⚛️", "u7"],
      ["s10", "Química", "🧪", "u6"],
      ["s11", "História", "🏛️", "u7"],
      ["s12", "Geografia", "🌍", "u6"],
      // Técnicas do curso Técnico em Administração.
      ["s13", "Administração Geral", "📊", "u6"],
      ["s14", "Contabilidade Básica", "🧾", "u6"],
      ["s15", "Matemática Financeira", "💰", "u6"],
      ["s16", "Direito Empresarial", "⚖️", "u7"],
    ]
    for (const [id, nome, icone, professor] of esperadas) {
      const subject = byId.get(id)
      expect(subject?.name, `nome da disciplina ${id}`).toBe(nome)
      expect(subject?.icon, `ícone da disciplina ${id}`).toBe(icone)
      expect(JSON.parse(subject?.teacherIds ?? "[]"), `professor da disciplina ${id}`).toEqual([professor])
    }
    // Toda disciplina do plano atende às três turmas.
    for (const subject of rows) {
      expect(JSON.parse(subject.classIds), `${subject.id} sem turma`).toEqual(["c1", "c2", "c3"])
    }
    db.close()
  })

  it("a grade fica dividida entre os dois professores, sem disciplina sem dono", () => {
    const db = freshDb()
    const rows = db
      .prepare("SELECT id, teacherIds FROM subjects ORDER BY id")
      .all() as Array<{ id: string; teacherIds: string }>
    // Ordem da grade (s1, s2, ... s16), não a lexicológica do `ORDER BY id`.
    const porProfessor = (id: string): string[] =>
      rows
        .filter((s) => (JSON.parse(s.teacherIds) as string[]).includes(id))
        .map((s) => s.id)
        .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))

    // u6 = Prof. Marcelo (matemática, ciências e as técnicas), u7 = Prof. Sandra
    // (humanas: línguas, filosofia, história, físico-química).
    expect(porProfessor("u6")).toEqual(["s2", "s4", "s5", "s7", "s8", "s10", "s12", "s13", "s14", "s15"])
    expect(porProfessor("u7")).toEqual(["s1", "s3", "s6", "s9", "s11", "s16"])
    // Nenhuma disciplina fica órfã: todo o plano tem professor.
    for (const s of rows) {
      expect((JSON.parse(s.teacherIds) as string[]).length, `${s.id} sem professor`).toBeGreaterThan(0)
    }
    db.close()
  })
})

describe("Seed da V3 — usuários demo", () => {
  it("cada demo recebe exatamente os classIds que o Step 4 do plano define", () => {
    const db = freshDb()
    const classIds = (id: string): string[] => {
      const row = db.prepare("SELECT classIds FROM users WHERE id = ?").get(id) as { classIds: string }
      return JSON.parse(row.classIds) as string[]
    }

    expect(classIds("u1")).toEqual(["c1"])
    expect(classIds("u2")).toEqual(["c1"])
    expect(classIds("u3")).toEqual(["c2"])
    expect(classIds("u4")).toEqual(["c2"])
    expect(classIds("u5")).toEqual(["c3"])
    // u6 fica com as TRÊS turmas, mesmo sendo `teacherIds` só de c1 e c2: é a
    // divergência C1 do plano (Step 1 × Step 4), travada aqui de propósito para
    // que a reconciliação futura — decisão de produto — quebre a suíte em vez de
    // passar despercebida. O outro lado está no teste de turmas acima, e os dois
    // consumidores que discordam sobre o vínculo estão nomeados em `seed.ts`.
    expect(classIds("u6")).toEqual(["c1", "c2", "c3"])
    expect(classIds("u7")).toEqual(["c2", "c3"])
    // Sem turma: não é aluno nem professor de sala.
    expect(classIds("u8")).toEqual([])
    expect(classIds("u9")).toEqual([])
    db.close()
  })

  it("os quatro papéis continuam representados e todos nascem ativos", () => {
    const db = freshDb()
    const roles = db
      .prepare("SELECT role, active, avatar FROM users ORDER BY id")
      .all() as Array<{ role: string; active: number; avatar: string }>

    expect(roles).toHaveLength(9)
    for (const role of ["student", "teacher", "staff", "coordinator"]) {
      expect(roles.filter((r) => r.role === role).length, `papel ${role}`).toBeGreaterThan(0)
    }
    for (const row of roles) {
      expect(Number(row.active), `usuário inativo: ${row.role}`).toBe(1)
      expect(row.avatar.length, `avatar vazio: ${row.role}`).toBeGreaterThan(0)
    }
    db.close()
  })

  it("a senha demo nunca é gravada em texto puro", () => {
    const db = freshDb()
    const rows = db.prepare("SELECT password FROM users").all() as Array<{ password: string }>
    for (const row of rows) {
      expect(row.password).not.toBe("123456")
      expect(row.password.startsWith("$2")).toBe(true) // bcrypt
    }
    db.close()
  })
})
