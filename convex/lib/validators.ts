import { v } from "convex/values";
import {
  hrmsRole,
  employmentType,
  employeeStatus,
  gender,
  maritalStatus,
  documentType,
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
  claimApprovalFlow,
  claimAssigneeGroup,
  claimPayrollMode,
  claimExchangeMode,
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
  jobStatus,
  candidateStage,
  candidateSource,
  interviewMode,
  interviewStatus,
  reviewCycleStatus,
  goalStatus,
  reviewStatus,
  feedAudience,
  ratingBand,
  competencyLevelDescriptor,
  feedback360Relationship,
  feedback360Status,
  feedback360Answer,
} from "./enums";

/**
 * Reusable return validators for read queries. These mirror the schema docs
 * (including system fields) so query `returns:` stays declared without
 * re-spelling shapes at every call site.
 */

export const departmentDoc = v.object({
  _id: v.id("departments"),
  _creationTime: v.number(),
  orgId: v.id("organizations"),
  name: v.string(),
  code: v.optional(v.string()),
  parentId: v.optional(v.id("departments")),
  headEmployeeId: v.optional(v.id("employees")),
});

export const teamDoc = v.object({
  _id: v.id("teams"),
  _creationTime: v.number(),
  orgId: v.id("organizations"),
  departmentId: v.optional(v.id("departments")),
  name: v.string(),
  leadEmployeeId: v.optional(v.id("employees")),
});

export const positionDoc = v.object({
  _id: v.id("positions"),
  _creationTime: v.number(),
  orgId: v.id("organizations"),
  title: v.string(),
  level: v.optional(v.string()),
  departmentId: v.optional(v.id("departments")),
});

export const officeDoc = v.object({
  _id: v.id("offices"),
  _creationTime: v.number(),
  orgId: v.id("organizations"),
  name: v.string(),
  address: v.optional(v.string()),
  timezone: v.string(),
  defaultCurrency: v.optional(v.string()),
  isDefault: v.optional(v.boolean()),
  geo: v.optional(v.object({ lat: v.number(), lng: v.number() })),
  radiusMeters: v.optional(v.number()),
  qrEnabled: v.boolean(),
});

// Full employee document (mirrors the schema, incl. system fields).
const employeeFields = {
  _id: v.id("employees"),
  _creationTime: v.number(),
  orgId: v.id("organizations"),
  userId: v.optional(v.id("users")),
  loginEmail: v.optional(v.string()),
  loginUsername: v.optional(v.string()),
  invitedRole: v.optional(hrmsRole),
  employeeNumber: v.string(),
  isVacant: v.optional(v.boolean()),
  firstName: v.string(),
  lastName: v.string(),
  preferredName: v.optional(v.string()),
  photoStorageId: v.optional(v.id("_storage")),
  dob: v.optional(v.string()),
  gender: v.optional(gender),
  maritalStatus: v.optional(maritalStatus),
  nationality: v.optional(v.string()),
  idNumberMasked: v.optional(v.string()),
  idNumberLast4: v.optional(v.string()),
  address: v.optional(addressValidator),
  contact: v.optional(contactValidator),
  emergencyContacts: v.optional(v.array(emergencyContactValidator)),
  bio: v.optional(v.string()),
  galleryStorageIds: v.optional(v.array(v.id("_storage"))),
  personalFields: v.optional(v.array(personalFieldValidator)),
  experience: v.optional(v.array(resumeEntryValidator)),
  education: v.optional(v.array(resumeEntryValidator)),
  familyMembers: v.optional(v.array(familyMemberValidator)),
  trainings: v.optional(v.array(resumeEntryValidator)),
  departmentId: v.optional(v.id("departments")),
  teamId: v.optional(v.id("teams")),
  positionId: v.optional(v.id("positions")),
  managerId: v.optional(v.id("employees")),
  employmentType: employmentType,
  officeId: v.optional(v.id("offices")),
  joinDate: v.string(),
  confirmationDate: v.optional(v.string()),
  probationEndDate: v.optional(v.string()),
  status: employeeStatus,
  exitDate: v.optional(v.string()),
  customFields: v.optional(v.record(v.string(), v.any())),
  searchName: v.string(),
  createdBy: v.optional(v.id("users")),
  updatedAt: v.optional(v.number()),
};

export const employeeDoc = v.object(employeeFields);

// Employee profile with resolved labels + photo URL (return of employees.get).
// Locked personal fields (dob, gender, maritalStatus, nationality, idNumber*,
// address, personalFields, contact.personalEmail/phone) are omitted when the
// caller may not view them — hence the capability flags drive the UI.
export const employeeProfile = v.object({
  ...employeeFields,
  photoUrl: v.union(v.string(), v.null()),
  galleryUrls: v.array(
    v.object({ storageId: v.id("_storage"), url: v.string() }),
  ),
  departmentName: v.union(v.string(), v.null()),
  teamName: v.union(v.string(), v.null()),
  positionTitle: v.union(v.string(), v.null()),
  managerName: v.union(v.string(), v.null()),
  officeName: v.union(v.string(), v.null()),
  // Server-resolved capabilities for the calling user.
  isSelf: v.boolean(),
  canEdit: v.boolean(),
  canManage: v.boolean(),
  canViewPersonal: v.boolean(),
  canViewCompensation: v.boolean(),
});

