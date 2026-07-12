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
  leaveApproverStep,
  leaveChainStep,
  claimCategory,
  claimStatus,
  claimApproverStep,
  claimApprovalFlow,
  claimAssigneeGroup,
  claimPayrollMode,
  claimChainStep,
  claimSignature,
  claimExchangeMode,
  claimEditEntry,
  paymentRequestStatus,
  paymentRequestField,
  paymentRequestShow,
  paymentRequestItem,
  officeMileageSettings,
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
  cpfConfig,
  payType,
  payrollStatus,
  payslipLine,
  allowanceItem,
  deductionItem,
  employerContribItem,
  prorationMeta,
  employeeFunds,
  shgFundConfig,
  sdlConfig,
  payrollApprovalConfig,
  payslipApprovalStep,
  payslipSignature,
  payslipTemplateShow,
  payslipLayoutBlock,
  payslipDensity,
  payrollAdjustmentKind,
  payrollAdjustmentSource,
  overtimeMeta,
  reviewCycleStatus,
  goalStatus,
  reviewStatus,
  feedAudience,
  ratingBand,
  competencyLevelDescriptor,
  feedback360Relationship,
  feedback360Status,
  feedback360Answer,
} from "./lib/enums";

// Per-module email notification config. `enabled` gates whether emails send for
// that module; the rest customize the email template (all optional, falling
// back to sensible defaults at render time).
const emailModuleConfig = v.object({
  enabled: v.boolean(),
  accentColor: v.optional(v.string()), // hex, e.g. "#2563eb" — header + button
  fontFamily: v.optional(v.string()), // "system" | "serif" | "mono" | "rounded"
  fromName: v.optional(v.string()), // display name in the From header
  footerText: v.optional(v.string()),
});

