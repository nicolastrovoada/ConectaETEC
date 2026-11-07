import { SubmissionsManager } from "../../features/SubmissionsManager"

interface CoordinatorValidationsViewProps {
  preselectActivityId?: string
}

export function CoordinatorValidationsView({ preselectActivityId }: CoordinatorValidationsViewProps) {
  return (
    <SubmissionsManager
      role="coordinator"
      canValidateActivity={() => true}
      title="Validações da escola"
      subtitle="Todas as entregas da plataforma"
      preselectActivityId={preselectActivityId}
    />
  )
}