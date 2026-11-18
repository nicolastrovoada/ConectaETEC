import { BRAND } from "./content"

type WordmarkSize = "sm" | "md" | "lg"
type WordmarkTone = "dark" | "light"

interface WordmarkProps {
  size?: WordmarkSize
  tone?: WordmarkTone
  withText?: boolean
  className?: string
  textClassName?: string
}

const SIZES: Record<WordmarkSize, { mark: number; text: string; gap: string }> = {
  sm: { mark: 28, text: "text-lg", gap: "gap-2" },
  md: { mark: 32, text: "text-xl", gap: "gap-2.5" },
  lg: { mark: 36, text: "text-[22px]", gap: "gap-3" },
}

/** Marca tipográfica ConectaETEC + símbolo desenhado (arco aberto com nó verde). */
export function Wordmark({
  size = "md",
  tone = "dark",
  withText = true,
  className = "",
  textClassName = "",
}: WordmarkProps) {
  const { mark, text, gap } = SIZES[size]
  const isLight = tone === "light"
  return (
    <span className={`inline-flex items-center ${gap} ${className}`}>
      <svg
        width={mark}
        height={mark}
        viewBox="0 0 32 32"
        aria-hidden="true"
        focusable="false"
        className="shrink-0"
      >
        <rect width="32" height="32" rx="8" className={isLight ? "fill-white/15" : "fill-[#0d2d6b]"} />
        <path
          d="M21.3 10.7a7.5 7.5 0 1 0 0 10.6"
          fill="none"
          stroke="#fff"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="24" cy="16" r="2" fill="#22c55e" />
      </svg>
      {withText ? (
        <span
          className={`${text} font-black leading-none tracking-[-0.01em] ${textClassName}`}
          style={{ fontFamily: "Nunito, sans-serif" }}
        >
          <span className={isLight ? "text-white" : "text-[#0d2d6b] dark:text-white"}>{BRAND.first}</span>
          <span className={isLight ? "text-blue-300" : "text-[#1a4fa0] dark:text-blue-300"}>{BRAND.second}</span>
        </span>
      ) : null}
    </span>
  )
}
