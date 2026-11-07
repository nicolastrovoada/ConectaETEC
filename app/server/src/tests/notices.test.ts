import { describe, it, expect, beforeEach } from "vitest"
import request from "supertest"
import type { Express } from "express"
import type { DatabaseSync } from "node:sqlite"
import { count, loginAgent, makeApp, prepareDb, USERS } from "./helpers"
import { hashPassword } from "../auth/password"
import { getDb } from "../db/connection"
import { insertNotificationsForUsers } from "../services/notifications"
import type { CoordinatorNoticePage, Notification, NotificationType } from "../shared/types"

/**
 * Avisos da coordenação (V3, Tarefa 3.5) — o quadro e a publicação.
 *
 * O que está travado aqui é a decisão 11 da V3: o aviso é uma ENTIDADE
 * persistente no quadro da coordenação e vira notificação PERSISTENTE
 * (`coord_notice`, `transient = 0`) para cada destinatário.
 *
 * O público é decidido no servidor, e o banco de demonstração fixa o cenário
 * (seed da V3, sem histórico): estudantes u1/u2 na c1, u3/u4 na c2, u5 na c3;
 * professores u6 (c1, c2, c3 pelo `classIds`) e u7 (c2, c3); funcionário u8 e
 * coordenação u9. Nenhum teste monta a lista de destinatários no client — o
 * client não participa dessa conta.
 *
 * Atenção ao seed: com `Class.studentIds/teacherIds` e `User.classIds` iguais no
 * seed, `roster ⊂ classIds` em toda turma, então o cenário do seed **não** isola
 * nenhuma das pernas da união de vínculos. O teste "cada vínculo da turma é
 *isolado por vez" move o `classIds` do usuário para isolar; é ele que impede as
 * pernas `studentIds`/`teacherIds` de virarem código morto.
 */

/** A sessão logada do supertest, com o cookie. */
type Agent = Awaited<ReturnType<typeof loginAgent>>

const app: Express = makeApp()

/**
 * Derruba de verdade a escrita de auditoria de aviso, com um TRIGGER do SQLite.
 *
 * A auditoria é a ÚLTIMA escrita de `createNotice`, então derrubá-la é a falha "no
 * meio" mais honesta que existe: quando ela estoura, o aviso e as notificações JÁ
 * foram inseridos dentro da transação, e só o ROLLBACK desfaz.
 *
 * É um trigger (e não um mock de `services/audit`) porque a suíte do server é
 * supertest sobre `node:sqlite` real e não usa mock — a exceção aprovada (R33) é
 * só de `tests/submission-window-eval.test.ts`. Aqui o `recordAudit` é o de
 * verdade, o INSERT é o de verdade, e o ABORT é o motor do banco recusando
 * escrever: é a mesma falha que o banco daria se a auditoria estivesse fora do
 * ar, e não uma exceção plantada em código de aplicação.
 *
 * O `WHEN NEW.action = 'NOTICE_CREATED'` limita o estrago ao aviso: o `LOGIN` do
 * supertest agent continua entrando, que é justamente por onde o teste mede o
 * "não mudou nada".
 */
function derrubaAuditoriaDeAviso(db: DatabaseSync): void {
  db.exec(`
    CREATE TRIGGER teste_notices_auditoria_off
    BEFORE INSERT ON auditLogs
    WHEN NEW.action = 'NOTICE_CREATED'
    BEGIN
      SELECT RAISE(ABORT, 'auditoria indisponível (trigger de teste)');
    END
  `)
}

/** O usuário da sessão (o `id` que identifica o destinatário da notificação). */
async function idDe(agent: Agent): Promise<string> {
  const res = await agent.get("/api/auth/me")
  expect(res.status).toBe(200)
  return res.body.data.id as string
}

/** Notificações de um usuário pela rota que o próprio usuário usa (RF10). */
async function notificacoesDe(agent: Agent): Promise<Notification[]> {
  const res = await agent.get("/api/notifications")
  expect(res.status).toBe(200)
  return res.body.data as Notification[]
}

/** Só os avisos da coordenação na lista de um usuário. */
async function avisosDe(agent: Agent): Promise<Notification[]> {
  const id = await idDe(agent)
  return (await notificacoesDe(agent)).filter((n) => n.type === "coord_notice" && n.userId === id)
}

