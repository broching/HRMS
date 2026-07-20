import { query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getOrgContext, OrgContext } from "./auth";
import { Permission } from "./lib/permissions";
import { ctxHasPermission } from "./auth";

/**
 * HR Lounge → Reports → Report builder. A single generic `dataset` query that
 * returns a report's column definitions + rows for the selected report key.
 * The client toggles/filters columns and exports to CSV/Excel. Each report is
 * gated by the permission appropriate to its data (all held by HR + admin).
 */

type Cell = string | number | null;
type Row = Record<string, Cell>;
type Column = { key: string; label: string; group: string };
// Optional date scope for date-filterable reports (e.g. Leave Records).
// `month` is 1–12 and requires `year`; `year` alone means the whole year.
type Period = { month?: number; year?: number };

// Report key → the permission required to pull it.
const REPORT_PERMISSION: Record<string, Permission> = {
  employee_information: "employees:read:all",
  identity_documents: "employees:read:all",
  leave_balances: "leave:approve:all",
  leave_records: "leave:approve:all",
  expense_claims: "claims:approve:finance",
  employee_payroll: "payroll:manage",
  company_payroll: "payroll:manage",
  performance_management: "performance:manage",
  // Timesheet reports mirror the org-wide timesheet oversight surface
  // (orgReport / orgExportRows), which is held by projects:manage.
  timesheets_project: "projects:manage",
  timesheet_employee: "projects:manage",
};

// ─── Label helpers ──────────────────────────────────────────────────────────

const GENDER_LABELS: Record<string, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
  undisclosed: "Undisclosed",
};
const MARITAL_LABELS: Record<string, string> = {
  single: "Single",
  married: "Married",
  divorced: "Divorced",
  widowed: "Widowed",
  other: "Other",
  undisclosed: "Undisclosed",
};
const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  intern: "Intern",
};
const EMPLOYEE_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  probation: "Probation",
  on_leave: "On leave",
  suspended: "Suspended",
  terminated: "Terminated",
};
const DOC_TYPE_LABELS: Record<string, string> = {
  contract: "Contract",
  certification: "Certification",
  work_pass: "Work pass",
  identity: "Identity",
  other: "Other",
};
const LEAVE_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  info_requested: "Info requested",
};
const CLAIM_STATUS_LABELS: Record<string, string> = {
  pending_manager: "Pending manager",
  pending_finance: "Pending finance",
  approved: "Approved",
  rejected: "Rejected",
  reimbursed: "Reimbursed",
  cancelled: "Cancelled",
};
const REVIEW_STATUS_LABELS: Record<string, string> = {
  self_review: "Self review",
  manager_review: "Appraiser review",
  calibration: "Calibration",
  released: "Released",
  completed: "Completed",
};

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

function ageFrom(dob: string | undefined, now: number): number | null {
  if (!dob) return null;
  const t = new Date(`${dob}T00:00:00`).getTime();
  if (Number.isNaN(t)) return null;
  const years = Math.floor((now - t) / YEAR_MS);
  return years >= 0 ? years : null;
}

function dollars(cents: number): number {
  return Math.round(cents) / 100;
}

