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
export type Gender = "male" | "female" | "other" | "undisclosed";

export const maritalStatus = v.union(
  v.literal("single"),
  v.literal("married"),
  v.literal("divorced"),
  v.literal("widowed"),
  v.literal("other"),
  v.literal("undisclosed"),
);
export type MaritalStatus =
  | "single"
  | "married"
  | "divorced"
  | "widowed"
  | "other"
  | "undisclosed";

export const documentType = v.union(
  v.literal("contract"),
  v.literal("certification"),
  v.literal("work_pass"),
  v.literal("identity"),
  v.literal("other"),
);

export const equipmentStatus = v.union(
  v.literal("assigned"),
  v.literal("returned"),
);
export type EquipmentStatus = "assigned" | "returned";

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

// A family member / dependent (self-service, under Family Details).
export const familyMemberValidator = v.object({
  id: v.string(),
  name: v.string(),
  relationship: v.optional(v.string()),
  dob: v.optional(v.string()),
  contact: v.optional(v.string()),
});

// Self-service custom field on an employee's personal details. The employee
// names the field and picks its input type; the value is stored as a string
// (numbers/dates serialized) for a uniform shape.
export const personalFieldType = v.union(
  v.literal("text"),
  v.literal("number"),
  v.literal("date"),
);
export type PersonalFieldType = "text" | "number" | "date";

export const personalFieldValidator = v.object({
  id: v.string(),
  label: v.string(),
  type: personalFieldType,
  value: v.string(),
});

