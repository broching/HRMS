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
  "payroll:approve", // Team → Payroll Approvals (sign + approve payslips)
  "attendance:team", // Team → Team Attendance
  "scheduling:roster", // Team → Roster (build + publish team schedule)
  "performance:team", // Team → Team Reviews
  // ── HR Lounge ───────────────────────────────────────────────────────────
  "hr:access", // see the HR Lounge (HR + admin)
  "employees:manage", // create/edit/archive any employee
  "employees:read:all", // view every employee in the org
  "leave:config", // leave types, holidays
  "leave:approve:all", // approve any leave request in the org
  "claims:read:all", // HR Lounge → all-headcount claims oversight
  "payroll:manage", // payroll runs + compensation
  "recruitment:manage", // jobs, candidates, job board
  "performance:manage", // review cycles + org-wide appraisals
  "scheduling:manage", // shift templates + org-wide rosters
  "attendance:config", // offices, QR, geofence
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

export const PERMISSION_META: Record<
  Permission,
  { label: string; description: string; module: PermissionModule }
> = {
  // ── Team workspace ────────────────────────────────────────────────────────
  "team:access": {
    label: "Open Team workspace",
    description: "See the Team tab and its landing dashboard.",
    module: "Team workspace",
  },
  "leave:approve": {
    label: "Leave approvals",
    description: "See the team calendar and act on leave requests.",
    module: "Team workspace",
  },
  "claims:approve": {
    label: "Claim approvals",
    description: "Act on claims awaiting you in Team → Claim Approvals.",
    module: "Team workspace",
  },
  "claims:approve:finance": {
    label: "Finance claim approval",
    description: "Approve the finance stage and mark claims reimbursed.",
    module: "Team workspace",
  },
  "payroll:approve": {
    label: "Payroll approvals",
    description: "Sign and approve payslips assigned to you before release.",
    module: "Team workspace",
  },
  "attendance:team": {
    label: "Team attendance",
    description: "See who's clocked in and review correction requests.",
    module: "Team workspace",
  },
  "scheduling:roster": {
    label: "Team roster",
    description: "Build and publish the weekly schedule for your team.",
    module: "Team workspace",
  },
  "performance:team": {
    label: "Team reviews",
    description: "Complete performance reviews for your team.",
    module: "Team workspace",
  },
  // ── HR Lounge ─────────────────────────────────────────────────────────────
  "hr:access": {
    label: "Open HR Lounge",
    description: "See the HR Lounge and its overview.",
    module: "HR Lounge",
  },
  "employees:manage": {
    label: "Manage employees",
    description: "Create, edit and archive any employee.",
    module: "HR Lounge",
  },
  "employees:read:all": {
    label: "View all employees",
    description: "View every employee profile in the org.",
    module: "HR Lounge",
  },
  "leave:config": {
    label: "Configure leave",
    description: "Manage leave types, policies and holidays.",
    module: "HR Lounge",
  },
  "leave:approve:all": {
    label: "Approve all leave",
    description: "Approve any leave request in the organization.",
    module: "HR Lounge",
  },
  "claims:read:all": {
    label: "Expense Claims (all headcount)",
    description: "See and export every employee's claims in the HR Lounge.",
    module: "HR Lounge",
  },
  "payroll:manage": {
    label: "Payroll & compensation",
    description: "Prepare runs, compensation and payslips.",
    module: "HR Lounge",
  },
  "recruitment:manage": {
    label: "Recruitment",
    description: "Manage jobs, candidates and the job board.",
    module: "HR Lounge",
  },
  "performance:manage": {
    label: "Performance",
    description: "Manage review cycles and org-wide appraisals.",
    module: "HR Lounge",
  },
  "scheduling:manage": {
    label: "Shift templates & rosters",
    description: "Manage shift templates and org-wide rosters.",
    module: "HR Lounge",
  },
  "attendance:config": {
    label: "Configure attendance",
    description: "Manage offices, QR and geofence settings.",
    module: "HR Lounge",
  },
  "reports:view": {
    label: "Reports",
    description: "Access statistics and the report builder.",
    module: "HR Lounge",
  },
  // ── Organization ──────────────────────────────────────────────────────────
  "org:manage": {
    label: "Manage organization",
    description: "Edit organization settings, country and locale.",
    module: "Organization",
  },
  "members:manage": {
    label: "Manage members",
    description: "Invite/remove members and change their roles.",
    module: "Organization",
  },
  "roles:manage": {
    label: "Manage roles",
    description: "Create, edit and delete roles and their permissions.",
    module: "Organization",
  },
  "audit:view": {
    label: "View audit log",
    description: "See the organization's audit trail.",
    module: "Organization",
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
  "payroll:approve",
  "attendance:team",
  "scheduling:roster",
  "performance:team",
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