// One document "group" — a logical document with up to 3 files (e.g. IC
// front/back) + a note (return of employeeDocuments.list).
export const documentGroupRow = v.object({
  _id: v.id("employeeDocuments"),
  _creationTime: v.number(),
  type: documentType,
  name: v.string(),
  note: v.union(v.string(), v.null()),
  expiryDate: v.union(v.string(), v.null()),
  files: v.array(
    v.object({
      storageId: v.id("_storage"),
      url: v.union(v.string(), v.null()),
      name: v.string(),
      isImage: v.boolean(),
    }),
  ),
});

// One asset lent to an employee (return of equipment.listForEmployee).
export const equipmentRow = v.object({
  _id: v.id("equipment"),
  _creationTime: v.number(),
  employeeId: v.id("employees"),
  name: v.string(),
  category: v.union(v.string(), v.null()),
  serialNumber: v.union(v.string(), v.null()),
  assignedDate: v.union(v.string(), v.null()),
  returnedDate: v.union(v.string(), v.null()),
  status: equipmentStatus,
  note: v.union(v.string(), v.null()),
});

// One in-company job timeline row with hydrated labels (return of
// jobHistory.listForEmployee). `isCurrent` marks the active position.
export const jobHistoryRow = v.object({
  _id: v.id("jobHistory"),
  _creationTime: v.number(),
  employeeId: v.id("employees"),
  effectiveDate: v.string(),
  title: v.union(v.string(), v.null()),
  // Raw ids so the edit dialog can prefill its pickers.
  positionId: v.union(v.id("positions"), v.null()),
  rawTitle: v.union(v.string(), v.null()),
  departmentId: v.union(v.id("departments"), v.null()),
  officeId: v.union(v.id("offices"), v.null()),
  managerId: v.union(v.id("employees"), v.null()),
  departmentName: v.union(v.string(), v.null()),
  officeName: v.union(v.string(), v.null()),
  managerName: v.union(v.string(), v.null()),
  managerInitials: v.union(v.string(), v.null()),
  managerPhotoUrl: v.union(v.string(), v.null()),
  employmentType: v.union(employmentType, v.null()),
  isCurrent: v.boolean(),
  note: v.union(v.string(), v.null()),
});

// Compact directory row (return of employees.list).
export const employeeRow = v.object({
  _id: v.id("employees"),
  employeeNumber: v.string(),
  firstName: v.string(),
  lastName: v.string(),
  preferredName: v.optional(v.string()),
  status: employeeStatus,
  employmentType: employmentType,
  joinDate: v.string(),
  workEmail: v.optional(v.string()),
  departmentName: v.optional(v.string()),
  positionTitle: v.optional(v.string()),
  officeName: v.optional(v.string()),
  photoUrl: v.union(v.string(), v.null()),
  isVacant: v.optional(v.boolean()),
});

// A node in the reporting-structure org chart (return of employees.orgChart).
export const orgChartNode = v.object({
  _id: v.id("employees"),
  name: v.string(),
  employeeNumber: v.string(),
  managerId: v.union(v.id("employees"), v.null()),
  positionTitle: v.union(v.string(), v.null()),
  departmentId: v.union(v.id("departments"), v.null()),
  departmentName: v.union(v.string(), v.null()),
  officeName: v.union(v.string(), v.null()),
  workEmail: v.union(v.string(), v.null()),
  photoUrl: v.union(v.string(), v.null()),
  isVacant: v.boolean(),
});

const leaveTypeDocFields = {
  _id: v.id("leaveTypes"),
  _creationTime: v.number(),
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
  isCredit: v.optional(v.boolean()),
  autoAssign: v.optional(v.boolean()),
};

export const leaveTypeDoc = v.object(leaveTypeDocFields);

// One policy configuration for a leave type (mirrors the schema doc).
export const leavePolicyDoc = v.object({
  _id: v.id("leavePolicies"),
  _creationTime: v.number(),
  orgId: v.id("organizations"),
  leaveTypeId: v.id("leaveTypes"),
  name: v.string(),
  description: v.optional(v.string()),
  availability: policyAvailability,
  isDefault: v.boolean(),
  order: v.optional(v.number()),
  firstApproverMode: approverMode,
  firstApproverValue: v.optional(v.string()),
  secondApproverMode: approverMode,
  secondApproverValue: v.optional(v.string()),
  entitlementMode: entitlementMode,
  entitlementDays: v.number(),
  toleranceDays: v.optional(v.number()),
  earnedEnabled: v.boolean(),
  accrualType: v.optional(accrualType),
  proratedEnabled: v.boolean(),
  prorateMode: v.optional(prorateMode),
  carryForwardEnabled: v.boolean(),
  maxCarryForwardDays: v.optional(v.number()),
  seniorityEnabled: v.boolean(),
  seniorityEffective: v.optional(seniorityEffective),
  seniorityIncrementMode: v.optional(incrementMode),
  seniorityRules: v.optional(v.array(seniorityRule)),
  seniorityMaxDays: v.optional(v.number()),
  rounding: roundingMode,
  linkedLeaveTypeId: v.optional(v.id("leaveTypes")),
  useWorkingDays: v.boolean(),
  allowApplyInPast: v.boolean(),
  minAdvanceDays: v.optional(v.number()),
  maxAdvanceDays: v.optional(v.number()),
  maxConsecutiveDays: v.optional(v.number()),
});

