import type { Permission } from "./permissions";
import { PERMISSIONS } from "./permissions";

/**
 * Product **modules** — the sellable, per-org toggleable feature bundles. This is
 * the single source of truth shared by the Convex backend (entitlement
 * enforcement) and the client (nav/UI gating), mirroring `permissions.ts`.
 *
 * The product is decoupled into modules so a super admin can enable/disable each
 * one per organization (see `convex/superAdmin.ts` + the platform console). A
 * disabled module is **hard-enforced**: the permissions it owns are stripped from
 * every member's effective set in `getOrgContext`, which transitively hides its
 * nav, HR-Lounge rail items, RoleGates, and rejects its backend calls. The
 * `core` module is always on (people directory, org settings, members, roles).
 *
 * Entitlements are stored as the *disabled* set (`orgModules.disabled`), so an
 * org with no row — and any module added in the future — defaults to ON.
 */
export const MODULES = [
  "core",
  "leave",
  "claims",
  "payment_requests",
  "payroll",
  "attendance",
  "timesheets",
  "performance",
  "recruitment",
  "reports",
] as const;

export type ModuleKey = (typeof MODULES)[number];

export const MODULE_META: Record<
  ModuleKey,
  { name: string; description: string; always?: boolean }
> = {
  core: {
    name: "Core",
    description:
      "People directory, org chart, feed, organization settings, members and roles. Always included.",
    always: true,
  },
  leave: {
    name: "Leave",
    description: "Leave requests, policies, balances, holidays and approvals.",
  },
  claims: {
    name: "Expense Claims",
    description: "Employee expense claims, approval flows and reimbursement.",
  },
  payment_requests: {
    name: "Payment Requests",
    description: "Request-for-payment workflow for vendors and payees.",
  },
  payroll: {
    name: "Payroll & Compensation",
    description: "Compensation, payroll runs, payslips and CPF/statutory funds.",
  },
  attendance: {
    name: "Attendance & Scheduling",
    description: "Clock-in/out, offices, geofence, rosters and overtime.",
  },
  timesheets: {
    name: "Timesheets & Projects",
    description: "Projects, tasks and daily time tracking.",
  },
  performance: {
    name: "Performance",
    description: "Appraisal cycles, objectives, competencies and 360 feedback.",
  },
  recruitment: {
    name: "Recruitment",
    description: "Jobs, candidate pipeline and the public job board.",
  },
  reports: {
    name: "Reports",
    description: "Statistics dashboards and the report builder.",
  },
};

/**
 * Which permissions each module owns. Every permission in `PERMISSIONS` must be
 * assigned to exactly one module (enforced at load by the assertion below).
 * `core` owns the container/organization-wide permissions that are never gated.
 */
export const MODULE_PERMISSIONS: Record<ModuleKey, Permission[]> = {
  core: [
    "team:access",
    "hr:access",
    "employees:manage",
    "employees:read:all",
    "employees:org_chart",
    "org:manage",
    "members:manage",
    "roles:manage",
    "audit:view",
  ],
  leave: ["leave:approve", "leave:approve:all", "leave:config"],
  claims: ["claims:approve", "claims:approve:finance", "claims:read:all"],
  payment_requests: [
    "payment_requests:approve",
    "payment_requests:read:all",
  ],
  payroll: ["payroll:approve", "payroll:manage"],
  attendance: [
    "attendance:team",
    "attendance:config",
    "scheduling:roster",
    "scheduling:manage",
  ],
  timesheets: [
    "timesheets:team",
    "timesheets:log:team",
    "timesheets:log:all",
    "projects:manage",
    "tasks:manage",
  ],
  performance: ["performance:team", "performance:manage"],
  recruitment: ["recruitment:manage"],
  reports: ["reports:view"],
};

/** Modules that can be toggled off (everything except the always-on `core`). */
export const OPTIONAL_MODULES: ModuleKey[] = MODULES.filter(
  (m) => !MODULE_META[m].always,
);

/** Reverse index: permission → the module that owns it. Built once at load. */
export const MODULE_FOR_PERMISSION: Record<Permission, ModuleKey> = (() => {
  const map = {} as Record<Permission, ModuleKey>;
  for (const mod of MODULES) {
    for (const perm of MODULE_PERMISSIONS[mod]) {
      map[perm] = mod;
    }
  }
  // Fail fast if a permission is missing a module (e.g. a new permission was
  // added to permissions.ts without being bundled here).
  const missing = PERMISSIONS.filter((p) => !(p in map));
  if (missing.length > 0) {
    throw new Error(
      `modules.ts: permissions not assigned to any module: ${missing.join(", ")}`,
    );
  }
  return map;
})();

/** Narrow an arbitrary string list down to known optional module keys. */
export function sanitizeModuleKeys(list: readonly string[]): ModuleKey[] {
  const optional = new Set<string>(OPTIONAL_MODULES);
  return list.filter((m): m is ModuleKey => optional.has(m));
}

/**
 * Resolve the set of enabled modules from a stored `disabled` list. `core` is
 * always enabled; any unknown/future module defaults to enabled.
 */
export function enabledModulesFromDisabled(
  disabled: readonly string[] | undefined | null,
): Set<ModuleKey> {
  const off = new Set(disabled ?? []);
  return new Set(MODULES.filter((m) => MODULE_META[m].always || !off.has(m)));
}
