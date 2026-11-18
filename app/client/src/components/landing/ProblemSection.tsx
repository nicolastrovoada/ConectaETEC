import { Section } from "./Section"
import { LandingIcon } from "./LandingIcon"
import { PROBLEMS } from "./content"

export function ProblemSection() {
  return (
    <Section
      id="sobre"
      tone="paper"
      labelledBy="sobre-title"
      className="relative"
    >
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
          <p className="text-xs font-semibold tracking-wide text-[#1a4fa0]">Origem do projeto</p>
          <h2
            id="sobre-title"
            className="mt-3 text-[clamp(1.75rem,3vw,2.5rem)] font-black leading-[1.12] tracking-[-0.015em] text-slate-900 dark:text-white"
          >
            Tudo começou com uma necessidade real.
          </h2>
          <p className="mt-4 md:mt-5 max-w-[60ch] text-base md:text-lg leading-relaxed text-slate-600 dark:text-slate-300">
            O projeto nasceu da vivência escolar de estudantes do Curso Técnico em Administração da ETEC Cravinhos, ao observar tarefas que já aconteciam na escola, mas não estavam integradas em um único ambiente.
          </p>
          <span aria-hidden="true" className="mt-6 flex items-center gap-2">
            <span className="h-px w-8 bg-[#0d2d6b]/25 dark:bg-white/25" />
            <span className="h-1 w-1 rounded-full bg-[#1a4fa0] dark:bg-blue-300" />
          </span>
          <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
            Observação do cotidiano escolar — não é resultado de pesquisa estatística.
          </p>
        </div>

        <div className="lg:col-span-8 lg:col-start-5">
          <ul className="space-y-0" aria-label="Desafios identificados">
            {PROBLEMS.map((item, index) => (
              <li
                key={item.title}
                className={`flex gap-4 py-6 ${index !== 0 ? "border-t border-slate-200/80 dark:border-slate-800" : ""}`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eef3fa] text-[#1a4fa0] dark:bg-slate-800 dark:text-blue-300">
                  <LandingIcon name={item.icon} className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-extrabold leading-snug text-slate-900 dark:text-white">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    {item.text}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-8 border-l-2 border-[#1a4fa0] bg-white/70 py-5 pl-6 dark:bg-slate-900/60">
            <p className="text-xl font-extrabold leading-snug text-slate-900 dark:text-white md:text-2xl">
              “Como a tecnologia poderia ajudar a organizar a rotina escolar e incentivar a participação dos estudantes sem aumentar a carga de trabalho da equipe?”
            </p>
          </div>

          <div className="mt-8 flex flex-col items-center" aria-hidden="true">
            <span className="h-8 w-px bg-[#0d2d6b]/20 dark:bg-white/20" />
            <span className="h-2 w-2 rounded-full bg-[#1a4fa0] ring-4 ring-white dark:ring-slate-950" />
          </div>
        </div>
      </div>
    </Section>
  )
}