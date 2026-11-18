import { Section, SectionIntro } from "./Section"
import { WORKFLOW, WORKFLOW_STEPS } from "./content"

export function WorkflowSection() {
  return (
    <Section id="como-funciona" tone="paper" labelledBy="como-funciona-title">
      <SectionIntro titleId="como-funciona-title" title={WORKFLOW.title} lead={WORKFLOW.lead} />
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{WORKFLOW.legend}</p>

      <ol className="mt-10 md:mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-x-8 lg:gap-y-10" aria-label="Etapas do funcionamento">
        {WORKFLOW_STEPS.map((step, index) => {
          const isResult = index >= 3
          return (
            <li key={step.title} className="relative flex gap-4 md:block">
              <div className="flex flex-col items-center md:hidden" aria-hidden="true">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-extrabold ${isResult ? "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300" : "border-[#0d2d6b]/15 bg-white text-[#0d2d6b] dark:border-white/15 dark:bg-slate-900 dark:text-blue-200"}`}>
                  {index + 1}
                </span>
                {index < WORKFLOW_STEPS.length - 1 ? <span className={`mt-2 h-full min-h-6 w-px ${isResult ? "bg-green-500/30" : "bg-[#0d2d6b]/15 dark:bg-white/15"}`} /> : null}
              </div>
              <div className="min-w-0">
                <div className="hidden md:flex items-center gap-3 mb-3">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-extrabold ${isResult ? "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300" : "border-[#0d2d6b]/15 bg-white text-[#0d2d6b] dark:border-white/15 dark:bg-slate-900 dark:text-blue-200"}`}>
                    {index + 1}
                  </span>
                  <span className={`h-px flex-1 ${isResult ? "bg-green-500/40" : "bg-[#0d2d6b]/15 dark:bg-white/15"}`} aria-hidden="true" />
                </div>
                <h3 className="text-lg font-extrabold leading-snug text-slate-900 dark:text-white">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{step.text}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </Section>
  )
}