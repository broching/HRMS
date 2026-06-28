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
  documentType,
  customFieldType,
  addressValidator,
  contactValidator,
  emergencyContactValidator,
  leaveCategory,
  accrualMethod,
  leaveStatus,
  halfDay,
  claimCategory,
  claimStatus,
  attendanceMethod,
  attendanceStatus,
  correctionStatus,
  shiftStatus,
  cpfStatus,
  payrollStatus,
  payslipLine,
  allowanceItem,
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
    employeeNumber: v.string(),

    // Personal
    firstName: v.string(),
    lastName: v.string(),
    preferredName: v.optional(v.string()),
    photoStorageId: v.optional(v.id("_storage")),
    dob: v.optional(v.string()), // ISO date "YYYY-MM-DD"
    gender: v.optional(gender),
    nationality: v.optional(v.string()),
    idNumberMasked: v.optional(v.string()),
    idNumberLast4: v.optional(v.string()),
    address: v.optional(addressValidator),
    contact: v.optional(contactValidator),
    emergencyContacts: v.optional(v.array(emergencyContactValidator)),

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
    storageId: v.id("_storage"),
    expiryDate: v.optional(v.string()),
    uploadedBy: v.optional(v.id("users")),
  })
    .index("by_employee", ["employeeId"])
    .index("by_org_type", ["orgId", "type"])
    .index("by_org_expiry", ["orgId", "expiryDate"]),

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
  }).index("by_org", ["orgId"]),

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
    maxAmountCents: v.optional(v.number()),
    glCode: v.optional(v.string()),
    active: v.boolean(),
  }).index("by_org", ["orgId"]),

  claims: defineTable({
    orgId: v.id("organizations"),
    employeeId: v.id("employees"),
    claimTypeId: v.id("claimTypes"),
    amountCents: v.number(),
    currency: v.string(),
    incurredDate: v.string(), // ISO date
    description: v.string(),
    receiptStorageIds: v.array(v.id("_storage")),
    status: claimStatus,
    managerApproverUserId: v.optional(v.id("users")),
    financeApproverUserId: v.optional(v.id("users")),
    decidedAt: v.optional(v.number()),
    reimbursedAt: v.optional(v.number()),
    decisionNote: v.optional(v.string()),
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
    .index("by_employee", ["employeeId"])
    .index("by_employee_period", ["employeeId", "periodMonth"]),

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

  // ─── Billing (existing) ──────────────────────────────────────────────────

  paymentAttempts: defineTable(paymentAttemptSchemaValidator)
    .index("byPaymentId", ["payment_id"])
    .index("byUserId", ["userId"])
    .index("byPayerUserId", ["payer.user_id"]),
});
