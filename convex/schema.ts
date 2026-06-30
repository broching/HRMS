import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { paymentAttemptSchemaValidator } from "./paymentAttemptTypes";
import {
  hrmsRole,
  memberStatus,
  orgSettings,
  employmentType,
  employeeStatus,
  gender,
  maritalStatus,
  documentType,
  customFieldType,
  equipmentStatus,
  addressValidator,
  contactValidator,
  emergencyContactValidator,
  familyMemberValidator,
  personalFieldValidator,
  resumeEntryValidator,
  leaveCategory,
  accrualMethod,
  leaveStatus,
  halfDay,
  policyAvailability,
  approverMode,
  entitlementMode,
  accrualType,
  prorateMode,
  seniorityEffective,
  incrementMode,
  roundingMode,
  seniorityRule,
  leaveTimelineEvent,
  claimCategory,
  claimStatus,
  claimApproverStep,
  claimPayrollMode,
  claimChainStep,
  jobStatus,
  candidateStage,
  candidateSource,
  interviewMode,
  interviewStatus,
  attendanceMethod,
  attendanceStatus,
  correctionStatus,
  shiftStatus,
  cpfStatus,
  payrollStatus,
  payslipLine,
  allowanceItem,
  payrollAdjustmentKind,
  payrollAdjustmentSource,
  overtimeMeta,
  reviewCycleStatus,
  goalStatus,
  reviewStatus,
  feedAudience,
} from "./lib/enums";