// A leave type with its policy count + assignment summary (policies list).
export const leaveTypeWithPolicies = v.object({
  ...leaveTypeDocFields,
  policyCount: v.number(),
});

// Who a non-default policy is assigned to (assign-policy dialog state).
export const leavePolicyAssignmentRow = v.object({
  _id: v.id("leavePolicyAssignments"),
  employeeId: v.id("employees"),
  employeeName: v.string(),
  policyId: v.id("leavePolicies"),
});

export const holidayDoc = v.object({
  _id: v.id("holidays"),
  _creationTime: v.number(),
  orgId: v.id("organizations"),
  date: v.string(),
  name: v.string(),
  country: v.string(),
  recurring: v.optional(v.boolean()),
});

// Leave request row with hydrated labels (return of leaveRequests list/queue).
const leaveRequestRowFields = {
  _id: v.id("leaveRequests"),
  _creationTime: v.number(),
  employeeId: v.id("employees"),
  employeeName: v.string(),
  leaveTypeId: v.id("leaveTypes"),
  leaveTypeName: v.string(),
  leaveTypeColor: v.string(),
  startDate: v.string(),
  endDate: v.string(),
  startHalf: v.optional(halfDay),
  endHalf: v.optional(halfDay),
  totalDays: v.number(),
  reason: v.optional(v.string()),
  status: leaveStatus,
  attachmentUrl: v.union(v.string(), v.null()),
  decisionNote: v.optional(v.string()),
};

export const leaveRequestRow = v.object(leaveRequestRowFields);

// Dashboard calendar row — adds the department/office labels used for chips
// and filtering in the HR Lounge leave calendar.
export const leaveDashboardRow = v.object({
  ...leaveRequestRowFields,
  employeePhotoUrl: v.union(v.string(), v.null()),
  departmentId: v.union(v.id("departments"), v.null()),
  departmentName: v.union(v.string(), v.null()),
  officeId: v.union(v.id("offices"), v.null()),
  officeName: v.union(v.string(), v.null()),
});

// Full request detail for the slide-over: hydrated labels + timeline +
// resolved approver names + the caller's allowed actions.
export const leaveRequestDetail = v.object({
  ...leaveRequestRowFields,
  employeeNumber: v.string(),
  employeePhotoUrl: v.union(v.string(), v.null()),
  departmentName: v.union(v.string(), v.null()),
  positionTitle: v.union(v.string(), v.null()),
  approvalStep: v.union(v.number(), v.null()),
  firstApproverName: v.union(v.string(), v.null()),
  secondApproverName: v.union(v.string(), v.null()),
  currentApproverName: v.union(v.string(), v.null()),
  timeline: v.array(
    v.object({
      at: v.number(),
      actorName: v.union(v.string(), v.null()),
      type: v.string(),
      note: v.union(v.string(), v.null()),
    }),
  ),
  // Resolved server-side for the caller.
  canApprove: v.boolean(),
  canManage: v.boolean(),
});

// An employee in the dashboard's right-rail Employees list.
export const leaveDashboardEmployeeRow = v.object({
  _id: v.id("employees"),
  name: v.string(),
  positionTitle: v.union(v.string(), v.null()),
  departmentName: v.union(v.string(), v.null()),
  photoUrl: v.union(v.string(), v.null()),
  status: employeeStatus,
});

export const claimTypeDoc = v.object({
  _id: v.id("claimTypes"),
  _creationTime: v.number(),
  orgId: v.id("organizations"),
  name: v.string(),
  category: claimCategory,
  requiresReceipt: v.boolean(),
  guidelines: v.optional(v.string()),
  maxAmountCents: v.optional(v.number()),
  yearlyLimitCents: v.optional(v.number()),
  monthlyLimitCents: v.optional(v.number()),
  glCode: v.optional(v.string()),
  active: v.boolean(),
});

// Live per-employee spend vs. a claim type's configured limits, for the
// "Balance available to claim" card in the submit form. Limits are null when
// unconfigured ("No limit").
export const claimTypeBalance = v.object({
  claimTypeId: v.id("claimTypes"),
  currency: v.string(),
  guidelines: v.union(v.string(), v.null()),
  yearlyLimitCents: v.union(v.number(), v.null()),
  monthlyLimitCents: v.union(v.number(), v.null()),
  perTransactionLimitCents: v.union(v.number(), v.null()),
  yearlyUsedCents: v.number(),
  monthlyUsedCents: v.number(),
  availableCents: v.union(v.number(), v.null()),
});

const claimRowFields = {
  _id: v.id("claims"),
  _creationTime: v.number(),
  employeeId: v.id("employees"),
  groupId: v.optional(v.id("claimGroups")),
  employeeName: v.string(),
  claimTypeName: v.string(),
  category: claimCategory,
  amountCents: v.number(),
  currency: v.string(),
  incurredDate: v.string(),
  description: v.string(),
  remarks: v.optional(v.string()),
  status: claimStatus,
  receiptCount: v.number(),
  decisionNote: v.optional(v.string()),
};

export const claimRow = v.object(claimRowFields);

// A claim receipt resolved to a servable URL plus its stored content type, so
// the UI can render images/PDFs inline (and open any file in a new tab). The
// storageId lets the edit form preserve existing attachments.
export const claimReceipt = v.object({
  storageId: v.id("_storage"),
  url: v.string(),
  contentType: v.union(v.string(), v.null()),
});

