"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  IconLayoutDashboard,
  IconUsers,
  IconCalendarStats,
  IconCash,
  IconCoin,
  IconReceipt2,
  IconChartBar,
  IconRefresh,
  IconSitemap,
  IconUserCog,
  IconUserPlus,
  IconBriefcase,
  type Icon,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { useCurrentMember } from "@/hooks/use-current-member"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type Item = {
  label: string
  icon: Icon
  href?: string
  exact?: boolean
  comingSoon?: boolean
}

// The HR module rail. The core HR modules live in-shell under /hr-lounge so the
// rail stays present; a few advanced screens still deep-link to admin pages.
const ITEMS: Item[] = [
  { label: "Overview", icon: IconLayoutDashboard, href: "/hr-lounge/overview" },
  { label: "Employee List", icon: IconUsers, href: "/hr-lounge", exact: true },
  { label: "Leave", icon: IconCalendarStats, href: "/hr-lounge/leave" },
  { label: "Payroll", icon: IconCash, href: "/hr-lounge/payroll" },
  {
    label: "Compensation",
    icon: IconCoin,
    href: "/hr-lounge/payroll/compensation",
  },
  { label: "Expense Claims", icon: IconReceipt2, href: "/hr-lounge/claims" },
  { label: "Recruitment", icon: IconBriefcase, href: "/hr-lounge/recruitment" },
  { label: "Performance", icon: IconChartBar, href: "/performance/team" },
  { label: "Review Cycles", icon: IconRefresh, href: "/settings/review-cycles" },
  { label: "Org Structure", icon: IconSitemap, href: "/settings/org-structure" },
  { label: "Members", icon: IconUserCog, href: "/settings/members" },
  { label: "Onboarding", icon: IconUserPlus, comingSoon: true },
]

export function HrLoungeShell({ children }: { children: React.ReactNode }) {
  const member = useCurrentMember()
  const pathname = usePathname()

  if (member === undefined) {
    return (
      <div className="flex flex-col gap-4 px-4 py-6 lg:px-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const allowed = member?.role === "admin" || member?.role === "hr"
  if (!allowed) {
    return (
      <div className="px-4 py-6 lg:px-6">
        <p className="text-muted-foreground text-sm">
          The HR Lounge is available to HR and admins only.
        </p>
      </div>
    )
  }

  // Longest-matching href wins, so e.g. /hr-lounge/payroll/compensation
  // highlights Compensation rather than also lighting up Payroll.
  let activeHref: string | null = null
  for (const item of ITEMS) {
    if (!item.href) continue
    const match = item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + "/")
    if (match && (!activeHref || item.href.length > activeHref.length)) {
      activeHref = item.href
    }
  }

  function isActive(item: Item): boolean {
    return !!item.href && item.href === activeHref
  }

  return (
    <div className="flex flex-col gap-6 py-4 lg:flex-row">
      <aside className="px-4 lg:w-60 lg:shrink-0 lg:pl-6">
        <div className="mb-3 px-1">
          <Link href="/hr-lounge" className="text-xl font-semibold">
            HR Lounge
          </Link>
        </div>
        <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {ITEMS.map((item) => {
            const active = isActive(item)
            const content = (
              <span
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
                  active
                    ? "border-primary/20 bg-primary/10 text-primary font-medium"
                    : "hover:bg-accent/50 border-transparent",
                  item.comingSoon && "opacity-60",
                )}
              >
                <span className="flex items-center gap-2.5">
                  <item.icon className="size-4 shrink-0" />
                  {item.label}
                </span>
                {item.comingSoon && (
                  <span className="text-muted-foreground hidden text-[10px] lg:inline">
                    Soon
                  </span>
                )}
              </span>
            )
            if (item.comingSoon) {
              return (
                <button
                  key={item.label}
                  type="button"
                  className="text-left"
                  onClick={() => toast.info(`${item.label} is coming soon.`)}
                >
                  {content}
                </button>
              )
            }
            return (
              <Link key={item.label} href={item.href!}>
                {content}
              </Link>
            )
          })}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
