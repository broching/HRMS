import { query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getOrgContext, OrgContext } from "./auth";
import { hasPermission, Permission } from "./lib/permissions";

/**
 * HR Lounge → Reports → Report builder. A single generic `dataset` query that
 * returns a report's column definitions + rows for the selected report key.
 * The client toggles/filters columns and exports to CSV/Excel. Each report is
 * gated by the permission appropriate to its data (all held by HR + admin).
 */

type Cell = string | number | null;
type Row = Record<string, Cell>;
type Column = { key: string; label: string; group: string };

// Report key → the permission required to pull it.
const REPORT_PERMISSION: Record<string, Permission> = {
  employee_information: "employees:read:all",
  identity_documents: "employees:read:all",
  leave_balances: "leave:approve:all",
  expense_claims: "claims:approve:finance",
  employee_payroll: "payroll:manage",
  company_payroll: "payroll:manage",
  performance_management: "performance:manage",
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

// ─── Public query ──────────────────────────────────────────────────────────

export const dataset = query({
  args: { report: v.string() },
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
  handler: async (ctx, { report }) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return null;
    const perm = REPORT_PERMISSION[report];
    if (!perm || !hasPermission(orgCtx.role, perm)) return null;
    return await buildReport(ctx, orgCtx, report);
  },
});

async function buildReport(
  ctx: QueryCtx,
  orgCtx: OrgContext,
  report: string,
): Promise<{ columns: Column[]; rows: Row[] } | null> {
  const orgId = orgCtx.orgId;
  switch (report) {
    case "employee_information":
      return buildEmployeeInformation(ctx, orgId);
    case "identity_documents":
      return buildIdentityDocuments(ctx, orgId);
    case "leave_balances":
      return buildLeaveBalances(ctx, orgId);
    case "expense_claims":
      return buildExpenseClaims(ctx, orgId);
    case "employee_payroll":
      return buildEmployeePayroll(ctx, orgId);
    case "company_payroll":
      return buildCompanyPayroll(ctx, orgId);
    case "performance_management":
      return buildPerformanceManagement(ctx, orgId);
    default:
      return null;
  }
}