export const claimDetail = v.object({
  ...claimRowFields,
  taxAmountCents: v.union(v.number(), v.null()),
  localAmountCents: v.union(v.number(), v.null()),
  localCurrency: v.union(v.string(), v.null()),
  // Foreign-currency exchange snapshot (null on same-currency claims).
  exchangeRate: v.union(v.number(), v.null()),
  exchangeMode: v.union(claimExchangeMode, v.null()),
  exchangeRateDate: v.union(v.string(), v.null()),
  exchangeProvider: v.union(v.string(), v.null()),
  receiptNo: v.union(v.string(), v.null()),
  receipts: v.array(claimReceipt),
  managerApproverUserId: v.union(v.id("users"), v.null()),
  financeApproverUserId: v.union(v.id("users"), v.null()),
  // Whether the viewer may edit this claim (an approver acting on a pending
  // claim). Drives the edit affordance in the detail view.
  canEdit: v.boolean(),
  // Edit audit trail (who changed what, when) resolved to display names.
  edits: v.array(
    v.object({
      editedByName: v.string(),
      editedAt: v.number(),
      summary: v.string(),
    }),
  ),
  // Whether the viewer is the employee who filed this claim (owner) — used to
  // offer the "mark reimbursed" action once approved.
  isMine: v.boolean(),
  // Whether the viewer can approve/reject the claim's current pending stage
  // (current chain approver, or finance at the finance stage). Drives the
  // decision buttons so they show for the right person regardless of role.
  canApprove: v.boolean(),
  // The ordered status stages this claim actually moves through, derived from
  // the configured approval process (skips finance when no finance approvers
  // are set). Drives the detail-view status timeline.
  flow: v.array(claimStatus),
  // Resolved approval chain progress for the detail view.
  approvalChain: v.array(
    v.object({
      label: v.string(),
      done: v.boolean(),
      current: v.boolean(),
    }),
  ),
  // Pending but parked behind its batch: the group barrier is holding this claim
  // at its current step until the rest of the batch reaches the same stage.
  waitingForBatch: v.boolean(),
  sentToPayroll: v.boolean(),
});

// One employee's bucket in the approver's queue: how many of their claims await
// the caller, and the base-currency total across them.
export const claimApprovalGroup = v.object({
  employeeId: v.id("employees"),
  employeeName: v.string(),
  pendingCount: v.number(),
  totalAmountCents: v.number(),
  currency: v.string(),
});

// One claim in the per-employee approval drill-down, with receipts resolved for
// quick inline/new-tab viewing.
export const claimApprovalItem = v.object({
  ...claimRowFields,
  receipts: v.array(claimReceipt),
});

// One monthly claim group (batch) in the approver's queue. `pendingCount` is how
// many of its claims await the caller right now; a group is "complete" (shown
// under the completed section) when nothing in it awaits the caller. Totals/
// counts reflect only the claims the caller is allowed to see.
export const claimApprovalGroupRow = v.object({
  groupId: v.id("claimGroups"),
  employeeId: v.id("employees"),
  employeeName: v.string(),
  periodMonth: v.string(),
  sequence: v.number(),
  title: v.union(v.string(), v.null()),
  submittedAt: v.union(v.number(), v.null()),
  pendingCount: v.number(), // awaiting the caller
  visibleCount: v.number(), // total claims the caller can see in the group
  approvedCount: v.number(),
  rejectedCount: v.number(),
  totalAmountCents: v.number(), // sum of visible claims
  currency: v.string(),
  complete: v.boolean(), // pendingCount === 0
});

// One claim inside a group drill-down. `canAct` = the caller may approve/reject
// it now (it's awaiting their step); otherwise it's shown read-only (already
// approved, or rejected and visible to the caller under the top-down rule).
export const claimGroupApprovalItem = v.object({
  ...claimRowFields,
  receipts: v.array(claimReceipt),
  canAct: v.boolean(),
  // The approver this claim currently sits with (chain step label, or "Finance"),
  // null once terminal — drives the "chain flow" hint in the group drill-down.
  currentApprover: v.union(v.string(), v.null()),
  // Pending but parked ahead of the batch: the group barrier is holding it until
  // the slower claims reach the same approver level.
  waitingForBatch: v.boolean(),
});

// Org claim settings (return of claimSettings.get) — resolved with defaults so
// the form always has a complete shape to bind to.
export const claimSettingsValue = v.object({
  cutoffDay: v.number(),
  transactionValidityMonths: v.union(v.number(), v.null()),
  hrApproverUserIds: v.array(v.id("users")),
  financeApproverUserIds: v.array(v.id("users")),
  assigneeGroups: v.array(claimAssigneeGroup),
  approvalWorkflow: v.array(claimApproverStep),
  approvalFlows: v.array(claimApprovalFlow),
  maxGroupsPerPeriod: v.union(v.number(), v.null()),
  payrollMode: claimPayrollMode,
  payrollItem: v.union(v.string(), v.null()),
})

