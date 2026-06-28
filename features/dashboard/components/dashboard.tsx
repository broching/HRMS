"use client"

import { useCurrentMember } from "@/hooks/use-current-member"
import { hasPermission } from "@/convex/lib/permissions"
import { Skeleton } from "@/components/ui/skeleton"
import { AdminDashboard } from "./admin-dashboard"
import { PersonalDashboard } from "./personal-dashboard"

export function Dashboard() {
  const member = useCurrentMember()

  if (member === undefined) {
    return (
      <div className="grid gap-4 px-4 sm:grid-cols-2 lg:grid-cols-4 lg:px-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    )
  }

  // HR/Admin get the org-wide dashboard; everyone else gets the personal view.
  const orgView = member ? hasPermission(member.role, "employees:read:all") : false
  return orgView ? <AdminDashboard /> : <PersonalDashboard />
}
