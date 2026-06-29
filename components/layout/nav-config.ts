import {
  IconHome,
  IconUsersGroup,
  IconAddressBook,
  IconBriefcase,
  IconRss,
  IconSettings,
  type Icon,
} from "@tabler/icons-react"
import type { Permission } from "@/convex/lib/permissions"
import type { HrmsRole } from "@/convex/lib/enums"

export type NavLink = {
  title: string
  url: string
  permission?: Permission
  roles?: HrmsRole[]
}

export type NavSection = {
  key: string
  title: string
  url: string // section landing route
  icon: Icon
  permission?: Permission
  roles?: HrmsRole[]
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
      { title: "Attendance", url: "/attendance" },
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
    roles: ["admin", "hr", "manager"],
    items: [
      { title: "Team", url: "/team" },
      { title: "Team Calendar", url: "/leave/calendar" },
      { title: "Leave Approvals", url: "/leave/requests" },
      { title: "Claim Approvals", url: "/claims/requests" },
      { title: "Team Attendance", url: "/attendance/team" },
      { title: "Roster", url: "/scheduling/roster" },
      { title: "Team Reviews", url: "/performance/team" },
    ],
  },
  {
    key: "people",
    title: "People",
    url: "/employees",
    icon: IconAddressBook,
    permission: "employees:read:all",
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
    roles: ["admin", "hr"],
    // Module navigation lives in the in-page HR Lounge sidebar, so the top
    // sub-nav is collapsed to a single entry (SubNav hides when <2 items).
    items: [{ title: "HR Lounge", url: "/hr-lounge" }],
  },
]

// Configuration area, reached via the top-nav Settings gear (not a primary tab).
export const SETTINGS_SECTION: NavSection = {
  key: "settings",
  title: "Settings",
  url: "/settings/organization",
  icon: IconSettings,
  items: [
    {
      title: "Organization",
      url: "/settings/organization",
      permission: "org:manage",
    },
    {
      title: "Leave Types",
      url: "/settings/leave-types",
      permission: "leave:config",
    },
    {
      title: "Claim Types",
      url: "/settings/claim-types",
      permission: "claims:approve:finance",
    },
    {
      title: "Attendance",
      url: "/settings/attendance",
      permission: "attendance:config",
    },
    {
      title: "Shift Templates",
      url: "/settings/shift-templates",
      permission: "scheduling:manage",
    },
  ],
}

const ALL_SECTIONS: NavSection[] = [...SECTIONS, SETTINGS_SECTION]

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
