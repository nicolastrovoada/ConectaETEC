import type { ReactNode } from "react"
import type { StudyContent } from "@shared/types"
import { Card } from "../components/ui/Card"
import { formatPoints } from "../lib/format"

const COLOR_STYLES: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  green: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
}

/** Contagem de questões com plural correto (as duas telas mostram a mesma frase). */
export function questionsSummary(count: number): string {
  return count === 1 ? "1 questão de verificação" : `${count} questões de verificação`
}

interface StudyContentCardProps {
  content: StudyContent
  /** Bloco do meio: aluno traz a lição expandível, professor traz as ações. */
  children?: ReactNode
  /** Faixa inferior: botão de concluir (aluno) ou nada (professor). */
  footer?: ReactNode
}

/**
 * Cartão de reforço escolar compartilhado pelas telas de aluno (3.2) e professor.
 * É um `article` nomeado pelo título: o cartão é uma unidade de conteúdo
 * autossuficiente e o nome acessível é o que o leitor de tela anuncia.
 */
export function StudyContentCard({ content, children, footer }: StudyContentCardProps) {
  const headingId = `reforco-${content.id}-titulo`

  return (
    <Card className="p-5 flex flex-col gap-3" role="article" aria-labelledby={headingId}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 ${COLOR_STYLES[content.color] ?? COLOR_STYLES.blue}`}
              aria-hidden="true"
            >
              {content.icon}
            </div>
            <div className="min-w-0">
              <h3
                id={headingId}
                className="text-sm font-extrabold text-gray-900 dark:text-white leading-snug"
                style={{ fontFamily: "Nunito, sans-serif" }}
              >
                {content.topic}
              </h3>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{content.subject}</p>
            </div>
          </div>
          {content.description && (
            <p className="text-sm text-gray-600 dark:text-slate-300 mt-3">{content.description}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-black text-blue-700 dark:text-blue-400">{formatPoints(content.points)}</p>
          <p className="text-[11px] text-gray-500 dark:text-slate-400">ao concluir</p>
        </div>
      </div>

      {children}

      {footer && <div className="mt-auto pt-3 border-t border-gray-100 dark:border-slate-800">{footer}</div>}
    </Card>
  )
}
