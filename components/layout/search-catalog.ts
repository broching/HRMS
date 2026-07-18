import {
  IconHome,
  IconRss,
  IconCalendarStats,
  IconCalendarCheck,
  IconReceipt2,
  IconReceiptTax,
  IconFileInvoice,
  IconClockHour4,
  IconClockCog,
  IconCalendarTime,
  IconChecklist,
  IconFolders,
  IconChartBar,
  IconUsersGroup,
  IconUsers,
  IconAddressBook,
  IconSitemap,
  IconLayoutDashboard,
  IconCash,
  IconCoin,
  IconBriefcase,
  IconReportAnalytics,
  IconBuildingCog,
  IconCreditCard,
  type Icon,
} from "@tabler/icons-react"
import { permitted, type Permission } from "@/convex/lib/permissions"
import type { ModuleKey } from "@/convex/lib/modules"
import type { HrmsRole } from "@/convex/lib/enums"

// A single searchable destination. `context` is the workspace it lives in and is
// rendered next to the label (e.g. "Leave (Team)" vs "Leave (HR Lounge)") so the
// same concept surfaces once per area the user can actually reach. Gating mirrors
// the nav: an entry shows only when its `permission` is granted (or absent) AND
// its `roles` include the caller's role (or absent).
export type SearchContext = "Personal" | "People" | "Team" | "HR Lounge"

export type SearchEntry = {
  label: string
  context: SearchContext
  href: string
  icon: Icon
  permission?: Permission
  roles?: HrmsRole[]
  // Product module; entry is hidden when the org has the module disabled.
  module?: ModuleKey
  // Extra terms that should match this entry beyond its label.
  keywords?: string[]
}

