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
  IconMail,
  IconTemplate,
  IconShieldLock,
  IconCategory,
  IconSettings,
  IconChartPie,
  IconTable,
  IconTargetArrow,
  type Icon,
} from "@tabler/icons-react"
import { permitted, type Permission } from "@/convex/lib/permissions"
import type { ModuleKey } from "@/convex/lib/modules"
import type { HrmsRole } from "@/convex/lib/enums"

// A single searchable destination. `context` is the workspace it lives in and is
// rendered next to the label (e.g. "Leave (Team)" vs "Leave (HR Lounge)") so the
// same concept surfaces once per area the user can actually reach. `group` is the
// parent page a sub-section belongs to, so tabs read as a breadcrumb — e.g.
// "Payroll › Approval flow" or "Leave › Public Holidays". Gating mirrors the nav:
// an entry shows only when its permission requirement is met (or absent) AND its
// `roles` include the caller's role (or absent).
export type SearchContext = "Personal" | "People" | "Team" | "HR Lounge"

export type SearchEntry = {
  label: string
  context: SearchContext
  href: string
  icon: Icon
  // Parent page for a sub-section (tab). Shown as a breadcrumb prefix and folded
  // into the search text, so typing the parent name surfaces all its tabs.
  group?: string
  // Requires this exact permission.
  permission?: Permission
  // Requires ANY of these permissions (for tabs gated by one of several grants).
  anyPermission?: Permission[]
  roles?: HrmsRole[]
  // Product module; entry is hidden when the org has the module disabled.
  module?: ModuleKey
  // Extra terms that should match this entry beyond its label + group.
  keywords?: string[]
}

