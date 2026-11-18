import { useEffect, useRef, useState } from "react"
import { Button } from "../ui/Button"
import { A11Y, HEADER, NAV_LINKS } from "./content"
import { LandingIcon } from "./LandingIcon"
import { Wordmark } from "./Wordmark"

interface LandingHeaderProps {
  onRequestLogin: () => void
}

/** Header sticky sólido com nav desktop e disclosure mobile acessível. */
export function LandingHeader({ onRequestLogin }: LandingHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const firstLinkRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    firstLinkRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      setMenuOpen(false)
      menuButtonRef.current?.focus()
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [menuOpen])

  function requestLogin() {
    setMenuOpen(false)
    onRequestLogin()
  }

  return (
    <header
      role="banner"
      className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 shadow-[0_1px_0_rgba(13,45,107,.04)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95"
    >
      <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center gap-4 lg:h-[72px]">
          <a
            href="#inicio"
            aria-label={A11Y.brandLink}
            className="shrink-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <Wordmark size="sm" textClassName="hidden min-[400px]:inline" />
          </a>

          <nav aria-label={A11Y.mainNav} className="hidden items-center lg:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                className="inline-flex min-h-11 items-center rounded-lg px-1.5 text-sm font-semibold text-slate-600 transition-colors hover:text-[#1a4fa0] dark:text-slate-300 dark:hover:text-blue-300"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="primary"
              onClick={requestLogin}
              aria-label={HEADER.accessLabel}
              className="min-h-10 whitespace-nowrap px-2.5! text-xs! sm:min-h-11 sm:px-4! sm:text-sm!"
            >
              <span aria-hidden="true" className="sm:hidden">
                {HEADER.accessShortLabel}
              </span>
              <span className="hidden sm:inline">{HEADER.accessLabel}</span>
            </Button>
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls="menu-landing"
              aria-label={menuOpen ? A11Y.menuClose : A11Y.menuOpen}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 lg:hidden dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <LandingIcon name={menuOpen ? "close" : "menu"} />
            </button>
          </div>
        </div>
      </div>

      <div
        id="menu-landing"
        hidden={!menuOpen}
        className="absolute left-0 right-0 top-full max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-slate-200 bg-white shadow-[var(--landing-shadow-float)] lg:hidden dark:border-slate-800 dark:bg-slate-950"
      >
        <nav aria-label={A11Y.mainNav} className="mx-auto w-full max-w-[1200px] px-5 sm:px-6">
          <ul className="py-1">
            {NAV_LINKS.map((link, index) => (
              <li key={link.id}>
                <a
                  ref={index === 0 ? firstLinkRef : undefined}
                  href={`#${link.id}`}
                  onClick={() => setMenuOpen(false)}
                  className="flex min-h-11 items-center rounded-lg py-3.5 text-base font-semibold text-slate-700 transition-colors hover:text-[#1a4fa0] dark:text-slate-200 dark:hover:text-blue-300"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="space-y-2 border-t border-slate-200 py-4 dark:border-slate-800">
            <Button variant="primary" onClick={requestLogin} className="min-h-12 w-full">
              {HEADER.accessLabel}
            </Button>
          </div>
        </nav>
      </div>
    </header>
  )
}
