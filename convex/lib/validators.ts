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
  leaveApproverStep,
  claimCategory,
  claimStatus,
  claimApproverStep,
  claimApprovalFlow,
  claimAssigneeGroup,
  claimPayrollMode,
  claimExchangeMode,
  officeMileageSettings,
  mileageVehicleRate,
  attendanceMethod,
  attendanceStatus,
  correctionStatus,
  shiftStatus,
  overtimeStatus,
  cpfStatus,
  payType,
  payrollStatus,
  payslipLine,
  allowanceItem,
  deductionItem,
  employerContribItem,
  employeeFunds,
  prorationMeta,
  payslipSignature,
  payslipApprovalStep,
  payslipTemplateShow,
  payslipLayoutBlock,
  payslipDensity,
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
  cycleForm,
  cycleAudienceMode,
  reviewAnswerSide,
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
  geoRequired: v.optional(v.boolean()),
  mileageSettings: v.optional(officeMileageSettings),
  qrEnabled: v.boolean(),
  qrMode: v.optional(v.union(v.literal("poster"), v.literal("kiosk"))),
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
  // Denormalized serving URL for photoStorageId (cached at write time).
  photoUrl: v.optional(v.string()),
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
  additionalManagerIds: v.optional(v.array(v.id("employees"))),
  employmentType: employmentType,
  officeId: v.optional(v.id("offices")),
  joinDate: v.string(),
  confirmationDate: v.optional(v.string()),
  probationEndDate: v.optional(v.string()),
  status: employeeStatus,
  exitDate: v.optional(v.string()),
  attendanceRequired: v.optional(v.boolean()),
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
  additionalManagerIds: v.array(v.id("employees")),
  positionId: v.union(v.id("positions"), v.null()),
  positionTitle: v.union(v.string(), v.null()),
  departmentId: v.union(v.id("departments"), v.null()),
  departmentName: v.union(v.string(), v.null()),
  officeId: v.union(v.id("offices"), v.null()),
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
  approvalChain: v.optional(v.array(leaveApproverStep)),
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
  prorateRounding: v.optional(roundingMode),
  carryForwardEnabled: v.boolean(),
  maxCarryForwardDays: v.optional(v.number()),
  carryForwardExpiry: v.optional(v.string()),
  seniorityEnabled: v.boolean(),
  seniorityEffective: v.optional(seniorityEffective),
  seniorityIncrementMode: v.optional(incrementMode),
  seniorityRules: v.optional(v.array(seniorityRule)),
  seniorityMaxDays: v.optional(v.number()),
  seniorityFirstYearMinMonths: v.optional(v.number()),
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