/** Leitura direta do banco, para quando o teste é sobre a linha persistida. */
function avisosNoBanco(type: NotificationType = "coord_notice"): Array<{ userId: string; transient: number }> {
  return getDb()
    .prepare("SELECT userId, transient FROM notifications WHERE type = ? ORDER BY rowid")
    .all(type) as unknown as Array<{ userId: string; transient: number }>
}

beforeEach(() => {
  prepareDb()
})

describe("Avisos da coordenação — publicação e público (3.5)", () => {
  it("coordenação cria aviso para a turma c1 e os alunos recebem coord_notice", async () => {
    const coord = await loginAgent(app, USERS.juliana.email)

    const res = await coord.post("/api/notices").send({
      title: "Reunião de pais",
      message: "Sexta-feira, 19h, na biblioteca.",
      audienceType: "classes",
      classIds: ["c1"],
    })
    expect(res.status).toBe(201)
    expect(res.body.data.notice.title).toBe("Reunião de pais")
    expect(res.body.data.notice.audienceType).toBe("classes")
    expect(res.body.data.notice.classIds).toEqual(["c1"])

    const ana = await loginAgent(app, USERS.ana.email)
    const aviso = (await avisosDe(ana))[0]
    expect(aviso.type).toBe("coord_notice")
    expect(aviso.title).toBe("Reunião de pais")
    expect(aviso.message).toBe("Sexta-feira, 19h, na biblioteca.")
    // PERSISTENTE: é comunicação que fica até o aluno ler.
    expect(aviso.transient).toBe(false)
    expect(aviso.read).toBe(false)
    // Aviso institucional não é sobre atividade nenhuma.
    expect(aviso.relatedActivityId).toBeNull()
  })

  it("o aviso de turma chega a TODO o público da turma e a ninguém de fora", async () => {
    const coord = await loginAgent(app, USERS.juliana.email)
    await coord.post("/api/notices").send({
      title: "Feriado municipal",
      message: "Aula suspensa na sexta.",
      audienceType: "classes",
      classIds: ["c1"],
    })

    // c1: Ana, Mateus (alunos) e Marcelo (professor da turma).
    for (const user of [USERS.ana, USERS.mateus, USERS.marcelo]) {
      const agent = await loginAgent(app, user.email)
      expect((await avisosDe(agent)).length, `deveria avisar ${user.email}`).toBe(1)
    }
    // Quem é de outra turma NÃO recebe.
    for (const user of [USERS.beatriz, USERS.ricardo, USERS.fernanda, USERS.sandra]) {
      const agent = await loginAgent(app, user.email)
      expect((await avisosDe(agent)).length, `não deveria avisar ${user.email}`).toBe(0)
    }
    // Funcionário e coordenação também não: o aviso é comunicação escolar, e quem
    // publica não é público do próprio aviso.
    expect((await avisosDe(await loginAgent(app, USERS.carlos.email))).length).toBe(0)
    expect((await avisosDe(coord)).length).toBe(0)
  })

  it("público amplo avisa todo estudante e professor ativo, e ninguém inativo", async () => {
    const db = prepareDb()
    // Fernanda (u5) sai do ar ANTES do aviso: destinatário inativo não recebe.
    db.prepare("UPDATE users SET active = 0 WHERE id = ?").run(USERS.fernanda.id)

    const coord = await loginAgent(app, USERS.juliana.email)
    const res = await coord.post("/api/notices").send({
      title: "Conselho de classe",
      message: "Reunião dos professores na quarta.",
      audienceType: "all",
    })
    expect(res.status).toBe(201)
    // 5 estudantes + 2 professores do seed, menos a Fernanda desativada.
    expect(res.body.data.notifiedUserIds).toHaveLength(6)
    expect(res.body.data.notifiedUserIds).not.toContain(USERS.fernanda.id)

    for (const user of [USERS.ana, USERS.mateus, USERS.beatriz, USERS.ricardo, USERS.marcelo, USERS.sandra]) {
      expect((await avisosDe(await loginAgent(app, user.email))).length, user.email).toBe(1)
    }
    // E a inativa nem entra para conferir: RN01 responde 401 no login.
    const fernanda = await request(app)
      .post("/api/auth/login")
      .send({ email: USERS.fernanda.email, password: USERS.fernanda.password })
    expect(fernanda.status).toBe(401)
  })

  it("turma indicada alcança o professor pelo vínculo de turma e pelo classIds dele", async () => {
    const coord = await loginAgent(app, USERS.juliana.email)
    // Este é o cenário REAL do seed: c3 lista a Prof. Sandra em `teacherIds`, e o
    // Prof. Marcelo entra pelo `classIds` dele. A soma dos dois vínculos é a regra
    // porque o repositório já trata "atuante na turma" como OU em
    // `routes/activities.ts`, e escolher só um dos dois faria o aviso chegar a
    // alguém diferente de quem a criação de atividade considera da turma.
    //
    // O que este teste NÃO prova: no seed `roster ⊂ classIds` (a Sandra também
    // tem c3 no `classIds`, e o Marcelo não está no roster da c3), então as duas
    // pernas resolvem o mesmo público aqui. A perna do roster é isolada no teste
    // seguinte, que quebra essa redundância.
    const res = await coord.post("/api/notices").send({
      title: "Reunião de entrega",
      message: "Alunos do 3º ano, atenção.",
      audienceType: "classes",
      classIds: ["c3"],
    })
    expect(res.status).toBe(201)
    expect(res.body.data.notifiedUserIds.sort()).toEqual([USERS.fernanda.id, USERS.marcelo.id, USERS.sandra.id].sort())

    for (const user of [USERS.fernanda, USERS.sandra, USERS.marcelo]) {
      expect((await avisosDe(await loginAgent(app, user.email))).length, user.email).toBe(1)
    }
  })

  it("cada vínculo da turma é isolado por vez: roster e classIds, sem um cobrir o outro", async () => {
    const db = prepareDb()
    // No seed as duas fontes dizem a MESMA coisa, então apagar qualquer uma das
    // pernas da união (`Class.studentIds`, `Class.teacherIds`) deixa a suíte
    // verde e o código vira morto sem ninguém notar. Aqui cada pessoa é
    // alcançável por UM caminho só:
    //
    //  - Mateus (u2) sai do `classIds` e sobra no `studentIds` da c1;
    //  - Sandra (u7) sai do `classIds` da c3 e sobra no `teacherIds` da c3;
    //  - Ana (u1) e Marcelo (u6) mantêm o `classIds` e não estão no roster um do
    //    outro — só eles provam que o `classIds` ainda conta.
    db.prepare("UPDATE users SET classIds = ? WHERE id = ?").run("[]", USERS.mateus.id)
    db.prepare("UPDATE users SET classIds = ? WHERE id = ?").run('["c2"]', USERS.sandra.id)

    const coord = await loginAgent(app, USERS.juliana.email)
    const res = await coord.post("/api/notices").send({
      title: "Aviso que isola os vínculos",
      message: "Cada turma se alcança por um caminho só.",
      audienceType: "classes",
      classIds: ["c1", "c3"],
    })
    expect(res.status).toBe(201)
    expect(res.body.data.notifiedUserIds.sort()).toEqual(
      [USERS.ana.id, USERS.mateus.id, USERS.fernanda.id, USERS.marcelo.id, USERS.sandra.id].sort(),
    )

    // As asserções acima morrem se a perna correspondente for apagada: sem
    // `studentIds` cai o Mateus, sem `teacherIds` cai a Sandra, e sem o `classIds`
    // cai quem só tinha ele (Ana e Marcelo). E quem está fora das turmas fica fora.
    for (const user of [USERS.ana, USERS.mateus, USERS.fernanda, USERS.marcelo, USERS.sandra]) {
      expect((await avisosDe(await loginAgent(app, user.email))).length, user.email).toBe(1)
    }
    for (const user of [USERS.beatriz, USERS.ricardo, USERS.carlos, USERS.juliana]) {
      expect((await avisosDe(await loginAgent(app, user.email))).length, user.email).toBe(0)
    }
    expect(count(db, "notifications")).toBe(5)
  })

  it("classIds com audienceType 'all' é normalizado: o quadro diz 'toda a escola'", async () => {
    const db = prepareDb()
    const coord = await loginAgent(app, USERS.juliana.email)
    const res = await coord.post("/api/notices").send({
      title: "Semana de provas",
      message: "Atenção ao calendário.",
      audienceType: "all",
      classIds: ["c1"],
    })
    expect(res.status).toBe(201)
    // Gravar as turmas aqui mentiria no quadro: o aviso foi para a escola inteira.
    expect(res.body.data.notice.classIds).toEqual([])
    const row = db.prepare("SELECT classIds FROM notices WHERE id = ?").get(res.body.data.notice.id) as {
      classIds: string
    }
    expect(row.classIds).toBe("[]")
    // …e a notificação realmente foi para todo mundo, não só para a c1.
    expect(res.body.data.notifiedUserIds).toHaveLength(7)
  })

  it("classIds repetido é deduplicado: uma turma é UMA turma no quadro e na auditoria", async () => {
    const db = prepareDb()
    const coord = await loginAgent(app, USERS.juliana.email)

    // A mesma turma duas vezes no payload. Antes de normalizar, o `notices.classIds`
    // guardava `["c1","c1"]` e o quadro pintava "2 turma(s)" para uma turma só —
    // afirmação falsa ao usuário — e a auditoria dizia "para 2 turma(s)".
    const res = await coord.post("/api/notices").send({
      title: "Turma repetida",
      message: "A mesma turma veio duas vezes no payload.",
      audienceType: "classes",
      classIds: ["c1", "c1"],
    })
    expect(res.status).toBe(201)
    // No contrato e na linha guardada: uma turma, uma vez.
    expect(res.body.data.notice.classIds).toEqual(["c1"])
    const row = db.prepare("SELECT classIds FROM notices WHERE id = ?").get(res.body.data.notice.id) as {
      classIds: string
    }
    expect(row.classIds).toBe('["c1"]')
    // E a contagem que a tela e o log de auditoria mostraem.
    expect(res.body.data.notifiedUserIds).toHaveLength(3)

    const logs = (await coord.get("/api/audit?action=NOTICE_CREATED")).body.data as Array<{ description: string }>
    expect(logs[0].description).toContain("1 turma(s)")

    // Payload misto também normaliza ANTES de validar: a turma inválida repetida
    // aparece uma vez só no 422, e a repetida que é válida não aparece.
    const misto = await coord.post("/api/notices").send({
      title: "Repetida e inválida",
      message: "A mesma turma repetida, uma delas nem existe.",
      audienceType: "classes",
      classIds: ["c1", "c-fantasma", "c1", "c-fantasma"],
    })
    expect(misto.status).toBe(422)
    expect(misto.body.error).toContain("c-fantasma")
    expect(misto.body.error.split("c-fantasma").length - 1).toBe(1)
    expect(misto.body.error).not.toContain("c1,")
    // Nada gravado: nem o aviso do lote nem a notificação do público válido.
    expect(count(db, "notices")).toBe(1)
  })

  it("quem é alcançado por dois caminhos do mesmo aviso recebe UM coord_notice", async () => {
    const db = prepareDb()
    // A Beatriz passa a estar na c1 por DUAS fontes ao mesmo tempo: no roster
    // (`studentIds`) e pelo `classIds` da c2, num aviso que pede as duas turmas.
    // É o mesmo caminho duplo que o Prof. Marcelo tem no seed (c1 por
    // `teacherIds` + `classIds`).
    db.prepare("UPDATE classes SET studentIds = ? WHERE id = ?").run(
      JSON.stringify(["u1", "u2", "u3"]),
      "c1",
    )

    const coord = await loginAgent(app, USERS.juliana.email)
    const res = await coord.post("/api/notices").send({
      title: "Duas turmas no mesmo aviso",
      message: "Alunos de duas turmas, uma notificação cada.",
      audienceType: "classes",
      classIds: ["c1", "c2"],
    })
    expect(res.status).toBe(201)

    const notified = res.body.data.notifiedUserIds as string[]
    // A invariante: um destinatário, uma ocorrência na resposta…
    for (const user of [USERS.beatriz, USERS.marcelo, USERS.sandra]) {
      expect(notified.filter((id) => id === user.id).length, user.email).toBe(1)
    }
    // …e uma linha na tabela, que é o que o aluno veria duplicado na tela.
    expect(avisosNoBanco().filter((n) => n.userId === USERS.beatriz.id)).toHaveLength(1)
    // A união c1 ∪ c2 tem 6 pessoas (c1:{u1,u2,u3,u6} + c2:{u3,u4,u6,u7}): quem é
    // alcançado pelos DOIS caminhos entra uma vez só.
    expect(count(db, "notifications")).toBe(6)
  })

  it("a notificação continua na lista depois de lida (persistente, não transitória)", async () => {
    const coord = await loginAgent(app, USERS.juliana.email)
    await coord.post("/api/notices").send({
      title: "Prazo do PI",
      message: "Entrega até sexta.",
      audienceType: "classes",
      classIds: ["c1"],
    })

    const ana = await loginAgent(app, USERS.ana.email)
    const antes = await avisosDe(ana)
    expect(antes[0].transient).toBe(false)

    await ana.patch("/api/notifications/read")

    const depois = await avisosDe(ana)
    expect(depois.map((n) => n.id)).toContain(antes[0].id)
    expect(depois[0].read).toBe(true)
  })
})

