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
  IconReceiptTax,
  IconReceipt2,
  IconFileInvoice,
  IconChartBar,
  IconReportAnalytics,
  IconBuildingCog,
  IconCreditCard,
  IconBriefcase,
  IconFolders,
  IconClockHour4,
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
import { SidebarNav, type SidebarNavGroup } from "@/components/layout/sidebar-nav"

type Item = {
  label: string
  icon: Icon
  href?: string
  exact?: boolean
  comingSoon?: boolean
  // Sub-function gate; omitted items are visible to anyone with hr:access.
  permission?: Permission
  // Collapsible category this module sits under; undefined = ungrouped lead.
  group?: string
}

// The HR module rail. The core HR modules live in-shell under /hr-lounge so the
// rail stays present; a few advanced screens still deep-link to admin pages.
// Each entry is gated by the permission backing that module, so removing a
// permission from a role hides the module from that role's rail.
const ITEMS: Item[] = [
  { label: "Overview", icon: IconLayoutDashboard, href: "/hr-lounge/overview" },
  // ── People ──
  {
    label: "Employee List",
    icon: IconUsers,
    href: "/hr-lounge",
    exact: true,
    permission: "employees:manage",
    group: "People & organization",
  },
  // Org structure now lives as a tab under Organization (below) — no separate
  // People entry.
  {
    label: "Recruitment",
    icon: IconBriefcase,
    href: "/hr-lounge/recruitment",
    permission: "recruitment:manage",
    group: "People & organization",
  },
  {
    label: "Performance",
    icon: IconChartBar,
    href: "/hr-lounge/performance",
    permission: "performance:manage",
    group: "People & organization",
  },
  // ── Payroll & claims ──
  {
    label: "Payroll",
    icon: IconCash,
    href: "/hr-lounge/payroll",
    permission: "payroll:manage",
    group: "Payroll & claims",
  },
  {
    label: "Compensation",
    icon: IconCoin,
    href: "/hr-lounge/payroll/compensation",
    permission: "payroll:manage",
    group: "Payroll & claims",
  },
  {
    label: "Tax Forms (IR8A)",
    icon: IconReceiptTax,
    href: "/hr-lounge/payroll/ir8a",
    permission: "payroll:ir8a",
    group: "Payroll & claims",
  },
  {
    label: "Expense Claims",
    icon: IconReceipt2,
    href: "/hr-lounge/claims",
    permission: "claims:read:all",
    group: "Payroll & claims",
  },
  {
    label: "Payment Requests",
    icon: IconFileInvoice,
    href: "/hr-lounge/payment-requests",
    permission: "payment_requests:read:all",
    group: "Payroll & claims",
  },
  // ── Time & projects ──
  {
    label: "Roster & OT",
    icon: IconCalendarTime,
    href: "/hr-lounge/roster",
    permission: "scheduling:manage",
    group: "Time & projects",
  },
  {
    label: "Projects",
    icon: IconFolders,
    href: "/hr-lounge/projects",
    permission: "projects:manage",
    group: "Time & projects",
  },
  {
    label: "Timesheet Report",
    icon: IconClockHour4,
    href: "/hr-lounge/timesheets",
    permission: "projects:manage",
    group: "Time & projects",
  },
  // ── Leave & attendance ──
  {
    label: "Leave",
    icon: IconCalendarStats,
    href: "/hr-lounge/leave",
    permission: "leave:config",
    group: "Leave & attendance",
  },
  {
    label: "Attendance",
    icon: IconClockHour4,
    href: "/hr-lounge/attendance",
    permission: "attendance:config",
    group: "Leave & attendance",
  },
  // Shift setup (work patterns + shift templates) now lives as a tab under
  // Roster & OT above — no separate nav entry.
  // ── Insights ──
  {
    label: "Reports",
    icon: IconReportAnalytics,
    href: "/hr-lounge/reports",
    permission: "reports:view",
    group: "Insights",
  },
  // ── Organization ──
  {
    label: "Organization",
    icon: IconBuildingCog,
    href: "/hr-lounge/org-settings",
    permission: "org:manage",
    group: "People & organization",
  },
  {
    label: "Billing & plan",
    icon: IconCreditCard,
    href: "/hr-lounge/billing",
    permission: "org:manage",
    group: "People & organization",
  },
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

  // Fold the flat, permission-filtered list into ordered collapsible groups.
  const groups: SidebarNavGroup[] = []
  for (const item of items) {
    const key = item.group ?? "__lead__"
    let group = groups.find((g) => g.key === key)
    if (!group) {
      group = { key, label: item.group, items: [] }
      groups.push(group)
    }
    group.items.push({
      key: item.label,
      label: item.label,
      icon: item.icon,
      href: item.href,
      active: isActive(item),
      comingSoon: item.comingSoon,
      onClick: item.comingSoon
        ? () => toast.info(`${item.label} is coming soon.`)
        : undefined,
    })
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
        <SidebarNav
          groups={groups}
          collapsed={collapsed}
          storageKey="hr-lounge-nav-groups"
        />
      </aside>

      <div className="min-w-0 flex-1 lg:pl-6">{children}</div>
    </div>
  )
}
