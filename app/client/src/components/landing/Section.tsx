import type { ReactNode } from "react"

export type SectionTone = "paper" | "tint" | "white" | "navy"

const TONES: Record<SectionTone, string> = {
  paper: "bg-[#fbfcfe] dark:bg-slate-950",
  tint: "bg-[#eef3fa] dark:bg-slate-900",
  white: "bg-white dark:bg-slate-950",
  navy: "bg-[#0d2d6b] dark:bg-[#081c3d]",
}

interface SectionProps {
  id: string
  tone?: SectionTone
  labelledBy?: string
  className?: string
  containerClassName?: string
  children: ReactNode
}

/** Fundo full-bleed + container único + ritmo vertical + compensação do header sticky. */
export function Section({
  id,
  tone = "paper",
  labelledBy,
  className = "",
  containerClassName = "",
  children,
}: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={`scroll-mt-[80px] lg:scroll-mt-[88px] ${TONES[tone]} ${className}`}
    >
      <div
        className={`mx-auto w-full max-w-[1200px] px-5 sm:px-6 lg:px-8 py-16 md:py-24 lg:py-28 ${containerClassName}`}
      >
        {children}
      </div>
    </section>
  )
}

interface SectionIntroProps {
  titleId: string
  title: ReactNode
  lead?: ReactNode
  align?: "left" | "center"
  tone?: "light" | "dark"
  className?: string
}

/** Cabeçalho editorial de seção: hairline de marca + h2 + lead. */
export function SectionIntro({
  titleId,
  title,
  lead,
  align = "left",
  tone = "dark",
  className = "",
}: SectionIntroProps) {
  const isLight = tone === "light"
  return (
    <div className={`${align === "center" ? "mx-auto text-center" : ""} max-w-[68ch] ${className}`}>
      <span aria-hidden="true" className={`mb-5 flex items-center gap-2 ${align === "center" ? "justify-center" : ""}`}>
        <span className={`h-px w-8 ${isLight ? "bg-blue-300/60" : "bg-[#0d2d6b]/25 dark:bg-white/25"}`} />
        <span className={`h-1 w-1 rounded-full ${isLight ? "bg-blue-300" : "bg-[#1a4fa0] dark:bg-blue-300"}`} />
      </span>
      <h2
        id={titleId}
        className={`text-[clamp(1.75rem,3vw,2.5rem)] font-black leading-[1.12] tracking-[-0.015em] ${
          isLight ? "text-white" : "text-slate-900 dark:text-white"
        }`}
      >
        {title}
      </h2>
      {lead ? (
        <p
          className={`mt-4 md:mt-5 max-w-[60ch] text-base md:text-lg leading-relaxed ${
            isLight ? "text-blue-100" : "text-slate-600 dark:text-slate-300"
          }`}
        >
          {lead}
        </p>
      ) : null}
    </div>
  )
}