describe("Avisos da coordenação — permissões (3.5)", () => {
  it("só a coordenação publica; aluno, professor e funcionário recebem 403 auditado", async () => {
    const db = prepareDb()
    const payload = { title: "Tentativa indevida", message: "Não deveria passar.", audienceType: "all" }

    for (const user of [USERS.ana, USERS.marcelo, USERS.carlos]) {
      const agent = await loginAgent(app, user.email)
      const res = await agent.post("/api/notices").send(payload)
      expect(res.status, `papel ${user.role}`).toBe(403)
    }

    // Recusado é recusado por inteiro: nenhum aviso, nenhuma notificação.
    expect(count(db, "notices")).toBe(0)
    expect(count(db, "notifications")).toBe(0)

    const coord = await loginAgent(app, USERS.juliana.email)
    const logs = (await coord.get("/api/audit?action=ACCESS_DENIED")).body.data as Array<{
      userId: string
      entity: string
      entityId: string
      description: string
    }>
    for (const user of [USERS.ana, USERS.marcelo, USERS.carlos]) {
      const denied = logs.find((l) => l.userId === user.id)
      expect(denied, `sem ACCESS_DENIED para o papel ${user.role}`).toBeDefined()
      expect(denied?.entity).toBe("Route")
      // A tentativa precisa dizer QUAL rota e QUE papel: `entityId` e a descrição
      // carregam o caminho real (`baseUrl + path`), não o "/" interno do router.
      expect(denied?.entityId).toBe("/api/notices/")
      expect(denied?.description).toContain("POST /api/notices/")
      expect(denied?.description).toContain(user.role)
    }
  })

  it("o quadro é exclusivo da coordenação: os demais papéis não listam avisos", async () => {
    const coord = await loginAgent(app, USERS.juliana.email)
    await coord.post("/api/notices").send({
      title: "Aviso interno",
      message: "Só a coordenação publica.",
      audienceType: "all",
    })

    for (const user of [USERS.ana, USERS.marcelo, USERS.carlos]) {
      const res = await loginAgent(app, user.email).then((agent) => agent.get("/api/notices"))
      expect(res.status, `papel ${user.role}`).toBe(403)
    }

    // O aluno recebe o aviso pela rota que já é escopada por `userId`.
    const ana = await loginAgent(app, USERS.ana.email)
    expect((await avisosDe(ana)).length).toBe(1)
  })

  it("sem sessão: 401 na leitura e na publicação", async () => {
    expect((await request(app).get("/api/notices")).status).toBe(401)
    const post = await request(app)
      .post("/api/notices")
      .send({ title: "Sem sessão", message: "Nem chega a ler.", audienceType: "all" })
    expect(post.status).toBe(401)
  })
})