// Full destination catalogue — every page AND every deep-linkable sub-section
// (tab) the app exposes. Kept in sync with `SECTIONS` (top nav), the HR Lounge
// rail (hr-lounge-shell) and the per-hub tab bars. Personal + People entries are
// open to every member; Team + HR Lounge entries are permission-gated. Sub-tab
// hrefs rely on the hubs reading their tab from the URL (see use-tab-param).
const CATALOG: SearchEntry[] = [
  // ── Personal ──────────────────────────────────────────────────────────────
  { label: "Home", context: "Personal", href: "/dashboard", icon: IconHome, keywords: ["dashboard"] },
  { label: "Feed", context: "Personal", href: "/feed", icon: IconRss, keywords: ["announcements", "news"] },
  { label: "My Leave", context: "Personal", href: "/leave", icon: IconCalendarStats, module: "leave", keywords: ["time off", "vacation", "annual", "apply leave", "balances", "team calendar"] },
  { label: "My Claims", context: "Personal", href: "/claims", icon: IconReceipt2, module: "claims", keywords: ["expense", "reimburse", "mileage"] },
  { label: "My Payment Requests", context: "Personal", href: "/payment-requests", icon: IconFileInvoice, module: "payment_requests", keywords: ["payment", "request for payment", "vendor", "invoice", "payee"] },
  { label: "Attendance", context: "Personal", href: "/attendance", icon: IconClockHour4, module: "attendance", keywords: ["clock in", "clock out", "qr", "history"] },
  { label: "Timesheets", context: "Personal", href: "/timesheets", icon: IconClockHour4, module: "timesheets", keywords: ["log time", "time entry", "hours", "log hours", "timesheet"] },
  { label: "My Tasks", context: "Personal", href: "/tasks", icon: IconChecklist, module: "timesheets", keywords: ["task", "assigned", "to do", "todo", "project task"] },
  { label: "My Schedule", context: "Personal", href: "/scheduling", icon: IconCalendarTime, module: "attendance", keywords: ["roster", "shift"] },
  { label: "Payslips", context: "Personal", href: "/payslips", icon: IconCash, module: "payroll", keywords: ["salary", "pay", "payroll"] },
  { label: "My Performance", context: "Personal", href: "/performance", icon: IconChartBar, module: "performance", keywords: ["review", "appraisal", "goals", "360", "development plan"] },
  { label: "My Profile", context: "Personal", href: "/profile", icon: IconAddressBook, keywords: ["account", "personal details", "photo", "settings"] },

  // ── People (open to all members) ─────────────────────────────────────────
  { label: "Employee List", context: "People", href: "/employees", icon: IconAddressBook, keywords: ["directory", "staff", "people", "colleagues"] },
  { label: "Org Chart", context: "People", href: "/employees/org-chart", icon: IconSitemap, keywords: ["hierarchy", "reporting line", "structure"] },

  // ── Team workspace ────────────────────────────────────────────────────────
  { label: "Team", context: "Team", href: "/team", icon: IconUsersGroup, permission: "team:access", keywords: ["reports", "my team"] },
  { label: "Team Calendar", context: "Team", href: "/leave/calendar", icon: IconCalendarStats, permission: "leave:approve", keywords: ["leave", "who is away", "time off"] },
  { label: "Leave Approvals", context: "Team", href: "/leave/requests", icon: IconCalendarCheck, permission: "leave:approve", keywords: ["leave", "approve", "requests"] },
  { label: "Claim Approvals", context: "Team", href: "/claims/requests", icon: IconReceipt2, permission: "claims:approve", keywords: ["claims", "expense", "approve"] },
  { label: "Payment Requests", context: "Team", href: "/payment-requests/requests", icon: IconFileInvoice, permission: "payment_requests:approve", keywords: ["payment", "request for payment", "vendor", "approve"] },
  { label: "Payslip Approvals", context: "Team", href: "/payroll/approvals", icon: IconCash, permission: "payroll:approve", keywords: ["payslip", "payroll", "approve", "sign", "release"] },
  { label: "Team Attendance", context: "Team", href: "/attendance/team", icon: IconClockHour4, permission: "attendance:team", keywords: ["clock in", "timesheet"] },
  { label: "Team Timesheets", context: "Team", href: "/timesheets/team", icon: IconClockHour4, permission: "timesheets:team", keywords: ["log time", "hours", "team hours", "timesheet"] },
  { label: "Projects & Tasks", context: "Team", href: "/projects", icon: IconFolders, permission: "tasks:manage", keywords: ["project", "task", "assign", "create task", "board", "timeline"] },

  // Roster & Overtime (Team) + its deep-linkable views.
  { label: "Roster & Overtime", context: "Team", href: "/scheduling/roster", icon: IconCalendarTime, permission: "scheduling:roster", keywords: ["schedule", "shift", "rota", "overtime", "ot"] },
  { label: "Roster", group: "Roster & Overtime", context: "Team", href: "/scheduling/roster", icon: IconCalendarTime, permission: "scheduling:roster", keywords: ["schedule", "shift", "board"] },
  { label: "Reports", group: "Roster & Overtime", context: "Team", href: "/scheduling/roster?view=reports", icon: IconReportAnalytics, permission: "scheduling:roster", keywords: ["overtime", "variance", "attendance"] },

  { label: "Team Reviews", context: "Team", href: "/performance/team", icon: IconChartBar, permission: "performance:team", keywords: ["performance", "appraisal", "review"] },

  // ── HR Lounge ─────────────────────────────────────────────────────────────
  { label: "HR Overview", context: "HR Lounge", href: "/hr-lounge/overview", icon: IconLayoutDashboard, permission: "hr:access", keywords: ["hr lounge", "summary", "headcount"] },
  { label: "Employee List", context: "HR Lounge", href: "/hr-lounge", icon: IconUsers, permission: "employees:manage", keywords: ["staff", "members", "roles", "status", "headcount"] },

  // Payroll hub + its tabs.
  { label: "Payroll", context: "HR Lounge", href: "/hr-lounge/payroll", icon: IconCash, permission: "payroll:manage", keywords: ["salary", "pay run", "cpf"] },
  { label: "Runs", group: "Payroll", context: "HR Lounge", href: "/hr-lounge/payroll", icon: IconCash, permission: "payroll:manage", keywords: ["pay run", "process payroll", "monthly"] },
  { label: "Approval flow", group: "Payroll", context: "HR Lounge", href: "/hr-lounge/payroll?tab=approval", icon: IconChecklist, permission: "payroll:manage", keywords: ["approval", "approve", "workflow", "sign off"] },
  { label: "Payslip templates", group: "Payroll", context: "HR Lounge", href: "/hr-lounge/payroll?tab=templates", icon: IconTemplate, permission: "payroll:manage", keywords: ["payslip", "template", "layout", "design"] },
  { label: "IR8A / Tax settings", group: "Payroll", context: "HR Lounge", href: "/hr-lounge/payroll?tab=ir8a", icon: IconReceiptTax, anyPermission: ["payroll:classify", "payroll:ais"], keywords: ["ir8a", "tax", "classification", "ais", "auto-inclusion"] },
  { label: "Email", group: "Payroll", context: "HR Lounge", href: "/hr-lounge/payroll?tab=email", icon: IconMail, permission: "payroll:manage", keywords: ["notification", "payslip email"] },

  // Compensation hub + its tabs.
  { label: "Compensation", context: "HR Lounge", href: "/hr-lounge/payroll/compensation", icon: IconCoin, permission: "payroll:manage", keywords: ["salary", "pay", "bonus", "allowance"] },
  { label: "Employees", group: "Compensation", context: "HR Lounge", href: "/hr-lounge/payroll/compensation", icon: IconCoin, permission: "payroll:manage", keywords: ["salary", "pay", "wages", "allowance"] },
  { label: "CPF", group: "Compensation", context: "HR Lounge", href: "/hr-lounge/payroll/compensation?tab=cpf", icon: IconCoin, permission: "payroll:manage", keywords: ["cpf", "contribution", "rates", "statutory"] },
  { label: "Statutory funds", group: "Compensation", context: "HR Lounge", href: "/hr-lounge/payroll/compensation?tab=funds", icon: IconCoin, permission: "payroll:manage", keywords: ["sdl", "cdac", "sinda", "mbmf", "ecf", "funds"] },

  { label: "Tax Forms (IR8A)", context: "HR Lounge", href: "/hr-lounge/payroll/ir8a", icon: IconReceiptTax, permission: "payroll:ir8a", keywords: ["ir8a", "tax", "iras", "ais", "auto-inclusion", "annual income", "tax forms", "ir8s", "appendix 8a"] },

  // Expense Claims hub + settings tabs.
  { label: "Expense Claims", context: "HR Lounge", href: "/hr-lounge/claims", icon: IconReceipt2, permission: "claims:read:all", keywords: ["expense", "reimburse", "headcount", "approve"] },
  { label: "Claim Settings", context: "HR Lounge", href: "/hr-lounge/claims/settings", icon: IconSettings, permission: "claims:approve:finance", keywords: ["claim settings", "configuration"] },
  { label: "General", group: "Claim Settings", context: "HR Lounge", href: "/hr-lounge/claims/settings", icon: IconSettings, permission: "claims:approve:finance", keywords: ["thresholds", "limits", "period cap", "general"] },
  { label: "Claim types", group: "Claim Settings", context: "HR Lounge", href: "/hr-lounge/claims/settings?tab=types", icon: IconCategory, permission: "claims:approve:finance", keywords: ["categories", "expense types", "claim types"] },
  { label: "Claim groups", group: "Claim Settings", context: "HR Lounge", href: "/hr-lounge/claims/settings?tab=groups", icon: IconUsersGroup, permission: "claims:approve:finance", keywords: ["approval flow", "groups", "who approves"] },
  { label: "Email", group: "Claim Settings", context: "HR Lounge", href: "/hr-lounge/claims/settings?tab=email", icon: IconMail, permission: "claims:approve:finance", keywords: ["notification", "claim email"] },

  // Payment Requests hub + settings tabs.
  { label: "Payment Requests", context: "HR Lounge", href: "/hr-lounge/payment-requests", icon: IconFileInvoice, permission: "payment_requests:read:all", keywords: ["payment", "request for payment", "vendor", "invoice"] },
  { label: "Settings", group: "Payment Requests", context: "HR Lounge", href: "/hr-lounge/payment-requests/settings", icon: IconSettings, permission: "payment_requests:read:all", keywords: ["configuration", "payment settings"] },
  { label: "Approval flow", group: "Payment Requests", context: "HR Lounge", href: "/hr-lounge/payment-requests/settings", icon: IconChecklist, permission: "payment_requests:read:all", keywords: ["approval", "approve", "workflow", "who approves"] },
  { label: "Templates", group: "Payment Requests", context: "HR Lounge", href: "/hr-lounge/payment-requests/settings?tab=templates", icon: IconTemplate, permission: "payment_requests:read:all", keywords: ["template", "payment request form", "layout"] },
  { label: "Email", group: "Payment Requests", context: "HR Lounge", href: "/hr-lounge/payment-requests/settings?tab=email", icon: IconMail, permission: "payment_requests:read:all", keywords: ["notification", "payment email"] },

  // Leave (HR) hub + tabs.
  { label: "Leave", context: "HR Lounge", href: "/hr-lounge/leave", icon: IconCalendarStats, permission: "leave:config", keywords: ["leave types", "policies", "public holidays", "holidays", "entitlement"] },
  { label: "Dashboard", group: "Leave", context: "HR Lounge", href: "/hr-lounge/leave", icon: IconLayoutDashboard, permission: "leave:config", keywords: ["overview", "who is away", "leave dashboard"] },
  { label: "Leave Management", group: "Leave", context: "HR Lounge", href: "/hr-lounge/leave?tab=management", icon: IconCalendarCheck, permission: "leave:config", keywords: ["requests", "adjust balance", "manage leave"] },
  { label: "Leave Policies", group: "Leave", context: "HR Lounge", href: "/hr-lounge/leave?tab=policies", icon: IconChecklist, permission: "leave:config", keywords: ["policy", "entitlement", "carry forward", "accrual", "leave types"] },
  { label: "Public Holidays", group: "Leave", context: "HR Lounge", href: "/hr-lounge/leave?tab=holidays", icon: IconCalendarCheck, permission: "leave:config", keywords: ["holidays", "calendar", "public holiday"] },
  { label: "Email", group: "Leave", context: "HR Lounge", href: "/hr-lounge/leave?tab=email", icon: IconMail, permission: "leave:config", keywords: ["notification", "leave email"] },

  // Projects + Timesheet report (HR).
  { label: "Projects", context: "HR Lounge", href: "/hr-lounge/projects", icon: IconFolders, permission: "projects:manage", keywords: ["project", "task", "assign", "client work"] },
  { label: "Timesheet Report", context: "HR Lounge", href: "/hr-lounge/timesheets", icon: IconClockHour4, permission: "projects:manage", keywords: ["timesheet", "hours", "log time", "billable", "report"] },

  // Recruitment hub + tabs.
  { label: "Recruitment", context: "HR Lounge", href: "/hr-lounge/recruitment", icon: IconBriefcase, permission: "recruitment:manage", keywords: ["jobs", "candidates", "hiring", "job board"] },
  { label: "Dashboard", group: "Recruitment", context: "HR Lounge", href: "/hr-lounge/recruitment", icon: IconBriefcase, permission: "recruitment:manage", keywords: ["jobs", "candidates", "pipeline", "applicants"] },
  { label: "Job board settings", group: "Recruitment", context: "HR Lounge", href: "/hr-lounge/recruitment/settings", icon: IconSettings, permission: "recruitment:manage", keywords: ["job board", "public board", "careers page", "settings"] },

  // Performance (HR) hub + tabs.
  { label: "Performance", context: "HR Lounge", href: "/hr-lounge/performance", icon: IconChartBar, permission: "performance:manage", keywords: ["appraisal", "review cycles", "360"] },
  { label: "Dashboard", group: "Performance", context: "HR Lounge", href: "/hr-lounge/performance", icon: IconLayoutDashboard, permission: "performance:manage", keywords: ["overview", "performance dashboard"] },
  { label: "Report", group: "Performance", context: "HR Lounge", href: "/hr-lounge/performance/report", icon: IconChartPie, permission: "performance:manage", keywords: ["performance report", "charts", "ratings", "distribution"] },
  { label: "Cycle Overview", group: "Performance", context: "HR Lounge", href: "/hr-lounge/performance/cycles", icon: IconCalendarCheck, permission: "performance:manage", keywords: ["appraisal cycles", "review cycle", "cycles"] },
  { label: "Competency", group: "Performance", context: "HR Lounge", href: "/hr-lounge/performance/competency", icon: IconTargetArrow, permission: "performance:manage", keywords: ["competencies", "skills", "framework"] },

  // Reports (HR) hub + tabs.
  { label: "Reports", context: "HR Lounge", href: "/hr-lounge/reports", icon: IconReportAnalytics, permission: "reports:view", keywords: ["statistics", "analytics", "export", "attrition"] },
  { label: "Statistics", group: "Reports", context: "HR Lounge", href: "/hr-lounge/reports", icon: IconChartPie, permission: "reports:view", keywords: ["charts", "attrition", "headcount", "leave stats", "payroll stats"] },
  { label: "Report builder", group: "Reports", context: "HR Lounge", href: "/hr-lounge/reports/builder", icon: IconTable, permission: "reports:view", keywords: ["build report", "dataset", "fields", "csv", "excel", "export"] },
  { label: "Custom reports", group: "Reports", context: "HR Lounge", href: "/hr-lounge/reports/custom", icon: IconTable, permission: "reports:view", keywords: ["saved reports", "custom report"] },

  // Organization hub + tabs.
  { label: "Organization", context: "HR Lounge", href: "/hr-lounge/org-settings", icon: IconBuildingCog, permission: "org:manage", keywords: ["logo", "locale", "name", "org profile", "currency", "roles", "permissions", "settings"] },
  { label: "Profile", group: "Organization", context: "HR Lounge", href: "/hr-lounge/org-settings", icon: IconBuildingCog, permission: "org:manage", keywords: ["logo", "locale", "name", "currency", "statutory defaults", "org profile"] },
  { label: "Org structure", group: "Organization", context: "HR Lounge", href: "/hr-lounge/org-settings?tab=structure", icon: IconSitemap, permission: "employees:manage", keywords: ["departments", "teams", "positions", "offices", "hierarchy"] },
  { label: "Roles & permissions", group: "Organization", context: "HR Lounge", href: "/hr-lounge/org-settings?tab=roles", icon: IconShieldLock, permission: "employees:manage", keywords: ["roles", "permissions", "access", "rbac", "grants"] },

  { label: "Billing & plan", context: "HR Lounge", href: "/hr-lounge/billing", icon: IconCreditCard, permission: "org:manage", keywords: ["subscription", "stripe", "pricing", "plan", "seats", "upgrade", "payment method", "invoice"] },

  // Attendance (HR) hub + tabs.
  { label: "Attendance", context: "HR Lounge", href: "/hr-lounge/attendance", icon: IconClockCog, permission: "attendance:config", keywords: ["qr", "geofence", "office", "clock in", "clock-ins", "corrections", "attendance config"] },
  { label: "Clock-ins", group: "Attendance", context: "HR Lounge", href: "/hr-lounge/attendance", icon: IconClockHour4, permission: "attendance:config", keywords: ["clock-ins", "corrections", "attendance records"] },
  { label: "Configuration", group: "Attendance", context: "HR Lounge", href: "/hr-lounge/attendance/config", icon: IconSettings, permission: "attendance:config", keywords: ["qr", "geofence", "office", "poster", "attendance settings"] },

  // Roster & Overtime (HR) hub + views.
  { label: "Roster & Overtime", context: "HR Lounge", href: "/hr-lounge/roster", icon: IconCalendarTime, permission: "scheduling:manage", keywords: ["roster", "overtime", "schedule", "shift", "attendance report"] },
  { label: "Roster", group: "Roster & Overtime", context: "HR Lounge", href: "/hr-lounge/roster", icon: IconCalendarTime, permission: "scheduling:manage", keywords: ["schedule", "shift", "board", "ot"] },
  { label: "Reports", group: "Roster & Overtime", context: "HR Lounge", href: "/hr-lounge/roster?view=reports", icon: IconReportAnalytics, permission: "scheduling:manage", keywords: ["overtime", "variance", "attendance report"] },
  { label: "Work patterns", group: "Roster & Overtime", context: "HR Lounge", href: "/hr-lounge/roster?view=patterns", icon: IconCalendarTime, permission: "scheduling:manage", keywords: ["shift setup", "work pattern", "shift template", "working hours", "scheduling"] },
]