// Full destination catalogue. Kept in sync with `SECTIONS` (top nav) and the HR
// Lounge rail (see hr-lounge-shell). Personal + People entries are open to every
// member; Team + HR Lounge entries are permission-gated.
const CATALOG: SearchEntry[] = [
  // ── Personal ──────────────────────────────────────────────────────────────
  { label: "Home", context: "Personal", href: "/dashboard", icon: IconHome, keywords: ["dashboard"] },
  { label: "Feed", context: "Personal", href: "/feed", icon: IconRss, keywords: ["announcements", "news"] },
  { label: "My Leave", context: "Personal", href: "/leave", icon: IconCalendarStats, module: "leave", keywords: ["time off", "vacation", "annual", "apply leave"] },
  { label: "My Claims", context: "Personal", href: "/claims", icon: IconReceipt2, module: "claims", keywords: ["expense", "reimburse", "mileage"] },
  { label: "My Payment Requests", context: "Personal", href: "/payment-requests", icon: IconFileInvoice, module: "payment_requests", keywords: ["payment", "request for payment", "vendor", "invoice", "payee"] },
  { label: "Attendance", context: "Personal", href: "/attendance", icon: IconClockHour4, module: "attendance", keywords: ["clock in", "clock out", "timesheet"] },
  { label: "Timesheets", context: "Personal", href: "/timesheets", icon: IconClockHour4, module: "timesheets", keywords: ["log time", "time entry", "hours", "log hours", "timesheet"] },
  { label: "My Tasks", context: "Personal", href: "/tasks", icon: IconChecklist, module: "timesheets", keywords: ["task", "assigned", "to do", "todo", "project task"] },
  { label: "My Schedule", context: "Personal", href: "/scheduling", icon: IconCalendarTime, module: "attendance", keywords: ["roster", "shift"] },
  { label: "Payslips", context: "Personal", href: "/payslips", icon: IconCash, module: "payroll", keywords: ["salary", "pay", "payroll"] },
  { label: "My Performance", context: "Personal", href: "/performance", icon: IconChartBar, module: "performance", keywords: ["review", "appraisal", "goals"] },

  // ── People (open to all members) ─────────────────────────────────────────
  { label: "Employee List", context: "People", href: "/employees", icon: IconAddressBook, keywords: ["directory", "staff", "people", "colleagues"] },
  { label: "Org Chart", context: "People", href: "/employees/org-chart", icon: IconSitemap, keywords: ["hierarchy", "reporting line", "structure"] },

  // ── Team workspace ────────────────────────────────────────────────────────
  { label: "Team", context: "Team", href: "/team", icon: IconUsersGroup, permission: "team:access", keywords: ["reports", "my team"] },
  { label: "Team Calendar", context: "Team", href: "/leave/calendar", icon: IconCalendarStats, permission: "leave:approve", keywords: ["leave", "who is away", "time off"] },
  { label: "Leave Approvals", context: "Team", href: "/leave/requests", icon: IconCalendarCheck, permission: "leave:approve", keywords: ["leave", "approve", "requests"] },
  { label: "Claim Approvals", context: "Team", href: "/claims/requests", icon: IconReceipt2, permission: "claims:approve", keywords: ["claims", "expense", "approve"] },
  { label: "Payment Requests", context: "Team", href: "/payment-requests/requests", icon: IconFileInvoice, permission: "payment_requests:approve", keywords: ["payment", "request for payment", "vendor", "approve"] },
  { label: "Team Attendance", context: "Team", href: "/attendance/team", icon: IconClockHour4, permission: "attendance:team", keywords: ["clock in", "timesheet"] },
  { label: "Team Timesheets", context: "Team", href: "/timesheets/team", icon: IconClockHour4, permission: "timesheets:team", keywords: ["log time", "hours", "team hours", "timesheet"] },
  { label: "Projects & Tasks", context: "Team", href: "/projects", icon: IconFolders, permission: "tasks:manage", keywords: ["project", "task", "assign", "create task"] },
  { label: "Roster & Overtime", context: "Team", href: "/scheduling/roster", icon: IconCalendarTime, permission: "scheduling:roster", keywords: ["schedule", "shift", "rota", "overtime", "ot"] },
  { label: "Team Reviews", context: "Team", href: "/performance/team", icon: IconChartBar, permission: "performance:team", keywords: ["performance", "appraisal", "review"] },

  // ── HR Lounge ─────────────────────────────────────────────────────────────
  { label: "HR Overview", context: "HR Lounge", href: "/hr-lounge/overview", icon: IconLayoutDashboard, permission: "hr:access", keywords: ["hr lounge", "summary"] },
  { label: "Employee List", context: "HR Lounge", href: "/hr-lounge", icon: IconUsers, permission: "employees:manage", keywords: ["staff", "members", "roles", "status", "headcount"] },
  { label: "Leave", context: "HR Lounge", href: "/hr-lounge/leave", icon: IconCalendarStats, permission: "leave:config", keywords: ["leave types", "policies", "public holidays", "holidays", "entitlement"] },
  { label: "Payroll", context: "HR Lounge", href: "/hr-lounge/payroll", icon: IconCash, permission: "payroll:manage", keywords: ["salary", "pay run", "cpf"] },
  { label: "Compensation", context: "HR Lounge", href: "/hr-lounge/payroll/compensation", icon: IconCoin, permission: "payroll:manage", keywords: ["salary", "pay", "bonus"] },
  { label: "Expense Claims", context: "HR Lounge", href: "/hr-lounge/claims", icon: IconReceipt2, permission: "claims:read:all", keywords: ["expense", "reimburse", "headcount"] },
  { label: "Claim Types", context: "HR Lounge", href: "/hr-lounge/claims/settings", icon: IconReceiptTax, permission: "claims:approve:finance", keywords: ["claim settings", "categories", "expense types"] },
  { label: "Payment Requests", context: "HR Lounge", href: "/hr-lounge/payment-requests", icon: IconFileInvoice, permission: "payment_requests:read:all", keywords: ["payment", "request for payment", "vendor", "invoice", "templates"] },
  { label: "Projects", context: "HR Lounge", href: "/hr-lounge/projects", icon: IconFolders, permission: "projects:manage", keywords: ["project", "task", "assign", "client work"] },
  { label: "Timesheet Report", context: "HR Lounge", href: "/hr-lounge/timesheets", icon: IconClockHour4, permission: "projects:manage", keywords: ["timesheet", "hours", "log time", "billable", "report"] },
  { label: "Recruitment", context: "HR Lounge", href: "/hr-lounge/recruitment", icon: IconBriefcase, permission: "recruitment:manage", keywords: ["jobs", "candidates", "hiring", "job board"] },
  { label: "Performance", context: "HR Lounge", href: "/hr-lounge/performance", icon: IconChartBar, permission: "performance:manage", keywords: ["appraisal", "review cycles", "360"] },
  { label: "Reports", context: "HR Lounge", href: "/hr-lounge/reports", icon: IconReportAnalytics, permission: "reports:view", keywords: ["statistics", "analytics", "export", "attrition"] },
  { label: "Org Structure", context: "HR Lounge", href: "/hr-lounge/org-structure", icon: IconSitemap, permission: "employees:manage", keywords: ["departments", "offices", "hierarchy"] },
  { label: "Organization Settings", context: "HR Lounge", href: "/hr-lounge/org-settings", icon: IconBuildingCog, permission: "org:manage", keywords: ["logo", "locale", "name", "org profile", "currency"] },
  { label: "Billing & plan", context: "HR Lounge", href: "/hr-lounge/billing", icon: IconCreditCard, permission: "org:manage", keywords: ["subscription", "stripe", "pricing", "plan", "seats", "upgrade", "payment method", "invoice"] },
  { label: "Attendance", context: "HR Lounge", href: "/hr-lounge/attendance", icon: IconClockCog, permission: "attendance:config", keywords: ["qr", "geofence", "office", "clock in", "clock-ins", "corrections", "attendance config"] },
  { label: "Roster & Overtime", context: "HR Lounge", href: "/hr-lounge/roster", icon: IconCalendarTime, permission: "scheduling:manage", keywords: ["roster", "overtime", "schedule", "shift", "attendance report"] },
  { label: "Scheduling", context: "HR Lounge", href: "/settings/scheduling", icon: IconCalendarTime, permission: "scheduling:manage", keywords: ["roster", "shifts", "schedule", "working hours", "pattern", "shift template"] },
]

