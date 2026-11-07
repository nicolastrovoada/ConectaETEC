import { useState } from "react"

/** Barra individual (altura em % do contêiner pai). */
export function Bar({ pct, color = "bg-blue-600" }: { pct: number; color?: string }) {
  return (
    <div className="h-full flex items-end">
      <div className={`w-full ${color} rounded-t-md`} style={{ height: `${Math.max(2, pct)}%` }} />
    </div>
  )
}

export interface BarSeries {
  label: string
  value: number
  color?: string
}

/**
 * Gráfico de barras simples em CSS (acessível: tabela de dados de apoio).
 * `height` define a altura vertical do gráfico em pixels.
 */
export function BarChart({ series, height = 180, color = "bg-blue-600", unit = "" }: { series: BarSeries[]; height?: number; color?: string; unit?: string }) {
  const max = Math.max(...series.map((s) => s.value), 1)
  return (
    <div>
      <div className="flex items-end gap-3" style={{ height }} role="img" aria-label="Gráfico de barras">
        {series.map((s) => (
          <div key={s.label} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
            <span className="text-xs font-bold text-gray-700 dark:text-slate-200 mb-1">{s.value.toLocaleString("pt-BR")}</span>
            <div className="w-full h-full max-w-10 flex items-end">
              <Bar pct={(s.value / max) * 100} color={s.color ?? color} />
            </div>
            <span className="text-[11px] text-gray-500 dark:text-slate-400 mt-2 text-center truncate w-full">
              {s.label}
              {unit}
            </span>
          </div>
        ))}
      </div>
      <table className="sr-only" aria-label="Dados do gráfico">
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Valor</th>
          </tr>
        </thead>
        <tbody>
          {series.map((s) => (
            <tr key={s.label}>
              <td>{s.label}</td>
              <td>{s.value.toLocaleString("pt-BR")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}