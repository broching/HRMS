import { v } from "convex/values";

/**
 * Shared enum validators used across the HRMS schema and functions.
 * Keep all union literals here so tables and function args stay in sync.
 */

// Authoritative HRMS role, stored on `members.role`.
// Seeded from the Clerk org role on first sync, then editable in-app.
export const hrmsRole = v.union(
  v.literal("admin"),
  v.literal("hr"),
  v.literal("manager"),
  v.literal("employee"),
);
export type HrmsRole = "admin" | "hr" | "manager" | "employee";

// Membership lifecycle, mirrored from Clerk organization membership state.
export const memberStatus = v.union(
  v.literal("active"),
  v.literal("invited"),
  v.literal("removed"),
);
export type MemberStatus = "active" | "invited" | "removed";

// ─── Employee module ─────────────────────────────────────────────────────

export const employmentType = v.union(
  v.literal("full_time"),
  v.literal("part_time"),
  v.literal("contract"),
  v.literal("intern"),
);
export type EmploymentType =
  | "full_time"
  | "part_time"
  | "contract"
  | "intern";

export const employeeStatus = v.union(
  v.literal("active"),
  v.literal("probation"),
  v.literal("on_leave"),
  v.literal("suspended"),
  v.literal("terminated"),
);
export type EmployeeStatus =
  | "active"
  | "probation"
  | "on_leave"
  | "suspended"
  | "terminated";

export const gender = v.union(
  v.literal("male"),
  v.literal("female"),
  v.literal("other"),
  v.literal("undisclosed"),
);

export const documentType = v.union(
  v.literal("contract"),
  v.literal("certification"),
  v.literal("work_pass"),
  v.literal("other"),
);

export const customFieldType = v.union(
  v.literal("text"),
  v.literal("number"),
  v.literal("date"),
  v.literal("select"),
);

// Reusable nested validators.
export const addressValidator = v.object({
  line1: v.optional(v.string()),
  line2: v.optional(v.string()),
  city: v.optional(v.string()),
  state: v.optional(v.string()),
  postalCode: v.optional(v.string()),
  country: v.optional(v.string()),
});

export const contactValidator = v.object({
  personalEmail: v.optional(v.string()),
  workEmail: v.optional(v.string()),
  phone: v.optional(v.string()),
});

export const emergencyContactValidator = v.object({
  name: v.string(),
  relationship: v.optional(v.string()),
  phone: v.optional(v.string()),
});

// ─── Leave module ────────────────────────────────────────────────────────

export const leaveCategory = v.union(
  v.literal("annual"),
  v.literal("sick"),
  v.literal("hospitalisation"),
  v.literal("childcare"),
  v.literal("maternity"),
  v.literal("paternity"),
  v.literal("unpaid"),
  v.literal("custom"),
);
export type LeaveCategory =
  | "annual"
  | "sick"
  | "hospitalisation"
  | "childcare"
  | "maternity"
  | "paternity"
  | "unpaid"
  | "custom";

export const accrualMethod = v.union(
  v.literal("none"),
  v.literal("monthly"),
  v.literal("anniversary"),
);

export const leaveStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("cancelled"),
);
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export const halfDay = v.union(v.literal("am"), v.literal("pm"));

// ─── Claims module ───────────────────────────────────────────────────────

export const claimCategory = v.union(
  v.literal("medical"),
  v.literal("travel"),
  v.literal("meals"),
  v.literal("office"),
  v.literal("mileage"),
  v.literal("training"),
  v.literal("entertainment"),
  v.literal("custom"),
);
export type ClaimCategory =
  | "medical"
  | "travel"
  | "meals"
  | "office"
  | "mileage"
  | "training"
  | "entertainment"
  | "custom";

// Workflow: pending_manager → pending_finance → approved → reimbursed.
export const claimStatus = v.union(
  v.literal("pending_manager"),
  v.literal("pending_finance"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("reimbursed"),
  v.literal("cancelled"),
);
export type ClaimStatus =
  | "pending_manager"
  | "pending_finance"
  | "approved"
  | "rejected"
  | "reimbursed"
  | "cancelled";

// ─── Attendance module ───────────────────────────────────────────────────

// How a clock event was captured. `qr_gps` = scanned a signed office QR with a
// geolocation check; `manual` = created/edited via an approved correction.
export const attendanceMethod = v.union(
  v.literal("qr_gps"),
  v.literal("manual"),
);
export type AttendanceMethod = "qr_gps" | "manual";

// `open` = clocked in, awaiting clock-out; `completed` = both ends recorded.
export const attendanceStatus = v.union(
  v.literal("open"),
  v.literal("completed"),
);
export type AttendanceStatus = "open" | "completed";

export const correctionStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
);
export type CorrectionStatus = "pending" | "approved" | "rejected";

// ─── Scheduling module ───────────────────────────────────────────────────

// A shift assignment is `draft` while a roster is being built, `published`
// once released to employees, or `cancelled`.
export const shiftStatus = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("cancelled"),
);
export type ShiftStatus = "draft" | "published" | "cancelled";

// ─── Payroll module ──────────────────────────────────────────────────────

// CPF treatment for an employee. `citizen_pr` is subject to CPF; `foreigner`
// (work-pass holders) and `exempt` are not (a levy applies separately, out of
// scope for v1).
export const cpfStatus = v.union(
  v.literal("citizen_pr"),
  v.literal("foreigner"),
  v.literal("exempt"),
);
export type CpfStatus = "citizen_pr" | "foreigner" | "exempt";

// A payroll run is `draft` while being prepared, `finalized` once locked, and
// `paid` after disbursement.
export const payrollStatus = v.union(
  v.literal("draft"),
  v.literal("finalized"),
  v.literal("paid"),
);
export type PayrollStatus = "draft" | "finalized" | "paid";

// Payslip line classification for the breakdown.
export const payslipLineType = v.union(
  v.literal("earning"),
  v.literal("deduction"),
  v.literal("employer"),
);
export type PayslipLineType = "earning" | "deduction" | "employer";

export const payslipLine = v.object({
  label: v.string(),
  amountCents: v.number(),
  type: payslipLineType,
});

// A recurring compensation allowance (e.g. transport, meal).
export const allowanceItem = v.object({
  name: v.string(),
  amountCents: v.number(),
  cpfable: v.boolean(), // counts toward CPF Ordinary Wages
});

// Org-level settings persisted on the `organizations` table.
export const orgSettings = v.object({
  timezone: v.string(),
  currency: v.string(),
  weekStart: v.number(), // 0 = Sunday, 1 = Monday
  fiscalYearStartMonth: v.number(), // 1-12
});

// Default settings applied when an organization is first synced (Singapore).
export const DEFAULT_ORG_COUNTRY = "SG";
export const DEFAULT_ORG_SETTINGS = {
  timezone: "Asia/Singapore",
  currency: "SGD",
  weekStart: 1,
  fiscalYearStartMonth: 1,
} as const;