// Pickers for the claim settings form (members for assignees/approvers,
// offices for threshold rules). Each member carries enough role/permission
// context for the HR/Finance assignee guardrail: whether they can already act
// on claims as finance/HR, and whether their role is a custom one (which must
// be edited in Org Structure rather than swapped for a preset).
export const claimSettingsOptions = v.object({
  members: v.array(
    v.object({
      userId: v.id("users"),
      memberId: v.id("members"),
      name: v.string(),
      role: hrmsRole,
      roleName: v.string(),
      isCustomRole: v.boolean(),
      hasFinanceAccess: v.boolean(),
    }),
  ),
  offices: v.array(
    v.object({ _id: v.id("offices"), name: v.string() }),
  ),
  // Roles (data-driven) for the per-flow "role" matcher picker.
  roles: v.array(
    v.object({ _id: v.id("roles"), name: v.string() }),
  ),
})

export const claimCommentRow = v.object({
  _id: v.id("claimComments"),
  _creationTime: v.number(),
  authorName: v.string(),
  body: v.string(),
});

// ─── Attendance ──────────────────────────────────────────────────────────

// One attendance record with hydrated employee + office labels.
export const attendanceRow = v.object({
  _id: v.id("attendanceRecords"),
  _creationTime: v.number(),
  employeeId: v.id("employees"),
  employeeName: v.string(),
  officeName: v.union(v.string(), v.null()),
  date: v.string(),
  clockInAt: v.number(),
  clockOutAt: v.union(v.number(), v.null()),
  workedMinutes: v.union(v.number(), v.null()),
  method: attendanceMethod,
  status: attendanceStatus,
  note: v.union(v.string(), v.null()),
});

// The caller's live clock state for today.
export const attendanceStatusResult = v.object({
  open: v.union(attendanceRow, v.null()),
  today: v.array(attendanceRow),
  hasProfile: v.boolean(),
});

// Someone currently clocked in (team/admin live view).
export const presenceRow = v.object({
  recordId: v.id("attendanceRecords"),
  employeeId: v.id("employees"),
  employeeName: v.string(),
  officeName: v.union(v.string(), v.null()),
  clockInAt: v.number(),
});

export const correctionRow = v.object({
  _id: v.id("attendanceCorrections"),
  _creationTime: v.number(),
  employeeId: v.id("employees"),
  employeeName: v.string(),
  recordId: v.union(v.id("attendanceRecords"), v.null()),
  date: v.string(),
  requestedClockInAt: v.union(v.number(), v.null()),
  requestedClockOutAt: v.union(v.number(), v.null()),
  reason: v.string(),
  status: correctionStatus,
  decisionNote: v.union(v.string(), v.null()),
});

// ─── Scheduling ──────────────────────────────────────────────────────────

export const shiftTemplateDoc = v.object({
  _id: v.id("shiftTemplates"),
  _creationTime: v.number(),
  orgId: v.id("organizations"),
  name: v.string(),
  startTime: v.string(),
  endTime: v.string(),
  breakMinutes: v.number(),
  color: v.string(),
  officeId: v.optional(v.id("offices")),
  active: v.boolean(),
})

// A scheduled shift with hydrated employee/office/template labels + duration.
export const shiftAssignmentRow = v.object({
  _id: v.id("shiftAssignments"),
  _creationTime: v.number(),
  employeeId: v.id("employees"),
  employeeName: v.string(),
  date: v.string(),
  startTime: v.string(),
  endTime: v.string(),
  breakMinutes: v.number(),
  durationMinutes: v.number(),
  color: v.string(),
  shiftTemplateId: v.union(v.id("shiftTemplates"), v.null()),
  templateName: v.union(v.string(), v.null()),
  officeId: v.union(v.id("offices"), v.null()),
  officeName: v.union(v.string(), v.null()),
  status: shiftStatus,
  note: v.union(v.string(), v.null()),
})

// Employee the caller may schedule (roster row header).
export const schedulableEmployee = v.object({
  _id: v.id("employees"),
  name: v.string(),
  positionTitle: v.union(v.string(), v.null()),
})

// ─── Payroll ─────────────────────────────────────────────────────────────

export const compensationDoc = v.object({
  _id: v.id("compensation"),
  _creationTime: v.number(),
  orgId: v.id("organizations"),
  employeeId: v.id("employees"),
  effectiveDate: v.string(),
  currency: v.string(),
  baseMonthlyCents: v.number(),
  allowances: v.array(allowanceItem),
  cpfStatus: cpfStatus,
  note: v.optional(v.string()),
  createdBy: v.optional(v.id("users")),
})

// An employee with their current base pay (compensation management list).
export const compensationRow = v.object({
  employeeId: v.id("employees"),
  name: v.string(),
  positionTitle: v.union(v.string(), v.null()),
  departmentId: v.union(v.id("departments"), v.null()),
  departmentName: v.union(v.string(), v.null()),
  teamId: v.union(v.id("teams"), v.null()),
  teamName: v.union(v.string(), v.null()),
  currency: v.union(v.string(), v.null()),
  baseMonthlyCents: v.union(v.number(), v.null()),
  cpfStatus: v.union(cpfStatus, v.null()),
  effectiveDate: v.union(v.string(), v.null()),
})

export const payrollRunRow = v.object({
  _id: v.id("payrollRuns"),
  _creationTime: v.number(),
  periodMonth: v.string(),
  label: v.string(),
  currency: v.string(),
  status: payrollStatus,
  payDate: v.union(v.string(), v.null()),
  grossCents: v.number(),
  employeeCpfCents: v.number(),
  employerCpfCents: v.number(),
  netCents: v.number(),
  payslipCount: v.number(),
})

