import { describe, it, expect, beforeAll, vi } from "vitest"
import { makeApp, prepareDb, loginAgent, USERS } from "./helpers"
import { getDb } from "../db/connection"
import {
  brDateInDays as brDateSP,
  isLateWindowOpen,
  type LateWindowActivity,
} from "../lib/dates"
import type { Express } from "express"

/**
 * V3 Fase 2 (2.2) — fix round 1 · a janela de atraso é avaliada UMA vez.
 *
 * O veredito da janela é decidido no guard, antes do multer, e viaja até a
 * escrita. Se o serviço reavaliasse `isLateWindowOpen` depois do upload, uma
 * virada do dia de São Paulo no meio desses bytes fecharia a janela e gravaria
 * `delayed = 0` numa entrega já aceita — ou seja, a aprovação creditaria a
 * pontuação INTEGRAL de uma entrega feita fora da janela.
 *
 * O "dia virou" é simulado no ponto exato onde aconteceria: da segunda leitura
 * de `isLateWindowOpen` em diante, a janela responde fechada. Fazer o relógio
 * andar de verdade durante o upload exigiria depender da duração da requisição
 * (dado de teste, não teste de regra); o spy conta as avaliações e arma a
 * virada, então o teste é determinístico e morre se a segunda avaliação voltar.
 */
vi.mock("../lib/dates", async (importOriginal) => {
  const real = await importOriginal<typeof import("../lib/dates")>()
  return { ...real, isLateWindowOpen: vi.fn(real.isLateWindowOpen) }
})

const janela = vi.mocked(isLateWindowOpen)
/** A implementação real, para o spy não duplicar (e não falsear) a regra. */
const JANELA_REAL = janela.getMockImplementation() as (
  activity: LateWindowActivity,
) => boolean

describe("Fase 2 (2.2) · a janela de atraso é avaliada uma vez por requisição", () => {
  let app: Express

  beforeAll(() => {
    prepareDb()
    app = makeApp()
  })

  it("virada de dia durante o upload não promove a entrega a pontuação integral", async () => {
    // Atividade no ÚLTIMO dia da janela (prazo -7, tolerância 7) e 15 pontos:
    // com o dia virado, a janela fecha e a reavaliação gravaria `delayed = 0`.
    const marcelo = await loginAgent(app, USERS.marcelo.email)
    const created = await marcelo.post("/api/activities").send({
      title: "Ensaio no último dia da janela",
      subjectId: "s1",
      classId: "c1",
      points: 15,
      deadline: brDateSP(5),
      type: "academic",
      status: "active",
      lateWindowDays: 7,
    })
    expect(created.status).toBe(201)
    const activityId = (created.body.data as { id: string }).id
    // A rota recusa prazo no passado; para exercitar o último dia da janela o
    // prazo é movido direto no banco (mesmo truque dos demais testes de janela).
    getDb()
      .prepare("UPDATE activities SET deadline = ? WHERE id = ?")
      .run(brDateSP(-7), activityId)

    let avaliacoes = 0
    janela.mockImplementation((activity) => {
      avaliacoes += 1
      // 1ª leitura: o guard, com a janela aberta. Da 2ª em diante o dia de São
      // Paulo já virou — é o que a reavaliação encontraria.
      return avaliacoes === 1 ? JANELA_REAL(activity) : false
    })

    const mateus = await loginAgent(app, USERS.mateus.email)
    const balanceBefore = (await mateus.get(`/api/users/${USERS.mateus.id}/points`)).body.data
      .balance as number

    const sent = await mateus
      .post(`/api/activities/${activityId}/submissions`)
      .field("comment", "Ensaio entregue no último dia da janela")
    expect(sent.status, "a janela estava aberta no guard").toBe(201)
    expect(janela, "janela avaliada UMA vez (no guard, antes do upload)").toHaveBeenCalledTimes(1)
    expect(sent.body.data.delayed, "entrega aceita na janela continua atrasada").toBe(true)
    const submissionId = (sent.body.data as { id: string }).id

    // Prova de que a armadilha está armada: uma segunda leitura agora cai no dia
    // seguinte. Se a virada não tivesse sido simulada, o teste passaria à toa.
    expect(janela({ deadline: "16/09/2026", lateWindowDays: 7 })).toBe(false)

    const approved = await marcelo
      .post(`/api/submissions/${submissionId}/validate`)
      .send({ action: "approve", feedback: "Aprovada com atraso." })
    expect(approved.status).toBe(200)

    const transactions = (await mateus.get("/api/transactions")).body.data as Array<{
      amount: number
      relatedActivityId: string | null
    }>
    const credit = transactions.find((t) => t.relatedActivityId === activityId)
    expect(credit?.amount, "15 pts de atividade → 8 creditados (não 15)").toBe(8)
    const after = (await mateus.get(`/api/users/${USERS.mateus.id}/points`)).body.data
      .balance as number
    expect(after).toBe(balanceBefore + 8)
  })
})