describe("Avisos da coordenação — payload (3.5)", () => {
  it("título e mensagem vazios são recusados com mensagem pt-BR", async () => {
    const db = prepareDb()
    const coord = await loginAgent(app, USERS.juliana.email)

    const semTitulo = await coord
      .post("/api/notices")
      .send({ title: "   ", message: "Mensagem válida.", audienceType: "all" })
    expect(semTitulo.status).toBe(400)
    expect(JSON.stringify(semTitulo.body)).toContain("título")

    const semMensagem = await coord
      .post("/api/notices")
      .send({ title: "Título válido", message: "", audienceType: "all" })
    expect(semMensagem.status).toBe(400)
    expect(JSON.stringify(semMensagem.body)).toContain("mensagem")

    expect(count(db, "notices")).toBe(0)
  })

  it("público inválido e 'classes' sem turma são 400 (payload incompleto)", async () => {
    const db = prepareDb()
    const coord = await loginAgent(app, USERS.juliana.email)

    const alvoInvalido = await coord
      .post("/api/notices")
      .send({ title: "Público inválido", message: "Ninguém sabe quem recebe.", audienceType: "todos" })
    expect(alvoInvalido.status).toBe(400)

    const semTurma = await coord
      .post("/api/notices")
      .send({ title: "Sem turma", message: "Escolhi turmas e não escolhi nenhuma.", audienceType: "classes" })
    expect(semTurma.status).toBe(400)
    expect(JSON.stringify(semTurma.body)).toContain("turma")

    expect(count(db, "notices")).toBe(0)
    expect(count(db, "notifications")).toBe(0)
  })

  it("turma inexistente ou inativa é 422 listando os ids, e não grava nada", async () => {
    const db = prepareDb()
    const coord = await loginAgent(app, USERS.juliana.email)

    const res = await coord.post("/api/notices").send({
      title: "Aviso com turma inválida",
      message: "Uma turma do lote não existe.",
      audienceType: "classes",
      classIds: ["c1", "c-fantasma"],
    })
    expect(res.status).toBe(422)
    expect(res.body.error).toContain("c-fantasma")
    expect(res.body.details).toBe("CLASSES_NOT_FOUND")
    // A turma que EXISTE não salva o lote: avisar a c1 e falhar na outra deixaria
    // metade do público avisado sem nenhum registro do aviso.
    expect(count(db, "notices")).toBe(0)
    expect(count(db, "notifications")).toBe(0)
  })

  it("turma inativa é 422 do mesmo jeito que turma inexistente", async () => {
    const db: DatabaseSync = prepareDb()
    db.prepare("UPDATE classes SET active = 0 WHERE id = 'c1'").run()
    const coord = await loginAgent(app, USERS.juliana.email)

    const res = await coord.post("/api/notices").send({
      title: "Aviso para turma fora do ar",
      message: "Turma desativada.",
      audienceType: "classes",
      classIds: ["c1"],
    })
    expect(res.status).toBe(422)
    expect(res.body.error).toContain("c1")
    expect(count(db, "notices")).toBe(0)
  })
})

