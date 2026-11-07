import { useCallback } from "react"
import type { Activity } from "@shared/types"
import { useUser } from "../../context/UserContext"
import { ActivityManager } from "../../features/ActivityManager"

interface StaffActivitiesViewProps {
  onGoToValidate: (activityId: string) => void
}

export function StaffActivitiesView({ onGoToValidate }: StaffActivitiesViewProps) {
  const { user } = useUser()

  const canManage = useCallback((activity: Activity) => activity.teacherId === user.id, [user.id])

  return <ActivityManager role="staff" canCreate canManageActivity={canManage} onGoToSubmissions={onGoToValidate} />
}