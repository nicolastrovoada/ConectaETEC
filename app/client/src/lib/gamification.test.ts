// Testes dos helpers de gamificação compartilhados (app/shared/types.ts).
// Importados via alias @shared — apenas testes, NÃO altera o fonte compartilhado.
import { describe, it, expect } from "vitest"
import {
  getBalance,
  levelLabel,
  nextLevelPts,
  missingForNextLevel,
  nextLevelGoal,
  levelProgress,
  STREAK_MILESTONES,
  nextStreakMilestone,
} from "@shared/types"
import type { PointsTransaction } from "@shared/types"

function tx(partial: Partial<PointsTransaction> & { studentId: string; amount: number }): PointsTransaction {
  return {
    id: partial.id ?? "tx-test",
    studentId: partial.studentId,
    amount: partial.amount,
    type: partial.type ?? "activity",
    description: partial.description ?? "",
    relatedActivityId: partial.relatedActivityId ?? null,
    createdBy: partial.createdBy ?? "u1",
    createdAt: partial.createdAt ?? "01/08/2026 08:00",
  }
}

describe("getBalance — saldo nunca negativo (RN04/RN07)", () => {
  it("sem transações → 0", () => {
    expect(getBalance("u1", [])).toBe(0)
  })

  it("soma apenas as transações do aluno", () => {
    const txs = [
      tx({ studentId: "u1", amount: 100 }),
      tx({ studentId: "u2", amount: 999 }), // de outro aluno é ignorado
      tx({ studentId: "u1", amount: 50 }),
    ]
    expect(getBalance("u1", txs)).toBe(150)
  })

  it("saldo positivo com créditos e débitos", () => {
    const txs = [
      tx({ studentId: "u1", amount: 200 }),
      tx({ studentId: "u1", amount: -50, type: "reward_redemption" }),
      tx({ studentId: "u1", amount: 30 }),
    ]
    expect(getBalance("u1", txs)).toBe(180)
  })

  it("soma negativa é limitada a 0 (clamp)", () => {
    const txs = [
      tx({ studentId: "u1", amount: -50 }),
      tx({ studentId: "u1", amount: -10 }),
    ]
    expect(getBalance("u1", txs)).toBe(0)
  })

  it("soma exatamente zero → 0", () => {
    const txs = [tx({ studentId: "u1", amount: 100 }), tx({ studentId: "u1", amount: -100 })]
    expect(getBalance("u1", txs)).toBe(0)
  })
})

describe("levelLabel — faixas de nível (limites inclusivos)", () => {
  it.each([
    [0, "🥉 Bronze"],
    [99, "🥉 Bronze"],
    [100, "🥈 Prata"],
    [299, "🥈 Prata"],
    [300, "🥇 Ouro"],
    [499, "🥇 Ouro"],
    [500, "🥇 Diamante"],
    [799, "🥇 Diamante"],
    [800, "🥇 Diamante"],
    [12345, "🥇 Diamante"],
  ])("para %i pts → %s", (pts, label) => {
    expect(levelLabel(pts)).toBe(label)
  })
})

describe("nextLevelPts — pontos para o próximo nível", () => {
  it.each([
    [0, 100],
    [99, 100],
    [100, 300],
    [299, 300],
    [300, 500],
    [499, 500],
    [500, 800],
    [799, 800],
    [800, 800],
  ])("para %i pts → próximo nível em %i", (pts, next) => {
    expect(nextLevelPts(pts)).toBe(next)
  })
})

describe("missingForNextLevel — faltantes para o próximo nível REAL (2.6)", () => {
  it.each([
    [0, 100],
    [99, 1],
    [100, 200],
    [299, 1],
    [300, 200],
    [499, 1],
    [500, null], // Diamante é o topo — não há próximo nível
    [799, null],
    [800, null],
    [12345, null],
  ])("com %i pts → %s", (pts, expected) => {
    expect(missingForNextLevel(pts)).toBe(expected)
  })
})

describe("nextLevelGoal — meta única para exibição (2.6)", () => {
  it.each([
    [0, { next: 100, missing: 100, kind: "level" }],
    [150, { next: 300, missing: 150, kind: "level" }],
    [499, { next: 500, missing: 1, kind: "level" }],
    [500, { next: 800, missing: 300, kind: "milestone" }],
    [799, { next: 800, missing: 1, kind: "milestone" }],
    [800, { next: 800, missing: null, kind: "max" }],
    [900, { next: 800, missing: null, kind: "max" }],
  ])("com %i pts → %o", (pts, expected) => {
    expect(nextLevelGoal(pts)).toEqual(expected)
  })
})

describe("levelProgress — % dentro da faixa com limiares oficiais (2.6)", () => {
  it.each([
    [0, 0],
    [50, 50],
    [99, 99],
    [100, 0],
    [299, 100],
    [300, 0],
    [499, 100],
    [500, 0],
    [550, 17],
    [700, 67],
    [800, 100],
    [900, 100],
  ])("com %i pts → %i%", (pts, expected) => {
    expect(levelProgress(pts)).toBe(expected)
  })
})

describe("STREAK_MILESTONES e nextStreakMilestone — marcos da sequência (2.1)", () => {
  it("tabela canônica (fonte única no shared)", () => {
    expect(STREAK_MILESTONES).toEqual([
      { days: 3, bonus: 10 },
      { days: 7, bonus: 20 },
      { days: 12, bonus: 40 },
      { days: 20, bonus: 80 },
    ])
  })

  it.each([
    [0, { days: 3, bonus: 10 }],
    [1, { days: 3, bonus: 10 }],
    [3, { days: 7, bonus: 20 }],
    [7, { days: 12, bonus: 40 }],
    [11, { days: 12, bonus: 40 }],
    [19, { days: 20, bonus: 80 }],
    [20, null], // todos os marcos atingidos → sem próximo
    [30, null],
  ])("sequência %i → próximo marco %o", (streak, expected) => {
    expect(nextStreakMilestone(streak)).toEqual(expected)
  })
})