describe("Avisos da coordenação — quadro (3.5)", () => {
  it("lista o mais recente primeiro, com autor e data/hora", async () => {
    const coord = await loginAgent(app, USERS.juliana.email)
    for (const titulo of ["Primeiro aviso", "Segundo aviso", "Terceiro aviso"]) {
      await coord.post("/api/notices").send({ title: titulo, message: `Mensagem do ${titulo}.`, audienceType: "all" })
    }

    const res = await coord.get("/api/notices")
    expect(res.status).toBe(200)
    const page = res.body.data as CoordinatorNoticePage
    expect(page.total).toBe(3)
    expect(page.page).toBe(1)
    expect(page.items.map((n) => n.title)).toEqual(["Terceiro aviso", "Segundo aviso", "Primeiro aviso"])
    expect(page.items[0].createdBy).toBe(USERS.juliana.id)
    expect(page.items[0].createdByName).toBe("Juliana Santos")
    // `createdAt` em pt-BR com segundos: o quadro precisa dizer a HORA do aviso.
    expect(page.items[0].createdAt).toMatch(/^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}:\d{2}$/)
  })

  it("paginação é do servidor: page/pageSize recortam sem repetir nem pular", async () => {
    const coord = await loginAgent(app, USERS.juliana.email)
    for (let i = 1; i <= 3; i += 1) {
      await coord.post("/api/notices").send({ title: `Aviso ${i}`, message: `Mensagem ${i}.`, audienceType: "all" })
    }

    const primeira = (await coord.get("/api/notices?page=1&pageSize=2")).body.data as CoordinatorNoticePage
    const segunda = (await coord.get("/api/notices?page=2&pageSize=2")).body.data as CoordinatorNoticePage

    expect(primeira.total).toBe(3)
    expect(primeira.pageSize).toBe(2)
    expect(primeira.items.map((n) => n.title)).toEqual(["Aviso 3", "Aviso 2"])
    expect(segunda.items.map((n) => n.title)).toEqual(["Aviso 1"])
    expect(new Set([...primeira.items, ...segunda.items].map((n) => n.id)).size).toBe(3)
  })

  it("página fora do formato não derruba a rota: vira a primeira página", async () => {
    const coord = await loginAgent(app, USERS.juliana.email)
    await coord.post("/api/notices").send({ title: "Aviso do quadro", message: "Mensagem.", audienceType: "all" })

    // Query string é entrada do usuário: `page=abc` chega como `NaN` depois de
    // `Number()`, e um `NaN` no `OFFSET` do SQLite é erro de tipo no bind — a
    // rota responderia 500 por causa de um `?page=` mal digitado.
    for (const query of ["?page=abc", "?pageSize=abc", "?page=", "?pageSize=", "?page=NaN"]) {
      const res = await coord.get(`/api/notices${query}`)
      expect(res.status, query).toBe(200)
      const page = res.body.data as CoordinatorNoticePage
      expect(page.items.map((n) => n.title), query).toEqual(["Aviso do quadro"])
      expect(page.page, query).toBe(1)
    }

    // E o teto de `pageSize` continua valendo para valor válido e grande demais.
    const larga = (await coord.get("/api/notices?pageSize=1000")).body.data as CoordinatorNoticePage
    expect(larga.pageSize).toBe(100)
  })

  it("quadro vazio responde lista vazia com total 0 (não erro)", async () => {
    const coord = await loginAgent(app, USERS.juliana.email)
    const res = await coord.get("/api/notices")
    expect(res.status).toBe(200)
    const page = res.body.data as CoordinatorNoticePage
    expect(page.items).toEqual([])
    expect(page.total).toBe(0)
  })

  it("aviso de autor desativado continua no quadro, sem o nome do autor", async () => {
    const db = prepareDb()
    // A coordenação publica e depois sai do ar: o registro da comunicação tem de
    // continuar legível (é o histórico da coordenação), só sem o nome.
    db.prepare(
      "INSERT INTO users (id, name, email, password, role, active, avatar, classIds, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "u-coord",
      "Coord. de Passageiro",
      "passageiro@etec.sp.gov.br",
      hashPassword("123456"),
      "coordinator",
      1,
      "C",
      "[]",
      "01/08/2026",
    )
    await loginAgent(app, "passageiro@etec.sp.gov.br")
      .then((agent) =>
        agent
          .post("/api/notices")
          .send({ title: "Aviso de quem saiu", message: "O autor é desativado depois.", audienceType: "all" }),
      )
      .then((res) => expect(res.status).toBe(201))
    db.prepare("UPDATE users SET active = 0 WHERE id = 'u-coord'").run()

    // A sessão morre com a conta desativada (RN01 vale na sessão), então o quadro
    // é lido por outra coordenação.
    const page = (await loginAgent(app, USERS.juliana.email).then((c) => c.get("/api/notices"))).body
      .data as CoordinatorNoticePage
    const aviso = page.items.find((n) => n.title === "Aviso de quem saiu")
    expect(aviso).toBeDefined()
    expect(aviso?.createdBy).toBe("u-coord")
    // O filtro `u.active = 1` fica no `ON` do join: o aviso desapareceria do
    // quadro se o filtro estivesse no `WHERE`, sumindo junto com o registro.
    expect(aviso?.createdByName).toBeNull()
  })
})

