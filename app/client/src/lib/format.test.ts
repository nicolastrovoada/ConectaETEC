// Testes dos utilitários de formatação pt-BR (client/src/lib/format.ts).
import { describe, it, expect, afterEach, vi } from "vitest"
import {
  parseBrDateTime,
  formatBrDateTime,
  formatBrDate,
  formatBytes,
  formatNumber,
  formatMonthLabel,
  daysUntil,
  isValidBrDate,
  brDayKey,
} from "./format"

describe("parseBrDateTime", () => {
  it('parse "DD/MM/AAAA HH:MM"', () => {
    const d = parseBrDateTime("08/08/2026 09:10")
    expect(d?.getFullYear()).toBe(2026)
    expect(d?.getMonth()).toBe(7) // agosto (0-indexado)
    expect(d?.getDate()).toBe(8)
    expect(d?.getHours()).toBe(9)
    expect(d?.getMinutes()).toBe(10)
  })

  it("aceita variantes com 'T', vírgula sem espaço e sem hora", () => {
    expect(parseBrDateTime("08/08/2026T09:10")?.getHours()).toBe(9)
    expect(parseBrDateTime("08/08/2026,22:05")?.getMinutes()).toBe(5)
    expect(parseBrDateTime("08/08/2026")?.getHours()).toBe(0)
    expect(parseBrDateTime("08/08/2026")?.getMinutes()).toBe(0)
  })

  // ACHADO QA-2026-01: "08/08/2026, 22:05" (vírgula + espaço, formato que
  // toLocaleString pt-BR produz) era parseado sem a hora. O formato continua
  // aceito e coberto logo abaixo; a correção do descarte da hora entrou na 2.6.
  it("retorna null para entradas não compatíveis", () => {
    expect(parseBrDateTime("")).toBeNull()
    expect(parseBrDateTime("abc")).toBeNull()
    expect(parseBrDateTime("2026-08-08")).toBeNull()
    expect(parseBrDateTime("08/08/26")).toBeNull()
  })

  // V3/2.6 (lixeira da coordenação): o `nowBR()` do servidor grava
  // "DD/MM/AAAA, HH:MM:SS" e é o formato de `deletedAt`/`submittedAt`/
  // `timestamp`. Sem aceitar a vírgula seguida de espaço, a HORA era
  // descartada em silêncio e a lixeira mostrava "28/09/2026, 00:00" para uma
  // exclusão feita às 10:00 — data certa, hora errada, sem nenhum aviso.
  it("parse o formato do servidor (DD/MM/AAAA, HH:MM:SS) sem perder a hora", () => {
    const d = parseBrDateTime("28/09/2026, 10:00:00")
    expect(d?.getDate()).toBe(28)
    expect(d?.getMonth()).toBe(8)
    expect(d?.getFullYear()).toBe(2026)
    expect(d?.getHours()).toBe(10)
    expect(d?.getMinutes()).toBe(0)
  })

  it("formatBrDateTime devolve a hora do formato do servidor", () => {
    // O separador entre data e hora varia com a ICU do host (" " ou ", ").
    expect(formatBrDateTime("28/09/2026, 10:00:00")).toMatch(/^28\/09\/2026[,\s]*10:00$/)
  })

  // ACHADO QA-2026-02: datas com mês/dia fora do intervalo NÃO viram null
  // (Date rola: 31/02 → 03/03; 13/08 → 01/2027 no componente de hora/dia).
  // Comportamento atual abaixo; correção é responsabilidade do web-debugger.
  it("comportamento atual: overflow de mês/dia não é rejeitado (bug conhecido)", () => {
    const rolledFeb = parseBrDateTime("31/02/2026")
    expect(rolledFeb?.getMonth()).toBe(2) // virou 3 de março
    const rolledMonth = parseBrDateTime("08/13/2026")
    expect(rolledMonth?.getFullYear()).toBe(2027) // 13º mês rola para janeiro
  })
})

