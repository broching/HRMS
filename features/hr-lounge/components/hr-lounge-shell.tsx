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
  IconFileInvoice,
  IconChartBar,
  IconReportAnalytics,
  IconSitemap,
  IconBuildingCog,
  IconCreditCard,
  IconUserPlus,
  IconBriefcase,
  IconClockCog,
  IconCalendarTime,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  type Icon,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { useCurrentMember } from "@/hooks/use-current-member"
import { permitted, type Permission } from "@/convex/lib/permissions"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type Item = {
  label: string
  icon: Icon
  href?: string
  exact?: boolean
  comingSoon?: boolean
  // Sub-function gate; omitted items are visible to anyone with hr:access.
  permission?: Permission
}

// The HR module rail. The core HR modules live in-shell under /hr-lounge so the
// rail stays present; a few advanced screens still deep-link to admin pages.
// Each entry is gated by the permission backing that module, so removing a
// permission from a role hides the module from that role's rail.
const ITEMS: Item[] = [
  { label: "Overview", icon: IconLayoutDashboard, href: "/hr-lounge/overview" },
  {
    label: "Employee List",
    icon: IconUsers,
    href: "/hr-lounge",
    exact: true,
    permission: "employees:manage",
  },
  {
    label: "Leave",
    icon: IconCalendarStats,
    href: "/hr-lounge/leave",
    permission: "leave:config",
  },
  {
    label: "Payroll",
    icon: IconCash,
    href: "/hr-lounge/payroll",
    permission: "payroll:manage",
  },
  {
    label: "Compensation",
    icon: IconCoin,
    href: "/hr-lounge/payroll/compensation",
    permission: "payroll:manage",
  },
  {
    label: "Expense Claims",
    icon: IconReceipt2,
    href: "/hr-lounge/claims",
    permission: "claims:read:all",
  },
  {
    label: "Payment Requests",
    icon: IconFileInvoice,
    href: "/hr-lounge/payment-requests",
    permission: "payment_requests:read:all",
  },
  {
    label: "Recruitment",
    icon: IconBriefcase,
    href: "/hr-lounge/recruitment",
    permission: "recruitment:manage",
  },
  {
    label: "Performance",
    icon: IconChartBar,
    href: "/hr-lounge/performance",
    permission: "performance:manage",
  },
  {
    label: "Reports",
    icon: IconReportAnalytics,
    href: "/hr-lounge/reports",
    permission: "reports:view",
  },
  {
    label: "Org Structure",
    icon: IconSitemap,
    href: "/hr-lounge/org-structure",
    permission: "employees:manage",
  },
  {
    label: "Organization",
    icon: IconBuildingCog,
    href: "/hr-lounge/org-settings",
    permission: "org:manage",
  },
  {
    label: "Billing & plan",
    icon: IconCreditCard,
    href: "/hr-lounge/billing",
    permission: "org:manage",
  },
  {
    label: "Attendance Config",
    icon: IconClockCog,
    href: "/settings/attendance",
    permission: "attendance:config",
  },
  {
    label: "Shift Templates",
    icon: IconCalendarTime,
    href: "/settings/shift-templates",
    permission: "scheduling:manage",
  },
  { label: "Onboarding", icon: IconUserPlus, comingSoon: true },
]

export function HrLoungeShell({ children }: { children: React.ReactNode }) {
  const member = useCurrentMember()
  const pathname = usePathname()
  const [collapsed, setCollapsed] = React.useState(false)

  if (member === undefined) {
    return (
      <div className="flex flex-col gap-4 px-4 py-6 lg:px-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const allowed = !!member?.permissions?.includes("hr:access")
  if (!allowed) {
    return (
      <div className="px-4 py-6 lg:px-6">
        <p className="text-muted-foreground text-sm">
          The HR Lounge is available to HR and admins only.
        </p>
      </div>
    )
  }

  // Only show modules this member's role can actually open.
  const items = ITEMS.filter(
    (item) => !item.permission || permitted(member?.permissions, item.permission),
  )

  // Longest-matching href wins, so e.g. /hr-lounge/payroll/compensation
  // highlights Compensation rather than also lighting up Payroll.
  let activeHref: string | null = null
  for (const item of items) {
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
    <div className="flex flex-col gap-6 py-4 lg:flex-row lg:gap-0">
      <aside
        className={cn(
          "px-4 transition-all duration-200 lg:shrink-0 lg:border-r lg:border-border/70 lg:pr-4 lg:pl-6",
          collapsed ? "lg:w-20" : "lg:w-60",
        )}
      >
        <div className="mb-3 flex items-center justify-between px-1">
          <Link
            href="/hr-lounge"
            className={cn(
              "text-xl font-semibold",
              collapsed && "lg:sr-only",
            )}
          >
            HR Lounge
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="text-muted-foreground hover:bg-accent hover:text-foreground hidden size-8 shrink-0 items-center justify-center rounded-lg transition-colors lg:flex"
          >
            {collapsed ? (
              <IconLayoutSidebarLeftExpand className="size-5" />
            ) : (
              <IconLayoutSidebarLeftCollapse className="size-5" />
            )}
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {items.map((item) => {
            const active = isActive(item)
            const content = (
              <span
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
                  collapsed && "lg:justify-center lg:px-2",
                  active
                    ? "border-primary/20 bg-primary/10 text-primary font-medium"
                    : "hover:bg-accent/50 border-transparent",
                  item.comingSoon && "opacity-60",
                )}
              >
                <span className="flex items-center gap-2.5">
                  <item.icon className="size-4 shrink-0" />
                  <span className={cn(collapsed && "lg:hidden")}>
                    {item.label}
                  </span>
                </span>
                {item.comingSoon && !collapsed && (
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

      <div className="min-w-0 flex-1 lg:pl-6">{children}</div>
    </div>
  )
}
