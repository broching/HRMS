import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requireOrg, getOrgContext, requirePermission } from "./auth";
import { hasPermission } from "./lib/permissions";
import { employeeByUserId } from "./employees";
import { effectiveCompensation } from "./compensation";
import { computeCpf, ageOn } from "./model/cpf";
import {
  payrollRunRow,
  payslipRow,
  payslipDetail,
  payrollWorkspace,
} from "./lib/validators";
import {
  payrollAdjustmentKind,
  payrollAdjustmentSource,
  overtimeMeta,
  claimStatus,
} from "./lib/enums";
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

// The bits of an adjustment that affect the computation. Accepts either a full
// doc or a not-yet-inserted draft.
type AdjustmentInput = Pick<
  Doc<"payrollAdjustments">,
  "kind" | "label" | "amountCents" | "cpfable" | "affectsGross"
>;

/**
 * Singapore MOM hourly rate of pay = (12 × monthly basic) / (52 × weekly hours).
 * Defaults to a 44-hour work week. Returned in cents.
 */
export function hourlyRateCents(baseMonthlyCents: number, weeklyHours = 44): number {
  if (weeklyHours <= 0) return 0;
  return Math.round((12 * baseMonthlyCents) / (52 * weeklyHours));
}

/** Overtime pay = hourly rate × multiplier × hours, in cents. */
export function overtimePayCents(
  baseMonthlyCents: number,
  hours: number,
  multiplier: number,
): number {
  return Math.round(hourlyRateCents(baseMonthlyCents) * multiplier * hours);
}

