import { Section } from "./Section"
import { LandingIcon } from "./LandingIcon"
import { A11Y, CONTACT, CONTACT_CHANNELS, GITHUB_URL, ISSUES_URL } from "./content"

export function ContactSection() {
  return (
    <Section id="contato" tone="navy" labelledBy="contato-title">
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
        <div className="min-w-0 lg:col-span-6">
          <p className="text-xs font-semibold tracking-wide text-blue-200">{CONTACT.overline}</p>
          <h2
            id="contato-title"
            className="mt-3 text-[clamp(1.75rem,3vw,2.5rem)] font-black leading-[1.12] tracking-[-0.015em] text-white"
          >
            {CONTACT.title}
          </h2>
          <p className="mt-4 md:mt-5 max-w-[60ch] text-base md:text-lg leading-relaxed text-blue-100">
            {CONTACT.lead}
          </p>
          {CONTACT_CHANNELS.length === 0 ? (
            <p className="mt-6 text-sm leading-relaxed text-blue-200">{CONTACT.fallback}</p>
          ) : null}
        </div>

        <div className="min-w-0 lg:col-span-6">
          <div className="rounded-2xl border border-white/15 bg-white/5 p-6">
            <div className="space-y-4">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 rounded-xl border border-white/10 p-4 text-left transition-colors hover:border-white/25 hover:bg-white/5"
              >
                <LandingIcon name="github" className="mt-0.5 h-5 w-5 shrink-0 text-white" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-white">{CONTACT.githubLabel}</span>
                  <span className="mt-1 block break-words text-xs text-blue-200">
                    {GITHUB_URL} <span className="sr-only">{A11Y.newTabNote}</span>
                  </span>
                </span>
              </a>

              {ISSUES_URL ? (
                <a
                  href={ISSUES_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 rounded-xl border border-white/10 p-4 text-left transition-colors hover:border-white/25 hover:bg-white/5"
                >
                  <LandingIcon name="arrowRight" className="mt-0.5 h-5 w-5 shrink-0 text-white" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-white">{CONTACT.issuesLabel}</span>
                    <span className="mt-1 block break-words text-xs text-blue-200">
                      {ISSUES_URL} <span className="sr-only">{A11Y.newTabNote}</span>
                    </span>
                  </span>
                </a>
              ) : null}

              {CONTACT_CHANNELS.map((channel) => (
                <a
                  key={channel.id}
                  href={channel.href}
                  target={channel.external ? "_blank" : undefined}
                  rel={channel.external ? "noopener noreferrer" : undefined}
                  className="flex items-start gap-3 rounded-xl border border-white/10 p-4 text-left transition-colors hover:border-white/25 hover:bg-white/5"
                >
                  <LandingIcon name={channel.icon} className="mt-0.5 h-5 w-5 shrink-0 text-white" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-white">{channel.label}</span>
                    <span className="mt-1 block break-words text-xs text-blue-200">
                      {channel.href} {channel.external ? <span className="sr-only">{A11Y.newTabNote}</span> : null}
                    </span>
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Section>
  )
}