// One manual leave-balance adjustment event (employee profile audit timeline).
export const leaveBalanceAdjustmentRow = v.object({
  _id: v.id("leaveBalanceAdjustments"),
  at: v.number(),
  leaveTypeId: v.id("leaveTypes"),
  leaveTypeName: v.string(),
  color: v.string(),
  deltaDays: v.number(),
  newAdjustmentDays: v.number(),
  reason: v.union(v.string(), v.null()),
  actorName: v.union(v.string(), v.null()),
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

// One step of a leave request's resolved approval chain, for the stepper UI.
// State is relative to the request's progress; `note` is the approver's remark.
export const leaveApprovalChainStep = v.object({
  label: v.string(),
  approverName: v.union(v.string(), v.null()),
  state: v.union(
    v.literal("approved"),
    v.literal("current"),
    v.literal("upcoming"),
    v.literal("rejected"),
  ),
  note: v.union(v.string(), v.null()),
  decidedAt: v.union(v.number(), v.null()),
});

// Richer "My leave" row: the base row plus the resolved approval-chain stepper,
// the attachment's content type (so the popup can render it inline), and the
// name of the approver the request currently sits with.
export const myLeaveRequestRow = v.object({
  ...leaveRequestRowFields,
  attachmentContentType: v.union(v.string(), v.null()),
  currentApproverName: v.union(v.string(), v.null()),
  approvalChain: v.array(leaveApprovalChainStep),
});

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
  // Resolved approval chain for the stepper. Each item is one step with its
  // display label, primary approver name, and state relative to the request's
  // progress. Empty for auto-approved requests with no chain.
  approvalChain: v.array(leaveApprovalChainStep),
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
  // Whether approving the current step requires the caller to clock a signature.
  needsSignature: v.boolean(),
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

// An employee's resolved mileage-claim configuration (from their office),
// used to drive the distance/vehicle-type inputs and enforce the rate/max
// distance on the claim form. `null` fields mean "not configured" — the form
// blocks submission until an admin sets up the office's mileage settings.
export const mileageClaimSettings = v.object({
  currency: v.string(),
  ratePerKmCents: v.union(v.number(), v.null()),
  vehicleRates: v.array(mileageVehicleRate),
  maxDistanceKm: v.union(v.number(), v.null()),
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
  // Present (non-null) only when the claim type's category is "mileage".
  mileage: v.union(mileageClaimSettings, v.null()),
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
  // The approver a pending claim currently sits with (its chain step label, or
  // "Finance"), null once terminal. Lets list views show the accurate pending
  // stage rather than the coarse `pending_manager`/`pending_finance` status.
  currentApprover: v.union(v.string(), v.null()),
  receiptCount: v.number(),
  decisionNote: v.optional(v.string()),
  mileageDistanceKm: v.optional(v.number()),
  mileageVehicleTypeId: v.optional(v.string()),
  mileageVehicleTypeLabel: v.optional(v.string()),
  mileageRatePerKmCents: v.optional(v.number()),
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
  // Whether approving the current stage requires the caller to clock a signature
  // (the current chain step, or finance when finance signatures are required).
  needsSignature: v.boolean(),
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
  // `currentApprover` (inherited from claimRowFields) is the approver this claim
  // currently sits with (chain step label, or "Finance"), null once terminal.
  // Pending but parked ahead of the batch: the group barrier is holding it until
  // the slower claims reach the same approver level.
  waitingForBatch: v.boolean(),
  // Whether acting on this claim now requires a signature from the caller.
  needsSignature: v.boolean(),
});

// Org claim settings (return of claimSettings.get) — resolved with defaults so
// the form always has a complete shape to bind to.
export const claimSettingsValue = v.object({
  cutoffDay: v.number(),
  transactionValidityMonths: v.union(v.number(), v.null()),
  hrApproverUserIds: v.array(v.id("users")),
  financeApproverUserIds: v.array(v.id("users")),
  financeRequiresSignature: v.boolean(),
  assigneeGroups: v.array(claimAssigneeGroup),
  approvalWorkflow: v.array(claimApproverStep),
  approvalFlows: v.array(claimApprovalFlow),
  maxGroupsPerPeriod: v.union(v.number(), v.null()),
  payrollMode: claimPayrollMode,
  payrollItem: v.union(v.string(), v.null()),
})

// Org payment-request settings (return of paymentRequestSettings.get) — resolved
// with defaults so the form always has a complete shape to bind to. Reuses the
// claim approval structures; `paymentRequestSettings.options` reuses
// `claimSettingsOptions` (same members/offices/roles shape).
export const paymentRequestSettingsValue = v.object({
  hrApproverUserIds: v.array(v.id("users")),
  financeApproverUserIds: v.array(v.id("users")),
  financeRequiresSignature: v.boolean(),
  assigneeGroups: v.array(claimAssigneeGroup),
  approvalWorkflow: v.array(claimApproverStep),
  approvalFlows: v.array(claimApprovalFlow),
  defaultTemplateId: v.union(v.id("paymentRequestTemplates"), v.null()),
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

// One clock session on the attendance day board — minute-of-day (office tz).
export const attendanceBlock = v.object({
  _id: v.id("attendanceRecords"),
  clockInMinute: v.number(),
  // Null while still clocked in (renders as ongoing / to "now").
  clockOutMinute: v.union(v.number(), v.null()),
  status: attendanceStatus,
  method: attendanceMethod,
  clockInAt: v.number(),
  clockOutAt: v.union(v.number(), v.null()),
  workedMinutes: v.union(v.number(), v.null()),
  officeName: v.union(v.string(), v.null()),
  note: v.union(v.string(), v.null()),
  clockInDistance: v.union(v.number(), v.null()),
})

// One person's column on the day board.
export const attendanceBoardPerson = v.object({
  employeeId: v.id("employees"),
  name: v.string(),
  jobTitle: v.union(v.string(), v.null()),
  photoUrl: v.union(v.string(), v.null()),
  officeName: v.union(v.string(), v.null()),
  blocks: v.array(attendanceBlock),
  totalMinutes: v.number(),
  open: v.boolean(),
})

export const attendanceBoardResult = v.object({
  date: v.string(),
  people: v.array(attendanceBoardPerson),
  totalMinutes: v.number(),
  peopleCount: v.number(),
})

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

// One overtime record, hydrated with the employee's name. `paid` reflects a
// completed payroll pull.
export const overtimeRow = v.object({
  _id: v.id("overtimeRecords"),
  _creationTime: v.number(),
  employeeId: v.id("employees"),
  employeeName: v.string(),
  date: v.string(),
  startTime: v.union(v.string(), v.null()),
  endTime: v.union(v.string(), v.null()),
  plannedHours: v.number(),
  actualHours: v.union(v.number(), v.null()),
  multiplier: v.number(),
  status: overtimeStatus,
  note: v.union(v.string(), v.null()),
  paid: v.boolean(),
})

// ─── Work patterns + unified roster board ────────────────────────────────

export const workPatternDay = v.object({
  off: v.boolean(),
  startTime: v.union(v.string(), v.null()),
  endTime: v.union(v.string(), v.null()),
  breakMinutes: v.union(v.number(), v.null()),
})

export const workPatternDoc = v.object({
  _id: v.id("workPatterns"),
  _creationTime: v.number(),
  orgId: v.id("organizations"),
  name: v.string(),
  days: v.array(workPatternDay),
  color: v.union(v.string(), v.null()),
  officeId: v.union(v.id("offices"), v.null()),
  isDefault: v.boolean(),
})

// One block on the roster day hour-grid. `kind` distinguishes a scheduled shift,
// scheduled overtime, and actual clocked attendance overlaid on the same column.
// `derived` marks a virtual shift generated from a work pattern (no concrete row
// yet). Ids are per-kind: shiftId for shifts, overtimeId for OT, recordId for
// actual attendance sessions.
export const rosterBlock = v.object({
  kind: v.union(
    v.literal("scheduled"),
    v.literal("overtime"),
    v.literal("actual"),
  ),
  startMinute: v.number(),
  endMinute: v.union(v.number(), v.null()), // null = ongoing (actual, still in)
  derived: v.boolean(),
  color: v.union(v.string(), v.null()),
  label: v.union(v.string(), v.null()),
  shiftId: v.union(v.id("shiftAssignments"), v.null()),
  overtimeId: v.union(v.id("overtimeRecords"), v.null()),
  recordId: v.union(v.id("attendanceRecords"), v.null()),
  status: v.union(v.string(), v.null()),
  // Editable source values (null on actual-attendance blocks).
  startTime: v.union(v.string(), v.null()),
  endTime: v.union(v.string(), v.null()),
  breakMinutes: v.union(v.number(), v.null()),
  multiplier: v.union(v.number(), v.null()),
  note: v.union(v.string(), v.null()),
})

// Schedule-vs-actual variance for one person on one day.
export const rosterVariance = v.object({
  lateStartMin: v.number(),
  earlyLeaveMin: v.number(),
  absent: v.boolean(),
  unscheduled: v.boolean(),
  workedBeyondEndMin: v.number(),
})

// A suggested OT record derived from attendance running past the scheduled end,
// awaiting a manager's confirmation (not yet persisted).
export const otSuggestion = v.object({
  startTime: v.string(),
  endTime: v.string(),
  hours: v.number(),
})

export const rosterDayPerson = v.object({
  employeeId: v.id("employees"),
  name: v.string(),
  jobTitle: v.union(v.string(), v.null()),
  photoUrl: v.union(v.string(), v.null()),
  payType: payType,
  blocks: v.array(rosterBlock),
  scheduledMinutes: v.number(),
  overtimeMinutes: v.number(),
  actualMinutes: v.number(),
  open: v.boolean(),
  variance: rosterVariance,
  otSuggestion: v.union(otSuggestion, v.null()),
})

export const rosterDayResult = v.object({
  date: v.string(),
  people: v.array(rosterDayPerson),
  peopleCount: v.number(),
})

// One day's summary for a person in the week chip grid.
export const rosterWeekDay = v.object({
  date: v.string(),
  off: v.boolean(),
  shifts: v.array(
    v.object({
      shiftId: v.union(v.id("shiftAssignments"), v.null()),
      startTime: v.string(),
      endTime: v.string(),
      breakMinutes: v.number(),
      color: v.string(),
      derived: v.boolean(),
      status: v.union(shiftStatus, v.null()),
      note: v.union(v.string(), v.null()),
    }),
  ),
  overtime: v.array(
    v.object({
      overtimeId: v.id("overtimeRecords"),
      startTime: v.union(v.string(), v.null()),
      endTime: v.union(v.string(), v.null()),
      plannedHours: v.number(),
      multiplier: v.number(),
      status: overtimeStatus,
    }),
  ),
})

export const rosterWeekRow = v.object({
  employeeId: v.id("employees"),
  name: v.string(),
  jobTitle: v.union(v.string(), v.null()),
  payType: payType,
  workPatternName: v.union(v.string(), v.null()),
  days: v.array(rosterWeekDay),
})

export const rosterWeekResult = v.object({
  start: v.string(),
  end: v.string(),
  rows: v.array(rosterWeekRow),
  draftCount: v.number(),
})

// The signed-in employee's own upcoming schedule (self-service Home card).
export const myScheduleDay = v.object({
  date: v.string(),
  off: v.boolean(),
  shifts: v.array(
    v.object({
      startTime: v.string(),
      endTime: v.string(),
      breakMinutes: v.number(),
      color: v.string(),
      derived: v.boolean(),
      note: v.union(v.string(), v.null()),
    }),
  ),
  overtime: v.array(
    v.object({
      startTime: v.union(v.string(), v.null()),
      endTime: v.union(v.string(), v.null()),
      plannedHours: v.number(),
      multiplier: v.number(),
      status: overtimeStatus,
    }),
  ),
})

export const myScheduleResult = v.object({
  payType: payType,
  days: v.array(myScheduleDay),
})

// ─── Roster reports (attendance × roster × timesheets) ───────────────────

export const rosterReportResult = v.object({
  // True when any table scan or the date range hit its safety cap.
  truncated: v.boolean(),
  peopleCount: v.number(),
  totals: v.object({
    scheduledMinutes: v.number(),
    actualMinutes: v.number(),
    loggedMinutes: v.number(),
    billableMinutes: v.number(),
    overtimeMinutes: v.number(),
    expectedDays: v.number(),
    presentDays: v.number(),
    lateCount: v.number(),
    absentCount: v.number(),
  }),
  byDay: v.array(
    v.object({
      date: v.string(),
      scheduledMinutes: v.number(),
      actualMinutes: v.number(),
      loggedMinutes: v.number(),
    }),
  ),
  byEmployee: v.array(
    v.object({
      employeeId: v.id("employees"),
      name: v.string(),
      scheduledMinutes: v.number(),
      actualMinutes: v.number(),
      loggedMinutes: v.number(),
      billableMinutes: v.number(),
      overtimeMinutes: v.number(),
      expectedDays: v.number(),
      presentDays: v.number(),
      lateCount: v.number(),
      absentCount: v.number(),
    }),
  ),
  byProject: v.array(
    v.object({
      projectId: v.id("projects"),
      name: v.string(),
      color: v.union(v.string(), v.null()),
      loggedMinutes: v.number(),
      billableMinutes: v.number(),
    }),
  ),
})

// ─── Payroll ─────────────────────────────────────────────────────────────

export const compensationDoc = v.object({
  _id: v.id("compensation"),
  _creationTime: v.number(),
  orgId: v.id("organizations"),
  employeeId: v.id("employees"),
  effectiveDate: v.string(),
  currency: v.string(),
  payType: v.optional(payType),
  baseMonthlyCents: v.number(),
  hourlyRateCents: v.optional(v.number()),
  allowances: v.array(allowanceItem),
  cpfStatus: cpfStatus,
  prStartDate: v.optional(v.string()),
  exchangeMode: v.optional(claimExchangeMode),
  manualRate: v.optional(v.number()),
  workingDays: v.optional(v.array(v.number())),
  funds: v.optional(employeeFunds),
  deductions: v.optional(v.array(deductionItem)),
  employerContributions: v.optional(v.array(employerContribItem)),
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
  payType: v.union(payType, v.null()),
  baseMonthlyCents: v.union(v.number(), v.null()),
  hourlyRateCents: v.union(v.number(), v.null()),
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
  // The un-prorated full monthly base (for the proration editor's "× d/t").
  fullBaseCents: v.number(),
  // Pay basis for this employee. "hourly" employees get an hours editor at the
  // adjust stage instead of a proration editor; base = hourlyRate × hours.
  payType: payType,
  hourlyRateCents: v.union(v.number(), v.null()),
  hoursWorked: v.union(v.number(), v.null()),
  allowances: v.array(allowanceItem),
  grossCents: v.number(),
  cpfableWageCents: v.number(),
  employeeCpfCents: v.number(),
  employerCpfCents: v.number(),
  netCents: v.number(),
  cpfStatus: cpfStatus,
  prYear: v.union(v.number(), v.null()),
  // Multi-currency: `currency` is the pay currency; when it differs from
  // `baseCurrency` the exchange rate converts to base for totals/exports.
  baseCurrency: v.union(v.string(), v.null()),
  exchangeRate: v.union(v.number(), v.null()),
  exchangeRateDate: v.union(v.string(), v.null()),
  exchangeMode: v.union(claimExchangeMode, v.null()),
  exchangeProvider: v.union(v.string(), v.null()),
  proration: v.union(prorationMeta, v.null()),
  // The full computed payslip line breakdown (base, allowances, funds, CPF,
  // SDL, employer contributions, adjustments) — powers the detailed export.
  lines: v.array(payslipLine),
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

// A payslip template's rendering config, with the logo resolved to a URL.
export const payslipTemplateConfig = v.object({
  accentColor: v.string(),
  fontFamily: v.string(),
  logoUrl: v.union(v.string(), v.null()),
  headerText: v.union(v.string(), v.null()),
  footerText: v.union(v.string(), v.null()),
  show: payslipTemplateShow,
  layout: v.union(v.array(payslipLayoutBlock), v.null()),
  textColor: v.union(v.string(), v.null()),
  fontScale: v.union(v.number(), v.null()),
  density: v.union(payslipDensity, v.null()),
})

// A signature rendered on a payslip, with the image resolved to a URL.
export const payslipSignatureView = v.object({
  role: v.string(),
  name: v.string(),
  url: v.union(v.string(), v.null()),
  signedAt: v.number(),
})

// A payslip template row for the templates manager (logo resolved to a URL).
export const payslipTemplateRow = v.object({
  _id: v.id("payslipTemplates"),
  _creationTime: v.number(),
  name: v.string(),
  isDefault: v.boolean(),
  accentColor: v.string(),
  fontFamily: v.string(),
  logoStorageId: v.union(v.id("_storage"), v.null()),
  logoUrl: v.union(v.string(), v.null()),
  headerText: v.union(v.string(), v.null()),
  footerText: v.union(v.string(), v.null()),
  show: payslipTemplateShow,
  layout: v.union(v.array(payslipLayoutBlock), v.null()),
  textColor: v.union(v.string(), v.null()),
  fontScale: v.union(v.number(), v.null()),
  density: v.union(payslipDensity, v.null()),
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
  prYear: v.union(v.number(), v.null()),
  baseCurrency: v.union(v.string(), v.null()),
  exchangeRate: v.union(v.number(), v.null()),
  exchangeRateDate: v.union(v.string(), v.null()),
  exchangeMode: v.union(claimExchangeMode, v.null()),
  exchangeProvider: v.union(v.string(), v.null()),
  lines: v.array(payslipLine),
  status: payrollStatus,
  proration: v.union(prorationMeta, v.null()),
  template: payslipTemplateConfig,
  signatures: v.array(payslipSignatureView),
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
  form: v.optional(cycleForm),
  templateId: v.optional(v.id("appraisalFormTemplates")),
  audience: v.optional(
    v.object({
      mode: cycleAudienceMode,
      departmentIds: v.optional(v.array(v.id("departments"))),
      officeIds: v.optional(v.array(v.id("offices"))),
      employeeIds: v.optional(v.array(v.id("employees"))),
    }),
  ),
  reminders: v.optional(
    v.object({ enabled: v.boolean(), daysBefore: v.array(v.number()) }),
  ),
  dueDates: v.optional(v.record(v.string(), v.string())),
  createdBy: v.optional(v.id("users")),
})

export const appraisalFormTemplateDoc = v.object({
  _id: v.id("appraisalFormTemplates"),
  _creationTime: v.number(),
  orgId: v.id("organizations"),
  name: v.string(),
  description: v.optional(v.string()),
  form: cycleForm,
  isSystemDefault: v.boolean(),
  active: v.boolean(),
  createdBy: v.optional(v.id("users")),
})

// One field answer, resolved for the client (storage ids paired with signed
// URLs). Only the keys relevant to the field's type are non-null.
export const formAnswer = v.object({
  fieldId: v.string(),
  side: reviewAnswerSide,
  text: v.union(v.string(), v.null()),
  rating: v.union(v.number(), v.null()),
  choice: v.union(v.string(), v.null()),
  choices: v.union(v.array(v.string()), v.null()),
  boolValue: v.union(v.boolean(), v.null()),
  date: v.union(v.string(), v.null()),
  files: v.array(
    v.object({ storageId: v.id("_storage"), url: v.union(v.string(), v.null()) }),
  ),
  signatureStorageId: v.union(v.id("_storage"), v.null()),
  signatureUrl: v.union(v.string(), v.null()),
})

// The form-driven fill payload: the resolved form + both sides' answers + what
// the caller may do. Objectives/competencies blocks are fetched via their own
// queries (reviewObjectives/reviewCompetencies.forReview).
export const appraisalFormResult = v.object({
  _id: v.id("reviews"),
  cycleId: v.id("reviewCycles"),
  cycleName: v.string(),
  employeeId: v.id("employees"),
  employeeName: v.string(),
  appraiserName: v.union(v.string(), v.null()),
  ratingScaleMax: v.number(),
  status: reviewStatus,
  form: cycleForm,
  answers: v.array(formAnswer),
  // Which side the viewer is, so a surface can pick the right perspective.
  viewerIsSubject: v.boolean(),
  viewerIsAppraiser: v.boolean(),
  canSelf: v.boolean(),
  canAppraiser: v.boolean(),
  canFinalizeAppraiser: v.boolean(),
  canAcknowledge: v.boolean(),
  selfSubmittedAt: v.union(v.number(), v.null()),
  managerSubmittedAt: v.union(v.number(), v.null()),
  acknowledgedAt: v.union(v.number(), v.null()),
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
  canFinalizeAppraiser: v.boolean(),
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
