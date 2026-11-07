import { describe, it, expect, afterEach, vi } from "vitest"
import { nowBR, todayBR, startOfToday, brDateInDays } from "../lib/dates"

// Frente 2 (item 2.4) — datas sempre em America/Sao_Paulo, independentemente do
// TZ do servidor (um servidor em UTC não pode virar "hoje" à meia-noite UTC).
describe("Datas no fuso America/Sao_Paulo (Frente 2)", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  function setUtc(iso: string) {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(iso))
  }

  it("nowBR/todayBR seguem o relógio de São Paulo (UTC-3), não o do servidor", () => {
    setUtc("2026-08-22T03:30:00Z") // SP: 22/08 00:30
    expect(nowBR().startsWith("22/08/2026")).toBe(true)
    expect(todayBR()).toBe("22/08/2026")

    setUtc("2026-08-22T02:59:59Z") // SP: 21/08 23:59:59
    expect(nowBR().startsWith("21/08/2026")).toBe(true)
    expect(todayBR()).toBe("21/08/2026")
  })

  it("startOfToday retorna a meia-noite de São Paulo como instante exato", () => {
    setUtc("2026-08-22T03:00:00Z") // exatamente 00:00 em SP
    expect(startOfToday().toISOString()).toBe("2026-08-22T03:00:00.000Z")

    setUtc("2026-08-22T02:59:59.999Z") // 21/08 23:59:59.999 em SP
    expect(startOfToday().toISOString()).toBe("2026-08-21T03:00:00.000Z")

    setUtc("2026-08-22T13:00:00Z") // meio-dia em SP: hoje continua 22/08
    expect(startOfToday().toISOString()).toBe("2026-08-22T03:00:00.000Z")
  })

  it("brDateInDays conta o dia no fuso SP (não vira o dia à meia-noite UTC)", () => {
    setUtc("2026-08-23T02:00:00Z") // SP: 22/08 23:00
    expect(brDateInDays(0)).toBe("22/08/2026")
    expect(brDateInDays(1)).toBe("23/08/2026")

    setUtc("2026-08-23T03:30:00Z") // SP: 23/08 00:30 → já virou o dia em SP
    expect(brDateInDays(0)).toBe("23/08/2026")
  })
})