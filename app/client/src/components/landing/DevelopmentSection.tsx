import { Section } from "./Section"
import { DEV_STAGES, DEVELOPMENT } from "./content"

export function DevelopmentSection() {
  return (
    <Section id="desenvolvimento" tone="white" labelledBy="desenvolvimento-title" className="relative">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          backgroundImage: "radial-gradient(circle, var(--landing-grid-color, rgba(13,45,107,.07)) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <div className="relative grid gap-10 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-4 lg:sticky lg:top-28 lg:self-start">
          <h2
            id="desenvolvimento-title"
            className="text-[clamp(1.75rem,3vw,2.5rem)] font-black leading-[1.12] tracking-[-0.015em] text-slate-900 dark:text-white"
          >
            {DEVELOPMENT.title}
          </h2>
          <p className="mt-4 md:mt-5 max-w-[60ch] text-base md:text-lg leading-relaxed text-slate-600 dark:text-slate-300">
            {DEVELOPMENT.lead}
          </p>
        </div>

        <div className="lg:col-span-7 lg:col-start-6">
          <ol className="relative space-y-6">
            <span className="absolute left-5 top-5 bottom-5 w-px bg-[#0d2d6b]/15 dark:bg-white/15" aria-hidden="true" />
            {DEV_STAGES.map((stage, index) => (
              <li key={stage.title} className="relative flex gap-4">
                <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eef3fa] text-sm font-extrabold text-[#0d2d6b] dark:bg-slate-800 dark:text-blue-200">
                  {index + 1}
                </span>
                <div className="min-w-0 pb-2">
                  <h3 className="text-lg md:text-xl font-extrabold leading-snug text-slate-900 dark:text-white">{stage.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{stage.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-8 text-xs text-slate-500 dark:text-slate-400">{DEVELOPMENT.note}</p>
        </div>
      </div>
    </Section>
  )
}