import type { HrmsRole } from "./enums";

/**
 * Role → permission matrix. Single source of truth shared by the Convex
 * backend (authorization enforcement) and the client (UI gating). This module
 * is framework-agnostic — it only depends on the `HrmsRole` type — so the
 * frontend can import it directly via `@/convex/lib/permissions`.
 *
 * Server enforcement is authoritative; client checks are convenience only.
 * Relationship-scoped capabilities (e.g. a manager acting on direct reports)
 * are enforced separately in function handlers, not by this flat matrix.
 */
export const PERMISSIONS = [
  "org:manage", // organization settings, country/locale
  "members:manage", // invite/remove members, change in-app roles
  "employees:manage", // create/edit/archive any employee
  "employees:read:all", // view every employee in the org
  "leave:config", // leave types, holidays
  "leave:approve:all", // approve any leave request in the org
  "claims:approve:finance", // finance/HR claim approval step
  "payroll:manage",
  "attendance:config", // offices, QR, geofence
  "scheduling:manage", // shift templates + org-wide rosters
  "performance:manage", // review cycles + org-wide appraisals
  "reports:view",
  "audit:view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<HrmsRole, readonly Permission[]> = {
  admin: ALL,
  hr: [
    "members:manage",
    "employees:manage",
    "employees:read:all",
    "leave:config",
    "leave:approve:all",
    "claims:approve:finance",
    "payroll:manage",
    "attendance:config",
    "scheduling:manage",
    "performance:manage",
    "reports:view",
    "audit:view",
  ],
  manager: [
    // Org-wide capabilities a manager has; report-scoped approvals are
    // granted relationally in handlers, not here.
    "reports:view",
  ],
  employee: [],
};

export function hasPermission(role: HrmsRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
