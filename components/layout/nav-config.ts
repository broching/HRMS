import {
  IconHome,
  IconUsersGroup,
  IconAddressBook,
  IconBriefcase,
  IconRss,
  IconCalendarStats,
  IconCalendarCheck,
  IconReceipt2,
  IconClockHour4,
  IconCalendarTime,
  IconChartBar,
  IconFileDollar,
  IconFileInvoice,
  IconFolders,
  type Icon,
} from "@tabler/icons-react"
import type { Permission } from "@/convex/lib/permissions"
import type { HrmsRole } from "@/convex/lib/enums"

export type NavLink = {
  title: string
  url: string
  icon?: Icon
  permission?: Permission
  roles?: HrmsRole[]
  // Collapsible category (sidebar layout only); undefined = ungrouped lead item.
  group?: string
}

export type NavSection = {
  key: string
  title: string
  url: string // section landing route
  icon: Icon
  permission?: Permission
  roles?: HrmsRole[]
  // "sidebar" renders the section's items in a left rail (like HR Lounge)
  // instead of the horizontal sub-nav bar.
  layout?: "subnav" | "sidebar"
  items: NavLink[]
}

// Primary top-nav sections. Each maps to a contextual sub-nav (its `items`).
// Gating: a section/link is visible when its `roles` include the caller's role
// (or no `roles`), AND its `permission` is granted (or no `permission`).
export const SECTIONS: NavSection[] = [
  {
    key: "feed",
    title: "Feed",
    url: "/feed",
    icon: IconRss,
    items: [{ title: "Announcements", url: "/feed" }],
  },
  {
    key: "home",
    title: "Home",
    url: "/dashboard",
    icon: IconHome,
    items: [
      { title: "Home", url: "/dashboard" },
      { title: "My Leave", url: "/leave" },
      { title: "Claims", url: "/claims" },
      { title: "Payment Requests", url: "/payment-requests" },
      { title: "Attendance", url: "/attendance" },
      { title: "Timesheets", url: "/timesheets" },
      { title: "My Tasks", url: "/tasks" },
      { title: "My Schedule", url: "/scheduling" },
      { title: "Payslips", url: "/payslips" },
      { title: "Performance", url: "/performance" },
    ],
  },
  {
    key: "team",
    title: "Team",
    url: "/team",
    icon: IconUsersGroup,
    // Any approver (managers + roles granting team access) sees the Team tab.
    permission: "team:access",
    layout: "sidebar",
    items: [
      { title: "Team", url: "/team", icon: IconUsersGroup, permission: "team:access" },
      {
        title: "Team Calendar",
        url: "/leave/calendar",
        icon: IconCalendarStats,
        permission: "leave:approve",
        group: "Approvals",
      },
      {
        title: "Leave Approvals",
        url: "/leave/requests",
        icon: IconCalendarCheck,
        permission: "leave:approve",
        group: "Approvals",
      },
      {
        title: "Claim Approvals",
        url: "/claims/requests",
        icon: IconReceipt2,
        permission: "claims:approve",
        group: "Approvals",
      },
      {
        title: "Payment Requests",
        url: "/payment-requests/requests",
        icon: IconFileInvoice,
        permission: "payment_requests:approve",
        group: "Approvals",
      },
      {
        title: "Payslip Approvals",
        url: "/payroll/approvals",
        icon: IconFileDollar,
        permission: "payroll:approve",
        group: "Approvals",
      },
      {
        title: "Team Attendance",
        url: "/attendance/team",
        icon: IconClockHour4,
        permission: "attendance:team",
        group: "Time & scheduling",
      },
      {
        title: "Team Timesheets",
        url: "/timesheets/team",
        icon: IconClockHour4,
        permission: "timesheets:team",
        group: "Time & scheduling",
      },
      {
        title: "Projects & Tasks",
        url: "/projects",
        icon: IconFolders,
        permission: "tasks:manage",
        group: "Time & scheduling",
      },
      {
        title: "Roster & OT",
        url: "/scheduling/roster",
        icon: IconCalendarTime,
        permission: "scheduling:roster",
        group: "Time & scheduling",
      },
      {
        title: "Team Reviews",
        url: "/performance/team",
        icon: IconChartBar,
        permission: "performance:team",
        group: "Performance",
      },
    ],
  },
  {
    key: "people",
    title: "People",
    url: "/employees",
    icon: IconAddressBook,
    // Directory + org chart are visible to every member; sensitive per-employee
    // fields are redacted server-side (see employees.get).
    items: [
      { title: "Employee List", url: "/employees" },
      { title: "Org Chart", url: "/employees/org-chart" },
    ],
  },
  {
    key: "hr",
    title: "HR Lounge",
    url: "/hr-lounge",
    icon: IconBriefcase,
    // HR Lounge is HR + admin only.
    permission: "hr:access",
    // Module navigation lives in the in-page HR Lounge sidebar, so the top
    // sub-nav is collapsed to a single entry (SubNav hides when <2 items).
    items: [{ title: "HR Lounge", url: "/hr-lounge" }],
  },
]

// Configuration pages (Leave Types, Claim Types, Attendance, Shift Templates)
// now live inside the HR Lounge rail (see HrLoungeShell), not a top-nav gear.

const ALL_SECTIONS: NavSection[] = [...SECTIONS]

/**
 * Resolve which section "owns" a pathname by longest-matching sub-item url.
 * e.g. `/leave/requests` → Team (beats Home's `/leave`); `/leave` → Home.
 * Returns null for routes outside the nav (e.g. `/profile`).
 */
export function resolveSection(pathname: string): NavSection | null {
  let best: { section: NavSection; len: number } | null = null
  for (const section of ALL_SECTIONS) {
    for (const item of section.items) {
      const match =
        pathname === item.url || pathname.startsWith(item.url + "/")
      if (match && (!best || item.url.length > best.len)) {
        best = { section, len: item.url.length }
      }
    }
  }
  return best?.section ?? null
}

/** The deepest sub-item url that prefixes the current pathname (active link). */
export function activeItemUrl(section: NavSection, pathname: string): string | null {
  let best: string | null = null
  for (const item of section.items) {
    const match = pathname === item.url || pathname.startsWith(item.url + "/")
    if (match && (!best || item.url.length > best.length)) best = item.url
  }
  return best
}
