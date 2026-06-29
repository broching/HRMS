"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery, useMutation } from "convex/react"
import { IconBell } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import { useCurrentMember } from "@/hooks/use-current-member"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

// Map a notification's type prefix to the page that best resolves it.
function hrefFor(type: string): string {
  if (type.startsWith("leave.nudge") || type.startsWith("leave.requested"))
    return "/leave/requests"
  if (type.startsWith("leave.resubmitted")) return "/leave/requests"
  if (type.startsWith("leave.")) return "/leave"
  if (type.startsWith("claim.requested") || type.startsWith("claim.submitted"))
    return "/claims/requests"
  if (type.startsWith("claim.")) return "/claims"
  if (type.startsWith("payroll.")) return "/payslips"
  if (type.startsWith("review.") || type.startsWith("feedback."))
    return "/performance"
  if (type.startsWith("schedule.")) return "/scheduling"
  if (type.startsWith("attendance.")) return "/attendance"
  if (type.startsWith("feed.")) return "/feed"
  return "/dashboard"
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms
  const min = Math.floor(diff / 60000)
  if (min < 1) return "just now"
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(ms).toLocaleDateString()
}

export function NotificationCenter() {
  const member = useCurrentMember()
  const enabled = member != null
  const notifications = useQuery(api.notifications.list, enabled ? {} : "skip")
  const unread = useQuery(api.notifications.unreadCount, enabled ? {} : "skip")
  const markRead = useMutation(api.notifications.markRead)
  const markAllRead = useMutation(api.notifications.markAllRead)

  if (!enabled) return null

  const count = unread ?? 0
  const items = notifications ?? []

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="relative rounded-md p-1.5 text-white/90 outline-none hover:text-white focus-visible:ring-3 focus-visible:ring-white/50">
        <IconBell className="size-5" />
        {count > 0 && (
          <Badge className="absolute -top-1 -right-1 size-4 justify-center rounded-full p-0 text-[10px] tabular-nums">
            {count > 9 ? "9+" : count}
          </Badge>
        )}
        <span className="sr-only">Notifications</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          Notifications
          {count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-1 text-xs"
              onClick={(e) => {
                e.preventDefault()
                markAllRead({})
              }}
            >
              Mark all read
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="text-muted-foreground px-2 py-6 text-center text-sm">
              You&apos;re all caught up.
            </p>
          ) : (
            items.map((n) => (
              <Link
                key={n._id}
                href={hrefFor(n.type)}
                onClick={() => {
                  if (!n.read) markRead({ notificationId: n._id })
                }}
                className={cn(
                  "hover:bg-accent/60 flex flex-col gap-0.5 border-b px-3 py-2.5 text-sm last:border-b-0",
                  !n.read && "bg-primary/5",
                )}
              >
                <span className="flex items-center gap-2 font-medium">
                  {!n.read && (
                    <span className="bg-primary size-1.5 shrink-0 rounded-full" />
                  )}
                  {n.title}
                </span>
                {n.body && (
                  <span className="text-muted-foreground text-xs">{n.body}</span>
                )}
                <span className="text-muted-foreground text-[10px]">
                  {relativeTime(n._creationTime)}
                </span>
              </Link>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
