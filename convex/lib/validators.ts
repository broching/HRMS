import { v } from "convex/values";
import {
  employmentType,
  employeeStatus,
  gender,
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
  employeeNumber: v.string(),
  firstName: v.string(),
  lastName: v.string(),
  preferredName: v.optional(v.string()),
  photoStorageId: v.optional(v.id("_storage")),
  dob: v.optional(v.string()),
  gender: v.optional(gender),
  nationality: v.optional(v.string()),
  idNumberMasked: v.optional(v.string()),
  idNumberLast4: v.optional(v.string()),
  address: v.optional(addressValidator),
  contact: v.optional(contactValidator),
  emergencyContacts: v.optional(v.array(emergencyContactValidator)),
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
export const employeeProfile = v.object({
  ...employeeFields,
  photoUrl: v.union(v.string(), v.null()),
  departmentName: v.union(v.string(), v.null()),
  teamName: v.union(v.string(), v.null()),
  positionTitle: v.union(v.string(), v.null()),
  managerName: v.union(v.string(), v.null()),
  officeName: v.union(v.string(), v.null()),
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
});

export const leaveTypeDoc = v.object({
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
export const leaveRequestRow = v.object({
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
});

export const claimTypeDoc = v.object({
  _id: v.id("claimTypes"),
  _creationTime: v.number(),
  orgId: v.id("organizations"),
  name: v.string(),
  category: claimCategory,
  requiresReceipt: v.boolean(),
  maxAmountCents: v.optional(v.number()),
  glCode: v.optional(v.string()),
  active: v.boolean(),
});

const claimRowFields = {
  _id: v.id("claims"),
  _creationTime: v.number(),
  employeeId: v.id("employees"),
  employeeName: v.string(),
  claimTypeName: v.string(),
  category: claimCategory,
  amountCents: v.number(),
  currency: v.string(),
  incurredDate: v.string(),
  description: v.string(),
  status: claimStatus,
  receiptCount: v.number(),
  decisionNote: v.optional(v.string()),
};

export const claimRow = v.object(claimRowFields);

export const claimDetail = v.object({
  ...claimRowFields,
  receiptUrls: v.array(v.string()),
  managerApproverUserId: v.union(v.id("users"), v.null()),
  financeApproverUserId: v.union(v.id("users"), v.null()),
});

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
