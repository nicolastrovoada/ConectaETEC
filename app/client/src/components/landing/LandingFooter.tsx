import { A11Y, FOOTER, GITHUB_URL, ISSUES_URL, NAV_LINKS } from "./content"
import { LandingIcon } from "./LandingIcon"
import { Wordmark } from "./Wordmark"

/** Rodapé institucional (fundo tinta) com navegação, projeto e contexto acadêmico. */
export function LandingFooter() {
  return (
    <footer role="contentinfo" className="bg-[#081c3d] text-blue-100">
      <h2 className="sr-only">{A11Y.footerInfoTitle}</h2>
      <div className="mx-auto w-full max-w-[1200px] px-5 pb-8 pt-14 sm:px-6 md:pt-16 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="max-w-[42ch] sm:col-span-2 lg:col-span-2">
            <Wordmark tone="light" size="md" />
            <p className="mt-3 text-sm text-blue-200">{FOOTER.slogan}</p>
            <p className="mt-3 text-sm leading-relaxed text-blue-100">{FOOTER.description}</p>
          </div>

          <nav aria-label={A11Y.footerNav}>
            <h3 className="text-sm font-bold text-blue-200">{FOOTER.navTitle}</h3>
            <ul className="mt-2">
              {NAV_LINKS.map((link) => (
                <li key={link.id}>
                  <a
                    href={`#${link.id}`}
                    className="inline-flex min-h-8 items-center rounded py-2 text-sm text-blue-100 transition-colors hover:text-white focus-visible:outline-white lg:py-1.5"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label={A11Y.footerProject}>
            <h3 className="text-sm font-bold text-blue-200">{FOOTER.projectTitle}</h3>
            <ul className="mt-2">
              <li>
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-8 items-center gap-2 rounded py-2 text-sm text-blue-100 transition-colors hover:text-white focus-visible:outline-white lg:py-1.5"
                >
                  <LandingIcon name="github" className="h-4 w-4" />
                  {FOOTER.githubLabel}
                  <span className="sr-only">{A11Y.newTabNote}</span>
                </a>
              </li>
              {ISSUES_URL ? (
                <li>
                  <a
                    href={ISSUES_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-8 items-center gap-2 rounded py-2 text-sm text-blue-100 transition-colors hover:text-white focus-visible:outline-white lg:py-1.5"
                  >
                    <LandingIcon name="arrowRight" className="h-4 w-4" />
                    {FOOTER.issuesLabel}
                    <span className="sr-only">{A11Y.newTabNote}</span>
                  </a>
                </li>
              ) : null}
            </ul>
          </nav>

          <div>
            <h3 className="text-sm font-bold text-blue-200">{FOOTER.academicTitle}</h3>
            <ul className="mt-2 text-sm">
              {FOOTER.academicItems.map((item) => (
                <li key={item} className="py-1.5">
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-blue-200">{FOOTER.academicContext}</p>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1 text-xs leading-relaxed text-blue-200/80">
            <p>{FOOTER.copyright}</p>
            <p>{FOOTER.prototypeNote}</p>
            <p>{FOOTER.notice}</p>
          </div>
          <a
            href="#inicio"
            aria-label={A11Y.backToTopAria}
            className="inline-flex min-h-11 items-center gap-2 self-start rounded-lg px-2 py-2 text-sm font-semibold text-blue-100 transition-colors hover:text-white focus-visible:outline-white sm:self-auto"
          >
            {A11Y.backToTop}
            <LandingIcon name="arrowUp" className="h-4 w-4" />
          </a>
        </div>
      </div>
    </footer>
  )
}
