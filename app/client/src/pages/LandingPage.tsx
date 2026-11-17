import { ContactSection } from "../components/landing/ContactSection"
import { DevelopmentSection } from "../components/landing/DevelopmentSection"
import { FeaturesSection } from "../components/landing/FeaturesSection"
import { GamificationSection } from "../components/landing/GamificationSection"
import { HeroSection } from "../components/landing/HeroSection"
import { LandingFooter } from "../components/landing/LandingFooter"
import { LandingHeader } from "../components/landing/LandingHeader"
import { ProblemSection } from "../components/landing/ProblemSection"
import { ProfilesSection } from "../components/landing/ProfilesSection"
import { ProjectStatusSection } from "../components/landing/ProjectStatusSection"
import { SolutionSection } from "../components/landing/SolutionSection"
import { TechnologySection } from "../components/landing/TechnologySection"
import { WorkflowSection } from "../components/landing/WorkflowSection"
import { A11Y } from "../components/landing/content"

export interface LandingPageProps {
  /** Abre o LoginPage existente (mesma ação dos CTAs de acesso). */
  onRequestLogin: () => void
}

/** Landing pública exibida quando não há sessão e o visitante ainda não pediu login. */
export function LandingPage({ onRequestLogin }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-[#fbfcfe] text-slate-900 dark:bg-slate-950 dark:text-white">
      <a className="skip-link" href="#conteudo">
        {A11Y.skipToContent}
      </a>

      <LandingHeader onRequestLogin={onRequestLogin} />

      <main id="conteudo" tabIndex={-1} className="outline-none">
        <HeroSection onRequestLogin={onRequestLogin} />
        <ProblemSection />
        <SolutionSection />
        <FeaturesSection />
        <ProfilesSection />
        <WorkflowSection />
        <GamificationSection />
        <DevelopmentSection />
        <TechnologySection />
        <ProjectStatusSection />
        <ContactSection />
      </main>

      <LandingFooter />
    </div>
  )
}