function canSee(
  entry: SearchEntry,
  role: HrmsRole | undefined,
  permissions: readonly string[] | undefined,
  modules: readonly string[] | undefined,
): boolean {
  if (entry.roles && (!role || !entry.roles.includes(role))) return false
  if (entry.permission && !permitted(permissions, entry.permission)) return false
  if (entry.module && !(modules ?? []).includes(entry.module)) return false
  return true
}

/** Every destination the given member can reach, in catalogue order. */
export function visibleEntries(
  role: HrmsRole | undefined,
  permissions: readonly string[] | undefined,
  modules: readonly string[] | undefined,
): SearchEntry[] {
  return CATALOG.filter((e) => canSee(e, role, permissions, modules))
}

/**
 * Rank `entries` against a free-text `query`. Matches label first, then context,
 * then keywords; an empty query returns everything (for the palette's idle
 * state). Simple substring scoring — cheap and predictable for a small catalog.
 */
export function searchEntries(
  entries: SearchEntry[],
  query: string,
): SearchEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return entries

  const scored: { entry: SearchEntry; score: number }[] = []
  for (const entry of entries) {
    const label = entry.label.toLowerCase()
    const context = entry.context.toLowerCase()
    let score = -1
    if (label.startsWith(q)) score = 100
    else if (label.includes(q)) score = 80
    else if (`${label} (${context})`.includes(q)) score = 60
    else if (entry.keywords?.some((k) => k.toLowerCase().includes(q))) score = 40
    if (score >= 0) scored.push({ entry, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.map((s) => s.entry)
}
