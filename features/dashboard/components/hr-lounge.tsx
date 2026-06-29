"use client"

import { useCurrentMember } from "@/hooks/use-current-member"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/shared/page-header"
import { AdminDashboard } from "./admin-dashboard"

// Admin/HR-only administration hub. Route visibility is gated in the nav, but
// we guard here too so a direct hit degrades gracefully instead of throwing
// from the permission-scoped dashboard queries.
export function HrLounge() {
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

  const allowed = member?.role === "admin" || member?.role === "hr"
  if (!allowed) {
    return (
      <div className="px-4 lg:px-6">
        <p className="text-muted-foreground text-sm">
          The HR Lounge is available to HR and admins only.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="HR Lounge"
        description="Org-wide overview and administration."
      />
      <AdminDashboard />
    </div>
  )
}
