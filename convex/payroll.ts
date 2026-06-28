import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requireOrg, getOrgContext, requirePermission } from "./auth";
import { hasPermission } from "./lib/permissions";
import { employeeByUserId } from "./employees";
import { effectiveCompensation } from "./compensation";
import { computeCpf, ageOn } from "./model/cpf";
import { payrollRunRow, payslipRow, payslipDetail } from "./lib/validators";
import { writeAuditLog } from "./lib/audit";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PERIOD_RE = /^\d{4}-\d{2}$/;

// Last calendar day of a "YYYY-MM" period, as ISO "YYYY-MM-DD".
function periodEndDate(periodMonth: string): string {
  const [y, m] = periodMonth.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${periodMonth}-${String(last).padStart(2, "0")}`;
}

function monthLabel(periodMonth: string): string {
  const [y, m] = periodMonth.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

interface ComputedPayslip {
  baseCents: number;
  allowancesCents: number;
  grossCents: number;
  cpfableWageCents: number;
  employeeCpfCents: number;
  employerCpfCents: number;
  netCents: number;
  cpfStatus: Doc<"compensation">["cpfStatus"];
  lines: { label: string; amountCents: number; type: "earning" | "deduction" | "employer" }[];
}

// Pure-ish: derive a payslip from a compensation record + employee dob.
function computePayslip(
  comp: Doc<"compensation">,
  dob: string | undefined,
  periodEnd: string,
): ComputedPayslip {
  const baseCents = comp.baseMonthlyCents;
  const allowancesCents = comp.allowances.reduce((s, a) => s + a.amountCents, 0);
  const grossCents = baseCents + allowancesCents;

  const cpfableAllowances = comp.allowances
    .filter((a) => a.cpfable)
    .reduce((s, a) => s + a.amountCents, 0);
  const ordinaryWage = baseCents + cpfableAllowances;
  const age = dob ? ageOn(dob, periodEnd) : 30; // assume prime-age band if unknown
  const cpf = computeCpf(ordinaryWage, age, comp.cpfStatus);

  const netCents = grossCents - cpf.employeeCpfCents;

  const lines: ComputedPayslip["lines"] = [
    { label: "Base pay", amountCents: baseCents, type: "earning" },
    ...comp.allowances.map((a) => ({
      label: a.name,
      amountCents: a.amountCents,
      type: "earning" as const,
    })),
  ];
  if (cpf.employeeCpfCents > 0) {
    lines.push({
      label: "CPF (employee)",
      amountCents: cpf.employeeCpfCents,
      type: "deduction",
    });
  }
  if (cpf.employerCpfCents > 0) {
    lines.push({
      label: "CPF (employer)",
      amountCents: cpf.employerCpfCents,
      type: "employer",
    });
  }

  return {
    baseCents,
    allowancesCents,
    grossCents,
    cpfableWageCents: cpf.cpfableWageCents,
    employeeCpfCents: cpf.employeeCpfCents,
    employerCpfCents: cpf.employerCpfCents,
    netCents,
    cpfStatus: comp.cpfStatus,
    lines,
  };
}

function runRow(run: Doc<"payrollRuns">) {
  return {
    _id: run._id,
    _creationTime: run._creationTime,
    periodMonth: run.periodMonth,
    label: run.label,
    currency: run.currency,
    status: run.status,
    payDate: run.payDate ?? null,
    grossCents: run.grossCents,
    employeeCpfCents: run.employeeCpfCents,
    employerCpfCents: run.employerCpfCents,
    netCents: run.netCents,
    payslipCount: run.payslipCount,
  };
}

async function hydratePayslip(ctx: QueryCtx, p: Doc<"payslips">) {
  const emp = await ctx.db.get(p.employeeId);
  return {
    _id: p._id,
    _creationTime: p._creationTime,
    employeeId: p.employeeId,
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
    periodMonth: p.periodMonth,
    currency: p.currency,
    grossCents: p.grossCents,
    employeeCpfCents: p.employeeCpfCents,
    employerCpfCents: p.employerCpfCents,
    netCents: p.netCents,
    status: p.status,
  };
}

// ─── Run lifecycle ───────────────────────────────────────────────────────────

export const createRun = mutation({
  args: {
    periodMonth: v.string(),
    label: v.optional(v.string()),
    payDate: v.optional(v.string()),
  },
  returns: v.id("payrollRuns"),
  handler: async (ctx, { periodMonth, label, payDate }) => {
    const { orgId, userId, org } = await requirePermission(ctx, "payroll:manage");
    if (!PERIOD_RE.test(periodMonth)) {
      throw new Error("Period must be in YYYY-MM format.");
    }
    const existing = await ctx.db
      .query("payrollRuns")
      .withIndex("by_org_period", (q) =>
        q.eq("orgId", orgId).eq("periodMonth", periodMonth),
      )
      .first();
    if (existing) {
      throw new Error("A payroll run for this period already exists.");
    }

    const periodEnd = periodEndDate(periodMonth);
    const employees = (
      await ctx.db
        .query("employees")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .collect()
    ).filter((e) => e.status !== "terminated");

    const runId = await ctx.db.insert("payrollRuns", {
      orgId,
      periodMonth,
      label: label?.trim() || monthLabel(periodMonth),
      currency: org.settings.currency,
      status: "draft",
      payDate,
      grossCents: 0,
      employeeCpfCents: 0,
      employerCpfCents: 0,
      netCents: 0,
      payslipCount: 0,
      createdBy: userId,
    });

    let grossCents = 0;
    let employeeCpfCents = 0;
    let employerCpfCents = 0;
    let netCents = 0;
    let count = 0;

    for (const e of employees) {
      const comp = await effectiveCompensation(ctx, e._id, periodEnd);
      if (!comp) continue; // no salary on file yet → skip
      const slip = computePayslip(comp, e.dob, periodEnd);
      await ctx.db.insert("payslips", {
        orgId,
        runId,
        employeeId: e._id,
        periodMonth,
        currency: comp.currency,
        baseCents: slip.baseCents,
        allowancesCents: slip.allowancesCents,
        grossCents: slip.grossCents,
        cpfableWageCents: slip.cpfableWageCents,
        employeeCpfCents: slip.employeeCpfCents,
        employerCpfCents: slip.employerCpfCents,
        netCents: slip.netCents,
        cpfStatus: slip.cpfStatus,
        lines: slip.lines,
        status: "draft",
      });
      grossCents += slip.grossCents;
      employeeCpfCents += slip.employeeCpfCents;
      employerCpfCents += slip.employerCpfCents;
      netCents += slip.netCents;
      count += 1;
    }

    await ctx.db.patch(runId, {
      grossCents,
      employeeCpfCents,
      employerCpfCents,
      netCents,
      payslipCount: count,
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "payroll.create_run",
      entity: "payrollRuns",
      entityId: runId,
      after: { periodMonth, count, grossCents },
    });
    return runId;
  },
});

async function setRunStatus(
  ctx: MutationCtx,
  runId: Id<"payrollRuns">,
  status: "finalized" | "paid",
  orgId: Id<"organizations">,
) {
  const slips = await ctx.db
    .query("payslips")
    .withIndex("by_run", (q) => q.eq("runId", runId))
    .collect();
  for (const s of slips) {
    if (s.orgId === orgId) await ctx.db.patch(s._id, { status });
  }
}

export const finalizeRun = mutation({
  args: { runId: v.id("payrollRuns") },
  returns: v.null(),
  handler: async (ctx, { runId }) => {
    const { orgId, userId } = await requirePermission(ctx, "payroll:manage");
    const run = await ctx.db.get(runId);
    if (!run || run.orgId !== orgId) throw new Error("Run not found.");
    if (run.status !== "draft") throw new Error("Only draft runs can be finalized.");
    await ctx.db.patch(runId, { status: "finalized", finalizedAt: Date.now() });
    await setRunStatus(ctx, runId, "finalized", orgId);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "payroll.finalize",
      entity: "payrollRuns",
      entityId: runId,
    });
    return null;
  },
});

export const markPaid = mutation({
  args: { runId: v.id("payrollRuns"), payDate: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { runId, payDate }) => {
    const { orgId, userId } = await requirePermission(ctx, "payroll:manage");
    const run = await ctx.db.get(runId);
    if (!run || run.orgId !== orgId) throw new Error("Run not found.");
    if (run.status !== "finalized") {
      throw new Error("Only finalized runs can be marked paid.");
    }
    await ctx.db.patch(runId, {
      status: "paid",
      paidAt: Date.now(),
      payDate: payDate ?? run.payDate ?? new Date().toISOString().slice(0, 10),
    });
    await setRunStatus(ctx, runId, "paid", orgId);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "payroll.mark_paid",
      entity: "payrollRuns",
      entityId: runId,
    });
    return null;
  },
});

export const deleteRun = mutation({
  args: { runId: v.id("payrollRuns") },
  returns: v.null(),
  handler: async (ctx, { runId }) => {
    const { orgId, userId } = await requirePermission(ctx, "payroll:manage");
    const run = await ctx.db.get(runId);
    if (!run || run.orgId !== orgId) throw new Error("Run not found.");
    if (run.status !== "draft") throw new Error("Only draft runs can be deleted.");
    const slips = await ctx.db
      .query("payslips")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
    for (const s of slips) await ctx.db.delete(s._id);
    await ctx.db.delete(runId);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "payroll.delete_run",
      entity: "payrollRuns",
      entityId: runId,
    });
    return null;
  },
});

// ─── Queries ─────────────────────────────────────────────────────────────────

export const listRuns = query({
  args: {},
  returns: v.array(payrollRunRow),
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "payroll:manage");
    const runs = await ctx.db
      .query("payrollRuns")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .order("desc")
      .take(60);
    return runs.map(runRow);
  },
});

export const getRun = query({
  args: { runId: v.id("payrollRuns") },
  returns: v.union(
    v.object({
      run: payrollRunRow,
      payslips: v.array(payslipRow),
    }),
    v.null(),
  ),
  handler: async (ctx, { runId }) => {
    const { orgId } = await requirePermission(ctx, "payroll:manage");
    const run = await ctx.db.get(runId);
    if (!run || run.orgId !== orgId) return null;
    const slips = await ctx.db
      .query("payslips")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
    const payslips = await Promise.all(slips.map((s) => hydratePayslip(ctx, s)));
    payslips.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
    return { run: runRow(run), payslips };
  },
});

// The caller's own payslips (only from finalized/paid runs).
export const myPayslips = query({
  args: {},
  returns: v.array(payslipRow),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    if (!own) return [];
    const slips = await ctx.db
      .query("payslips")
      .withIndex("by_employee", (q) => q.eq("employeeId", own._id))
      .order("desc")
      .take(48);
    const visible = slips.filter((s) => s.status !== "draft");
    return await Promise.all(visible.map((s) => hydratePayslip(ctx, s)));
  },
});

export const getPayslip = query({
  args: { payslipId: v.id("payslips") },
  returns: payslipDetail,
  handler: async (ctx, { payslipId }) => {
    const orgCtx = await requireOrg(ctx);
    const slip = await ctx.db.get(payslipId);
    if (!slip || slip.orgId !== orgCtx.orgId) throw new Error("Payslip not found.");

    const canManage = hasPermission(orgCtx.role, "payroll:manage");
    if (!canManage) {
      const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
      if (!own || slip.employeeId !== own._id || slip.status === "draft") {
        throw new Error("Not authorized to view this payslip.");
      }
    }
    const emp = await ctx.db.get(slip.employeeId);
    return {
      _id: slip._id,
      _creationTime: slip._creationTime,
      employeeId: slip.employeeId,
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
      periodMonth: slip.periodMonth,
      currency: slip.currency,
      baseCents: slip.baseCents,
      allowancesCents: slip.allowancesCents,
      grossCents: slip.grossCents,
      cpfableWageCents: slip.cpfableWageCents,
      employeeCpfCents: slip.employeeCpfCents,
      employerCpfCents: slip.employerCpfCents,
      netCents: slip.netCents,
      cpfStatus: slip.cpfStatus,
      lines: slip.lines,
      status: slip.status,
    };
  },
});
