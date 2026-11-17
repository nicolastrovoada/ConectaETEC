import { Button } from "../ui/Button"
import { HERO } from "./content"
import { LinkButton } from "./LinkButton"
import { ProductPreview } from "./ProductPreview"
import { Wordmark } from "./Wordmark"

interface HeroSectionProps {
  onRequestLogin: () => void
}

/** Hero navy: única seção de forte contraste, com entrada orquestrada uma vez. */
export function HeroSection({ onRequestLogin }: HeroSectionProps) {
  return (
    <section
      id="inicio"
      aria-labelledby="hero-title"
      className="relative overflow-hidden scroll-mt-[80px] bg-[linear-gradient(160deg,#0d2d6b_0%,#0a2452_55%,#081c3d_100%)] pt-14 pb-16 text-white md:pt-20 md:pb-24 lg:scroll-mt-[88px] lg:pt-24 lg:pb-28 dark:bg-[#081c3d]"
    >
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          backgroundImage:
            "radial-gradient(circle at 88% 8%, rgba(26,79,160,0.55) 0%, rgba(26,79,160,0) 45%), radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "auto, 24px 24px",
        }}
      />
      <div
        className="pointer-events-none absolute -right-24 -top-24 hidden h-[560px] w-[560px] rounded-full border border-white/10 md:block"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -right-6 top-16 hidden h-[360px] w-[360px] rounded-full border border-white/10 md:block"
        aria-hidden="true"
      />

      <div className="relative mx-auto grid w-full max-w-[1200px] gap-12 px-5 sm:px-6 lg:grid-cols-12 lg:items-center lg:gap-6 lg:px-8">
        <div className="landing-rise min-w-0 lg:col-span-6">
          <p className="text-xs font-semibold tracking-wide text-blue-200">{HERO.overline}</p>

          <div className="mt-4">
            <Wordmark size="lg" tone="light" />
          </div>

          <p className="mt-4 flex items-center gap-3 text-sm font-extrabold text-blue-200 md:text-base">
            <span aria-hidden="true" className="flex items-center gap-1.5">
              <span className="h-px w-6 bg-blue-300/60" />
              <span className="h-1 w-1 rounded-full bg-blue-300" />
            </span>
            {HERO.slogan}
          </p>

          <h1
            id="hero-title"
            className="mt-5 max-w-[15ch] text-[clamp(2.25rem,5vw,4rem)] font-black leading-[1.05] tracking-[-0.02em] text-white"
          >
            {HERO.title}
          </h1>

          <p className="mt-5 max-w-[46ch] text-base leading-relaxed text-blue-100 md:text-lg">
            {HERO.lead}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <LinkButton href={HERO.primaryCtaHref} variant="onDark" className="min-h-12 w-full sm:w-auto">
              {HERO.primaryCta}
            </LinkButton>
            <Button variant="onDarkOutline" onClick={onRequestLogin} className="min-h-12 w-full sm:w-auto">
              {HERO.accessCta}
            </Button>
          </div>

          <p className="mt-5 max-w-[48ch] text-xs leading-relaxed text-blue-200">{HERO.note}</p>
        </div>

        <div className="landing-rise landing-rise-late mx-auto w-full min-w-0 max-w-[560px] lg:col-span-6 lg:-mr-6 lg:max-w-none">
          <ProductPreview />
        </div>
      </div>
    </section>
  )
}
