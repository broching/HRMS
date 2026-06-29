"use client"

import type { Id } from "@/convex/_generated/dataModel"
import { ProfileView } from "@/features/profile/components/profile-view"

export function EmployeeProfile({
  employeeId,
}: {
  employeeId: Id<"employees">
}) {
  return <ProfileView employeeId={employeeId} mode="manage" />
}