export const payslipRow = v.object({
  _id: v.id("payslips"),
  _creationTime: v.number(),
  employeeId: v.id("employees"),
  employeeName: v.string(),
  periodMonth: v.string(),
  currency: v.string(),
  grossCents: v.number(),
  employeeCpfCents: v.number(),
  employerCpfCents: v.number(),
  netCents: v.number(),
  status: payrollStatus,
})

// One editable adjustment line on a draft run (return of run workspace).
export const payrollAdjustmentRow = v.object({
  _id: v.id("payrollAdjustments"),
  _creationTime: v.number(),
  employeeId: v.id("employees"),
  kind: payrollAdjustmentKind,
  source: payrollAdjustmentSource,
  label: v.string(),
  amountCents: v.number(),
  cpfable: v.boolean(),
  affectsGross: v.boolean(),
  note: v.union(v.string(), v.null()),
  overtime: v.union(overtimeMeta, v.null()),
})

// A payslip enriched for the Adjust-Payroll step: base/CPF breakdown plus the
// raw adjustments behind it, so each employee row can be expanded and edited.
export const payslipWorkspaceRow = v.object({
  _id: v.id("payslips"),
  employeeId: v.id("employees"),
  employeeName: v.string(),
  employeePhotoUrl: v.union(v.string(), v.null()),
  positionTitle: v.union(v.string(), v.null()),
  departmentName: v.union(v.string(), v.null()),
  currency: v.string(),
  baseCents: v.number(),
  allowances: v.array(allowanceItem),
  grossCents: v.number(),
  cpfableWageCents: v.number(),
  employeeCpfCents: v.number(),
  employerCpfCents: v.number(),
  netCents: v.number(),
  cpfStatus: cpfStatus,
  adjustments: v.array(payrollAdjustmentRow),
})

// The Adjust-Payroll / Review workspace for a run.
export const payrollWorkspace = v.object({
  run: payrollRunRow,
  payslips: v.array(payslipWorkspaceRow),
  // Counts for the "validate items" banner.
  available: v.object({
    claims: v.number(),
    unpaidLeaveDays: v.number(),
    overtime: v.number(),
  }),
})

export const payslipDetail = v.object({
  _id: v.id("payslips"),
  _creationTime: v.number(),
  employeeId: v.id("employees"),
  employeeName: v.string(),
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
  // Document-header context for the printable payslip.
  companyName: v.string(),
  employeeNumber: v.string(),
  departmentName: v.union(v.string(), v.null()),
  positionTitle: v.union(v.string(), v.null()),
  payPeriodStart: v.string(),
  payPeriodEnd: v.string(),
  payDate: v.union(v.string(), v.null()),
})

// ─── Recruitment ───────────────────────────────────────────────────────────

// A job row for the recruitment dashboard table (hydrated labels + raw ids for
// the edit dialog + live applicant count).
export const jobRow = v.object({
  _id: v.id("jobs"),
  _creationTime: v.number(),
  title: v.string(),
  status: jobStatus,
  level: v.union(v.string(), v.null()),
  country: v.union(v.string(), v.null()),
  departmentId: v.union(v.id("departments"), v.null()),
  departmentName: v.union(v.string(), v.null()),
  employmentType: v.union(employmentType, v.null()),
  description: v.union(v.string(), v.null()),
  hiringManagerEmployeeId: v.union(v.id("employees"), v.null()),
  hiringManagerName: v.union(v.string(), v.null()),
  hiringManagerPhotoUrl: v.union(v.string(), v.null()),
  recruiterUserId: v.union(v.id("users"), v.null()),
  recruiterName: v.union(v.string(), v.null()),
  postedToBoard: v.boolean(),
  applicantCount: v.number(),
})

// A candidate row with hydrated job title + resume URL.
export const candidateRow = v.object({
  _id: v.id("candidates"),
  _creationTime: v.number(),
  jobId: v.id("jobs"),
  jobTitle: v.string(),
  name: v.string(),
  email: v.string(),
  phone: v.union(v.string(), v.null()),
  stage: candidateStage,
  source: candidateSource,
  resumeUrl: v.union(v.string(), v.null()),
  coverLetter: v.union(v.string(), v.null()),
  rating: v.union(v.number(), v.null()),
  note: v.union(v.string(), v.null()),
})

// Recruitment dashboard summary (pipeline counts + board card).
export const recruitmentSummary = v.object({
  counts: v.object({
    screening: v.number(),
    interview: v.number(),
    offer: v.number(),
    kiv: v.number(),
  }),
  jobCount: v.number(),
  board: v.object({
    slug: v.union(v.string(), v.null()),
    published: v.boolean(),
    companyName: v.string(),
    logoUrl: v.union(v.string(), v.null()),
  }),
})

// Job board settings (return of recruitment.getBoardSettings).
export const jobBoardSettingsValue = v.object({
  slug: v.string(),
  companyName: v.string(),
  headline: v.union(v.string(), v.null()),
  description: v.union(v.string(), v.null()),
  logoUrl: v.union(v.string(), v.null()),
  bannerUrl: v.union(v.string(), v.null()),
  published: v.boolean(),
})

// An interview with hydrated candidate / job / interviewer labels.
export const interviewRow = v.object({
  _id: v.id("interviews"),
  _creationTime: v.number(),
  candidateId: v.id("candidates"),
  jobId: v.id("jobs"),
  candidateName: v.string(),
  jobTitle: v.string(),
  scheduledAt: v.number(),
  durationMins: v.number(),
  mode: interviewMode,
  locationOrLink: v.union(v.string(), v.null()),
  interviewerName: v.union(v.string(), v.null()),
  notes: v.union(v.string(), v.null()),
  status: interviewStatus,
})