describe("formatBrDateTime", () => {
  // O separador data/hora varia com a ICU do host (" " ou ", "). Para não
  // depender da ICU, normalizamos antes do re-parse.
  // ACHADO QA-2026-03: o round-trip só fechava depois de normalizar porque o
  // parser não aceitava a vírgula seguida de espaço da ICU; a 2.6 fechou essa
  // lacuna (o `replace` abaixo virou redundante e foi mantido só para não
  // acoplar o teste ao separador do host).
  it("mantém o mesmo instante ao round-trip (parse → format → parse normalizado)", () => {
    const original = parseBrDateTime("08/08/2026 09:10")
    expect(original).not.toBeNull()
    const out = formatBrDateTime("08/08/2026 09:10")
    expect(out).toMatch(/^08\/08\/2026/)
    expect(out).toContain("09:10")
    const normalized = out.replace(", ", " ")
    const reparsed = parseBrDateTime(normalized)
    expect(reparsed?.getTime()).toBe(original!.getTime())
  })

  it("adiciona zeros à esquerda", () => {
    const out = formatBrDateTime("05/03/2026 08:05")
    expect(out).toMatch(/^05\/03\/2026/)
    expect(out).toContain("08:05")
  })

  it("fallback para o texto original quando inválido", () => {
    expect(formatBrDateTime("data inválida")).toBe("data inválida")
    expect(formatBrDateTime("")).toBe("")
  })
})

describe("formatBrDate", () => {
  it("formata apenas a data", () => {
    expect(formatBrDate("08/08/2026 09:10")).toBe("08/08/2026")
  })

  it("fallback para o texto original quando inválido", () => {
    expect(formatBrDate("não é data")).toBe("não é data")
  })
})

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [-5, "0 B"],
    [512, "512 B"],
    [1024, "1 KB"],
    [1536, "1,5 KB"],
    [1024 * 1024, "1 MB"],
    [5 * 1024 * 1024, "5 MB"],
    [2.5 * 1024 * 1024, "2,5 MB"],
  ])("formatBytes(%i) → %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected)
  })

  it("valor não-financeiro (NaN/Infinity) vira 0 B", () => {
    expect(formatBytes(Number.NaN)).toBe("0 B")
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("0 B")
  })
})

describe("formatNumber", () => {
  it("separa milhar com ponto pt-BR", () => {
    expect(formatNumber(1234567)).toBe("1.234.567")
  })

  it("números pequenos ficam intactos", () => {
    expect(formatNumber(42)).toBe("42")
    expect(formatNumber(-7)).toBe("-7")
  })
})

describe("formatMonthLabel", () => {
  it("converte MM/AAAA em rótulo por extenso", () => {
    expect(formatMonthLabel("01/2026")).toBe("Janeiro 2026")
    expect(formatMonthLabel("08/2026")).toBe("Agosto 2026")
    expect(formatMonthLabel("12/2026")).toBe("Dezembro 2026")
  })

  it("mês inválido cai no fallback (comportamento atual)", () => {
    expect(formatMonthLabel("13/2026")).toBe("13/2026 2026")
  })
})

describe("daysUntil", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  function fixarHoje() {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 23, 14, 0, 0)) // 23/09/2026 14:00 local
  }

  it("hoje=0, amanhã=+1, dias passados negativos", () => {
    fixarHoje()
    expect(daysUntil("23/09/2026")).toBe(0)
    expect(daysUntil("24/09/2026")).toBe(1)
    expect(daysUntil("17/09/2026")).toBe(-6)
  })

  it("ignora a hora na comparação (mesmo dia = 0)", () => {
    fixarHoje()
    expect(daysUntil("23/09/2026 01:30")).toBe(0)
    expect(daysUntil("24/09/2026 23:59")).toBe(1)
  })

  it("null para entrada inválida", () => {
    fixarHoje()
    expect(daysUntil("")).toBeNull()
    expect(daysUntil("abc")).toBeNull()
// QA-2026-02: 31/02/2026 "rola" para 03/03/2026 em vez de null — o helper
    // herda o comportamento do parser (coberto aqui apenas como número ≠ null).
    expect(daysUntil("31/02/2026")).not.toBeNull()
  })
})

