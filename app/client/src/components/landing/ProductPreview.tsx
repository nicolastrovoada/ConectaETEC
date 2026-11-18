import { levelProgress } from "@shared/types"
import { Badge } from "../ui/Badge"
import { A11Y, BRAND, HERO, HERO_PREVIEW } from "./content"

interface ProductPreviewProps {
  className?: string
}

/** Composição ilustrativa dos painéis do produto (nada focável; interior `aria-hidden`). */
export function ProductPreview({ className = "" }: ProductPreviewProps) {
  const progress = levelProgress(HERO_PREVIEW.balanceValue)

  return (
    <figure role="img" aria-label={A11Y.previewAria} className={`min-w-0 max-w-full ${className}`}>
      <div aria-hidden="true" className="relative min-w-0 max-w-full pb-0 lg:pb-12">
        <div className="min-w-0 overflow-hidden rounded-[24px] border border-[#0d2d6b]/10 bg-white text-slate-900 shadow-[var(--landing-shadow-frame)]">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#0d2d6b] text-xs font-black text-white">
                {BRAND.first.slice(0, 1)}
              </span>
              <span className="text-sm font-extrabold" style={{ fontFamily: "Nunito, sans-serif" }}>
                {HERO_PREVIEW.panelTitle}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                {HERO_PREVIEW.panelChip}
              </span>
              <Badge className="bg-slate-100 text-slate-600">{HERO_PREVIEW.exampleBadge}</Badge>
            </div>
          </div>

          <div className="space-y-3 p-4">
            <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 p-4 text-white">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-bold" style={{ fontFamily: "Nunito, sans-serif" }}>
                  {HERO_PREVIEW.greeting}
                </p>
                <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-bold">
                  {HERO_PREVIEW.balanceValue} pts
                </span>
              </div>
              <p className="mt-1 text-[11px] font-semibold text-blue-100">{HERO_PREVIEW.level}</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/25">
                <div className="h-full rounded-full bg-white" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-1.5 text-[11px] text-blue-100">{HERO_PREVIEW.progressLabel}</p>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
              <p className="min-w-0 text-xs font-semibold leading-snug text-slate-700">
                {HERO_PREVIEW.activityTitle}
              </p>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="text-[11px] font-bold text-[#1a4fa0]">{HERO_PREVIEW.activityPoints}</span>
                <Badge className="bg-green-100 text-green-700">{HERO_PREVIEW.activityStatus}</Badge>
              </div>
            </div>

            <p className="text-[11px] text-slate-500">{HERO_PREVIEW.panelFooter}</p>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[11px] font-semibold text-blue-100 lg:hidden">
          {HERO_PREVIEW.validationCompact}
        </div>

        <div className="hidden lg:absolute lg:-bottom-0 lg:-left-10 lg:block lg:w-[72%]">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 text-slate-900 shadow-[var(--landing-shadow-float)]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-extrabold" style={{ fontFamily: "Nunito, sans-serif" }}>
                {HERO_PREVIEW.validationTitle}
              </p>
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                {HERO_PREVIEW.validationChip}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-2">
              <span className="text-[11px] font-semibold text-slate-700">{HERO_PREVIEW.validationLine}</span>
              <Badge className="bg-blue-100 text-blue-700">{HERO_PREVIEW.validationStatus}</Badge>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-slate-500">{HERO_PREVIEW.validationFeedback}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-lg bg-green-100 px-2 py-1 text-[10px] font-semibold text-green-700">
                {HERO_PREVIEW.validationActions[0]}
              </span>
              <span className="rounded-lg bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-800">
                {HERO_PREVIEW.validationActions[1]}
              </span>
            </div>
            <p className="mt-2 text-[10px] text-slate-500">{HERO_PREVIEW.validationFooter}</p>
          </div>
        </div>
      </div>

      <figcaption className="mt-4 text-xs text-blue-200">{HERO.previewCaption}</figcaption>
    </figure>
  )
}
