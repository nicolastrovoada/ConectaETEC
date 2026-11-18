import { Section, SectionIntro } from "./Section"
import { LandingIcon } from "./LandingIcon"
import { PROJECT_STATUS, STATUS_DONE, STATUS_PLANNED } from "./content"

export function ProjectStatusSection() {
  return (
    <Section id="estado-atual" tone="paper" labelledBy="estado-atual-title">
      <SectionIntro titleId="estado-atual-title" title={PROJECT_STATUS.title} lead={PROJECT_STATUS.lead} />
      <span className="mt-4 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
        {PROJECT_STATUS.badge}
      </span>

      <div className="mt-10 md:mt-14 grid gap-6 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <LandingIcon name="check" className="h-4 w-4 text-[#1a4fa0] dark:text-blue-300" />
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">{PROJECT_STATUS.doneTitle}</h3>
          </div>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300 md:columns-2 md:gap-6">
            {STATUS_DONE.map((item) => (
              <li key={item} className="flex gap-2 break-inside-avoid">
                <LandingIcon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-[#1a4fa0] dark:text-blue-300" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-2xl border border-dashed border-slate-300 bg-transparent p-6 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <LandingIcon name="clock" className="h-4 w-4 text-slate-400 dark:text-slate-500" />
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">{PROJECT_STATUS.plannedTitle}</h3>
          </div>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {STATUS_PLANNED.map((item) => (
              <li key={item} className="flex gap-2">
                <LandingIcon name="clock" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <p className="mt-6 max-w-[68ch] text-sm leading-relaxed text-slate-600 dark:text-slate-300">{PROJECT_STATUS.note}</p>
    </Section>
  )
}