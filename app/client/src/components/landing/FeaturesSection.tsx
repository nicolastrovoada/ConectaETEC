import { Section, SectionIntro } from "./Section"
import { LandingIcon } from "./LandingIcon"
import { FEATURE_GROUPS, FEATURES } from "./content"

export function FeaturesSection() {
  return (
    <Section id="funcionalidades" tone="white" labelledBy="funcionalidades-title">
      <SectionIntro titleId="funcionalidades-title" title={FEATURES.title} lead={FEATURES.lead} />
      <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{FEATURES.note}</p>

      <div className="mt-10 md:mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-12 md:gap-6">
        {FEATURE_GROUPS.map((group, index) => {
          const span =
            index === 0 ? "lg:col-span-7" :
            index === 1 ? "lg:col-span-5" :
            index === 5 ? "lg:col-span-12" : "lg:col-span-4"
          const innerCols = group.wide ? "md:columns-2 md:gap-6" : ""
          return (
            <article
              key={group.title}
              className={`rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 ${span}`}
            >
              <LandingIcon name={group.icon} className="h-6 w-6 text-[#1a4fa0] dark:text-blue-300" />
              <h3 className="mt-4 text-xl font-extrabold leading-snug text-slate-900 dark:text-white">{group.title}</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{group.description}</p>
              <ul className={`mt-4 space-y-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300 ${innerCols}`}>
                {group.items.map((item) => (
                  <li key={item} className="flex gap-2 break-inside-avoid">
                    <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#1a4fa0]/60 dark:bg-blue-300/70" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          )
        })}
      </div>
    </Section>
  )
}