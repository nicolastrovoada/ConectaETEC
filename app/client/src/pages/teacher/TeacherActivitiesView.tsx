import { useCallback } from "react"
import type { Activity } from "@shared/types"
import { useUser } from "../../context/UserContext"
import { ActivityManager } from "../../features/ActivityManager"

interface TeacherActivitiesViewProps {
  onGoToValidate: (activityId: string) => void
}

export function TeacherActivitiesView({ onGoToValidate }: TeacherActivitiesViewProps) {
  const { user } = useUser()

  const canManage = useCallback((activity: Activity) => activity.teacherId === user.id, [user.id])

  return <ActivityManager role="teacher" canCreate canManageActivity={canManage} onGoToSubmissions={onGoToValidate} />
}