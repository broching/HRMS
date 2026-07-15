"use client"

import Link from "next/link"
import { useQuery } from "convex/react"
import {
  IconPlane,
  IconCalendarStats,
  IconChecklist,
  IconReceipt,
  IconUserPlus,
  IconUsers,
  IconCash,
  IconClipboardCheck,
  type Icon,
} from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useCurrentMember } from "@/hooks/use-current-member"
import { permitted } from "@/convex/lib/permissions"

// A compact count of pending work, anchored to a quick action. Circular for a
// single digit, expands for two, caps at 99+ so it never breaks the pill shape.
function CountBadge({ count }: { count: number }) {
  return (
    <span
      className="bg-primary text-primary-foreground ml-1 inline-grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums leading-none"
      aria-label={`${count} pending`}
    >
      {count > 99 ? "99+" : count}
    </span>
  )
}

type Action = {
  label: string
  href: string
  icon: Icon
  count?: number
}

export function QuickActions() {
  const member = useCurrentMember()
  const permissions = member?.permissions

  const isApprover = permitted(permissions, "team:access")
  const canManage = permitted(permissions, "employees:manage")
  const canReadAll = permitted(permissions, "employees:read:all")

  // Pending-work counts. Each query returns 0 when the caller has nothing to act
  // on, so the badged card only appears for people who actually have work.
  const reviewCount = useQuery(api.reviews.pendingCount) ?? 0
  const leaveApprovals = useQuery(api.leaveRequests.pendingApprovalCount) ?? 0
  const claimApprovals = useQuery(api.claims.pendingApprovalCount) ?? 0
  const paymentApprovals = useQuery(api.paymentRequests.pendingApprovalCount) ?? 0

  // Cards for work awaiting the caller — surfaced only when there's something to
  // do, ordered so the badge is the reason the card is there.
  const pending: Action[] = [
    { label: "Appraisals to complete", href: "/performance", icon: IconClipboardCheck, count: reviewCount },
    { label: "Leave approvals", href: "/leave/requests", icon: IconChecklist, count: leaveApprovals },
    { label: "Claim approvals", href: "/claims/requests", icon: IconReceipt, count: claimApprovals },
    { label: "Payment approvals", href: "/payment-requests/requests", icon: IconCash, count: paymentApprovals },
  ].filter((a) => a.count > 0)

  // Always-available shortcuts.
  const shortcuts: Action[] = [
    { label: "Apply for leave", href: "/leave", icon: IconPlane },
    { label: "Submit a claim", href: "/claims", icon: IconReceipt },
    { label: "Team calendar", href: "/leave/calendar", icon: IconCalendarStats },
    ...(isApprover && leaveApprovals === 0
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
        {pending.map((a) => (
          <Button
            key={a.href}
            asChild
            variant="outline"
            size="sm"
            className="border-primary/30 bg-primary/5 hover:bg-primary/10"
          >
            <Link href={a.href}>
              <a.icon className="size-4" />
              {a.label}
              <CountBadge count={a.count!} />
            </Link>
          </Button>
        ))}
        {pending.length > 0 && shortcuts.length > 0 && (
          <span className="bg-border mx-1 hidden w-px self-stretch sm:block" aria-hidden />
        )}
        {shortcuts.map((a) => (
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