export default defineSchema({
  // ─── Foundation: tenancy + identity ──────────────────────────────────────

  // One row per company. Synced from Clerk `organization.*` webhooks.
  organizations: defineTable({
    clerkOrgId: v.string(),
    name: v.string(),
    slug: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    // Org logo uploaded through our own UI (Convex storage). Takes precedence
    // over Clerk's `imageUrl` so we no longer depend on Clerk's org UI.
    logoStorageId: v.optional(v.id("_storage")),
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
    // Clerk username, when the account was created with a username identifier
    // rather than (or in addition to) an email. Lowercased.
    username: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  })
    .index("byExternalId", ["externalId"])
    .index("by_username", ["username"]),

  // Authoritative auth + RBAC record linking a user to an organization.
  // Synced from Clerk `organizationMembership.*` webhooks; `role` is seeded
  // from the Clerk org role then editable in-app (independent of Clerk plan).
  members: defineTable({
    orgId: v.id("organizations"),
    userId: v.id("users"),
    clerkMembershipId: v.string(),
    // Legacy role enum — retained for Clerk seeding + as the permission
    // resolution fallback when `roleId` is absent.
    role: hrmsRole,
    // The data-driven role this member holds. When set, its `roles` document's
    // permissions are authoritative; when absent, permissions fall back to the
    // static matrix keyed by `role`.
    roleId: v.optional(v.id("roles")),
    status: memberStatus,
  })
    .index("by_org", ["orgId"])
    .index("by_user", ["userId"])
    .index("by_org_and_user", ["orgId", "userId"])
    .index("by_clerkMembershipId", ["clerkMembershipId"])
    .index("by_role", ["roleId"]),

  // Data-driven roles, one set per org. Seeded from ROLE_PRESETS (isPreset =
  // true, `key` ties back to the legacy HrmsRole enum); admins may add custom
  // roles and tune permissions. `permissions` holds Permission keys.
  roles: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    key: v.optional(hrmsRole), // set for preset roles only
    isPreset: v.boolean(),
    permissions: v.array(v.string()),
    order: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_org_key", ["orgId", "key"]),

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
    // Base currency for this office — claims by employees assigned here are
    // denominated in it (falls back to the org currency when unset).
    defaultCurrency: v.optional(v.string()),
    // The org's protected default office (seeded as "Singapore"). Can't be
    // deleted, so there's always at least one office to assign employees to.
    isDefault: v.optional(v.boolean()),
    geo: v.optional(v.object({ lat: v.number(), lng: v.number() })),
    radiusMeters: v.optional(v.number()),
    // Mileage-claim rates for employees assigned to this office. Absent = not
    // configured yet — mileage claims are blocked until an admin sets it up.
    mileageSettings: v.optional(officeMileageSettings),
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
    // The Clerk username this person is invited/added to the org with — an
    // alternative to email for people who sign up with a username identifier.
    // Used to link the employee to their `members`/`users` row on join. Lowercased.
    loginUsername: v.optional(v.string()),
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
    .index("by_org_loginUsername", ["orgId", "loginUsername"])
    // Global (cross-org) lookup used to auto-add pending username invitees to
    // every org that is waiting on them, once they sign up.
    .index("by_loginUsername", ["loginUsername"])
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
    // Approval chain. `approvalChain` is the ordered multi-step chain (manager /
    // department_head / role / specific person(s), each optionally day-gated).
    // The legacy `firstApproverMode` / `secondApproverMode` fields are retained
    // for policies saved before the chain existed; resolution falls back to them
    // when `approvalChain` is absent.
    approvalChain: v.optional(v.array(leaveApproverStep)),
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
    // Approval chain snapshotted from the policy at apply time. While pending,
    // the request is at `currentStepIndex` in `approvalChain`; each step is
    // approved individually and any of its eligible approvers can act. Absent on
    // legacy in-flight requests, which fall back to the two-step fields below.
    approvalChain: v.optional(v.array(leaveChainStep)),
    currentStepIndex: v.optional(v.number()),
    // Legacy two-step approval: which step is currently pending (1 or 2), and
    // the resolved approvers for each step. Kept for requests created before the
    // chain existed.
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

  // A monthly batch of claims one employee submits together. Approvers act on
  // the group as a unit. Resubmitting rejected claims for a month creates a new
  // group with the next `sequence` (so a month can have several groups over time).
  claimGroups: defineTable({
    orgId: v.id("organizations"),
    employeeId: v.id("employees"),
    periodMonth: v.string(), // "YYYY-MM"
    sequence: v.number(), // 1-based per (employee, month); resubmissions increment
    title: v.optional(v.string()), // display label, e.g. "June 2026 · Resubmission 2"
    submittedAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_employee", ["employeeId"])
    .index("by_org_month", ["orgId", "periodMonth"])
    .index("by_employee_month", ["employeeId", "periodMonth"]),

  // Org-wide expense-claim configuration (one row per org). Drives the claim
  // cut-off, transaction validity window, approval workflow (with thresholds),
  // and how approved claims flow to payroll.
  claimSettings: defineTable({
    orgId: v.id("organizations"),
    cutoffDay: v.number(), // 1–31, day of month
    transactionValidityMonths: v.optional(v.number()), // undefined = no limit
    hrApproverUserIds: v.array(v.id("users")),
    financeApproverUserIds: v.array(v.id("users")),
    // When on, finance must clock a signature to approve the finance stage.
    // Absent = false. (Per-approver-step signatures live on the workflow steps.)
    financeRequiresSignature: v.optional(v.boolean()),
    // Custom assignee groups (beyond the built-in HR/Finance) that approval
    // workflow steps can target by id. Absent on orgs configured before groups.
    assigneeGroups: v.optional(v.array(claimAssigneeGroup)),
    approvalWorkflow: v.array(claimApproverStep),
    // Per-claimant approval flows (role- or person-matched, plus a "default"
    // flow). Absent on orgs configured before flows existed — those fall back to
    // a single default flow synthesized from `approvalWorkflow`, which stays
    // mirrored to the default flow's steps for backward compatibility.
    approvalFlows: v.optional(v.array(claimApprovalFlow)),
    // Max claim groups (monthly submissions incl. resubmissions) one employee
    // may create per period. Undefined = no limit.
    maxGroupsPerPeriod: v.optional(v.number()),
    payrollMode: claimPayrollMode,
    payrollItem: v.optional(v.string()),
  }).index("by_org", ["orgId"]),

  claims: defineTable({
    orgId: v.id("organizations"),
    employeeId: v.id("employees"),
    // The monthly batch this claim was submitted in. Absent on drafts (not yet
    // submitted) and on legacy claims submitted before groups existed.
    groupId: v.optional(v.id("claimGroups")),
    claimTypeId: v.id("claimTypes"),
    amountCents: v.number(),
    currency: v.string(),
    taxAmountCents: v.optional(v.number()),
    localAmountCents: v.optional(v.number()), // amount in original/foreign currency
    localCurrency: v.optional(v.string()),
    // Foreign-currency conversion, locked at submit. `amountCents` (base/org
    // currency) = localAmountCents × exchangeRate. `exchangeRateDate` is the
    // date the rate is for (submit date for "auto"); it never changes on review.
    exchangeRate: v.optional(v.number()), // base units per 1 foreign unit
    exchangeMode: v.optional(claimExchangeMode),
    exchangeRateDate: v.optional(v.string()), // ISO date
    exchangeProvider: v.optional(v.string()), // e.g. "frankfurter" | "manual"
    receiptNo: v.optional(v.string()),
    // Mileage claims only: distance travelled + the vehicle-type rate applied,
    // snapshotted at submit/edit time from the employee's office mileage
    // settings so a later rate change never retags past claims.
    mileageDistanceKm: v.optional(v.number()),
    mileageVehicleTypeId: v.optional(v.string()),
    mileageVehicleTypeLabel: v.optional(v.string()),
    mileageRatePerKmCents: v.optional(v.number()),
    incurredDate: v.string(), // ISO date
    description: v.string(),
    // Free-text remarks about the claim (set by the submitter and/or approvers).
    remarks: v.optional(v.string()),
    receiptStorageIds: v.array(v.id("_storage")),
    status: claimStatus,
    managerApproverUserId: v.optional(v.id("users")),
    financeApproverUserId: v.optional(v.id("users")),
    decidedAt: v.optional(v.number()),
    reimbursedAt: v.optional(v.number()),
    decisionNote: v.optional(v.string()),
    // Settings-driven approval chain (resolved at submit). While `status` is
    // `pending_manager` the claim is working through `approvalChain` at
    // `currentStepIndex`. Once the chain completes the claim moves to
    // `pending_finance` when finance approvers are configured, otherwise
    // straight to `approved`.
    approvalChain: v.optional(v.array(claimChainStep)),
    currentStepIndex: v.optional(v.number()),
    // When rejected, the chain step index at which the rejection happened
    // (finance-stage rejection = `approvalChain.length`). Drives top-down reject
    // visibility: a rejected claim is visible to approvers at steps up to and
    // including this index (plus the claimant and finance), never to later ones.
    rejectedStepIndex: v.optional(v.number()),
    // Snapshot (at submit) of whether this claim routes through a finance
    // approval stage, taken from the org's claim settings. Drives the status
    // timeline so it reflects the configured process. Absent on legacy claims,
    // which always went through finance.
    requiresFinance: v.optional(v.boolean()),
    // Queued for payroll reimbursement (auto-set on approval when the org's
    // payroll connection is "automatic"; toggled manually otherwise).
    sentToPayroll: v.optional(v.boolean()),
    // Approver signatures clocked at approval steps (and finance), appended as
    // each signing approver acts. Rendered on claim Excel exports.
    signatures: v.optional(v.array(claimSignature)),
    // Audit trail of approver edits (append-only). Absent until first edited.
    edits: v.optional(v.array(claimEditEntry)),
    // When this claim is a resubmission, the id of the original rejected claim
    // it was duplicated from. The original stays on its own (rejected); this is
    // a fresh, independently-editable copy. Absent on first-time claims.
    resubmittedFromClaimId: v.optional(v.id("claims")),
  })
    .index("by_org", ["orgId"])
    .index("by_org_status", ["orgId", "status"])
    .index("by_employee", ["employeeId"])
    .index("by_group", ["groupId"]),

  claimComments: defineTable({
    orgId: v.id("organizations"),
    claimId: v.id("claims"),
    authorUserId: v.id("users"),
    body: v.string(),
  }).index("by_claim", ["claimId"]),

  // ─── Payment requests ──────────────────────────────────────────────────────

  // A reusable payment-request form template. An org can have several; the form
  // shows one (chosen at submit, defaulting to `isDefault`). `fields` are the
  // org-defined custom fields shown on the form on top of the core fields.
  paymentRequestTemplates: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    // Heading rendered on the printable document (e.g. "REQUEST FOR PAYMENT").
    headerText: v.optional(v.string()),
    isDefault: v.boolean(),
    active: v.boolean(),
    order: v.number(),
    fields: v.array(paymentRequestField),
    // Document styling (mirrors payslip templates). All optional — absent falls
    // back to sensible defaults in the renderer.
    accentColor: v.optional(v.string()), // heading colour
    fontFamily: v.optional(v.string()),
    textColor: v.optional(v.string()), // body text colour
    fontScale: v.optional(v.number()), // 1 = default (~0.85–1.25)
    density: v.optional(payslipDensity),
    show: v.optional(paymentRequestShow), // which sections are visible
  }).index("by_org", ["orgId"]),

  // Org-wide payment-request configuration (one row per org). Mirrors the claim
  // approval structure (assignee groups + workflow + per-claimant flows + HR /
  // Finance stages) but is INDEPENDENT of claim settings, so payment requests can
  // route to different approvers. No cut-off / payroll connection (claims-only).
  paymentRequestSettings: defineTable({
    orgId: v.id("organizations"),
    hrApproverUserIds: v.array(v.id("users")),
    financeApproverUserIds: v.array(v.id("users")),
    // When on, finance must clock a signature to approve the finance stage.
    financeRequiresSignature: v.optional(v.boolean()),
    assigneeGroups: v.optional(v.array(claimAssigneeGroup)),
    approvalWorkflow: v.array(claimApproverStep),
    approvalFlows: v.optional(v.array(claimApprovalFlow)),
    // Template applied by default in the submit form.
    defaultTemplateId: v.optional(v.id("paymentRequestTemplates")),
  }).index("by_org", ["orgId"]),

  paymentRequests: defineTable({
    orgId: v.id("organizations"),
    employeeId: v.id("employees"),
    // The template this request was filled from (drives the custom fields shown
    // in detail / on the printed document). Absent on legacy/template-less rows.
    templateId: v.optional(v.id("paymentRequestTemplates")),
    // Per-org running sequence, for a human-friendly reference (e.g. "PR-0007").
    requestNumber: v.number(),
    // Core fields (always present).
    purpose: v.string(),
    amountCents: v.number(),
    currency: v.string(),
    payeeName: v.string(),
    // Itemised line items when the request pays for several things at once. When
    // present and non-empty, `amountCents` is the sum of the line `amountCents`.
    // Absent/empty means a single-amount request (the common case).
    items: v.optional(v.array(paymentRequestItem)),
    // Country the payment relates to (ISO-3166 alpha-2, e.g. "SG"). A built-in
    // field on every request; defaults to the org country. Optional for legacy
    // rows created before it existed.
    country: v.optional(v.string()),
    requestDate: v.string(), // ISO date the request is for
    incurredMonth: v.string(), // "YYYY-MM" derived from requestDate, for filters
    // Org-defined custom-field values, keyed by `paymentRequestField.key`. All
    // stored as strings (numbers/dates serialized) for a uniform render.
    fieldValues: v.optional(v.record(v.string(), v.string())),
    // Supporting documents (invoices, quotes, …), up to 10.
    attachmentStorageIds: v.array(v.id("_storage")),
    remarks: v.optional(v.string()),
    status: paymentRequestStatus,
    // Settings-driven approval chain (resolved at submit), reusing the claim
    // chain-step shape. While `pending_manager` the request walks the chain at
    // `currentStepIndex`; a completed chain moves to `pending_finance` when
    // finance approvers exist, otherwise straight to `approved`. No group barrier
    // (individual submission), so `workflowIndex` on steps is unused.
    approvalChain: v.optional(v.array(claimChainStep)),
    currentStepIndex: v.optional(v.number()),
    rejectedStepIndex: v.optional(v.number()),
    requiresFinance: v.optional(v.boolean()),
    // Optional signature the requestor clocks at submission ("Requested by").
    requestorSignatureStorageId: v.optional(v.id("_storage")),
    // Approver signatures clocked at approval steps (and finance).
    signatures: v.optional(v.array(claimSignature)),
    managerApproverUserId: v.optional(v.id("users")),
    financeApproverUserId: v.optional(v.id("users")),
    decidedAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    decisionNote: v.optional(v.string()),
    edits: v.optional(v.array(claimEditEntry)),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_org", ["orgId"])
    .index("by_org_status", ["orgId", "status"])
    .index("by_employee", ["employeeId"])
    .index("by_org_month", ["orgId", "incurredMonth"]),

  paymentRequestComments: defineTable({
    orgId: v.id("organizations"),
    requestId: v.id("paymentRequests"),
    authorUserId: v.id("users"),
    body: v.string(),
  }).index("by_request", ["requestId"]),

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
    // How base pay is defined. Absent = "fixed" (legacy records). For "hourly",
    // `hourlyRateCents` drives pay (× hours entered per run) and
    // `baseMonthlyCents` is unused (stored 0).
    payType: v.optional(payType),
    baseMonthlyCents: v.number(),
    hourlyRateCents: v.optional(v.number()),
    allowances: v.array(allowanceItem),
    cpfStatus: cpfStatus,
    // For PR employees: the date they obtained Permanent Resident status. Used
    // to derive their CPF contribution year (graduated in years 1–2).
    prStartDate: v.optional(v.string()),
    // When the pay `currency` differs from the org base currency, how the
    // conversion rate is obtained by default: "auto" (live FX) or "manual".
    // `manualRate` (base units per 1 pay unit) seeds a manual default.
    exchangeMode: v.optional(claimExchangeMode),
    manualRate: v.optional(v.number()),
    // Working weekdays (0=Sun … 6=Sat) used to prorate pay for unpaid leave and
    // incomplete months. Absent = default Mon–Fri.
    workingDays: v.optional(v.array(v.number())),
    // Statutory + custom fund participation for this employee.
    funds: v.optional(employeeFunds),
    // Recurring employee deductions (beyond funds/CPF).
    deductions: v.optional(v.array(deductionItem)),
    // Recurring employer contributions (beyond CPF/SDL).
    employerContributions: v.optional(v.array(employerContribItem)),
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
    // Payslip template this run renders with (falls back to the org default).
    templateId: v.optional(v.id("payslipTemplates")),
    // Preparer's signature, captured when the run is completed, applied to all
    // payslips. `completedBy` is the user who completed the run.
    preparerSignatureStorageId: v.optional(v.id("_storage")),
    completedBy: v.optional(v.id("users")),
    createdBy: v.optional(v.id("users")),
    finalizedAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
  })
    .index("by_org", ["orgId"])
    .index("by_org_period", ["orgId", "periodMonth"]),

  // Org-wide payroll configuration (one row per org): statutory fund tables,
  // SDL, and the payroll approval chain.
  payrollSettings: defineTable({
    orgId: v.id("organizations"),
    shgFunds: v.array(shgFundConfig),
    sdl: sdlConfig,
    // Org-configurable CPF rate tables (age bands, OW ceiling, PR graduated
    // rates). Absent → seeded SG defaults.
    cpf: v.optional(cpfConfig),
    approval: payrollApprovalConfig,
    defaultTemplateId: v.optional(v.id("payslipTemplates")),
    // When on, signatures are rendered on payslips employees view/download
    // themselves. HR/payroll and approvers always see signatures.
    showSignaturesToEmployees: v.optional(v.boolean()),
  }).index("by_org", ["orgId"]),

  // A configurable payslip template. An org can have several; each run picks one.
  payslipTemplates: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    isDefault: v.boolean(),
    accentColor: v.string(), // CSS color for headings/accents
    fontFamily: v.string(), // CSS font-family stack
    logoStorageId: v.optional(v.id("_storage")),
    headerText: v.optional(v.string()),
    footerText: v.optional(v.string()),
    show: payslipTemplateShow,
    // Drag-and-drop block layout. When present it drives the payslip render
    // (order + visibility + custom blocks); absent → legacy `show` layout.
    layout: v.optional(v.array(payslipLayoutBlock)),
    // Body text colour (CSS), overall font-size scale, and vertical density.
    textColor: v.optional(v.string()),
    fontScale: v.optional(v.number()), // 1 = default; ~0.85–1.25
    density: v.optional(payslipDensity),
  }).index("by_org", ["orgId"]),

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
    // For PR payslips, the contribution year applied (1 | 2 | 3), snapshotted.
    prYear: v.optional(v.number()),
    // Multi-currency: `currency` is the pay currency. When it differs from
    // `baseCurrency` (org), `exchangeRate` (base units per 1 pay unit) converts
    // amounts to base for run totals / exports. Captured/edited during the run.
    baseCurrency: v.optional(v.string()),
    exchangeRate: v.optional(v.number()),
    exchangeRateDate: v.optional(v.string()),
    exchangeMode: v.optional(claimExchangeMode),
    exchangeProvider: v.optional(v.string()),
    lines: v.array(payslipLine),
    status: payrollStatus,
    // For hourly-paid employees: the hours worked this period, entered at the
    // adjust stage. Base pay = hourlyRate × hoursWorked. Absent for fixed pay.
    hoursWorked: v.optional(v.number()),
    // Proration snapshot (base pay was reduced for unpaid leave / partial month).
    proration: v.optional(prorationMeta),
    // HR-entered override of the proration day counts (survives recompute).
    prorationOverride: v.optional(
      v.object({
        daysWorked: v.number(),
        totalWorkingDays: v.number(),
      }),
    ),
    // Approval chain snapshotted at run completion; the payslip is at
    // `currentStepIndex` while pending. Each approver signs individually.
    approvalChain: v.optional(v.array(payslipApprovalStep)),
    currentStepIndex: v.optional(v.number()),
    // Preparer + approver signatures rendered on the payslip.
    signatures: v.optional(v.array(payslipSignature)),
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
    // Appraisal weighting: objectives vs competencies (should sum to 100).
    objectivesWeightPct: v.optional(v.number()), // default 70
    competenciesWeightPct: v.optional(v.number()), // default 30
    // Qualitative bands applied to the numeric overall rating.
    ratingBands: v.optional(v.array(ratingBand)),
    // Configurable appraisal questionnaire (parallel self + appraiser answers).
    questionnaire: v.optional(v.array(v.string())),
    // Configurable 360-feedback questions.
    feedback360Questions: v.optional(v.array(v.string())),
    // Optional per-stage due dates keyed by stage id (dashboard progress).
    dueDates: v.optional(v.record(v.string(), v.string())),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_org", ["orgId"])
    .index("by_org_status", ["orgId", "status"]),

  // Org competency library. Competencies are grouped by `category` (e.g.
  // "Functional Knowledge") and carry per-level behaviour descriptors. Referenced
  // by the appraisal's competency section.
  competencies: defineTable({
    orgId: v.id("organizations"),
    category: v.string(), // grouping header, e.g. "Functional Knowledge"
    name: v.string(), // e.g. "Own your expertise"
    description: v.optional(v.string()),
    levelDescriptors: v.optional(v.array(competencyLevelDescriptor)),
    weightPct: v.optional(v.number()), // relative weight within the competency section
    order: v.number(),
    active: v.boolean(),
  }).index("by_org", ["orgId"]),

  // Per-review snapshot of an employee's weighted objectives (the "Objectives
  // Feedback" tab). Seeded from the employee's goals when objectives are
  // confirmed, then rated 1–N by both the employee (self) and the appraiser.
  reviewObjectives: defineTable({
    orgId: v.id("organizations"),
    reviewId: v.id("reviews"),
    cycleId: v.id("reviewCycles"),
    employeeId: v.id("employees"),
    category: v.optional(v.string()), // grouping header, e.g. "Professionalism"
    title: v.string(),
    weight: v.number(), // percentage weighting within objectives
    progress: v.number(), // 0–100
    selfRating: v.optional(v.number()),
    selfComment: v.optional(v.string()),
    appraiserRating: v.optional(v.number()),
    appraiserComment: v.optional(v.string()),
    order: v.number(),
    sourceGoalId: v.optional(v.id("goals")),
  })
    .index("by_review", ["reviewId"])
    .index("by_employee_cycle", ["employeeId", "cycleId"]),

  // Per-review snapshot of competency ratings (the "Competencies feedback" tab).
  // Denormalizes the competency name/description/level at generation time so the
  // appraisal stays stable if the library later changes.
  reviewCompetencies: defineTable({
    orgId: v.id("organizations"),
    reviewId: v.id("reviews"),
    cycleId: v.id("reviewCycles"),
    employeeId: v.id("employees"),
    competencyId: v.optional(v.id("competencies")),
    category: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    level: v.optional(v.number()), // expected competency level
    weightPct: v.number(),
    selfRating: v.optional(v.number()),
    selfComment: v.optional(v.string()),
    appraiserRating: v.optional(v.number()),
    appraiserComment: v.optional(v.string()),
    order: v.number(),
  })
    .index("by_review", ["reviewId"])
    .index("by_employee_cycle", ["employeeId", "cycleId"]),

  // A 360-feedback assignment: `giverEmployeeId` is asked to give feedback about
  // `subjectEmployeeId` for a cycle. Answers are embedded once submitted.
  // Results are visible only to HR + the subject's manager (never the subject).
  feedback360Assignments: defineTable({
    orgId: v.id("organizations"),
    cycleId: v.id("reviewCycles"),
    subjectEmployeeId: v.id("employees"),
    giverEmployeeId: v.id("employees"),
    relationship: feedback360Relationship,
    status: feedback360Status,
    assignedByUserId: v.optional(v.id("users")),
    submittedAt: v.optional(v.number()),
    answers: v.optional(v.array(feedback360Answer)),
  })
    .index("by_cycle", ["cycleId"])
    .index("by_cycle_subject", ["cycleId", "subjectEmployeeId"])
    .index("by_subject", ["subjectEmployeeId"])
    .index("by_giver_status", ["giverEmployeeId", "status"]),

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

  // One development plan per employee. Self-service career-growth planning:
  // short/mid/long-term goals, competencies, development needs, and an action
  // checklist. Lists are small, user-curated arrays (like the employee resume
  // fields), so a single doc per employee is fine.
  developmentPlans: defineTable({
    orgId: v.id("organizations"),
    employeeId: v.id("employees"),
    shortTerm: v.array(v.string()), // < 2 years
    midTerm: v.array(v.string()), // 2–4 years
    longTerm: v.array(v.string()), // > 4 years
    currentCompetencies: v.array(v.string()),
    developmentNeeds: v.array(v.string()),
    actionPlan: v.array(v.object({ label: v.string(), done: v.boolean() })),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("users")),
  })
    .index("by_org", ["orgId"])
    .index("by_employee", ["employeeId"]),

  // One appraisal per (cycle, employee), holding both the self and manager
  // sections plus the final rating.
  reviews: defineTable({
    orgId: v.id("organizations"),
    cycleId: v.id("reviewCycles"),
    employeeId: v.id("employees"),
    managerId: v.optional(v.id("employees")), // snapshot at generation (= appraiser)
    status: reviewStatus,
    selfRating: v.optional(v.number()),
    selfComments: v.optional(v.string()),
    selfSubmittedAt: v.optional(v.number()),
    managerRating: v.optional(v.number()),
    managerComments: v.optional(v.string()),
    managerSubmittedAt: v.optional(v.number()),
    overallRating: v.optional(v.number()),
    // Rich appraisal fields (weighted dual-rating model).
    competencyLevel: v.optional(v.number()), // employee's level this cycle
    selfAnswers: v.optional(v.array(v.string())), // questionnaire answers (self)
    appraiserAnswers: v.optional(v.array(v.string())), // questionnaire (appraiser)
    objectivesScore: v.optional(v.number()), // weighted avg of objective ratings
    competenciesScore: v.optional(v.number()), // weighted avg of competency ratings
    ratingBand: v.optional(v.string()), // qualitative label for overallRating
    calibratedRating: v.optional(v.number()), // HR-adjusted final, if any
    releasedAt: v.optional(v.number()),
    acknowledgedAt: v.optional(v.number()),
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

  // ─── Marketing (public landing-page contact form) ────────────────────────

  // A lead captured from the public LeadMighty landing page "Contact us" form.
  // Written by the unauthenticated `leads.submitLead` mutation.
  contactLeads: defineTable({
    name: v.string(),
    email: v.string(),
    company: v.optional(v.string()),
    // Product line the enquiry is about (e.g. "LeadMightyHR"), when chosen.
    product: v.optional(v.string()),
    message: v.string(),
    source: v.optional(v.string()), // where the lead came from, e.g. "landing"
  }).index("by_email", ["email"]),

  // ─── Billing (existing) ──────────────────────────────────────────────────

  paymentAttempts: defineTable(paymentAttemptSchemaValidator)
    .index("byPaymentId", ["payment_id"])
    .index("byUserId", ["userId"])
    .index("byPayerUserId", ["payer.user_id"]),

  // ─── Saved signatures ────────────────────────────────────────────────────

  // A reusable signature a user has saved so they can re-apply it when signing
  // claims / payslips / payment requests instead of drawing it every time. A
  // user may keep several (e.g. a formal and a casual one). The `storageId`
  // points at the PNG in Convex storage; it is shared with any document the
  // signature has been applied to, so `remove` deletes only this row (never the
  // storage) to avoid breaking already-signed documents.
  savedSignatures: defineTable({
    orgId: v.id("organizations"),
    userId: v.id("users"),
    storageId: v.id("_storage"),
    label: v.string(),
  }).index("by_org_and_user", ["orgId", "userId"]),

  // ─── Email notification settings (one row per org) ───────────────────────

  // Controls whether an in-app notification also fans out to a Resend email,
  // per feature, plus the branding applied to those emails. Absent row = all
  // email off (in-app only), matching the pre-existing behavior.
  emailSettings: defineTable({
    orgId: v.id("organizations"),
    // Per-module email config: whether emails are sent for that module, plus its
    // own template customization (accent color, font, footer, from-name). Absent
    // module (or absent row) = email off for it.
    modules: v.optional(
      v.object({
        claims: emailModuleConfig,
        paymentRequests: emailModuleConfig,
        payroll: emailModuleConfig,
        leave: emailModuleConfig,
      }),
    ),
    // Shared branding: a single logo used across all module emails.
    logoStorageId: v.optional(v.id("_storage")),
    // ── Legacy flat fields (pre per-module). Kept optional so existing rows
    // validate; read as fallbacks when a module hasn't set its own value. ──
    features: v.optional(
      v.object({
        claims: v.boolean(),
        paymentRequests: v.boolean(),
        payroll: v.boolean(),
        leave: v.boolean(),
      }),
    ),
    fromName: v.optional(v.string()),
    accentColor: v.optional(v.string()),
    footerText: v.optional(v.string()),
  }).index("by_org", ["orgId"]),
});