// Pure-ish: derive a payslip from a compensation record + employee dob + the
// run's one-off adjustments for this employee.
function computePayslip(
  comp: Doc<"compensation">,
  dob: string | undefined,
  periodEnd: string,
  adjustments: AdjustmentInput[],
): ComputedPayslip {
  const baseCents = comp.baseMonthlyCents;
  const compAllowancesCents = comp.allowances.reduce((s, a) => s + a.amountCents, 0);

  const additions = adjustments.filter((a) => a.kind === "addition");
  const deductions = adjustments.filter((a) => a.kind === "deduction");
  const grossDeductions = deductions.filter((d) => d.affectsGross); // pre-CPF
  const netDeductions = deductions.filter((d) => !d.affectsGross); // post-CPF

  const additionsCents = additions.reduce((s, a) => s + a.amountCents, 0);
  const grossDeductCents = grossDeductions.reduce((s, d) => s + d.amountCents, 0);
  const netDeductCents = netDeductions.reduce((s, d) => s + d.amountCents, 0);

  const allowancesCents = compAllowancesCents + additionsCents;
  const grossCents = baseCents + allowancesCents - grossDeductCents;

  // CPF Ordinary Wage = base + cpfable comp allowances + cpfable additions,
  // less any pre-CPF deductions (e.g. no-pay leave).
  const cpfableAllowances = comp.allowances
    .filter((a) => a.cpfable)
    .reduce((s, a) => s + a.amountCents, 0);
  const cpfableAdditions = additions
    .filter((a) => a.cpfable)
    .reduce((s, a) => s + a.amountCents, 0);
  const ordinaryWage = Math.max(
    0,
    baseCents + cpfableAllowances + cpfableAdditions - grossDeductCents,
  );
  const age = dob ? ageOn(dob, periodEnd) : 30; // assume prime-age band if unknown
  const cpf = computeCpf(ordinaryWage, age, comp.cpfStatus);

  const netCents = grossCents - cpf.employeeCpfCents - netDeductCents;

  const lines: ComputedPayslip["lines"] = [
    { label: "Base pay", amountCents: baseCents, type: "earning" },
    ...comp.allowances.map((a) => ({
      label: a.name,
      amountCents: a.amountCents,
      type: "earning" as const,
    })),
    ...additions.map((a) => ({
      label: a.label,
      amountCents: a.amountCents,
      type: "earning" as const,
    })),
    ...grossDeductions.map((d) => ({
      label: d.label,
      amountCents: d.amountCents,
      type: "deduction" as const,
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
  for (const d of netDeductions) {
    lines.push({ label: d.label, amountCents: d.amountCents, type: "deduction" });
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

// ─── Recompute ─────────────────────────────────────────────────────────────

// Recompute a single payslip from its employee's compensation + the run's
// adjustments for that employee, and write the snapshot back.
async function recomputePayslip(
  ctx: MutationCtx,
  slip: Doc<"payslips">,
): Promise<void> {
  const emp = await ctx.db.get(slip.employeeId);
  const periodEnd = periodEndDate(slip.periodMonth);
  const comp = await effectiveCompensation(ctx, slip.employeeId, periodEnd);
  if (!comp) return;
  const adjustments = await ctx.db
    .query("payrollAdjustments")
    .withIndex("by_run_employee", (q) =>
      q.eq("runId", slip.runId).eq("employeeId", slip.employeeId),
    )
    .collect();
  const computed = computePayslip(comp, emp?.dob, periodEnd, adjustments);
  await ctx.db.patch(slip._id, {
    baseCents: computed.baseCents,
    allowancesCents: computed.allowancesCents,
    grossCents: computed.grossCents,
    cpfableWageCents: computed.cpfableWageCents,
    employeeCpfCents: computed.employeeCpfCents,
    employerCpfCents: computed.employerCpfCents,
    netCents: computed.netCents,
    cpfStatus: computed.cpfStatus,
    lines: computed.lines,
  });
}

// Re-sum the run's denormalized totals from its payslips.
async function recomputeRunTotals(
  ctx: MutationCtx,
  runId: Id<"payrollRuns">,
): Promise<void> {
  const slips = await ctx.db
    .query("payslips")
    .withIndex("by_run", (q) => q.eq("runId", runId))
    .collect();
  let grossCents = 0;
  let employeeCpfCents = 0;
  let employerCpfCents = 0;
  let netCents = 0;
  for (const s of slips) {
    grossCents += s.grossCents;
    employeeCpfCents += s.employeeCpfCents;
    employerCpfCents += s.employerCpfCents;
    netCents += s.netCents;
  }
  await ctx.db.patch(runId, {
    grossCents,
    employeeCpfCents,
    employerCpfCents,
    netCents,
    payslipCount: slips.length,
  });
}

// Resolve a draft run + the caller's payslip for an employee, enforcing org
// scope and the run being editable. Shared by the adjustment mutations.
async function requireEditablePayslip(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  runId: Id<"payrollRuns">,
  employeeId: Id<"employees">,
): Promise<{ run: Doc<"payrollRuns">; slip: Doc<"payslips"> }> {
  const run = await ctx.db.get(runId);
  if (!run || run.orgId !== orgId) throw new Error("Run not found.");
  if (run.status !== "draft") {
    throw new Error("Only draft runs can be edited.");
  }
  const slip = await ctx.db
    .query("payslips")
    .withIndex("by_run_employee", (q) =>
      q.eq("runId", runId).eq("employeeId", employeeId),
    )
    .first();
  if (!slip) throw new Error("No payslip for this employee in the run.");
  return { run, slip };
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
      const slip = computePayslip(comp, e.dob, periodEnd, []);
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

    // Any claims that were pulled into this run are now reimbursed via payroll —
    // close them out so they can't be re-pulled into a future run.
    const claimAdjustments = await ctx.db
      .query("payrollAdjustments")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
    for (const adj of claimAdjustments) {
      if (adj.source !== "claim" || !adj.sourceRefId) continue;
      const claim = await ctx.db.get(adj.sourceRefId as Id<"claims">);
      if (!claim || claim.orgId !== orgId) continue;
      if (claim.status === "reimbursed") continue;
      await ctx.db.patch(claim._id, {
        status: "reimbursed",
        reimbursedAt: Date.now(),
      });
    }

    // Notify each employee that their payslip has been released.
    const slips = await ctx.db
      .query("payslips")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
    const label = monthLabel(run.periodMonth);
    for (const slip of slips) {
      if (slip.orgId !== orgId) continue;
      const emp = await ctx.db.get(slip.employeeId);
      if (!emp?.userId) continue;
      await ctx.db.insert("notifications", {
        orgId,
        recipientUserId: emp.userId,
        type: "payroll.payslip_released",
        title: "Payslip available",
        body: `Your payslip for ${label} has been released.`,
        entityRef: { table: "payslips", id: slip._id },
        read: false,
      });
    }
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
    const adjustments = await ctx.db
      .query("payrollAdjustments")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
    for (const a of adjustments) await ctx.db.delete(a._id);
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

// ─── Adjustments (Step 1: Adjust payroll) ────────────────────────────────────

export const addAdjustment = mutation({
  args: {
    runId: v.id("payrollRuns"),
    employeeId: v.id("employees"),
    kind: payrollAdjustmentKind,
    source: payrollAdjustmentSource,
    label: v.string(),
    amountCents: v.optional(v.number()),
    cpfable: v.optional(v.boolean()),
    affectsGross: v.optional(v.boolean()),
    note: v.optional(v.string()),
    overtime: v.optional(overtimeMeta),
  },
  returns: v.id("payrollAdjustments"),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(ctx, "payroll:manage");
    const { run, slip } = await requireEditablePayslip(
      ctx,
      orgId,
      args.runId,
      args.employeeId,
    );

    let amountCents = args.amountCents ?? 0;
    if (args.source === "overtime") {
      if (!args.overtime) throw new Error("Overtime hours are required.");
      const periodEnd = periodEndDate(run.periodMonth);
      const comp = await effectiveCompensation(ctx, args.employeeId, periodEnd);
      if (!comp) throw new Error("No compensation on file for this employee.");
      amountCents = overtimePayCents(
        comp.baseMonthlyCents,
        args.overtime.hours,
        args.overtime.multiplier,
      );
    }
    if (amountCents <= 0) throw new Error("Amount must be greater than zero.");

    const label = args.label.trim();
    if (!label) throw new Error("A label is required.");

    const adjustmentId = await ctx.db.insert("payrollAdjustments", {
      orgId,
      runId: args.runId,
      employeeId: args.employeeId,
      kind: args.kind,
      source: args.source,
      label,
      amountCents,
      cpfable: args.cpfable ?? args.source === "overtime",
      affectsGross: args.affectsGross ?? args.source === "unpaid_leave",
      note: args.note?.trim() || undefined,
      overtime: args.source === "overtime" ? args.overtime : undefined,
      createdBy: userId,
    });

    await recomputePayslip(ctx, slip);
    await recomputeRunTotals(ctx, args.runId);
    return adjustmentId;
  },
});

export const updateAdjustment = mutation({
  args: {
    adjustmentId: v.id("payrollAdjustments"),
    label: v.optional(v.string()),
    amountCents: v.optional(v.number()),
    cpfable: v.optional(v.boolean()),
    affectsGross: v.optional(v.boolean()),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { orgId } = await requirePermission(ctx, "payroll:manage");
    const adj = await ctx.db.get(args.adjustmentId);
    if (!adj || adj.orgId !== orgId) throw new Error("Adjustment not found.");
    const { slip } = await requireEditablePayslip(
      ctx,
      orgId,
      adj.runId,
      adj.employeeId,
    );

    const patch: Partial<Doc<"payrollAdjustments">> = {};
    if (args.label !== undefined) {
      const label = args.label.trim();
      if (!label) throw new Error("A label is required.");
      patch.label = label;
    }
    if (args.amountCents !== undefined) {
      if (args.amountCents <= 0) throw new Error("Amount must be greater than zero.");
      patch.amountCents = args.amountCents;
    }
    if (args.cpfable !== undefined) patch.cpfable = args.cpfable;
    if (args.affectsGross !== undefined) patch.affectsGross = args.affectsGross;
    if (args.note !== undefined) patch.note = args.note.trim() || undefined;

    await ctx.db.patch(args.adjustmentId, patch);
    await recomputePayslip(ctx, slip);
    await recomputeRunTotals(ctx, adj.runId);
    return null;
  },
});

export const removeAdjustment = mutation({
  args: { adjustmentId: v.id("payrollAdjustments") },
  returns: v.null(),
  handler: async (ctx, { adjustmentId }) => {
    const { orgId } = await requirePermission(ctx, "payroll:manage");
    const adj = await ctx.db.get(adjustmentId);
    if (!adj || adj.orgId !== orgId) throw new Error("Adjustment not found.");
    const { slip } = await requireEditablePayslip(
      ctx,
      orgId,
      adj.runId,
      adj.employeeId,
    );
    await ctx.db.delete(adjustmentId);
    await recomputePayslip(ctx, slip);
    await recomputeRunTotals(ctx, adj.runId);
    return null;
  },
});

// Bulk-add one item type across many employees ("Add items in bulk").
export const addAdjustmentsBulk = mutation({
  args: {
    runId: v.id("payrollRuns"),
    kind: payrollAdjustmentKind,
    source: payrollAdjustmentSource,
    label: v.string(),
    cpfable: v.optional(v.boolean()),
    affectsGross: v.optional(v.boolean()),
    items: v.array(
      v.object({
        employeeId: v.id("employees"),
        amountCents: v.number(),
      }),
    ),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(ctx, "payroll:manage");
    const run = await ctx.db.get(args.runId);
    if (!run || run.orgId !== orgId) throw new Error("Run not found.");
    if (run.status !== "draft") throw new Error("Only draft runs can be edited.");
    const label = args.label.trim();
    if (!label) throw new Error("A label is required.");

    let added = 0;
    const touched = new Set<Id<"payslips">>();
    for (const item of args.items) {
      if (item.amountCents <= 0) continue;
      const slip = await ctx.db
        .query("payslips")
        .withIndex("by_run_employee", (q) =>
          q.eq("runId", args.runId).eq("employeeId", item.employeeId),
        )
        .first();
      if (!slip) continue;
      await ctx.db.insert("payrollAdjustments", {
        orgId,
        runId: args.runId,
        employeeId: item.employeeId,
        kind: args.kind,
        source: args.source,
        label,
        amountCents: item.amountCents,
        cpfable: args.cpfable ?? false,
        affectsGross: args.affectsGross ?? false,
        createdBy: userId,
      });
      touched.add(slip._id);
      added += 1;
    }
    for (const slipId of touched) {
      const slip = await ctx.db.get(slipId);
      if (slip) await recomputePayslip(ctx, slip);
    }
    await recomputeRunTotals(ctx, args.runId);
    return added;
  },
});

// Pull approved claims and/or unpaid leave for the period into the run as
// adjustments. Idempotent — items already pulled (by source ref) are skipped.
export const syncAutoItems = mutation({
  args: {
    runId: v.id("payrollRuns"),
    sources: v.array(
      v.union(v.literal("claim"), v.literal("unpaid_leave")),
    ),
  },
  returns: v.object({ claims: v.number(), unpaidLeave: v.number() }),
  handler: async (ctx, { runId, sources }) => {
    const { orgId, userId } = await requirePermission(ctx, "payroll:manage");
    const run = await ctx.db.get(runId);
    if (!run || run.orgId !== orgId) throw new Error("Run not found.");
    if (run.status !== "draft") throw new Error("Only draft runs can be edited.");

    // Employees that actually have a payslip in this run.
    const slips = await ctx.db
      .query("payslips")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
    const slipByEmployee = new Map<Id<"employees">, Doc<"payslips">>();
    for (const s of slips) slipByEmployee.set(s.employeeId, s);

    // Already-pulled source refs, so re-syncing doesn't duplicate.
    const existing = await ctx.db
      .query("payrollAdjustments")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
    const pulled = new Set(
      existing.filter((a) => a.sourceRefId).map((a) => a.sourceRefId as string),
    );

    const touched = new Set<Id<"payslips">>();
    let claimsAdded = 0;
    let unpaidLeaveAdded = 0;

    if (sources.includes("claim")) {
      const claims = await ctx.db
        .query("claims")
        .withIndex("by_org_status", (q) =>
          q.eq("orgId", orgId).eq("status", "approved"),
        )
        .collect();
      for (const claim of claims) {
        if (!claim.incurredDate.startsWith(run.periodMonth)) continue;
        if (!claim.sentToPayroll) continue; // only claims queued for payroll
        if (pulled.has(claim._id)) continue;
        const slip = slipByEmployee.get(claim.employeeId);
        if (!slip) continue;
        const claimType = await ctx.db.get(claim.claimTypeId);
        await ctx.db.insert("payrollAdjustments", {
          orgId,
          runId,
          employeeId: claim.employeeId,
          kind: "addition",
          source: "claim",
          label: `Claim — ${claimType?.name ?? claim.description}`,
          amountCents: claim.amountCents,
          cpfable: false, // expense reimbursements are not CPF-able
          affectsGross: false,
          sourceRefId: claim._id,
          createdBy: userId,
        });
        touched.add(slip._id);
        claimsAdded += 1;
      }
    }

    if (sources.includes("unpaid_leave")) {
      const requests = await ctx.db
        .query("leaveRequests")
        .withIndex("by_org_status", (q) =>
          q.eq("orgId", orgId).eq("status", "approved"),
        )
        .collect();
      for (const req of requests) {
        if (!req.startDate.startsWith(run.periodMonth)) continue;
        if (pulled.has(req._id)) continue;
        const slip = slipByEmployee.get(req.employeeId);
        if (!slip) continue;
        const leaveType = await ctx.db.get(req.leaveTypeId);
        if (!leaveType || leaveType.paid) continue; // only no-pay leave
        const periodEnd = periodEndDate(run.periodMonth);
        const comp = await effectiveCompensation(ctx, req.employeeId, periodEnd);
        if (!comp) continue;
        // MOM convention: daily rate = monthly basic / 26 working days.
        const dailyRate = Math.round(comp.baseMonthlyCents / 26);
        const amountCents = Math.round(dailyRate * req.totalDays);
        if (amountCents <= 0) continue;
        await ctx.db.insert("payrollAdjustments", {
          orgId,
          runId,
          employeeId: req.employeeId,
          kind: "deduction",
          source: "unpaid_leave",
          label: `No-pay leave — ${req.totalDays} day(s)`,
          amountCents,
          cpfable: false,
          affectsGross: true, // reduces gross + CPF-able wage
          sourceRefId: req._id,
          createdBy: userId,
        });
        touched.add(slip._id);
        unpaidLeaveAdded += 1;
      }
    }

    for (const slipId of touched) {
      const slip = await ctx.db.get(slipId);
      if (slip) await recomputePayslip(ctx, slip);
    }
    await recomputeRunTotals(ctx, runId);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "payroll.sync_items",
      entity: "payrollRuns",
      entityId: runId,
      after: { claimsAdded, unpaidLeaveAdded },
    });
    return { claims: claimsAdded, unpaidLeave: unpaidLeaveAdded };
  },
});

// ─── Roster editing (add / remove employees) ─────────────────────────────────

// Add an employee to a draft run. Requires compensation on file for the period;
// creates their draft payslip and re-sums totals. No-op-safe against duplicates.
export const addEmployeeToRun = mutation({
  args: { runId: v.id("payrollRuns"), employeeId: v.id("employees") },
  returns: v.null(),
  handler: async (ctx, { runId, employeeId }) => {
    const { orgId, userId } = await requirePermission(ctx, "payroll:manage");
    const run = await ctx.db.get(runId);
    if (!run || run.orgId !== orgId) throw new Error("Run not found.");
    if (run.status !== "draft") throw new Error("Only draft runs can be edited.");
    const emp = await ctx.db.get(employeeId);
    if (!emp || emp.orgId !== orgId) throw new Error("Employee not found.");

    const existing = await ctx.db
      .query("payslips")
      .withIndex("by_run_employee", (q) =>
        q.eq("runId", runId).eq("employeeId", employeeId),
      )
      .first();
    if (existing) throw new Error("This employee is already in the run.");

    const periodEnd = periodEndDate(run.periodMonth);
    const comp = await effectiveCompensation(ctx, employeeId, periodEnd);
    if (!comp) {
      throw new Error("This employee has no compensation on file for this period.");
    }
    const slip = computePayslip(comp, emp.dob, periodEnd, []);
    await ctx.db.insert("payslips", {
      orgId,
      runId,
      employeeId,
      periodMonth: run.periodMonth,
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
    await recomputeRunTotals(ctx, runId);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "payroll.add_employee",
      entity: "payrollRuns",
      entityId: runId,
      after: { employeeId },
    });
    return null;
  },
});

// Exclude an employee from a draft run — deletes their payslip and any
// adjustments (including pulled claims/leave), then re-sums totals.
export const removeEmployeeFromRun = mutation({
  args: { runId: v.id("payrollRuns"), employeeId: v.id("employees") },
  returns: v.null(),
  handler: async (ctx, { runId, employeeId }) => {
    const { orgId, userId } = await requirePermission(ctx, "payroll:manage");
    const run = await ctx.db.get(runId);
    if (!run || run.orgId !== orgId) throw new Error("Run not found.");
    if (run.status !== "draft") throw new Error("Only draft runs can be edited.");
    const slip = await ctx.db
      .query("payslips")
      .withIndex("by_run_employee", (q) =>
        q.eq("runId", runId).eq("employeeId", employeeId),
      )
      .first();
    if (!slip) throw new Error("No payslip for this employee in the run.");

    const adjustments = await ctx.db
      .query("payrollAdjustments")
      .withIndex("by_run_employee", (q) =>
        q.eq("runId", runId).eq("employeeId", employeeId),
      )
      .collect();
    for (const a of adjustments) await ctx.db.delete(a._id);
    await ctx.db.delete(slip._id);
    await recomputeRunTotals(ctx, runId);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "payroll.remove_employee",
      entity: "payrollRuns",
      entityId: runId,
      after: { employeeId },
    });
    return null;
  },
});

// ─── Per-claim pull ──────────────────────────────────────────────────────────

// Pull specific approved claims into the run as reimbursement additions. Unlike
// `syncAutoItems`, selection is explicit — the caller has reviewed each claim's
// status. Skips claims that aren't approved, are already reimbursed, are already
// pulled, or whose employee isn't in the run. Marks pulled claims as queued for
// payroll so they aren't double-handled elsewhere.
export const pullClaims = mutation({
  args: { runId: v.id("payrollRuns"), claimIds: v.array(v.id("claims")) },
  returns: v.number(),
  handler: async (ctx, { runId, claimIds }) => {
    const { orgId, userId } = await requirePermission(ctx, "payroll:manage");
    const run = await ctx.db.get(runId);
    if (!run || run.orgId !== orgId) throw new Error("Run not found.");
    if (run.status !== "draft") throw new Error("Only draft runs can be edited.");

    const slips = await ctx.db
      .query("payslips")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
    const slipByEmployee = new Map<Id<"employees">, Doc<"payslips">>();
    for (const s of slips) slipByEmployee.set(s.employeeId, s);

    const existing = await ctx.db
      .query("payrollAdjustments")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
    const pulled = new Set(
      existing.filter((a) => a.sourceRefId).map((a) => a.sourceRefId as string),
    );

    const touched = new Set<Id<"payslips">>();
    let added = 0;
    for (const claimId of claimIds) {
      const claim = await ctx.db.get(claimId);
      if (!claim || claim.orgId !== orgId) continue;
      if (claim.status !== "approved") continue; // approved, not yet reimbursed
      if (claim.reimbursedAt) continue;
      if (pulled.has(claim._id)) continue;
      const slip = slipByEmployee.get(claim.employeeId);
      if (!slip) continue;
      const claimType = await ctx.db.get(claim.claimTypeId);
      await ctx.db.insert("payrollAdjustments", {
        orgId,
        runId,
        employeeId: claim.employeeId,
        kind: "addition",
        source: "claim",
        label: `Claim — ${claimType?.name ?? claim.description}`,
        amountCents: claim.amountCents,
        cpfable: false, // expense reimbursements are not CPF-able
        affectsGross: false,
        sourceRefId: claim._id,
        createdBy: userId,
      });
      if (!claim.sentToPayroll) {
        await ctx.db.patch(claim._id, { sentToPayroll: true });
      }
      touched.add(slip._id);
      added += 1;
    }
    for (const slipId of touched) {
      const slip = await ctx.db.get(slipId);
      if (slip) await recomputePayslip(ctx, slip);
    }
    await recomputeRunTotals(ctx, runId);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "payroll.pull_claims",
      entity: "payrollRuns",
      entityId: runId,
      after: { added },
    });
    return added;
  },
});

