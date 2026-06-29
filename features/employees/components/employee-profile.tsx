"use client"

import type { Id } from "@/convex/_generated/dataModel"
import { ProfileView } from "@/features/profile/components/profile-view"

export function EmployeeProfile({
  employeeId,
}: {
  employeeId: Id<"employees">
}) {
  // Self-edit vs HR-manage is resolved server-side (employees.get capability
  // flags), so the same view powers /profile (self) and People (HR/manager).
  return <ProfileView employeeId={employeeId} />
}