// A past job (Professional Experience) or qualification (Education). Both share
// this shape — for education, `title` = qualification and `organization` =
// institution. Dates are loose "YYYY-MM" strings; `endDate` empty = present.
export const resumeEntryValidator = v.object({
  id: v.string(),
  title: v.string(),
  organization: v.optional(v.string()),
  location: v.optional(v.string()),
  startDate: v.optional(v.string()),
  endDate: v.optional(v.string()),
  description: v.optional(v.string()),
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
  v.literal("info_requested"),
);
export type LeaveStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "info_requested";

export const halfDay = v.union(v.literal("am"), v.literal("pm"));

// ─── Leave-policy engine ───────────────────────────────────────────────────
// A leave type can have several policy configurations, each applying to a
// group of employees. `all` = the type's default policy (everyone); `groups`
// = applies only to explicitly assigned employees.
export const policyAvailability = v.union(
  v.literal("all"),
  v.literal("groups"),
);
export type PolicyAvailability = "all" | "groups";

// How an approver is resolved for a request. `manager` = the employee's direct
// manager; `department_head` = the head of their department; `specific` = a
// named member (value = userId); `none` = auto-approved at that step.
export const approverMode = v.union(
  v.literal("manager"),
  v.literal("department_head"),
  v.literal("specific"),
  v.literal("none"),
);
export type ApproverMode = "manager" | "department_head" | "specific" | "none";

// `fixed` credits a set number of days; `upon_request` tracks no balance (e.g.
// unpaid leave) and is always available.
export const entitlementMode = v.union(
  v.literal("fixed"),
  v.literal("upon_request"),
);
export type EntitlementMode = "fixed" | "upon_request";

// Earned-leave accrual cadence. Entitlement is computed deterministically on
// read from this, not credited by a scheduled job.
export const accrualType = v.union(
  v.literal("daily"),
  v.literal("monthly"),
);
export type AccrualType = "daily" | "monthly";

// How a partial first/last year is prorated. `started` counts the join month
// fully, `completed` excludes it, `partial` prorates by days worked that month.
export const prorateMode = v.union(
  v.literal("started"),
  v.literal("completed"),
  v.literal("partial"),
);
export type ProrateMode = "started" | "completed" | "partial";

// When seniority increments take effect.
export const seniorityEffective = v.union(
  v.literal("period"),
  v.literal("anniversary"),
);
export type SeniorityEffective = "period" | "anniversary";

export const incrementMode = v.union(
  v.literal("fixed"),
  v.literal("variable"),
);
export type IncrementMode = "fixed" | "variable";

// Rounding applied to the computed entitlement.
export const roundingMode = v.union(
  v.literal("none"),
  v.literal("up"),
  v.literal("down"),
  v.literal("nearest_half"),
);
export type RoundingMode = "none" | "up" | "down" | "nearest_half";

// One seniority rule: after `afterYears` of service, add `addDays`. For fixed
// increment the rule is recurring; for variable, rules are tiered thresholds.
export const seniorityRule = v.object({
  afterYears: v.number(),
  addDays: v.number(),
});

// One timeline event embedded on a leave request (creation, approvals, etc.).
export const leaveTimelineEvent = v.object({
  at: v.number(),
  actorUserId: v.optional(v.id("users")),
  type: v.string(),
  note: v.optional(v.string()),
});

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

// ─── Claim settings ────────────────────────────────────────────────────────

// One threshold rule on an approver step: the step applies only when a claim's
// amount exceeds `amountMoreThanCents`, optionally scoped to specific offices
// (empty = all offices).
export const claimApprovalThresholdRule = v.object({
  amountMoreThanCents: v.number(),
  officeIds: v.array(v.id("offices")),
});

// One step in the claim approval workflow. `approverType` "position" resolves a
// role relative to the claimant (manager / department_head); "specific" names a
// member (value = userId). When `thresholdEnabled`, the step only applies if a
// claim matches one of its `rules`.
export const claimApproverPosition = v.union(
  v.literal("manager"),
  v.literal("department_head"),
);
export const claimApproverStep = v.object({
  approverType: v.union(v.literal("position"), v.literal("specific")),
  value: v.string(), // "manager" | "department_head" | userId
  thresholdEnabled: v.boolean(),
  rules: v.array(claimApprovalThresholdRule),
});

// How approved claims flow to payroll.
export const claimPayrollMode = v.union(
  v.literal("manual"),
  v.literal("automatic"),
);
export type ClaimPayrollMode = "manual" | "automatic";

// One resolved step of a claim's approval chain, snapshotted onto the claim at
// submit time from the org's approval workflow. `approverUserId` is resolved
// from the step's position/specific target against the claimant.
export const claimChainStep = v.object({
  approverType: v.union(v.literal("position"), v.literal("specific")),
  value: v.string(), // "manager" | "department_head" | userId (config)
  approverUserId: v.optional(v.id("users")),
  label: v.string(), // e.g. "Manager — Jane Tan"
  decidedByUserId: v.optional(v.id("users")),
  decidedAt: v.optional(v.number()),
  note: v.optional(v.string()),
});

// ─── Feed module ───────────────────────────────────────────────────────────

// Who a feed post is shared with. `specific` targets an explicit employee list;
// `department`/`office` target everyone in that unit; `all` is org-wide.
export const feedAudience = v.union(
  v.literal("all"),
  v.literal("specific"),
  v.literal("department"),
  v.literal("office"),
);
export type FeedAudience = "all" | "specific" | "department" | "office";

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

// A one-off payroll line entered/pulled while preparing a run. `addition`
// increases pay; `deduction` reduces it.
export const payrollAdjustmentKind = v.union(
  v.literal("addition"),
  v.literal("deduction"),
);
export type PayrollAdjustmentKind = "addition" | "deduction";

// Where an adjustment came from. `manual` = keyed in by HR; `claim` =
// auto-pulled from an approved expense claim; `overtime` = OT hours entered in
// the run; `unpaid_leave` = auto-pulled from approved no-pay leave.
export const payrollAdjustmentSource = v.union(
  v.literal("manual"),
  v.literal("claim"),
  v.literal("overtime"),
  v.literal("unpaid_leave"),
);
export type PayrollAdjustmentSource =
  | "manual"
  | "claim"
  | "overtime"
  | "unpaid_leave";

// Overtime inputs captured on an OT adjustment, so the amount can be recomputed
// and shown as "N hour(s)".
export const overtimeMeta = v.object({
  hours: v.number(),
  multiplier: v.number(),
});

// ─── Recruitment module ────────────────────────────────────────────────────

export const jobStatus = v.union(
  v.literal("draft"),
  v.literal("open"),
  v.literal("closed"),
);
export type JobStatus = "draft" | "open" | "closed";

// Candidate pipeline stage. `kiv` = "keep in view".
export const candidateStage = v.union(
  v.literal("applied"),
  v.literal("screening"),
  v.literal("interview"),
  v.literal("offer"),
  v.literal("hired"),
  v.literal("kiv"),
  v.literal("rejected"),
);
export type CandidateStage =
  | "applied"
  | "screening"
  | "interview"
  | "offer"
  | "hired"
  | "kiv"
  | "rejected";

// Where a candidate entered the pipeline.
export const candidateSource = v.union(
  v.literal("board"), // applied via the public job board
  v.literal("manual"), // added by HR
  v.literal("referral"),
);
export type CandidateSource = "board" | "manual" | "referral";

export const interviewMode = v.union(
  v.literal("onsite"),
  v.literal("video"),
  v.literal("phone"),
);
export type InterviewMode = "onsite" | "video" | "phone";

export const interviewStatus = v.union(
  v.literal("scheduled"),
  v.literal("completed"),
  v.literal("cancelled"),
);
export type InterviewStatus = "scheduled" | "completed" | "cancelled";

// ─── Performance module ──────────────────────────────────────────────────

export const reviewCycleStatus = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("closed"),
);
export type ReviewCycleStatus = "draft" | "active" | "closed";

export const goalStatus = v.union(
  v.literal("not_started"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("cancelled"),
);
export type GoalStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "cancelled";

// Appraisal workflow: employee self-review → manager review → completed.
export const reviewStatus = v.union(
  v.literal("self_review"),
  v.literal("manager_review"),
  v.literal("completed"),
);
export type ReviewStatus = "self_review" | "manager_review" | "completed";

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
