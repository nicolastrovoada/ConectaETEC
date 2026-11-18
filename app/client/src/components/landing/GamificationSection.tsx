import { LEVEL_THRESHOLDS, STREAK_MILESTONES, levelProgress, nextLevelGoal } from "@shared/types"
import { Section, SectionIntro } from "./Section"
import { GAMIFICATION } from "./content"

const LEVELS = [
  { name: "Bronze", range: "Menos de 100 pontos", color: "bg-amber-700" },
  { name: "Prata", range: "De 100 a 299 pontos", color: "bg-slate-400" },
  { name: "Ouro", range: "De 300 a 499 pontos", color: "bg-[#d4a017]" },
  { name: "Diamante", range: "500 pontos ou mais", color: "bg-sky-400" },
] as const

function getLevelIndex(balance: number): number {
  if (balance >= 500) return 3
  if (balance >= 300) return 2
  if (balance >= 100) return 1
  return 0
}

export function GamificationSection() {
  const exampleBalance = 120
  const progress = levelProgress(exampleBalance)
  const goal = nextLevelGoal(exampleBalance)
  const levelIndex = getLevelIndex(exampleBalance)
  const levelName = GAMIFICATION.levelNames[levelIndex]
  const label = `${GAMIFICATION.levelNamePrefix}${levelName}`
  const nextLevelName = GAMIFICATION.levelNames[levelIndex + 1]
  const goalLabel = goal.missing != null && nextLevelName
    ? GAMIFICATION.missingPointsForLevel(goal.missing, nextLevelName)
    : GAMIFICATION.progressGoalLabel
  const ranges = LEVELS.map((l, i) => ({ ...l, threshold: LEVEL_THRESHOLDS[i] }))

  return (
    <Section id="gamificacao" tone="tint" labelledBy="gamificacao-title">
      <SectionIntro titleId="gamificacao-title" title={GAMIFICATION.title} lead={GAMIFICATION.lead} />

      <div className="mt-10 md:mt-14 space-y-8">
        <div>
          <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">{GAMIFICATION.levelsTitle}</h3>
          <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label={GAMIFICATION.levelsAriaLabel}>
            {ranges.map((level) => (
              <li key={level.name} className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <span className={`mt-1 h-4 w-4 shrink-0 rounded-full ${level.color}`} aria-hidden="true" />
                <div>
                  <p className="text-lg font-extrabold text-slate-900 dark:text-white">{level.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{level.range}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300 max-w-[68ch]">
            {GAMIFICATION.afterTable}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-5 rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{GAMIFICATION.walletTitle}</p>
            <div className="mt-4 flex items-end gap-3">
              <p className="text-[2rem] font-black leading-none text-slate-900 dark:text-white">{exampleBalance} pts</p>
              <span className="mb-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {label}
              </span>
            </div>
            <div className="mt-4">
              <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden="true">
                <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-500" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {goalLabel}
              </p>
            </div>
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">{GAMIFICATION.walletNote}</p>
          </div>

          <div className="lg:col-span-7 space-y-5">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">{GAMIFICATION.originsTitle}</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                {GAMIFICATION.origins.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#1a4fa0]/60 dark:bg-blue-300/70" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{GAMIFICATION.streakLabel}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {STREAK_MILESTONES.map((m) => (
                    <span key={m.days} className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                      {m.days} dias → +{m.bonus} pts
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">{GAMIFICATION.rewardsTitle}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{GAMIFICATION.rewardsText}</p>
              <span className="mt-3 inline-flex rounded-full bg-[#eef3fa] px-3 py-1 text-xs font-semibold text-[#0d2d6b] dark:bg-slate-800 dark:text-blue-200">
                {GAMIFICATION.rewardsBadge}
              </span>
            </div>
          </div>
        </div>

        <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400 max-w-[68ch]">
          {GAMIFICATION.exampleNote}
        </p>
      </div>
    </Section>
  )
}