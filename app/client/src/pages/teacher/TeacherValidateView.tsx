import { useCallback } from "react"
import type { Activity } from "@shared/types"
import { useUser } from "../../context/UserContext"
import { SubmissionsManager } from "../../features/SubmissionsManager"

interface TeacherValidateViewProps {
  preselectActivityId?: string
}

export function TeacherValidateView({ preselectActivityId }: TeacherValidateViewProps) {
  const { user } = useUser()

  const canValidate = useCallback((activity: Activity) => activity.teacherId === user.id, [user.id])

  return <SubmissionsManager role="teacher" canValidateActivity={canValidate} preselectActivityId={preselectActivityId} />
}