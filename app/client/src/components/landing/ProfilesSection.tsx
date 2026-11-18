import { ROLE_LABELS } from "@shared/types"
import { ROLE_THEME } from "../../lib/theme"
import { Section } from "./Section"
import { LandingIcon } from "./LandingIcon"
import { PROFILES, PROFILES_SECTION } from "./content"
import type { Role } from "@shared/types"

const ROLE_ICONS: Record<Role, "cap" | "board" | "building" | "chart"> = {
  student: "cap",
  teacher: "board",
  staff: "building",
  coordinator: "chart",
}

function ProfileVisual({ role }: { role: Role }) {
  if (role === "student") {
    return (
      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3" aria-label="Exemplo ilustrativo de progresso de nível">
        <div className="flex items-center justify-between text-xs text-blue-100">
          <span>Nível Prata</span>
          <span>Exemplo</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-[10%] rounded-full bg-gradient-to-r from-blue-600 to-blue-500" />
        </div>
        <p className="mt-1 text-xs text-blue-200">Prata → Ouro</p>
      </div>
    )
  }
  if (role === "teacher") {
    return (
      <div className="mt-4 space-y-2 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-blue-100">
        <div className="flex items-center justify-between gap-2">
          <span>Entrega · atividade</span>
          <span className="rounded-full bg-green-500/20 px-2 py-0.5 font-semibold text-green-200">Aprovada</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span>Entrega · atividade</span>
          <span className="rounded-full bg-orange-500/20 px-2 py-0.5 font-semibold text-orange-200">Correção solicitada</span>
        </div>
      </div>
    )
  }
  if (role === "staff") {
    return (
      <ul className="mt-4 space-y-2 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-blue-100">
        {["Biblioteca", "Evento", "Apoio"].map((item) => (
          <li key={item} className="flex items-center gap-2">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500/20 text-green-200" aria-hidden="true">✓</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    )
  }
  return (
    <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-blue-100">
      {["Participação", "Validações", "Pontos", "Relatórios"].map((item) => (
        <div key={item} className="rounded-lg border border-white/10 px-2 py-2 text-center">
          {item}
        </div>
      ))}
    </div>
  )
}

export function ProfilesSection() {
  return (
    <Section id="para-quem" tone="navy" labelledBy="para-quem-title">
      <div className="max-w-[68ch]">
        <p className="text-xs font-semibold tracking-wide text-blue-200">{PROFILES_SECTION.overline}</p>
        <h2
          id="para-quem-title"
          className="mt-3 text-[clamp(1.75rem,3vw,2.5rem)] font-black leading-[1.12] tracking-[-0.015em] text-white"
        >
          {PROFILES_SECTION.title}
        </h2>
        <p className="mt-4 md:mt-5 max-w-[60ch] text-base md:text-lg leading-relaxed text-blue-100">
          {PROFILES_SECTION.lead}
        </p>
      </div>

      <div className="relative mt-10 md:mt-14">
        <div className="hidden lg:absolute lg:left-0 lg:right-0 lg:top-8 lg:block lg:h-px lg:bg-white/15" aria-hidden="true" />
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4 md:gap-6">
          {PROFILES.map((profile) => {
            const theme = ROLE_THEME[profile.role]
            return (
              <article key={profile.role} className="relative rounded-2xl border border-white/10 bg-white/5 p-6">
                <span className="hidden lg:absolute lg:left-1/2 lg:top-0 lg:block lg:h-2 lg:w-2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-full lg:bg-white lg:ring-4 lg:ring-[#0d2d6b]" aria-hidden="true" />
                <div className={`h-[3px] w-full rounded-full bg-gradient-to-r ${theme.avatar}`} aria-hidden="true" />
                <div className="mt-4 flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${theme.avatar} text-white`}>
                    <LandingIcon name={ROLE_ICONS[profile.role]} className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-extrabold leading-snug text-white">{ROLE_LABELS[profile.role]}</h3>
                    <p className="text-xs font-semibold text-blue-200">{profile.functionLabel}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-blue-100">{profile.description}</p>
                <ProfileVisual role={profile.role} />
                <ul className="mt-4 space-y-2 text-sm leading-relaxed text-blue-100">
                  {profile.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-2">
                      <span aria-hidden="true" className={`mt-2 h-1 w-1 shrink-0 rounded-full bg-gradient-to-br ${theme.avatar}`} />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </article>
            )
          })}
        </div>
      </div>

      <p className="mt-10 max-w-[68ch] text-sm leading-relaxed text-blue-100">{PROFILES_SECTION.closing}</p>
    </Section>
  )
}