describe("isValidBrDate", () => {
  // V3/4.1 (filtros de validação): `parseBrDateTime` é tolerante de propósito
  // (rolar 31/02 → 03/03 é o que serve para EXIBIR um dado já gravado). Um campo
  // que o usuário digita precisa do contrário: "De"/"Até" não podem virar uma
  // data que não existe.
  it("aceita datas que existem", () => {
    expect(isValidBrDate("01/09/2026")).toBe(true)
    expect(isValidBrDate("29/02/2024")).toBe(true) // ano bissexto
    expect(isValidBrDate(" 10/12/2026 ")).toBe(true) // espaço tolerado
  })

  it("recusa data que não existe (sem virar 1970 nem rolar)", () => {
    expect(isValidBrDate("31/02/2026")).toBe(false)
    expect(isValidBrDate("32/13/2026")).toBe(false)
    expect(isValidBrDate("29/02/2026")).toBe(false) // 2026 não é bissexto
    expect(isValidBrDate("00/10/2026")).toBe(false)
    expect(isValidBrDate("10/00/2026")).toBe(false)
  })

  it("recusa formato que não é DD/MM/AAAA", () => {
    expect(isValidBrDate("")).toBe(false)
    expect(isValidBrDate("2026-09-10")).toBe(false)
    expect(isValidBrDate("1/9/2026")).toBe(false)
    expect(isValidBrDate("10/09/2026 08:00")).toBe(false)
  })

  it("lê os campos como DD/MM/AAAA — 01/02 é 1º de FEVEREIRO, não 2 de janeiro", () => {
    // O bug que o helper existe para evitar: `new Date("01/02/2026")` no JS é
    // 1 de fevereiro, que é a leitura que o brasileiro não faz.
    expect(isValidBrDate("01/02/2026")).toBe(true)
    expect(isValidBrDate("31/04/2026")).toBe(false) // abril não tem dia 31
    expect(isValidBrDate("30/09/2026")).toBe(true)
    expect(isValidBrDate("31/12/2026")).toBe(true)
  })
})

// V3/4.1 fix round 1: o client precisa decidir `from > to` ANTES de mandar o
// período, e precisa decidir com a MESMA chave que o servidor usa no filtro
// (`AAAAMMDD` de `DD/MM/AAAA`), senão os dois lados discordam de "invertido".
describe("brDayKey", () => {
  it("converte DD/MM/AAAA na chave AAAAMMDD (mesma ordem do servidor)", () => {
    expect(brDayKey("10/09/2026")).toBe("20260910")
    expect(brDayKey("01/09/2026")).toBe("20260901")
    expect(brDayKey("31/12/2026")).toBe("20261231")
  })

  it("ordena como data: ano > mês > dia, sem depender de Date nem de fuso", () => {
    // A pegadinha do `Date`: em 2026, janeiro é "menor" que setembro só quando
    // os ANOS são comparados; por string, "20260910" > "20260110" e é o que o
    // filtro do servidor faz.
    expect(brDayKey("10/09/2026") > brDayKey("01/09/2026")).toBe(true)
    expect(brDayKey("10/09/2026") > brDayKey("10/01/2026")).toBe(true)
    expect(brDayKey("10/09/2025") > brDayKey("10/09/2026")).toBe(false)
    // Dia de bissexto: a chave não existe, mas o recorte é posicional.
    expect(brDayKey("29/02/2024")).toBe("20240229")
  })

  it("o mesmo dia tem a mesma chave nas duas pontas do período", () => {
    expect(brDayKey("10/09/2026")).toBe(brDayKey("10/09/2026"))
  })

  it("trata espaços antes/depois (trim)", () => {
    expect(brDayKey(" 01/09/2026")).toBe("20260901")
    expect(brDayKey("01/09/2026 ")).toBe("20260901")
    expect(brDayKey(" 01/09/2026 ")).toBe("20260901")
  })

  it("produz chaves diferentes quando dia/mês trocam", () => {
    const k1 = brDayKey("10/09/2026")
    const k2 = brDayKey("09/10/2026")
    expect(k1).not.toBe(k2)
    expect(k1 > k2 || k1 < k2).toBe(true)
  })
})
