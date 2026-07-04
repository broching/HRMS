"use client"

import * as React from "react"
import { useCurrentMember } from "@/hooks/use-current-member"
import { hasPermission, type Permission } from "@/convex/lib/permissions"
import type { HrmsRole } from "@/convex/lib/enums"
import { Skeleton } from "@/components/ui/skeleton"

// Client-side route guard. Renders `children` only when the current member's
// role satisfies `roles` (any-of) and `permission` (if given). Used to protect
// pages that are hidden from the nav but still reachable by direct URL.
export function RoleGate({
  roles,
  permission,
  children,
}: {
  roles?: HrmsRole[]
  permission?: Permission
  children: React.ReactNode
}) {
  const member = useCurrentMember()

  if (member === undefined) {
    return <Skeleton className="mx-4 h-64 rounded-xl lg:mx-6" />
  }

  const role = member?.role
  const allowed =
    !!role &&
    (!roles || roles.includes(role)) &&
    (!permission || hasPermission(role, permission))

  if (!allowed) {
    return (
      <div className="px-4 py-6 lg:px-6">
        <p className="text-muted-foreground text-sm">
          You don’t have access to this page.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