// ─── Queries ─────────────────────────────────────────────────────────────────

// The Adjust-Payroll / Review workspace: run + each payslip with its raw
// adjustments + the "validate items" banner counts.
export const getRunWorkspace = query({
  args: { runId: v.id("payrollRuns") },
  returns: v.union(payrollWorkspace, v.null()),
  handler: async (ctx, { runId }) => {
    const { orgId } = await requirePermission(ctx, "payroll:manage");
    const run = await ctx.db.get(runId);
    if (!run || run.orgId !== orgId) return null;

    const slips = await ctx.db
      .query("payslips")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();

    const payslips = await Promise.all(
      slips.map(async (s) => {
        const emp = await ctx.db.get(s.employeeId);
        const [dept, position, photoUrl, adjustments] = await Promise.all([
          emp?.departmentId ? ctx.db.get(emp.departmentId) : Promise.resolve(null),
          emp?.positionId ? ctx.db.get(emp.positionId) : Promise.resolve(null),
          emp?.photoStorageId
            ? ctx.storage.getUrl(emp.photoStorageId)
            : Promise.resolve(null),
          ctx.db
            .query("payrollAdjustments")
            .withIndex("by_run_employee", (q) =>
              q.eq("runId", runId).eq("employeeId", s.employeeId),
            )
            .collect(),
        ]);
        const comp = await effectiveCompensation(
          ctx,
          s.employeeId,
          periodEndDate(s.periodMonth),
        );
        return {
          _id: s._id,
          employeeId: s.employeeId,
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
          employeePhotoUrl: photoUrl,
          positionTitle: position?.title ?? null,
          departmentName: dept?.name ?? null,
          currency: s.currency,
          baseCents: s.baseCents,
          allowances: comp?.allowances ?? [],
          grossCents: s.grossCents,
          cpfableWageCents: s.cpfableWageCents,
          employeeCpfCents: s.employeeCpfCents,
          employerCpfCents: s.employerCpfCents,
          netCents: s.netCents,
          cpfStatus: s.cpfStatus,
          adjustments: adjustments
            .map((a) => ({
              _id: a._id,
              _creationTime: a._creationTime,
              employeeId: a.employeeId,
              kind: a.kind,
              source: a.source,
              label: a.label,
              amountCents: a.amountCents,
              cpfable: a.cpfable,
              affectsGross: a.affectsGross,
              note: a.note ?? null,
              overtime: a.overtime ?? null,
            }))
            .sort((x, y) => x._creationTime - y._creationTime),
        };
      }),
    );
    payslips.sort((a, b) => a.employeeName.localeCompare(b.employeeName));

    // "Validate items" banner counts.
    const empIds = new Set(slips.map((s) => s.employeeId));
    const approvedClaims = await ctx.db
      .query("claims")
      .withIndex("by_org_status", (q) =>
        q.eq("orgId", orgId).eq("status", "approved"),
      )
      .collect();
    const claimsCount = approvedClaims.filter(
      (c) =>
        c.incurredDate.startsWith(run.periodMonth) &&
        empIds.has(c.employeeId) &&
        c.sentToPayroll,
    ).length;

    const approvedLeave = await ctx.db
      .query("leaveRequests")
      .withIndex("by_org_status", (q) =>
        q.eq("orgId", orgId).eq("status", "approved"),
      )
      .collect();
    let unpaidLeaveDays = 0;
    for (const req of approvedLeave) {
      if (!req.startDate.startsWith(run.periodMonth)) continue;
      if (!empIds.has(req.employeeId)) continue;
      const leaveType = await ctx.db.get(req.leaveTypeId);
      if (leaveType && !leaveType.paid) unpaidLeaveDays += req.totalDays;
    }

    const overtime = payslips.reduce(
      (n, p) => n + p.adjustments.filter((a) => a.source === "overtime").length,
      0,
    );

    return {
      run: runRow(run),
      payslips,
      available: { claims: claimsCount, unpaidLeaveDays, overtime },
    };
  },
});