export default defineSchema({
  // ─── Foundation: tenancy + identity ──────────────────────────────────────

  // One row per company. Synced from Clerk `organization.*` webhooks.
  organizations: defineTable({
    clerkOrgId: v.string(),
    name: v.string(),
    slug: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    country: v.string(), // ISO country, default "SG"
    settings: orgSettings,
  }).index("by_clerkOrgId", ["clerkOrgId"]),

  // Global user identity. Synced from Clerk `user.*` webhooks.
  // A user may belong to multiple organizations (one `members` row each).
  users: defineTable({
    name: v.string(),
    // this is the Clerk ID, stored in the subject JWT field
    externalId: v.string(),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  }).index("byExternalId", ["externalId"]),

  // Authoritative auth + RBAC record linking a user to an organization.
  // Synced from Clerk `organizationMembership.*` webhooks; `role` is seeded
  // from the Clerk org role then editable in-app (independent of Clerk plan).
  members: defineTable({
    orgId: v.id("organizations"),
    userId: v.id("users"),
    clerkMembershipId: v.string(),
    role: hrmsRole,
    status: memberStatus,
  })
    .index("by_org", ["orgId"])
    .index("by_user", ["userId"])
    .index("by_org_and_user", ["orgId", "userId"])
    .index("by_clerkMembershipId", ["clerkMembershipId"]),

  // ─── Org structure ───────────────────────────────────────────────────────

  departments: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    code: v.optional(v.string()),
    parentId: v.optional(v.id("departments")),
    headEmployeeId: v.optional(v.id("employees")),
  })
    .index("by_org", ["orgId"])
    .index("by_org_parent", ["orgId", "parentId"]),

  teams: defineTable({
    orgId: v.id("organizations"),
    departmentId: v.optional(v.id("departments")),
    name: v.string(),
    leadEmployeeId: v.optional(v.id("employees")),
  })
    .index("by_org", ["orgId"])
    .index("by_department", ["orgId", "departmentId"]),

  positions: defineTable({
    orgId: v.id("organizations"),
    title: v.string(),
    level: v.optional(v.string()),
    departmentId: v.optional(v.id("departments")),
  }).index("by_org", ["orgId"]),

  offices: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    address: v.optional(v.string()),
    timezone: v.string(),
    geo: v.optional(v.object({ lat: v.number(), lng: v.number() })),
    radiusMeters: v.optional(v.number()),
    qrEnabled: v.boolean(),
    // HMAC secret backing this office's rotating clock-in QR codes. Never
    // returned to clients; set when QR attendance is first enabled.
    qrSecret: v.optional(v.string()),
  }).index("by_org", ["orgId"]),

  // ─── Employees ───────────────────────────────────────────────────────────

  employees: defineTable({
    orgId: v.id("organizations"),
    // Link to the login account (users row), set once the person is invited.
    userId: v.optional(v.id("users")),
    // The email this person is invited to the org with — also their work email.
    // Used to link the employee to their `members`/`users` row when they join.
    loginEmail: v.optional(v.string()), // lowercased
    // HRMS role to apply to their membership once they accept the invite.
    invitedRole: v.optional(hrmsRole),
    employeeNumber: v.string(),
    // A placeholder role with no real person yet (shown in org chart + directory).
    isVacant: v.optional(v.boolean()),

    // Personal
    firstName: v.string(),
    lastName: v.string(),
    preferredName: v.optional(v.string()),
    photoStorageId: v.optional(v.id("_storage")),
    dob: v.optional(v.string()), // ISO date "YYYY-MM-DD"
    gender: v.optional(gender),
    maritalStatus: v.optional(maritalStatus),
    nationality: v.optional(v.string()),
    idNumberMasked: v.optional(v.string()),
    idNumberLast4: v.optional(v.string()),
    address: v.optional(addressValidator),
    contact: v.optional(contactValidator),
    emergencyContacts: v.optional(v.array(emergencyContactValidator)),
    // Self-service profile content (Employee Self-Service).
    bio: v.optional(v.string()), // "About" free text
    galleryStorageIds: v.optional(v.array(v.id("_storage"))), // ≤10 photos
    personalFields: v.optional(v.array(personalFieldValidator)), // self-defined
    experience: v.optional(v.array(resumeEntryValidator)), // past jobs elsewhere
    education: v.optional(v.array(resumeEntryValidator)),
    familyMembers: v.optional(v.array(familyMemberValidator)), // dependents
    trainings: v.optional(v.array(resumeEntryValidator)), // training & certs

    // Employment
    departmentId: v.optional(v.id("departments")),
    teamId: v.optional(v.id("teams")),
    positionId: v.optional(v.id("positions")),
    managerId: v.optional(v.id("employees")),
    employmentType: employmentType,
    officeId: v.optional(v.id("offices")),
    joinDate: v.string(), // ISO date
    confirmationDate: v.optional(v.string()),
    probationEndDate: v.optional(v.string()),
    status: employeeStatus,
    exitDate: v.optional(v.string()),

    // Extensibility + denormalized search
    customFields: v.optional(v.record(v.string(), v.any())),
    searchName: v.string(), // lowercased names + employeeNumber

    createdBy: v.optional(v.id("users")),
    updatedAt: v.optional(v.number()),
  })
    .index("by_org", ["orgId"])
    .index("by_org_status", ["orgId", "status"])
    .index("by_org_department", ["orgId", "departmentId"])
    .index("by_org_manager", ["orgId", "managerId"])
    .index("by_org_employeeNumber", ["orgId", "employeeNumber"])
    .index("by_org_loginEmail", ["orgId", "loginEmail"])
    .index("by_userId", ["userId"])
    .searchIndex("search_name", {
      searchField: "searchName",
      filterFields: ["orgId", "status"],
    }),

  employeeDocuments: defineTable({
    orgId: v.id("organizations"),
    employeeId: v.id("employees"),
    type: documentType,
    name: v.string(),
    note: v.optional(v.string()),
    // Legacy single-file field; new docs use storageIds (up to 3 files).
    storageId: v.optional(v.id("_storage")),
    storageIds: v.optional(v.array(v.id("_storage"))),
    fileNames: v.optional(v.array(v.string())),
    expiryDate: v.optional(v.string()),
    uploadedBy: v.optional(v.id("users")),
  })
    .index("by_employee", ["employeeId"])
    .index("by_org_type", ["orgId", "type"])
    .index("by_org_expiry", ["orgId", "expiryDate"]),

  // Assets lent to an employee (laptops, phones, access cards, …). HR-managed.
  equipment: defineTable({
    orgId: v.id("organizations"),
    employeeId: v.id("employees"),
    name: v.string(),
    category: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    assignedDate: v.optional(v.string()),
    returnedDate: v.optional(v.string()),
    status: equipmentStatus,
    note: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_org", ["orgId"])
    .index("by_employee", ["employeeId"]),

  // Versioned in-company job timeline (Job Information). Each row is a position
  // change effective on `effectiveDate`; the latest row effective on/before
  // today is the employee's current job. HR-controlled; mirrors the latest
  // entry onto the employee doc's current job fields.
  jobHistory: defineTable({
    orgId: v.id("organizations"),
    employeeId: v.id("employees"),
    effectiveDate: v.string(), // ISO date
    positionId: v.optional(v.id("positions")),
    title: v.optional(v.string()), // free-text fallback when no positionId
    departmentId: v.optional(v.id("departments")),
    officeId: v.optional(v.id("offices")),
    managerId: v.optional(v.id("employees")),
    employmentType: v.optional(employmentType),
    note: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_org", ["orgId"])
    .index("by_employee", ["employeeId"])
    .index("by_employee_effective", ["employeeId", "effectiveDate"]),

  customFieldDefs: defineTable({
    orgId: v.id("organizations"),
    entity: v.literal("employee"),
    key: v.string(),
    label: v.string(),
    fieldType: customFieldType,
    options: v.optional(v.array(v.string())),
    required: v.boolean(),
  }).index("by_org_entity", ["orgId", "entity"]),

  // ─── Leave ───────────────────────────────────────────────────────────────

  leaveTypes: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    code: v.string(),
    category: leaveCategory,
    paid: v.boolean(),
    defaultEntitlementDays: v.number(),
    accrualMethod: accrualMethod,
    allowCarryForward: v.boolean(),
    maxCarryForwardDays: v.optional(v.number()),
    allowHalfDay: v.boolean(),
    requiresAttachment: v.boolean(),
    requiresApproval: v.boolean(),
    color: v.string(),
    active: v.boolean(),
    // Shows a "CREDIT" badge (e.g. Replacement leave is earned by working).
    isCredit: v.optional(v.boolean()),
    // Auto-assign the default policy to every employee.
    autoAssign: v.optional(v.boolean()),
  }).index("by_org", ["orgId"]),

  // One policy configuration for a leave type. A type can have several (one
  // per employee group); the `isDefault`/`availability: "all"` policy applies
  // to everyone not covered by a group assignment. Entitlement is computed
  // deterministically on read from these settings (see model/leavePolicy.ts) —
  // there is no per-day accrual write.
  leavePolicies: defineTable({
    orgId: v.id("organizations"),
    leaveTypeId: v.id("leaveTypes"),
    name: v.string(),
    description: v.optional(v.string()),
    availability: policyAvailability,
    isDefault: v.boolean(),
    order: v.optional(v.number()),
    // Approval chain.
    firstApproverMode: approverMode,
    firstApproverValue: v.optional(v.string()), // userId when mode = specific
    secondApproverMode: approverMode,
    secondApproverValue: v.optional(v.string()),
    // Entitlement.
    entitlementMode: entitlementMode,
    entitlementDays: v.number(),
    toleranceDays: v.optional(v.number()),
    // Earned leave (accrual).
    earnedEnabled: v.boolean(),
    accrualType: v.optional(accrualType),
    // Proration on join/exit.
    proratedEnabled: v.boolean(),
    prorateMode: v.optional(prorateMode),
    // Carry-forward.
    carryForwardEnabled: v.boolean(),
    maxCarryForwardDays: v.optional(v.number()),
    // Seniority increments.
    seniorityEnabled: v.boolean(),
    seniorityEffective: v.optional(seniorityEffective),
    seniorityIncrementMode: v.optional(incrementMode),
    seniorityRules: v.optional(v.array(seniorityRule)),
    seniorityMaxDays: v.optional(v.number()),
    // Rounding + linkage.
    rounding: roundingMode,
    linkedLeaveTypeId: v.optional(v.id("leaveTypes")),
    // Advance-booking settings.
    useWorkingDays: v.boolean(),
    allowApplyInPast: v.boolean(),
    minAdvanceDays: v.optional(v.number()),
    maxAdvanceDays: v.optional(v.number()),
    maxConsecutiveDays: v.optional(v.number()),
  })
    .index("by_org", ["orgId"])
    .index("by_org_type", ["orgId", "leaveTypeId"]),

  // Assigns a non-default policy to specific employees (Assign Policy tool).
  leavePolicyAssignments: defineTable({
    orgId: v.id("organizations"),
    leaveTypeId: v.id("leaveTypes"),
    policyId: v.id("leavePolicies"),
    employeeId: v.id("employees"),
  })
    .index("by_org_type_employee", ["orgId", "leaveTypeId", "employeeId"])
    .index("by_policy", ["policyId"]),

  leaveBalances: defineTable({
    orgId: v.id("organizations"),
    employeeId: v.id("employees"),
    leaveTypeId: v.id("leaveTypes"),
    year: v.number(),
    entitledDays: v.number(),
    carriedForwardDays: v.number(),
    takenDays: v.number(),
    pendingDays: v.number(),
    adjustmentDays: v.number(),
  })
    .index("by_org_employee_year", ["orgId", "employeeId", "year"])
    .index("by_employee_type_year", ["employeeId", "leaveTypeId", "year"]),

  leaveRequests: defineTable({
    orgId: v.id("organizations"),
    employeeId: v.id("employees"),
    leaveTypeId: v.id("leaveTypes"),
    startDate: v.string(), // ISO date
    endDate: v.string(),
    startHalf: v.optional(halfDay),
    endHalf: v.optional(halfDay),
    totalDays: v.number(),
    reason: v.optional(v.string()),
    attachmentStorageId: v.optional(v.id("_storage")),
    status: leaveStatus,
    approverUserId: v.optional(v.id("users")),
    decidedAt: v.optional(v.number()),
    decisionNote: v.optional(v.string()),
    // Two-step approval: which step is currently pending (1 or 2), and the
    // resolved approvers for each step (from the applicable policy).
    approvalStep: v.optional(v.number()),
    firstApproverUserId: v.optional(v.id("users")),
    secondApproverUserId: v.optional(v.id("users")),
    // Bounded audit trail shown in the detail slide-over.
    timeline: v.optional(v.array(leaveTimelineEvent)),
  })
    .index("by_org", ["orgId"])
    .index("by_org_status", ["orgId", "status"])
    .index("by_employee", ["employeeId"])
    .index("by_employee_status", ["employeeId", "status"])
    .index("by_org_start", ["orgId", "startDate"]),

  holidays: defineTable({
    orgId: v.id("organizations"),
    date: v.string(), // ISO date
    name: v.string(),
    country: v.string(),
    recurring: v.optional(v.boolean()),
  })
    .index("by_org", ["orgId"])
    .index("by_org_date", ["orgId", "date"]),

  // ─── Claims ──────────────────────────────────────────────────────────────

  claimTypes: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    category: claimCategory,
    requiresReceipt: v.boolean(),
    guidelines: v.optional(v.string()), // policy blurb shown in the claim form
    maxAmountCents: v.optional(v.number()), // per-transaction cap
    yearlyLimitCents: v.optional(v.number()),
    monthlyLimitCents: v.optional(v.number()),
    glCode: v.optional(v.string()),
    active: v.boolean(),
  }).index("by_org", ["orgId"]),

  // Org-wide expense-claim configuration (one row per org). Drives the claim
  // cut-off, transaction validity window, approval workflow (with thresholds),
  // and how approved claims flow to payroll.
  claimSettings: defineTable({
    orgId: v.id("organizations"),
    cutoffDay: v.number(), // 1–31, day of month
    transactionValidityMonths: v.optional(v.number()), // undefined = no limit
    hrApproverUserIds: v.array(v.id("users")),
    financeApproverUserIds: v.array(v.id("users")),
    approvalWorkflow: v.array(claimApproverStep),
    payrollMode: claimPayrollMode,
    payrollItem: v.optional(v.string()),
  }).index("by_org", ["orgId"]),

  claims: defineTable({
    orgId: v.id("organizations"),
    employeeId: v.id("employees"),
    claimTypeId: v.id("claimTypes"),
    amountCents: v.number(),
    currency: v.string(),
    taxAmountCents: v.optional(v.number()),
    localAmountCents: v.optional(v.number()), // amount in original/foreign currency
    localCurrency: v.optional(v.string()),
    receiptNo: v.optional(v.string()),
    incurredDate: v.string(), // ISO date
    description: v.string(),
    receiptStorageIds: v.array(v.id("_storage")),
    status: claimStatus,
    managerApproverUserId: v.optional(v.id("users")),
    financeApproverUserId: v.optional(v.id("users")),
    decidedAt: v.optional(v.number()),
    reimbursedAt: v.optional(v.number()),
    decisionNote: v.optional(v.string()),
    // Settings-driven approval chain (resolved at submit). While `status` is
    // `pending_manager` the claim is working through `approvalChain` at
    // `currentStepIndex`; once the chain completes it moves to `pending_finance`.
    approvalChain: v.optional(v.array(claimChainStep)),
    currentStepIndex: v.optional(v.number()),
    // Queued for payroll reimbursement (auto-set on approval when the org's
    // payroll connection is "automatic"; toggled manually otherwise).
    sentToPayroll: v.optional(v.boolean()),
  })
    .index("by_org", ["orgId"])
    .index("by_org_status", ["orgId", "status"])
    .index("by_employee", ["employeeId"]),

  claimComments: defineTable({
    orgId: v.id("organizations"),
    claimId: v.id("claims"),
    authorUserId: v.id("users"),
    body: v.string(),
  }).index("by_claim", ["claimId"]),

  // ─── Attendance (PWA QR + GPS) ───────────────────────────────────────────

  // One row per clock-in/out pair. A row is `open` from clock-in until the
  // employee clocks out (or a correction completes it). The `date` is the
  // calendar day in the office timezone, used for daily lookups/reports.
  attendanceRecords: defineTable({
    orgId: v.id("organizations"),
    employeeId: v.id("employees"),
    officeId: v.optional(v.id("offices")),
    date: v.string(), // ISO "YYYY-MM-DD" in office timezone
    clockInAt: v.number(), // epoch ms
    clockInGeo: v.optional(v.object({ lat: v.number(), lng: v.number() })),
    clockInAccuracy: v.optional(v.number()), // metres
    clockInDistance: v.optional(v.number()), // metres from office at clock-in
    clockOutAt: v.optional(v.number()),
    clockOutGeo: v.optional(v.object({ lat: v.number(), lng: v.number() })),
    clockOutAccuracy: v.optional(v.number()),
    clockOutDistance: v.optional(v.number()),
    workedMinutes: v.optional(v.number()),
    method: attendanceMethod,
    status: attendanceStatus,
    note: v.optional(v.string()),
    correctedByUserId: v.optional(v.id("users")),
  })
    .index("by_org", ["orgId"])
    .index("by_org_date", ["orgId", "date"])
    .index("by_org_status", ["orgId", "status"])
    .index("by_employee", ["employeeId"])
    .index("by_employee_date", ["employeeId", "date"])
    .index("by_employee_status", ["employeeId", "status"]),

  // Employee-raised fixes for a missed/incorrect clock event, reviewed by a
  // manager or HR. Approval writes the requested times onto a record.
  attendanceCorrections: defineTable({
    orgId: v.id("organizations"),
    employeeId: v.id("employees"),
    recordId: v.optional(v.id("attendanceRecords")),
    date: v.string(),
    requestedClockInAt: v.optional(v.number()),
    requestedClockOutAt: v.optional(v.number()),
    reason: v.string(),
    status: correctionStatus,
    reviewerUserId: v.optional(v.id("users")),
    decidedAt: v.optional(v.number()),
    decisionNote: v.optional(v.string()),
  })
    .index("by_org", ["orgId"])
    .index("by_org_status", ["orgId", "status"])
    .index("by_employee", ["employeeId"]),

  // ─── Scheduling & shifts ─────────────────────────────────────────────────

  // Reusable shift definition (e.g. "Morning 09:00–17:00") used to stamp out
  // assignments quickly. Times are wall-clock "HH:MM" in the office timezone.
  shiftTemplates: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    startTime: v.string(), // "HH:MM"
    endTime: v.string(), // "HH:MM" (may be <= startTime for overnight shifts)
    breakMinutes: v.number(),
    color: v.string(),
    officeId: v.optional(v.id("offices")),
    active: v.boolean(),
  }).index("by_org", ["orgId"]),

  // One employee scheduled to work on a specific calendar date. May derive from
  // a template or carry ad-hoc times. `status` gates visibility to employees.
  shiftAssignments: defineTable({
    orgId: v.id("organizations"),
    employeeId: v.id("employees"),
    date: v.string(), // ISO "YYYY-MM-DD"
    shiftTemplateId: v.optional(v.id("shiftTemplates")),
    startTime: v.string(),
    endTime: v.string(),
    breakMinutes: v.number(),
    color: v.string(),
    officeId: v.optional(v.id("offices")),
    status: shiftStatus,
    note: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_org", ["orgId"])
    .index("by_org_date", ["orgId", "date"])
    .index("by_employee", ["employeeId"])
    .index("by_employee_date", ["employeeId", "date"])
    .index("by_employee_status_date", ["employeeId", "status", "date"]),

  // ─── Payroll ─────────────────────────────────────────────────────────────

  // Versioned compensation. The record in effect for a pay period is the one
  // with the latest `effectiveDate` on or before the period end. Never edited
  // in place — a change inserts a new row, preserving salary history.
  compensation: defineTable({
    orgId: v.id("organizations"),
    employeeId: v.id("employees"),
    effectiveDate: v.string(), // ISO date
    currency: v.string(),
    baseMonthlyCents: v.number(),
    allowances: v.array(allowanceItem),
    cpfStatus: cpfStatus,
    note: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_org", ["orgId"])
    .index("by_employee", ["employeeId"])
    .index("by_employee_effective", ["employeeId", "effectiveDate"]),

  // A monthly payroll run; totals are denormalized across its payslips.
  payrollRuns: defineTable({
    orgId: v.id("organizations"),
    periodMonth: v.string(), // "YYYY-MM"
    label: v.string(),
    currency: v.string(),
    status: payrollStatus,
    payDate: v.optional(v.string()),
    grossCents: v.number(),
    employeeCpfCents: v.number(),
    employerCpfCents: v.number(),
    netCents: v.number(),
    payslipCount: v.number(),
    createdBy: v.optional(v.id("users")),
    finalizedAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
  })
    .index("by_org", ["orgId"])
    .index("by_org_period", ["orgId", "periodMonth"]),

  // One-off line items entered or pulled while a run is in `draft`. The
  // editable *inputs* behind a payslip — `payslips.lines` is recomputed from
  // compensation + these. Cleared when a draft run is deleted; frozen by
  // virtue of the run locking once finalized.
  payrollAdjustments: defineTable({
    orgId: v.id("organizations"),
    runId: v.id("payrollRuns"),
    employeeId: v.id("employees"),
    kind: payrollAdjustmentKind,
    source: payrollAdjustmentSource,
    label: v.string(),
    amountCents: v.number(),
    // additions: counts toward CPF Ordinary Wages.
    cpfable: v.boolean(),
    // deductions: true = reduces gross (pre-CPF, e.g. no-pay leave); false =
    // post-CPF net-only (e.g. loan recovery). Ignored for additions.
    affectsGross: v.boolean(),
    note: v.optional(v.string()),
    // Provenance for auto-pulled items, so re-syncing is idempotent.
    sourceRefId: v.optional(v.string()), // claimId / leaveRequestId
    overtime: v.optional(overtimeMeta),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_run", ["runId"])
    .index("by_run_employee", ["runId", "employeeId"])
    .index("by_run_source", ["runId", "source"]),

  // A computed payslip snapshot. Immutable once its run is finalized.
  payslips: defineTable({
    orgId: v.id("organizations"),
    runId: v.id("payrollRuns"),
    employeeId: v.id("employees"),
    periodMonth: v.string(),
    currency: v.string(),
    baseCents: v.number(),
    allowancesCents: v.number(),
    grossCents: v.number(),
    cpfableWageCents: v.number(),
    employeeCpfCents: v.number(),
    employerCpfCents: v.number(),
    netCents: v.number(),
    cpfStatus: cpfStatus,
    lines: v.array(payslipLine),
    status: payrollStatus,
  })
    .index("by_run", ["runId"])
    .index("by_run_employee", ["runId", "employeeId"])
    .index("by_employee", ["employeeId"])
    .index("by_employee_period", ["employeeId", "periodMonth"]),

  // ─── Recruitment ───────────────────────────────────────────────────────────

  // Public careers-page configuration for an org (one row). The `slug` is the
  // public URL segment at /boards/<slug>.
  jobBoardSettings: defineTable({
    orgId: v.id("organizations"),
    slug: v.string(),
    companyName: v.string(),
    headline: v.optional(v.string()),
    description: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    bannerStorageId: v.optional(v.id("_storage")),
    published: v.boolean(),
  })
    .index("by_org", ["orgId"])
    .index("by_slug", ["slug"]),

  jobs: defineTable({
    orgId: v.id("organizations"),
    title: v.string(),
    departmentId: v.optional(v.id("departments")),
    level: v.optional(v.string()), // e.g. "Executive", "Mid Senior level"
    country: v.optional(v.string()), // work location
    employmentType: v.optional(employmentType),
    description: v.optional(v.string()),
    status: jobStatus,
    hiringManagerEmployeeId: v.optional(v.id("employees")),
    recruiterUserId: v.optional(v.id("users")),
    postedToBoard: v.boolean(),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_org", ["orgId"])
    .index("by_org_status", ["orgId", "status"]),

  candidates: defineTable({
    orgId: v.id("organizations"),
    jobId: v.id("jobs"),
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    resumeStorageId: v.optional(v.id("_storage")),
    coverLetter: v.optional(v.string()),
    stage: candidateStage,
    source: candidateSource,
    rating: v.optional(v.number()),
    note: v.optional(v.string()),
  })
    .index("by_org", ["orgId"])
    .index("by_job", ["jobId"])
    .index("by_org_stage", ["orgId", "stage"]),

  interviews: defineTable({
    orgId: v.id("organizations"),
    candidateId: v.id("candidates"),
    jobId: v.id("jobs"),
    scheduledAt: v.number(), // epoch ms
    durationMins: v.number(),
    mode: interviewMode,
    locationOrLink: v.optional(v.string()),
    interviewerUserId: v.optional(v.id("users")),
    notes: v.optional(v.string()),
    status: interviewStatus,
    createdBy: v.optional(v.id("users")),
  })
    .index("by_org", ["orgId"])
    .index("by_candidate", ["candidateId"])
    .index("by_org_scheduledAt", ["orgId", "scheduledAt"]),

  // ─── Performance appraisal ───────────────────────────────────────────────

  // A review period (e.g. "H1 2026"). Activating it generates a review row per
  // active employee; closing it locks them.
  reviewCycles: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    startDate: v.string(), // ISO date
    endDate: v.string(),
    status: reviewCycleStatus,
    ratingScaleMax: v.number(), // e.g. 5
    createdBy: v.optional(v.id("users")),
  })
    .index("by_org", ["orgId"])
    .index("by_org_status", ["orgId", "status"]),

  // An employee goal / KPI. May belong to a cycle or stand alone.
  goals: defineTable({
    orgId: v.id("organizations"),
    employeeId: v.id("employees"),
    cycleId: v.optional(v.id("reviewCycles")),
    title: v.string(),
    description: v.optional(v.string()),
    weight: v.number(), // percentage weighting
    progress: v.number(), // 0–100
    status: goalStatus,
    dueDate: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_org", ["orgId"])
    .index("by_employee", ["employeeId"])
    .index("by_employee_cycle", ["employeeId", "cycleId"])
    .index("by_cycle", ["cycleId"]),

  // One appraisal per (cycle, employee), holding both the self and manager
  // sections plus the final rating.
  reviews: defineTable({
    orgId: v.id("organizations"),
    cycleId: v.id("reviewCycles"),
    employeeId: v.id("employees"),
    managerId: v.optional(v.id("employees")), // snapshot at generation
    status: reviewStatus,
    selfRating: v.optional(v.number()),
    selfComments: v.optional(v.string()),
    selfSubmittedAt: v.optional(v.number()),
    managerRating: v.optional(v.number()),
    managerComments: v.optional(v.string()),
    managerSubmittedAt: v.optional(v.number()),
    overallRating: v.optional(v.number()),
  })
    .index("by_org", ["orgId"])
    .index("by_cycle", ["cycleId"])
    .index("by_employee", ["employeeId"])
    .index("by_employee_cycle", ["employeeId", "cycleId"])
    .index("by_manager_status", ["managerId", "status"]),

  // Peer / 360 feedback about an employee, visible to their manager + HR.
  feedback: defineTable({
    orgId: v.id("organizations"),
    subjectEmployeeId: v.id("employees"),
    cycleId: v.optional(v.id("reviewCycles")),
    authorUserId: v.id("users"),
    body: v.string(),
  })
    .index("by_org", ["orgId"])
    .index("by_subject", ["subjectEmployeeId"]),

  // ─── Cross-cutting primitives ────────────────────────────────────────────

  auditLogs: defineTable({
    orgId: v.id("organizations"),
    actorUserId: v.optional(v.id("users")),
    action: v.string(),
    entity: v.string(),
    entityId: v.optional(v.string()),
    before: v.optional(v.any()),
    after: v.optional(v.any()),
    ip: v.optional(v.string()),
  })
    .index("by_org", ["orgId"])
    .index("by_entity", ["orgId", "entity", "entityId"]),

  notifications: defineTable({
    orgId: v.id("organizations"),
    recipientUserId: v.id("users"),
    type: v.string(),
    title: v.string(),
    body: v.optional(v.string()),
    entityRef: v.optional(v.object({ table: v.string(), id: v.string() })),
    read: v.boolean(),
  })
    .index("by_recipient_read", ["recipientUserId", "read"])
    .index("by_org", ["orgId"]),

  // ─── Feed (company announcements) ────────────────────────────────────────

  feedPosts: defineTable({
    orgId: v.id("organizations"),
    authorUserId: v.id("users"),
    title: v.string(),
    body: v.string(), // sanitized rich-text HTML
    audience: feedAudience,
    audienceDepartmentId: v.optional(v.id("departments")),
    audienceOfficeId: v.optional(v.id("offices")),
    audienceEmployeeIds: v.optional(v.array(v.id("employees"))),
    pinned: v.boolean(),
    isEvent: v.boolean(),
    eventDate: v.optional(v.string()), // ISO date (start)
    eventEndDate: v.optional(v.string()), // ISO date (end, for multi-day events)
    eventLocation: v.optional(v.string()),
    youtubeUrl: v.optional(v.string()),
    mediaStorageIds: v.optional(v.array(v.id("_storage"))),
    mediaNames: v.optional(v.array(v.string())),
    notifyByEmail: v.optional(v.boolean()),
  })
    .index("by_org", ["orgId"])
    .index("by_org_pinned", ["orgId", "pinned"]),

  // ─── Billing (existing) ──────────────────────────────────────────────────

  paymentAttempts: defineTable(paymentAttemptSchemaValidator)
    .index("byPaymentId", ["payment_id"])
    .index("byUserId", ["userId"])
    .index("byPayerUserId", ["payer.user_id"]),
});