function canSee(
  entry: SearchEntry,
  role: HrmsRole | undefined,
  permissions: readonly string[] | undefined,
  modules: readonly string[] | undefined,
): boolean {
  if (entry.roles && (!role || !entry.roles.includes(role))) return false
  if (entry.permission && !permitted(permissions, entry.permission)) return false
  if (entry.anyPermission && !entry.anyPermission.some((p) => permitted(permissions, p)))
    return false
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

/** Breadcrumb title shown in the palette — parent page then sub-section. */
export function entryTitle(entry: SearchEntry): string {
  return entry.group ? `${entry.group} › ${entry.label}` : entry.label
}

/**
 * Rank `entries` against a free-text `query`. Matches label first, then the
 * parent group, then context, then keywords; an empty query returns everything
 * (for the palette's idle state). Simple substring scoring — cheap and
 * predictable for a small catalog.
 */
export function searchEntries(
  entries: SearchEntry[],
  query: string,
): SearchEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return entries

  const scored: { entry: SearchEntry; score: number; index: number }[] = []
  entries.forEach((entry, index) => {
    const label = entry.label.toLowerCase()
    const group = entry.group?.toLowerCase() ?? ""
    const context = entry.context.toLowerCase()
    let score = -1
    if (label.startsWith(q)) score = 100
    else if (group && group.startsWith(q)) score = 90
    else if (label.includes(q)) score = 80
    else if (group.includes(q)) score = 70
    else if (`${group} ${label} (${context})`.includes(q)) score = 60
    else if (entry.keywords?.some((k) => k.toLowerCase().includes(q))) score = 40
    if (score >= 0) scored.push({ entry, score, index })
  })
  // Ties keep catalogue order so a parent page sorts above its own tabs.
  scored.sort((a, b) => b.score - a.score || a.index - b.index)
  return scored.map((s) => s.entry)
}