function hoursFrom(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

// Minute-of-day (0–1439) → 12-hour clock, matching the board's display.
function clockFrom(minute: number | undefined | null): string | null {
  if (minute == null) return null;
  const h24 = Math.floor(minute / 60);
  const m = minute % 60;
  const ampm = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

const PROJECT_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  archived: "Archived",
};

// Resolve org-structure name maps + an employee display lookup once.
async function loadEmployeeContext(ctx: QueryCtx, orgId: Id<"organizations">) {
  const [employees, departments, positions, offices] = await Promise.all([
    ctx.db.query("employees").withIndex("by_org", (q) => q.eq("orgId", orgId)).take(3000),
    ctx.db.query("departments").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
    ctx.db.query("positions").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
    ctx.db.query("offices").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
  ]);
  const deptName = new Map(departments.map((d) => [d._id, d.name]));
  const posTitle = new Map(positions.map((p) => [p._id, p.title]));
  const officeName = new Map(offices.map((o) => [o._id, o.name]));
  const byId = new Map(employees.map((e) => [e._id, e]));
  const nameOf = (id: Id<"employees"> | undefined | null): string =>
    id ? (() => {
      const e = byId.get(id);
      return e ? `${e.preferredName ?? e.firstName} ${e.lastName}`.trim() : "—";
    })() : "—";
  return { employees, deptName, posTitle, officeName, byId, nameOf };
}

// ─── Per-report builders ──────────────────────────────────────────────────

async function buildEmployeeInformation(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
): Promise<{ columns: Column[]; rows: Row[] }> {
  const now = Date.now();
  const { employees, deptName, posTitle, officeName, nameOf } =
    await loadEmployeeContext(ctx, orgId);
  const columns: Column[] = [
    { key: "internalId", label: "Internal Id", group: "Employee Information" },
    { key: "firstName", label: "First Name", group: "Employee Information" },
    { key: "lastName", label: "Last Name", group: "Employee Information" },
    { key: "preferredName", label: "Preferred Name", group: "Employee Information" },
    { key: "email", label: "Email", group: "Employee Information" },
    { key: "mobilePhone", label: "Mobile phone", group: "Personal Details" },
    { key: "birthDate", label: "Birth Date", group: "Personal Details" },
    { key: "age", label: "Age", group: "Personal Details" },
    { key: "gender", label: "Gender", group: "Personal Details" },
    { key: "nationality", label: "Nationality", group: "Personal Details" },
    { key: "maritalStatus", label: "Marital status", group: "Personal Details" },
    { key: "department", label: "Department", group: "Employment Details" },
    { key: "position", label: "Position", group: "Employment Details" },
    { key: "office", label: "Office", group: "Employment Details" },
    { key: "manager", label: "Manager", group: "Employment Details" },
    { key: "employmentType", label: "Employment Type", group: "Employment Details" },
    { key: "joinDate", label: "Join Date", group: "Employment Details" },
    { key: "status", label: "Status", group: "Employment Details" },
  ];
  const rows: Row[] = employees
    .filter((e) => !e.isVacant)
    .sort((a, b) => a.employeeNumber.localeCompare(b.employeeNumber))
    .map((e) => ({
      internalId: e.employeeNumber,
      firstName: e.firstName,
      lastName: e.lastName,
      preferredName: e.preferredName ?? null,
      email: e.contact?.workEmail ?? e.loginEmail ?? null,
      mobilePhone: e.contact?.phone ?? null,
      birthDate: e.dob ?? null,
      age: ageFrom(e.dob, now),
      gender: e.gender ? GENDER_LABELS[e.gender] ?? e.gender : null,
      nationality: e.nationality ?? null,
      maritalStatus: e.maritalStatus
        ? MARITAL_LABELS[e.maritalStatus] ?? e.maritalStatus
        : null,
      department: e.departmentId ? deptName.get(e.departmentId) ?? null : null,
      position: e.positionId ? posTitle.get(e.positionId) ?? null : null,
      office: e.officeId ? officeName.get(e.officeId) ?? null : null,
      manager: e.managerId ? nameOf(e.managerId) : null,
      employmentType: EMPLOYMENT_LABELS[e.employmentType] ?? e.employmentType,
      joinDate: e.joinDate,
      status: EMPLOYEE_STATUS_LABELS[e.status] ?? e.status,
    }));
  return { columns, rows };
}

async function buildIdentityDocuments(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
): Promise<{ columns: Column[]; rows: Row[] }> {
  const { byId, nameOf } = await loadEmployeeContext(ctx, orgId);
  const docs = await ctx.db
    .query("employeeDocuments")
    .withIndex("by_org_type", (q) => q.eq("orgId", orgId).eq("type", "identity"))
    .collect();
  const passes = await ctx.db
    .query("employeeDocuments")
    .withIndex("by_org_type", (q) => q.eq("orgId", orgId).eq("type", "work_pass"))
    .collect();
  const all = [...docs, ...passes];
  const columns: Column[] = [
    { key: "internalId", label: "Internal Id", group: "Identity Documents" },
    { key: "employee", label: "Employee", group: "Identity Documents" },
    { key: "documentType", label: "Document Type", group: "Identity Documents" },
    { key: "name", label: "Document Name", group: "Identity Documents" },
    { key: "nationality", label: "Nationality", group: "Identity Documents" },
    { key: "expiryDate", label: "Expiry Date", group: "Identity Documents" },
  ];
  const rows: Row[] = all
    .map((d) => {
      const emp = byId.get(d.employeeId);
      return {
        internalId: emp?.employeeNumber ?? null,
        employee: nameOf(d.employeeId),
        documentType: DOC_TYPE_LABELS[d.type] ?? d.type,
        name: d.name,
        nationality: emp?.nationality ?? null,
        expiryDate: d.expiryDate ?? null,
        _sort: `${emp?.employeeNumber ?? ""}`,
      };
    })
    .sort((a, b) => String(a._sort).localeCompare(String(b._sort)))
    .map(({ _sort, ...r }) => r);
  return { columns, rows };
}

async function buildLeaveBalances(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
): Promise<{ columns: Column[]; rows: Row[] }> {
  const year = new Date().getFullYear();
  const { byId, nameOf } = await loadEmployeeContext(ctx, orgId);
  const leaveTypes = await ctx.db
    .query("leaveTypes")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  const typeName = new Map(leaveTypes.map((t) => [t._id, t.name]));
  const balances = (
    await ctx.db
      .query("leaveBalances")
      .withIndex("by_org_employee_year", (q) => q.eq("orgId", orgId))
      .collect()
  ).filter((b) => b.year === year);
  const columns: Column[] = [
    { key: "internalId", label: "Internal Id", group: "Leave Balances" },
    { key: "employee", label: "Employee", group: "Leave Balances" },
    { key: "leaveType", label: "Leave Type", group: "Leave Balances" },
    { key: "year", label: "Year", group: "Leave Balances" },
    { key: "entitled", label: "Entitled", group: "Leave Balances" },
    { key: "carriedForward", label: "Carried Forward", group: "Leave Balances" },
    { key: "taken", label: "Taken", group: "Leave Balances" },
    { key: "pending", label: "Pending", group: "Leave Balances" },
    { key: "balance", label: "Balance", group: "Leave Balances" },
  ];
  const rows: Row[] = balances
    .map((b) => {
      const emp = byId.get(b.employeeId);
      const balance =
        b.entitledDays +
        b.carriedForwardDays +
        b.adjustmentDays -
        b.takenDays -
        b.pendingDays;
      return {
        internalId: emp?.employeeNumber ?? null,
        employee: nameOf(b.employeeId),
        leaveType: typeName.get(b.leaveTypeId) ?? "—",
        year: b.year,
        entitled: Math.round((b.entitledDays + b.carriedForwardDays) * 10) / 10,
        carriedForward: Math.round(b.carriedForwardDays * 10) / 10,
        taken: Math.round(b.takenDays * 10) / 10,
        pending: Math.round(b.pendingDays * 10) / 10,
        balance: Math.round(balance * 10) / 10,
        _sort: `${emp?.employeeNumber ?? ""}`,
      };
    })
    .sort((a, b) => String(a._sort).localeCompare(String(b._sort)))
    .map(({ _sort, ...r }) => r);
  return { columns, rows };
}

// Leave Records — one row per leave request (the leaves employees actually
// take), optionally scoped to a month/year. The date picker filters by the
// request's start date via the `by_org_start` index, which also bounds the read.
async function buildLeaveRecords(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  period: Period,
): Promise<{ columns: Column[]; rows: Row[] }> {
  const { byId, nameOf } = await loadEmployeeContext(ctx, orgId);
  const leaveTypes = await ctx.db
    .query("leaveTypes")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  const typeName = new Map(leaveTypes.map((t) => [t._id, t.name]));

  const pad = (n: number) => String(n).padStart(2, "0");
  const requests = await ctx.db
    .query("leaveRequests")
    .withIndex("by_org_start", (q) => {
      if (period.year) {
        const lo = period.month
          ? `${period.year}-${pad(period.month)}-01`
          : `${period.year}-01-01`;
        const hi = period.month
          ? `${period.year}-${pad(period.month)}-31`
          : `${period.year}-12-31`;
        return q.eq("orgId", orgId).gte("startDate", lo).lte("startDate", hi);
      }
      return q.eq("orgId", orgId);
    })
    .take(10000);

  const columns: Column[] = [
    { key: "internalId", label: "Internal Id", group: "Leave Records" },
    { key: "employee", label: "Employee", group: "Leave Records" },
    { key: "leaveType", label: "Leave Type", group: "Leave Records" },
    { key: "startDate", label: "Start Date", group: "Leave Records" },
    { key: "endDate", label: "End Date", group: "Leave Records" },
    { key: "days", label: "Days", group: "Leave Records" },
    { key: "status", label: "Status", group: "Leave Records" },
    { key: "reason", label: "Reason", group: "Leave Records" },
    { key: "appliedOn", label: "Applied On", group: "Leave Records" },
  ];
  const rows: Row[] = requests
    .map((r) => {
      const emp = byId.get(r.employeeId);
      return {
        internalId: emp?.employeeNumber ?? null,
        employee: nameOf(r.employeeId),
        leaveType: typeName.get(r.leaveTypeId) ?? "—",
        startDate: r.startDate,
        endDate: r.endDate,
        days: Math.round(r.totalDays * 10) / 10,
        status: LEAVE_STATUS_LABELS[r.status] ?? r.status,
        reason: r.reason ?? null,
        appliedOn: new Date(r._creationTime).toISOString().slice(0, 10),
        // Newest leave first, then by person.
        _sort: `${r.startDate}|${nameOf(r.employeeId)}`,
      };
    })
    .sort((a, b) => String(b._sort).localeCompare(String(a._sort)))
    .map(({ _sort, ...r }) => r);
  return { columns, rows };
}

async function buildExpenseClaims(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
): Promise<{ columns: Column[]; rows: Row[] }> {
  const { byId, nameOf } = await loadEmployeeContext(ctx, orgId);
  const claimTypes = await ctx.db
    .query("claimTypes")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  const typeName = new Map(claimTypes.map((t) => [t._id, t.name]));
  const claims = await ctx.db
    .query("claims")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .take(5000);
  const columns: Column[] = [
    { key: "internalId", label: "Internal Id", group: "Expense Claims" },
    { key: "employee", label: "Employee", group: "Expense Claims" },
    { key: "claimType", label: "Claim Type", group: "Expense Claims" },
    { key: "amount", label: "Amount", group: "Expense Claims" },
    { key: "currency", label: "Currency", group: "Expense Claims" },
    { key: "incurredDate", label: "Incurred Date", group: "Expense Claims" },
    { key: "status", label: "Status", group: "Expense Claims" },
    { key: "description", label: "Description", group: "Expense Claims" },
  ];
  const rows: Row[] = claims
    // Unsubmitted drafts are private to the employee — keep them out of reports.
    .filter((c) => c.status !== "draft")
    .map((c) => {
      const emp = byId.get(c.employeeId);
      return {
        internalId: emp?.employeeNumber ?? null,
        employee: nameOf(c.employeeId),
        claimType: typeName.get(c.claimTypeId) ?? "—",
        amount: dollars(c.amountCents),
        currency: c.currency,
        incurredDate: c.incurredDate,
        status: CLAIM_STATUS_LABELS[c.status] ?? c.status,
        description: c.description,
        _sort: c.incurredDate,
      };
    })
    .sort((a, b) => String(b._sort).localeCompare(String(a._sort)))
    .map(({ _sort, ...r }) => r);
  return { columns, rows };
}

async function buildEmployeePayroll(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
): Promise<{ columns: Column[]; rows: Row[] }> {
  const { byId, nameOf } = await loadEmployeeContext(ctx, orgId);
  const runs = await ctx.db
    .query("payrollRuns")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  const slips: Doc<"payslips">[] = [];
  for (const run of runs) {
    const s = await ctx.db
      .query("payslips")
      .withIndex("by_run", (q) => q.eq("runId", run._id))
      .collect();
    slips.push(...s);
  }
  const columns: Column[] = [
    { key: "internalId", label: "Internal Id", group: "Employee Payroll" },
    { key: "employee", label: "Employee", group: "Employee Payroll" },
    { key: "period", label: "Period", group: "Employee Payroll" },
    { key: "basic", label: "Basic", group: "Employee Payroll" },
    { key: "allowances", label: "Allowances", group: "Employee Payroll" },
    { key: "gross", label: "Gross", group: "Employee Payroll" },
    { key: "employeeCpf", label: "Employee CPF", group: "Employee Payroll" },
    { key: "employerCpf", label: "Employer CPF", group: "Employee Payroll" },
    { key: "net", label: "Net Pay", group: "Employee Payroll" },
    { key: "currency", label: "Currency", group: "Employee Payroll" },
  ];
  const rows: Row[] = slips
    .map((s) => {
      const emp = byId.get(s.employeeId);
      return {
        internalId: emp?.employeeNumber ?? null,
        employee: nameOf(s.employeeId),
        period: s.periodMonth,
        basic: dollars(s.baseCents),
        allowances: dollars(s.allowancesCents),
        gross: dollars(s.grossCents),
        employeeCpf: dollars(s.employeeCpfCents),
        employerCpf: dollars(s.employerCpfCents),
        net: dollars(s.netCents),
        currency: s.currency,
        _sort: `${s.periodMonth}|${emp?.employeeNumber ?? ""}`,
      };
    })
    .sort((a, b) => String(b._sort).localeCompare(String(a._sort)))
    .map(({ _sort, ...r }) => r);
  return { columns, rows };
}

async function buildCompanyPayroll(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
): Promise<{ columns: Column[]; rows: Row[] }> {
  const runs = await ctx.db
    .query("payrollRuns")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  const statusLabel: Record<string, string> = {
    draft: "Draft",
    finalized: "Finalized",
    paid: "Paid",
  };
  const columns: Column[] = [
    { key: "period", label: "Period", group: "Company Payroll" },
    { key: "label", label: "Label", group: "Company Payroll" },
    { key: "status", label: "Status", group: "Company Payroll" },
    { key: "gross", label: "Gross", group: "Company Payroll" },
    { key: "employeeCpf", label: "Employee CPF", group: "Company Payroll" },
    { key: "employerCpf", label: "Employer CPF", group: "Company Payroll" },
    { key: "net", label: "Net", group: "Company Payroll" },
    { key: "payslipCount", label: "Payslips", group: "Company Payroll" },
    { key: "currency", label: "Currency", group: "Company Payroll" },
  ];
  const rows: Row[] = runs
    .sort((a, b) => b.periodMonth.localeCompare(a.periodMonth))
    .map((r) => ({
      period: r.periodMonth,
      label: r.label,
      status: statusLabel[r.status] ?? r.status,
      gross: dollars(r.grossCents),
      employeeCpf: dollars(r.employeeCpfCents),
      employerCpf: dollars(r.employerCpfCents),
      net: dollars(r.netCents),
      payslipCount: r.payslipCount,
      currency: r.currency,
    }));
  return { columns, rows };
}

async function buildPerformanceManagement(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
): Promise<{ columns: Column[]; rows: Row[] }> {
  const { byId, nameOf } = await loadEmployeeContext(ctx, orgId);
  const cycles = await ctx.db
    .query("reviewCycles")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  const cycleName = new Map(cycles.map((c) => [c._id, c.name]));
  const reviews = await ctx.db
    .query("reviews")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .take(5000);
  const columns: Column[] = [
    { key: "internalId", label: "Internal Id", group: "Performance Management" },
    { key: "employee", label: "Employee", group: "Performance Management" },
    { key: "cycle", label: "Cycle", group: "Performance Management" },
    { key: "status", label: "Status", group: "Performance Management" },
    { key: "overall", label: "Overall Rating", group: "Performance Management" },
    { key: "band", label: "Rating Band", group: "Performance Management" },
    { key: "objectives", label: "Objectives Score", group: "Performance Management" },
    { key: "competencies", label: "Competencies Score", group: "Performance Management" },
    { key: "level", label: "Level", group: "Performance Management" },
  ];
  const rows: Row[] = reviews
    .map((r) => {
      const emp = byId.get(r.employeeId);
      return {
        internalId: emp?.employeeNumber ?? null,
        employee: nameOf(r.employeeId),
        cycle: cycleName.get(r.cycleId) ?? "—",
        status: REVIEW_STATUS_LABELS[r.status] ?? r.status,
        overall: r.overallRating ?? null,
        band: r.ratingBand ?? null,
        objectives: r.objectivesScore ?? null,
        competencies: r.competenciesScore ?? null,
        level: r.competencyLevel ?? null,
        _sort: `${cycleName.get(r.cycleId) ?? ""}|${emp?.employeeNumber ?? ""}`,
      };
    })
    .sort((a, b) => String(a._sort).localeCompare(String(b._sort)))
    .map(({ _sort, ...r }) => r);
  return { columns, rows };
}

// A bounded read of the org's time entries, newest first. Timesheet reports pull
// the whole history (the builder has no date picker), so we cap the scan like the
// other high-volume reports (claims/reviews) and lean on the client-side filters.
const TIMESHEET_SCAN_CAP = 20000;

async function loadTimeEntries(ctx: QueryCtx, orgId: Id<"organizations">) {
  const entries = await ctx.db
    .query("timeEntries")
    .withIndex("by_org_date", (q) => q.eq("orgId", orgId))
    .order("desc")
    .take(TIMESHEET_SCAN_CAP);
  return entries;
}

// Timesheets by Project — one row per (project × employee), so a project owner
// can see who logged how much against each project, and how much was billable.
async function buildTimesheetsByProject(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
): Promise<{ columns: Column[]; rows: Row[] }> {
  const { deptName, nameOf, byId } = await loadEmployeeContext(ctx, orgId);
  const projects = await ctx.db
    .query("projects")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  const pMap = new Map(projects.map((p) => [p._id, p]));
  const entries = await loadTimeEntries(ctx, orgId);

  const columns: Column[] = [
    { key: "project", label: "Project", group: "Project" },
    { key: "projectCode", label: "Project Code", group: "Project" },
    { key: "client", label: "Client", group: "Project" },
    { key: "projectStatus", label: "Project Status", group: "Project" },
    { key: "internalId", label: "Internal Id", group: "Logged By" },
    { key: "employee", label: "Employee", group: "Logged By" },
    { key: "department", label: "Department", group: "Logged By" },
    { key: "entries", label: "Entries", group: "Time" },
    { key: "hours", label: "Hours", group: "Time" },
    { key: "billableHours", label: "Billable Hours", group: "Time" },
  ];

  type Agg = {
    projectId: Id<"projects">;
    employeeId: Id<"employees">;
    minutes: number;
    billableMinutes: number;
    entries: number;
  };
  const agg = new Map<string, Agg>();
  for (const e of entries) {
    const key = `${e.projectId}:${e.employeeId}`;
    const cur =
      agg.get(key) ??
      { projectId: e.projectId, employeeId: e.employeeId, minutes: 0, billableMinutes: 0, entries: 0 };
    cur.minutes += e.minutes;
    if (e.billable) cur.billableMinutes += e.minutes;
    cur.entries += 1;
    agg.set(key, cur);
  }

  const rows: Row[] = [...agg.values()]
    .map((a) => {
      const project = pMap.get(a.projectId);
      const emp = byId.get(a.employeeId);
      return {
        project: project?.name ?? "—",
        projectCode: project?.code ?? null,
        client: project?.clientName ?? null,
        projectStatus: project
          ? (PROJECT_STATUS_LABELS[project.status] ?? project.status)
          : null,
        internalId: emp?.employeeNumber ?? null,
        employee: nameOf(a.employeeId),
        department: emp?.departmentId ? (deptName.get(emp.departmentId) ?? null) : null,
        entries: a.entries,
        hours: hoursFrom(a.minutes),
        billableHours: hoursFrom(a.billableMinutes),
        _sort: `${project?.name ?? ""}|${String(1e9 - a.minutes).padStart(12, "0")}`,
      };
    })
    .sort((a, b) => String(a._sort).localeCompare(String(b._sort)))
    .map(({ _sort, ...r }) => r);
  return { columns, rows };
}

// Timesheet by Employee — one row per logged entry (the detailed timesheet), so
// an individual's hours can be extracted line by line for a spreadsheet.
async function buildTimesheetByEmployee(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
): Promise<{ columns: Column[]; rows: Row[] }> {
  const { deptName, posTitle, nameOf, byId } = await loadEmployeeContext(ctx, orgId);
  const projects = await ctx.db
    .query("projects")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  const pName = new Map(projects.map((p) => [p._id, p.name]));
  const tasks = await ctx.db
    .query("projectTasks")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  const tName = new Map(tasks.map((t) => [t._id, t.name]));
  const entries = await loadTimeEntries(ctx, orgId);

  const columns: Column[] = [
    { key: "internalId", label: "Internal Id", group: "Employee" },
    { key: "employee", label: "Employee", group: "Employee" },
    { key: "department", label: "Department", group: "Employee" },
    { key: "position", label: "Position", group: "Employee" },
    { key: "date", label: "Date", group: "Entry" },
    { key: "project", label: "Project", group: "Entry" },
    { key: "task", label: "Task", group: "Entry" },
    { key: "startTime", label: "Start Time", group: "Entry" },
    { key: "hours", label: "Hours", group: "Entry" },
    { key: "minutes", label: "Minutes", group: "Entry" },
    { key: "billable", label: "Billable", group: "Entry" },
    { key: "description", label: "Description", group: "Entry" },
  ];

  const rows: Row[] = entries
    .map((e) => {
      const emp = byId.get(e.employeeId);
      return {
        internalId: emp?.employeeNumber ?? null,
        employee: nameOf(e.employeeId),
        department: emp?.departmentId ? (deptName.get(emp.departmentId) ?? null) : null,
        position: emp?.positionId ? (posTitle.get(emp.positionId) ?? null) : null,
        date: e.date,
        project: pName.get(e.projectId) ?? "—",
        task: e.taskId ? (tName.get(e.taskId) ?? null) : null,
        startTime: clockFrom(e.startMinute),
        hours: hoursFrom(e.minutes),
        minutes: e.minutes,
        billable: e.billable ? "Yes" : "No",
        description: e.description,
        // Newest first, then by person — a natural reading order for a timesheet.
        _sort: `${e.date}|${nameOf(e.employeeId)}`,
      };
    })
    .sort((a, b) => String(b._sort).localeCompare(String(a._sort)))
    .map(({ _sort, ...r }) => r);
  return { columns, rows };
}

// ─── Public query ──────────────────────────────────────────────────────────

export const dataset = query({
  args: {
    report: v.string(),
    // Date scope for date-filterable reports; ignored by the rest.
    month: v.optional(v.number()),
    year: v.optional(v.number()),
  },
  returns: v.union(
    v.null(),
    v.object({
      columns: v.array(
        v.object({
          key: v.string(),
          label: v.string(),
          group: v.string(),
        }),
      ),
      rows: v.array(
        v.record(v.string(), v.union(v.string(), v.number(), v.null())),
      ),
    }),
  ),
  handler: async (ctx, { report, month, year }) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return null;
    const perm = REPORT_PERMISSION[report];
    if (!perm || !ctxHasPermission(orgCtx, perm)) return null;
    return await buildReport(ctx, orgCtx, report, { month, year });
  },
});

async function buildReport(
  ctx: QueryCtx,
  orgCtx: OrgContext,
  report: string,
  period: Period,
): Promise<{ columns: Column[]; rows: Row[] } | null> {
  const orgId = orgCtx.orgId;
  switch (report) {
    case "employee_information":
      return buildEmployeeInformation(ctx, orgId);
    case "identity_documents":
      return buildIdentityDocuments(ctx, orgId);
    case "leave_balances":
      return buildLeaveBalances(ctx, orgId);
    case "leave_records":
      return buildLeaveRecords(ctx, orgId, period);
    case "expense_claims":
      return buildExpenseClaims(ctx, orgId);
    case "employee_payroll":
      return buildEmployeePayroll(ctx, orgId);
    case "company_payroll":
      return buildCompanyPayroll(ctx, orgId);
    case "performance_management":
      return buildPerformanceManagement(ctx, orgId);
    case "timesheets_project":
      return buildTimesheetsByProject(ctx, orgId);
    case "timesheet_employee":
      return buildTimesheetByEmployee(ctx, orgId);
    default:
      return null;
  }
}
