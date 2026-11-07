import { useCallback } from "react"
import type { Activity } from "@shared/types"
import { useUser } from "../../context/UserContext"
import { SubmissionsManager } from "../../features/SubmissionsManager"

interface StaffValidateViewProps {
  preselectActivityId?: string
}

export function StaffValidateView({ preselectActivityId }: StaffValidateViewProps) {
  const { user } = useUser()

  const canValidate = useCallback((activity: Activity) => activity.teacherId === user.id, [user.id])

  return <SubmissionsManager role="staff" canValidateActivity={canValidate} preselectActivityId={preselectActivityId} />
}