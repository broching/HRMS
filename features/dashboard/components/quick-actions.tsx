"use client"

import Link from "next/link"
import {
  IconPlane,
  IconCalendarStats,
  IconChecklist,
  IconReceipt,
  IconUserPlus,
  IconUsers,
  type Icon,
} from "@tabler/icons-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useCurrentMember } from "@/hooks/use-current-member"
import { permitted } from "@/convex/lib/permissions"

export function QuickActions() {
  const member = useCurrentMember()
  const permissions = member?.permissions

  const isApprover = permitted(permissions, "team:access")
  const canManage = permitted(permissions, "employees:manage")
  const canReadAll = permitted(permissions, "employees:read:all")

  const actions: { label: string; href: string; icon: Icon }[] = [
    { label: "Apply for leave", href: "/leave", icon: IconPlane },
    { label: "Submit a claim", href: "/claims", icon: IconReceipt },
    { label: "Team calendar", href: "/leave/calendar", icon: IconCalendarStats },
    ...(isApprover
      ? [{ label: "Approvals", href: "/leave/requests", icon: IconChecklist }]
      : []),
    ...(canManage
      ? [{ label: "Add employee", href: "/employees/new", icon: IconUserPlus }]
      : []),
    ...(canReadAll
      ? [{ label: "Employees", href: "/employees", icon: IconUsers }]
      : []),
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick actions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button key={a.href} asChild variant="outline" size="sm">
            <Link href={a.href}>
              <a.icon className="size-4" />
              {a.label}
            </Link>
          </Button>
        ))}
      </CardContent>
    </Card>
  )
}