// ─── Public job board (no auth) ──────────────────────────────────────────────

const publicJobListing = v.object({
  _id: v.id("jobs"),
  title: v.string(),
  level: v.union(v.string(), v.null()),
  country: v.union(v.string(), v.null()),
  departmentName: v.union(v.string(), v.null()),
})

export const publicBoard = v.object({
  companyName: v.string(),
  headline: v.union(v.string(), v.null()),
  description: v.union(v.string(), v.null()),
  logoUrl: v.union(v.string(), v.null()),
  bannerUrl: v.union(v.string(), v.null()),
  jobs: v.array(publicJobListing),
})

export const publicJob = v.object({
  _id: v.id("jobs"),
  title: v.string(),
  level: v.union(v.string(), v.null()),
  country: v.union(v.string(), v.null()),
  departmentName: v.union(v.string(), v.null()),
  employmentType: v.union(employmentType, v.null()),
  description: v.union(v.string(), v.null()),
  companyName: v.string(),
})

// ─── Performance ─────────────────────────────────────────────────────────

export const reviewCycleDoc = v.object({
  _id: v.id("reviewCycles"),
  _creationTime: v.number(),
  orgId: v.id("organizations"),
  name: v.string(),
  startDate: v.string(),
  endDate: v.string(),
  status: reviewCycleStatus,
  ratingScaleMax: v.number(),
  objectivesWeightPct: v.optional(v.number()),
  competenciesWeightPct: v.optional(v.number()),
  ratingBands: v.optional(v.array(ratingBand)),
  questionnaire: v.optional(v.array(v.string())),
  feedback360Questions: v.optional(v.array(v.string())),
  dueDates: v.optional(v.record(v.string(), v.string())),
  createdBy: v.optional(v.id("users")),
})

export const competencyDoc = v.object({
  _id: v.id("competencies"),
  _creationTime: v.number(),
  orgId: v.id("organizations"),
  category: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  levelDescriptors: v.optional(v.array(competencyLevelDescriptor)),
  weightPct: v.optional(v.number()),
  order: v.number(),
  active: v.boolean(),
})

// A review objective line with the two-sided ratings (self + appraiser).
export const reviewObjectiveRow = v.object({
  _id: v.id("reviewObjectives"),
  _creationTime: v.number(),
  reviewId: v.id("reviews"),
  cycleId: v.id("reviewCycles"),
  employeeId: v.id("employees"),
  category: v.union(v.string(), v.null()),
  title: v.string(),
  weight: v.number(),
  progress: v.number(),
  selfRating: v.union(v.number(), v.null()),
  selfComment: v.union(v.string(), v.null()),
  appraiserRating: v.union(v.number(), v.null()),
  appraiserComment: v.union(v.string(), v.null()),
  order: v.number(),
})

export const reviewCompetencyRow = v.object({
  _id: v.id("reviewCompetencies"),
  _creationTime: v.number(),
  reviewId: v.id("reviews"),
  cycleId: v.id("reviewCycles"),
  employeeId: v.id("employees"),
  competencyId: v.union(v.id("competencies"), v.null()),
  category: v.string(),
  name: v.string(),
  description: v.union(v.string(), v.null()),
  level: v.union(v.number(), v.null()),
  weightPct: v.number(),
  selfRating: v.union(v.number(), v.null()),
  selfComment: v.union(v.string(), v.null()),
  appraiserRating: v.union(v.number(), v.null()),
  appraiserComment: v.union(v.string(), v.null()),
  order: v.number(),
})

// A 360-feedback assignment. `giverName`/`answers` are only populated for callers
// allowed to see results (HR + subject's manager); the giver's own queue sees a
// redacted row without the subject-only fields.
export const feedback360AssignmentRow = v.object({
  _id: v.id("feedback360Assignments"),
  _creationTime: v.number(),
  cycleId: v.id("reviewCycles"),
  cycleName: v.string(),
  subjectEmployeeId: v.id("employees"),
  subjectName: v.string(),
  giverEmployeeId: v.id("employees"),
  giverName: v.union(v.string(), v.null()),
  relationship: feedback360Relationship,
  status: feedback360Status,
  submittedAt: v.union(v.number(), v.null()),
  answers: v.union(v.array(feedback360Answer), v.null()),
})

export const goalRow = v.object({
  _id: v.id("goals"),
  _creationTime: v.number(),
  employeeId: v.id("employees"),
  employeeName: v.string(),
  cycleId: v.union(v.id("reviewCycles"), v.null()),
  cycleName: v.union(v.string(), v.null()),
  title: v.string(),
  description: v.union(v.string(), v.null()),
  weight: v.number(),
  progress: v.number(),
  status: goalStatus,
  dueDate: v.union(v.string(), v.null()),
})

// A review row with hydrated names (queues, lists).
export const reviewRow = v.object({
  _id: v.id("reviews"),
  _creationTime: v.number(),
  cycleId: v.id("reviewCycles"),
  cycleName: v.string(),
  employeeId: v.id("employees"),
  employeeName: v.string(),
  managerId: v.union(v.id("employees"), v.null()),
  managerName: v.union(v.string(), v.null()),
  status: reviewStatus,
  selfRating: v.union(v.number(), v.null()),
  managerRating: v.union(v.number(), v.null()),
  overallRating: v.union(v.number(), v.null()),
  ratingScaleMax: v.number(),
})