// Active employees with compensation on file who are NOT yet in this draft run
// — the candidate list for "Add employee".
export const addableEmployees = query({
  args: { runId: v.id("payrollRuns") },
  returns: v.array(
    v.object({
      employeeId: v.id("employees"),
      name: v.string(),
      positionTitle: v.union(v.string(), v.null()),
      baseCents: v.number(),
      currency: v.string(),
    }),
  ),
  handler: async (ctx, { runId }) => {
    const { orgId } = await requirePermission(ctx, "payroll:manage");
    const run = await ctx.db.get(runId);
    if (!run || run.orgId !== orgId) return [];

    const slips = await ctx.db
      .query("payslips")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
    const inRun = new Set(slips.map((s) => s.employeeId));

    const periodEnd = periodEndDate(run.periodMonth);
    const employees = (
      await ctx.db
        .query("employees")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .collect()
    ).filter((e) => e.status !== "terminated" && !e.isVacant && !inRun.has(e._id));

    const rows: {
      employeeId: Id<"employees">;
      name: string;
      positionTitle: string | null;
      baseCents: number;
      currency: string;
    }[] = [];
    for (const e of employees) {
      const comp = await effectiveCompensation(ctx, e._id, periodEnd);
      if (!comp) continue; // only employees payroll can actually compute
      const position = e.positionId ? await ctx.db.get(e.positionId) : null;
      rows.push({
        employeeId: e._id,
        name: `${e.firstName} ${e.lastName}`,
        positionTitle: position?.title ?? null,
        baseCents: comp.baseMonthlyCents,
        currency: comp.currency,
      });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  },
});

// Claims in the run's period for employees in the run, with their approval /
// reimbursement status — powers the claims picker. Only approved + reimbursed
// claims are surfaced; `eligible` marks the ones that can actually be pulled
// (approved, not reimbursed, not already pulled).
export const claimsForRun = query({
  args: { runId: v.id("payrollRuns") },
  returns: v.array(
    v.object({
      claimId: v.id("claims"),
      employeeId: v.id("employees"),
      employeeName: v.string(),
      claimType: v.string(),
      description: v.string(),
      amountCents: v.number(),
      currency: v.string(),
      incurredDate: v.string(),
      status: claimStatus,
      reimbursed: v.boolean(),
      alreadyPulled: v.boolean(),
      eligible: v.boolean(),
    }),
  ),
  handler: async (ctx, { runId }) => {
    const { orgId } = await requirePermission(ctx, "payroll:manage");
    const run = await ctx.db.get(runId);
    if (!run || run.orgId !== orgId) return [];

    const slips = await ctx.db
      .query("payslips")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
    const empInRun = new Set(slips.map((s) => s.employeeId));

    const existing = await ctx.db
      .query("payrollAdjustments")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
    const pulled = new Set(
      existing
        .filter((a) => a.source === "claim" && a.sourceRefId)
        .map((a) => a.sourceRefId as string),
    );

    const claims = await ctx.db
      .query("claims")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();

    const rows: {
      claimId: Id<"claims">;
      employeeId: Id<"employees">;
      employeeName: string;
      claimType: string;
      description: string;
      amountCents: number;
      currency: string;
      incurredDate: string;
      status: Doc<"claims">["status"];
      reimbursed: boolean;
      alreadyPulled: boolean;
      eligible: boolean;
    }[] = [];
    for (const c of claims) {
      if (!empInRun.has(c.employeeId)) continue;
      if (!c.incurredDate.startsWith(run.periodMonth)) continue;
      if (c.status !== "approved" && c.status !== "reimbursed") continue;
      const emp = await ctx.db.get(c.employeeId);
      const type = await ctx.db.get(c.claimTypeId);
      const reimbursed = c.status === "reimbursed" || !!c.reimbursedAt;
      const alreadyPulled = pulled.has(c._id);
      rows.push({
        claimId: c._id,
        employeeId: c.employeeId,
        employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
        claimType: type?.name ?? "Claim",
        description: c.description,
        amountCents: c.amountCents,
        currency: c.currency,
        incurredDate: c.incurredDate,
        status: c.status,
        reimbursed,
        alreadyPulled,
        eligible: c.status === "approved" && !reimbursed && !alreadyPulled,
      });
    }
    rows.sort(
      (a, b) =>
        a.employeeName.localeCompare(b.employeeName) ||
        a.incurredDate.localeCompare(b.incurredDate),
    );
    return rows;
  },
});

// Per-employee net-pay variance vs. the previous run (latest run before this
// period). Powers the Step-3 Variance Report download.
export const varianceReport = query({
  args: { runId: v.id("payrollRuns") },
  returns: v.array(
    v.object({
      employeeName: v.string(),
      currentNetCents: v.number(),
      previousNetCents: v.union(v.number(), v.null()),
      deltaCents: v.number(),
    }),
  ),
  handler: async (ctx, { runId }) => {
    const { orgId } = await requirePermission(ctx, "payroll:manage");
    const run = await ctx.db.get(runId);
    if (!run || run.orgId !== orgId) return [];

    // The most recent earlier run for this org.
    const earlier = await ctx.db
      .query("payrollRuns")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .order("desc")
      .collect();
    const prev = earlier.find((r) => r.periodMonth < run.periodMonth);

    const prevNet = new Map<Id<"employees">, number>();
    if (prev) {
      const prevSlips = await ctx.db
        .query("payslips")
        .withIndex("by_run", (q) => q.eq("runId", prev._id))
        .collect();
      for (const s of prevSlips) prevNet.set(s.employeeId, s.netCents);
    }

    const slips = await ctx.db
      .query("payslips")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
    const rows = await Promise.all(
      slips.map(async (s) => {
        const emp = await ctx.db.get(s.employeeId);
        const previousNetCents = prevNet.has(s.employeeId)
          ? (prevNet.get(s.employeeId) as number)
          : null;
        return {
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
          currentNetCents: s.netCents,
          previousNetCents,
          deltaCents: s.netCents - (previousNetCents ?? 0),
        };
      }),
    );
    rows.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
    return rows;
  },
});

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

// Payslips for the profile Payroll section — visible to the employee themselves
// OR HR/payroll (payroll:manage). Non-draft only, most recent first.
export const forEmployeeProfile = query({
  args: { employeeId: v.id("employees") },
  returns: v.array(payslipRow),
  handler: async (ctx, { employeeId }) => {
    const orgCtx = await requireOrg(ctx);
    const employee = await ctx.db.get(employeeId);
    if (!employee || employee.orgId !== orgCtx.orgId) {
      throw new Error("Employee not found.");
    }
    const isSelf = !!employee.userId && employee.userId === orgCtx.userId;
    if (!isSelf && !hasPermission(orgCtx.role, "payroll:manage")) {
      throw new Error("Not authorized to view payslips.");
    }
    const slips = await ctx.db
      .query("payslips")
      .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
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
    const [dept, position, run] = await Promise.all([
      emp?.departmentId ? ctx.db.get(emp.departmentId) : Promise.resolve(null),
      emp?.positionId ? ctx.db.get(emp.positionId) : Promise.resolve(null),
      ctx.db.get(slip.runId),
    ]);
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
      companyName: orgCtx.org.name,
      employeeNumber: emp?.employeeNumber ?? "—",
      departmentName: dept?.name ?? null,
      positionTitle: position?.title ?? null,
      payPeriodStart: `${slip.periodMonth}-01`,
      payPeriodEnd: periodEndDate(slip.periodMonth),
      payDate: run?.payDate ?? null,
    };
  },
});
