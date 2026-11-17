import { Section, SectionIntro } from "./Section"
import { TECH_EXTRAS, TECH_LAYERS, TECHNOLOGY } from "./content"

export function TechnologySection() {
  return (
    <Section id="tecnologia" tone="navy" labelledBy="tecnologia-title">
      <SectionIntro titleId="tecnologia-title" title={TECHNOLOGY.title} lead={TECHNOLOGY.lead} tone="light" />

      <div className="mt-10 md:mt-14 grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 space-y-3">
          {TECH_LAYERS.map((layer, index) => (
            <div key={layer.title}>
              <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="text-xs font-semibold text-blue-200">{index + 1} · {layer.subtitle}</p>
                <h3 className="mt-1 text-xl font-extrabold text-white">{layer.title}</h3>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {layer.items.map((item) => (
                    <li key={item} className="rounded-full bg-white/10 px-3 py-1 text-xs text-blue-100">
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
              {index < TECH_LAYERS.length - 1 ? (
                <div className="flex justify-center py-2" aria-hidden="true">
                  <span className="flex flex-col items-center">
                    <span className="h-3 w-px bg-white/20" />
                    <span className="h-2 w-2 rounded-full bg-white/40" />
                    <span className="h-3 w-px bg-white/20" />
                  </span>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h3 className="text-lg font-extrabold text-white">{TECHNOLOGY.extrasTitle}</h3>
            <ul className="mt-4 flex flex-wrap gap-2">
              {TECH_EXTRAS.map((item) => (
                <li key={item} className="rounded-full bg-white/10 px-3 py-1 text-xs text-blue-100">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-6 text-sm text-blue-100">{TECHNOLOGY.closing}</p>
        </div>
      </div>
    </Section>
  )
}