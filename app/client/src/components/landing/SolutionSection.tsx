import { Section, SectionIntro } from "./Section"
import { FLOW_STEPS, SOLUTION } from "./content"

export function SolutionSection() {
  return (
    <Section id="solucao" tone="tint" labelledBy="solucao-title">
      <div className="max-w-[68ch]">
        <SectionIntro titleId="solucao-title" title={SOLUTION.title} lead={SOLUTION.lead} />
      </div>

      <ol className="relative mt-10 md:mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-5 md:gap-6" aria-label="Ciclo de funcionamento da plataforma">
        {FLOW_STEPS.map((step, index) => (
          <li key={step.title} className="relative">
            <div className="hidden lg:block absolute left-1/2 top-8 h-px w-full bg-[#0d2d6b]/15 dark:bg-white/15" aria-hidden="true" style={{ display: index === FLOW_STEPS.length - 1 ? "none" : undefined }} />
            <div className="relative flex flex-col rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <span className="mb-3 flex items-center gap-3 lg:flex-col lg:items-start">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#0d2d6b]/15 bg-white text-xs font-extrabold text-[#0d2d6b] dark:border-white/15 dark:bg-slate-900 dark:text-blue-200">
                  {index + 1}
                </span>
                <span className="hidden lg:block h-px w-6 bg-[#0d2d6b]/15 dark:bg-white/15" aria-hidden="true" />
              </span>
              <h3 className="text-lg font-extrabold leading-snug text-slate-900 dark:text-white">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{step.text}</p>
            </div>
            {index < FLOW_STEPS.length - 1 ? (
              <div className="mt-3 flex justify-center lg:hidden" aria-hidden="true">
                <span className="h-4 w-px bg-[#0d2d6b]/15 dark:bg-white/15" />
              </div>
            ) : null}
          </li>
        ))}
      </ol>

      <p className="mt-10 text-sm text-slate-500 dark:text-slate-400">{SOLUTION.rolesLine}</p>
    </Section>
  )
}