// Full review detail incl. comments.
export const reviewDetail = v.object({
  _id: v.id("reviews"),
  _creationTime: v.number(),
  cycleId: v.id("reviewCycles"),
  cycleName: v.string(),
  employeeId: v.id("employees"),
  employeeName: v.string(),
  managerId: v.union(v.id("employees"), v.null()),
  managerName: v.union(v.string(), v.null()),
  status: reviewStatus,
  selfRating: v.union(v.number(), v.null()),
  selfComments: v.union(v.string(), v.null()),
  managerRating: v.union(v.number(), v.null()),
  managerComments: v.union(v.string(), v.null()),
  overallRating: v.union(v.number(), v.null()),
  ratingScaleMax: v.number(),
  // What the caller is allowed to do, resolved server-side.
  canSelf: v.boolean(),
  canManager: v.boolean(),
})

export const feedbackRow = v.object({
  _id: v.id("feedback"),
  _creationTime: v.number(),
  subjectEmployeeId: v.id("employees"),
  authorName: v.string(),
  body: v.string(),
})

// Aggregated appraisal detail for the HR Lounge appraisal page (header + form
// scaffolding). Objective/competency lines are fetched via their own queries.
export const appraisalDetail = v.object({
  _id: v.id("reviews"),
  cycleId: v.id("reviewCycles"),
  cycleName: v.string(),
  cycleStartDate: v.string(),
  cycleEndDate: v.string(),
  ratingScaleMax: v.number(),
  employeeId: v.id("employees"),
  employeeName: v.string(),
  employeeTitle: v.union(v.string(), v.null()),
  departmentName: v.union(v.string(), v.null()),
  appraiserId: v.union(v.id("employees"), v.null()),
  appraiserName: v.union(v.string(), v.null()),
  status: reviewStatus,
  competencyLevel: v.union(v.number(), v.null()),
  objectivesWeightPct: v.number(),
  competenciesWeightPct: v.number(),
  objectivesScore: v.union(v.number(), v.null()),
  competenciesScore: v.union(v.number(), v.null()),
  overallRating: v.union(v.number(), v.null()),
  ratingBand: v.union(v.string(), v.null()),
  selfSubmittedAt: v.union(v.number(), v.null()),
  managerSubmittedAt: v.union(v.number(), v.null()),
  acknowledgedAt: v.union(v.number(), v.null()),
  // Questionnaire: cycle questions paired with self + appraiser answers.
  questionnaire: v.array(
    v.object({
      question: v.string(),
      selfAnswer: v.union(v.string(), v.null()),
      appraiserAnswer: v.union(v.string(), v.null()),
    }),
  ),
  // Caller capabilities, resolved server-side.
  canSelf: v.boolean(),
  canAppraiser: v.boolean(),
  canAcknowledge: v.boolean(),
  canViewFeedback: v.boolean(),
})

// A 360-feedback assignment as seen by the giver (their own queue). Shows who
// they're reviewing + the questions + their in-progress answers.
export const feedback360QueueRow = v.object({
  _id: v.id("feedback360Assignments"),
  _creationTime: v.number(),
  cycleId: v.id("reviewCycles"),
  cycleName: v.string(),
  subjectEmployeeId: v.id("employees"),
  subjectName: v.string(),
  relationship: feedback360Relationship,
  status: feedback360Status,
  questions: v.array(v.string()),
  answers: v.array(feedback360Answer),
})

export const customFieldDefDoc = v.object({
  _id: v.id("customFieldDefs"),
  _creationTime: v.number(),
  orgId: v.id("organizations"),
  entity: v.literal("employee"),
  key: v.string(),
  label: v.string(),
  fieldType: v.union(
    v.literal("text"),
    v.literal("number"),
    v.literal("date"),
    v.literal("select"),
  ),
  options: v.optional(v.array(v.string())),
  required: v.boolean(),
});

// ─── Feed ────────────────────────────────────────────────────────────────

export const feedPostRow = v.object({
  _id: v.id("feedPosts"),
  _creationTime: v.number(),
  authorName: v.string(),
  authorPhotoUrl: v.union(v.string(), v.null()),
  title: v.string(),
  body: v.string(),
  audience: feedAudience,
  audienceLabel: v.string(),
  // Raw targeting ids, for prefilling the edit dialog.
  audienceDepartmentId: v.union(v.id("departments"), v.null()),
  audienceOfficeId: v.union(v.id("offices"), v.null()),
  audienceEmployeeIds: v.array(v.id("employees")),
  pinned: v.boolean(),
  isEvent: v.boolean(),
  eventDate: v.union(v.string(), v.null()),
  eventEndDate: v.union(v.string(), v.null()),
  eventLocation: v.union(v.string(), v.null()),
  youtubeUrl: v.union(v.string(), v.null()),
  media: v.array(
    v.object({
      storageId: v.id("_storage"),
      url: v.union(v.string(), v.null()),
      name: v.string(),
      isImage: v.boolean(),
    }),
  ),
  canDelete: v.boolean(),
  canEdit: v.boolean(),
  canPin: v.boolean(),
});