describe("Avisos da coordenação — auditoria e atomicidade (RN06)", () => {
  it("publicar grava NOTICE_CREATED com o alvo e quantos foram notificados", async () => {
    const coord = await loginAgent(app, USERS.juliana.email)
    await coord.post("/api/notices").send({
      title: "Aviso auditado",
      message: "A auditoria precisa dizer quem e para quem.",
      audienceType: "classes",
      classIds: ["c1"],
    })

    const logs = (await coord.get("/api/audit?action=NOTICE_CREATED")).body.data as Array<{
      userId: string
      entity: string
      entityId: string
      description: string
    }>
    expect(logs).toHaveLength(1)
    expect(logs[0].userId).toBe(USERS.juliana.id)
    expect(logs[0].entity).toBe("Notice")
    expect(logs[0].entityId).not.toBe("")
    expect(logs[0].description).toContain("Aviso auditado")
    // O alvo e a contagem de destinatários: sem eles a auditoria não conta a história.
    expect(logs[0].description).toContain("1 turma(s)")
    expect(logs[0].description).toContain("3 notificação(ões)")
  })

  it("falha no meio não deixa aviso sem notificação nem notificação sem aviso", async () => {
    const db = prepareDb()
    const coord = await loginAgent(app, USERS.juliana.email)
    // O login da coordenação já auditou (LOGIN): a comparação é com o que existe
    // ANTES do POST, senão a linha do login mascara o que a transação deixou.
    const auditoriaAntes = count(db, "auditLogs")
    derrubaAuditoriaDeAviso(db)

    const res = await coord.post("/api/notices").send({
      title: "Aviso transacional",
      message: "A auditoria cai no meio.",
      audienceType: "classes",
      classIds: ["c1"],
    })
    expect(res.status).toBe(500)
    // As três escritas são uma só: aviso + 3 notificações + auditoria, ou nada.
    expect(count(db, "notices")).toBe(0)
    expect(count(db, "notifications")).toBe(0)
    expect(count(db, "auditLogs")).toBe(auditoriaAntes)

    // E o banco segue utilizável depois do rollback (o próximo POST passa).
    db.exec("DROP TRIGGER teste_notices_auditoria_off")
    const depois = await coord
      .post("/api/notices")
      .send({ title: "Aviso transacional", message: "Agora a auditoria responde.", audienceType: "classes", classIds: ["c1"] })
    expect(depois.status).toBe(201)
    expect(count(db, "notices")).toBe(1)
  })

  it("ler o aviso não apaga o quadro: o aviso é registro, a notificação é efeito", async () => {
    const coord = await loginAgent(app, USERS.juliana.email)
    const criado = await coord
      .post("/api/notices")
      .send({ title: "Quadro permanente", message: "O quadro não é a lista de notificações.", audienceType: "classes", classIds: ["c1"] })
    const noticeId = criado.body.data.notice.id as string

    const ana = await loginAgent(app, USERS.ana.email)
    await ana.patch("/api/notifications/read")

    const page = (await coord.get("/api/notices")).body.data as CoordinatorNoticePage
    expect(page.items.map((n) => n.id)).toContain(noticeId)
  })
})

describe("Avisos da coordenação — helper de notificação em lote (3.5)", () => {
  it("insertNotificationsForUsers deriva transient do tipo e dá uma linha por destinatário", () => {
    prepareDb()
    const criadas = insertNotificationsForUsers(["u1", "u2"], {
      title: "Em lote",
      message: "Um insert por destinatário.",
      type: "coord_notice",
    })

    expect(criadas.map((n) => n.userId).sort()).toEqual(["u1", "u2"])
    // A derivação continua vindo do `type`: nenhum call site passa `transient`.
    expect(criadas.every((n) => n.transient === false)).toBe(true)
    // Cada destinatário tem a SUA linha (e o seu estado de leitura).
    expect(new Set(criadas.map((n) => n.id)).size).toBe(2)
    // E na coluna: `transient = 0` no banco, que é como o brief descreve a
    // persistência do aviso (a afirmação acima vem do objeto em memória).
    expect(avisosNoBanco()).toEqual([
      { userId: "u1", transient: 0 },
      { userId: "u2", transient: 0 },
    ])
  })
})
