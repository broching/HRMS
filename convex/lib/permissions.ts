import type { HrmsRole } from "./enums";

/**
 * Permission catalogue + role presets. Single source of truth shared by the
 * Convex backend (authorization enforcement) and the client (UI gating). This
 * module is framework-agnostic — it only depends on the `HrmsRole` type — so the
 * frontend can import it directly via `@/convex/lib/permissions`.
 *
 * Roles are data-driven: an org has a `roles` table seeded from the presets
 * below, and each member points at a role via `members.roleId`. A member's
 * *effective* permissions come from their role document; when a member has no
 * `roleId` yet (legacy rows), resolution falls back to `ROLE_PERMISSIONS` keyed
 * by the legacy `members.role` enum. Server enforcement is authoritative;
 * client checks are convenience only. Relationship-scoped capabilities (e.g. a
 * manager acting on direct reports) are enforced separately in handlers.
 */
// Ordered to mirror the workspace grouping used by the roles UI: Team workspace
// capabilities first, then HR Lounge modules, then org-wide administration.
export const PERMISSIONS = [
  // ── Team workspace ──────────────────────────────────────────────────────
  "team:access", // see the Team tab + its landing dashboard
  "leave:approve", // Team → Team Calendar + Leave Approvals
  "claims:approve", // Team → Claim Approvals (approver view)
  "claims:approve:finance", // finance/HR claim approval + reimbursement
  "payment_requests:approve", // Team → Payment Requests (approver view)
  "payroll:approve", // Team → Payroll Approvals (sign + approve payslips)
  "attendance:team", // Team → Team Attendance
  "scheduling:roster", // Team → Roster (build + publish team schedule)
  "performance:team", // Team → Team Reviews
  "timesheets:team", // Team → Team Timesheets (view your reporting tree)
  "timesheets:log:team", // Team → log/edit time on behalf of your reporting tree
  "tasks:manage", // create/edit tasks, assign people, complete any task (team-side)
  // ── HR Lounge ───────────────────────────────────────────────────────────
  "hr:access", // see the HR Lounge (HR + admin)
  "employees:manage", // create/edit/archive any employee
  "employees:read:all", // view every employee in the org
  "employees:org_chart", // reassign managers + edit cards from the org chart
  "leave:config", // leave types, holidays
  "leave:approve:all", // approve any leave request in the org
  "claims:read:all", // HR Lounge → all-headcount claims oversight
  "payment_requests:read:all", // HR Lounge → payment-request oversight + config
  "payroll:manage", // payroll runs + compensation
  "payroll:ir8a", // IR8A tax forms (generate, review, finalize)
  "payroll:ais", // AIS submission / export (decrypts NRIC/FIN at export)
  "payroll:classify", // IR8A income-classification map (IR8A / Tax settings)
  "recruitment:manage", // jobs, candidates, job board
  "performance:manage", // review cycles + org-wide appraisals
  "scheduling:manage", // shift templates + org-wide rosters
  "attendance:config", // offices, QR, geofence
  "projects:manage", // HR Lounge → Projects + org-wide timesheet oversight
  "timesheets:log:all", // HR Lounge → log/edit time on behalf of any employee
  "reports:view", // statistics + report builder
  // ── Organization ────────────────────────────────────────────────────────
  "org:manage", // organization settings, country/locale
  "members:manage", // invite/remove members, change in-app roles
  "roles:manage", // create/edit/delete roles + their permissions
  "audit:view", // organization audit trail
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Display metadata for the roles UI: each permission's human label, a short
 * description, and the module it belongs to (used to group the checkboxes).
 */
// Permission modules are the workspace "heads" shown in the roles UI. Each
// permission below maps a nav sub-function to a checkbox grouped under its head.
export const PERMISSION_MODULES = [
  "Team workspace",
  "HR Lounge",
  "Organization",
] as const;
export type PermissionModule = (typeof PERMISSION_MODULES)[number];

// `group` is a sub-header within a module — used to break long module lists
// (e.g. HR Lounge's ~19 permissions) into scannable clusters in the roles UI.
export const PERMISSION_META: Record<
  Permission,
  { label: string; description: string; module: PermissionModule; group: string }
> = {
  // ── Team workspace ────────────────────────────────────────────────────────
  "team:access": {
    label: "Open Team workspace",
    description: "See the Team tab and its landing dashboard.",
    module: "Team workspace",
    group: "General",
  },
  "leave:approve": {
    label: "Leave approvals",
    description: "See the team calendar and act on leave requests.",
    module: "Team workspace",
    group: "Approvals",
  },
  "claims:approve": {
    label: "Claim approvals",
    description: "Act on claims awaiting you in Team → Claim Approvals.",
    module: "Team workspace",
    group: "Approvals",
  },
  "claims:approve:finance": {
    label: "Finance claim approval",
    description: "Approve the finance stage and mark claims reimbursed.",
    module: "Team workspace",
    group: "Approvals",
  },
  "payment_requests:approve": {
    label: "Payment request approvals",
    description: "Act on payment requests awaiting you in Team → Payment Requests.",
    module: "Team workspace",
    group: "Approvals",
  },
  "payroll:approve": {
    label: "Payroll approvals",
    description: "Sign and approve payslips assigned to you before release.",
    module: "Team workspace",
    group: "Approvals",
  },
  "attendance:team": {
    label: "Team attendance",
    description: "See who's clocked in and review correction requests.",
    module: "Team workspace",
    group: "Team management",
  },
  "scheduling:roster": {
    label: "Team roster",
    description: "Build and publish the weekly schedule for your team.",
    module: "Team workspace",
    group: "Team management",
  },
  "performance:team": {
    label: "Team reviews",
    description: "Complete performance reviews for your team.",
    module: "Team workspace",
    group: "Team management",
  },
  "timesheets:team": {
    label: "Team timesheets",
    description: "View timesheets for your whole reporting tree.",
    module: "Team workspace",
    group: "Team management",
  },
  "timesheets:log:team": {
    label: "Log time for your team",
    description: "Log and edit time entries on behalf of anyone in your reporting tree.",
    module: "Team workspace",
    group: "Team management",
  },
  "tasks:manage": {
    label: "Manage tasks",
    description:
      "Create and edit project tasks, assign people, and mark any task complete.",
    module: "Team workspace",
    group: "Team management",
  },
  // ── HR Lounge ─────────────────────────────────────────────────────────────
  "hr:access": {
    label: "Open HR Lounge",
    description: "See the HR Lounge and its overview.",
    module: "HR Lounge",
    group: "General",
  },
  "employees:manage": {
    label: "Manage employees",
    description: "Create, edit and archive any employee.",
    module: "HR Lounge",
    group: "Employees",
  },
  "employees:read:all": {
    label: "View all employees",
    description: "View every employee profile in the org.",
    module: "HR Lounge",
    group: "Employees",
  },
  "employees:org_chart": {
    label: "Edit org chart",
    description:
      "Reassign direct managers and edit employee cards from the org chart. Everyone can already rearrange their own view for free.",
    module: "HR Lounge",
    group: "Employees",
  },
  "leave:config": {
    label: "Configure leave",
    description: "Manage leave types, policies and holidays.",
    module: "HR Lounge",
    group: "Leave",
  },
  "leave:approve:all": {
    label: "Approve all leave",
    description: "Approve any leave request in the organization.",
    module: "HR Lounge",
    group: "Leave",
  },
  "claims:read:all": {
    label: "Expense Claims (all headcount)",
    description: "See and export every employee's claims in the HR Lounge.",
    module: "HR Lounge",
    group: "Claims & payments",
  },
  "payment_requests:read:all": {
    label: "Payment Requests (all headcount)",
    description: "Configure, review and export every payment request in the HR Lounge.",
    module: "HR Lounge",
    group: "Claims & payments",
  },
  "payroll:manage": {
    label: "Payroll & compensation",
    description: "Prepare runs, compensation and payslips.",
    module: "HR Lounge",
    group: "Payroll",
  },
  "payroll:ir8a": {
    label: "IR8A tax forms",
    description:
      "Generate, review and finalize employees' annual IR8A income returns for IRAS.",
    module: "HR Lounge",
    group: "Payroll",
  },
  "payroll:ais": {
    label: "AIS submission / export",
    description:
      "Export the AIS submission file (XML/CSV) and toggle AIS-registered employer. Decrypts full NRIC/FIN at export.",
    module: "HR Lounge",
    group: "Payroll",
  },
  "payroll:classify": {
    label: "Income classification",
    description:
      "Map payslip earnings to their IR8A income fields (the IR8A / Tax classification list).",
    module: "HR Lounge",
    group: "Payroll",
  },
  "recruitment:manage": {
    label: "Recruitment",
    description: "Manage jobs, candidates and the job board.",
    module: "HR Lounge",
    group: "Recruitment",
  },
  "performance:manage": {
    label: "Performance",
    description: "Manage review cycles and org-wide appraisals.",
    module: "HR Lounge",
    group: "Performance",
  },
  "scheduling:manage": {
    label: "Shift templates & rosters",
    description: "Manage shift templates and org-wide rosters.",
    module: "HR Lounge",
    group: "Attendance & scheduling",
  },
  "attendance:config": {
    label: "Configure attendance",
    description: "Manage offices, QR and geofence settings.",
    module: "HR Lounge",
    group: "Attendance & scheduling",
  },
  "projects:manage": {
    label: "Projects & timesheets",
    description: "Manage projects and tasks, and see org-wide timesheets.",
    module: "HR Lounge",
    group: "Projects & timesheets",
  },
  "timesheets:log:all": {
    label: "Log time for anyone",
    description: "Log and edit time entries on behalf of any employee in the org.",
    module: "HR Lounge",
    group: "Projects & timesheets",
  },
  "reports:view": {
    label: "Reports",
    description: "Access statistics and the report builder.",
    module: "HR Lounge",
    group: "Reports",
  },
  // ── Organization ──────────────────────────────────────────────────────────
  "org:manage": {
    label: "Manage organization",
    description: "Edit organization settings, country and locale.",
    module: "Organization",
    group: "General",
  },
  "members:manage": {
    label: "Manage members",
    description: "Invite/remove members and change their roles.",
    module: "Organization",
    group: "General",
  },
  "roles:manage": {
    label: "Manage roles",
    description: "Create, edit and delete roles and their permissions.",
    module: "Organization",
    group: "General",
  },
  "audit:view": {
    label: "View audit log",
    description: "See the organization's audit trail.",
    module: "Organization",
    group: "General",
  },
};

const ALL: Permission[] = [...PERMISSIONS];

// HR runs the HR Lounge and every module inside it, approves claims/leave, and
// administers members + roles — everything except top-level org settings.
const HR_PERMISSIONS: Permission[] = ALL.filter((p) => p !== "org:manage");

// Finance approves claims (Team-side) and the finance stage, but — per the
// org's access model — does NOT get the HR Lounge; that's HR/admin only.
const FINANCE_PERMISSIONS: Permission[] = [
  "team:access",
  "claims:approve",
  "claims:approve:finance",
  "payment_requests:approve",
  "payroll:approve",
  "employees:read:all",
  "reports:view",
];

// Managers work out of the Team tab: they approve their reports' leave/claims
// (enforced relationally in handlers) and run the team's roster/reviews.
const MANAGER_PERMISSIONS: Permission[] = [
  "team:access",
  "leave:approve",
  "claims:approve",
  "payment_requests:approve",
  "payroll:approve",
  "attendance:team",
  "scheduling:roster",
  "performance:team",
  "timesheets:team",
  "timesheets:log:team",
  "tasks:manage",
  "reports:view",
];

/**
 * Preset roles seeded into every org's `roles` table. `key` ties a preset back
 * to the legacy `HrmsRole` enum so existing members resolve correctly before
 * they're explicitly assigned a role document.
 */
export const ROLE_PRESETS: Record<
  HrmsRole,
  { label: string; description: string; permissions: Permission[] }
> = {
  admin: {
    label: "Admin",
    description: "Full access to every module and setting.",
    permissions: ALL,
  },
  hr: {
    label: "HR",
    description: "Runs the HR Lounge and all people operations.",
    permissions: HR_PERMISSIONS,
  },
  finance: {
    label: "Finance",
    description: "Approves claims and the finance stage.",
    permissions: FINANCE_PERMISSIONS,
  },
  manager: {
    label: "Manager",
    description: "Approves their team's requests via the Team tab.",
    permissions: MANAGER_PERMISSIONS,
  },
  employee: {
    label: "Employee",
    description: "Self-service access to their own records.",
    permissions: [],
  },
};

// Legacy flat matrix (role enum → permissions), kept as the resolution fallback
// for members without a `roleId` and for pure role-based client checks.
export const ROLE_PERMISSIONS: Record<HrmsRole, readonly Permission[]> = {
  admin: ROLE_PRESETS.admin.permissions,
  hr: ROLE_PRESETS.hr.permissions,
  finance: ROLE_PRESETS.finance.permissions,
  manager: ROLE_PRESETS.manager.permissions,
  employee: ROLE_PRESETS.employee.permissions,
};

export function hasPermission(role: HrmsRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

// Client-side effective-permission check against a resolved permission list
// (as returned by `members.current`). Falls back gracefully to an empty list.
export function permitted(
  permissions: readonly string[] | undefined | null,
  permission: Permission,
): boolean {
  return !!permissions && permissions.includes(permission);
}

// Narrow an arbitrary string list (e.g. a stored role document's permissions)
// down to the known permission set.
export function sanitizePermissions(list: readonly string[]): Permission[] {
  const known = new Set<string>(PERMISSIONS);
  return list.filter((p): p is Permission => known.has(p));
}
