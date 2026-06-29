"use client"

import Link from "next/link"
import { useQuery } from "convex/react"
import { IconBell } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import { useCurrentMember } from "@/hooks/use-current-member"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const APPROVER_ROLES = ["admin", "hr", "manager"] as const

export function PendingActions() {
  const member = useCurrentMember()
  const isApprover =
    member != null &&
    (APPROVER_ROLES as readonly string[]).includes(member.role)

  const leave = useQuery(
    api.leaveRequests.approvalQueue,
    isApprover ? {} : "skip",
  )
  const claims = useQuery(api.claims.approvalQueue, isApprover ? {} : "skip")

  if (!isApprover) return null

  const leaveCount = leave?.length ?? 0
  const claimCount = claims?.length ?? 0
  const total = leaveCount + claimCount

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="focus-visible:ring-ring text-muted-foreground hover:text-foreground relative rounded-md p-1.5 outline-none focus-visible:ring-2">
        <IconBell className="size-5" />
        {total > 0 && (
          <Badge className="absolute -right-1 -top-1 size-4 justify-center rounded-full p-0 text-[10px] tabular-nums">
            {total > 9 ? "9+" : total}
          </Badge>
        )}
        <span className="sr-only">Pending actions</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Pending actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {total === 0 ? (
          <p className="text-muted-foreground px-2 py-3 text-center text-sm">
            You&apos;re all caught up.
          </p>
        ) : (
          <>
            {leaveCount > 0 && (
              <DropdownMenuItem asChild>
                <Link href="/leave/requests" className="justify-between">
                  Leave approvals
                  <Badge variant="secondary">{leaveCount}</Badge>
                </Link>
              </DropdownMenuItem>
            )}
            {claimCount > 0 && (
              <DropdownMenuItem asChild>
                <Link href="/claims/requests" className="justify-between">
                  Claim approvals
                  <Badge variant="secondary">{claimCount}</Badge>
                </Link>
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
