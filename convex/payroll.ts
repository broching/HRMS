import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requireOrg, getOrgContext, requirePermission } from "./auth";
import { ctxHasPermission } from "./auth";
import { employeeByUserId } from "./employees";
import { effectiveCompensation } from "./compensation";
import { computeCpf, ageOn, prYearOn } from "./model/cpf";
import {
  DEFAULT_WORKING_DAYS,
  workingDaysInMonth,
  workingDaysBetween,
  proratedBaseCents,
} from "./model/proration";
import {
  shgContributionCents,
  sdlContributionCents,
  customFundCents,
} from "./model/funds";
import {
  getPayrollSettings,
  type PayrollSettingsValue,
} from "./payrollSettings";
import {
  ensureDefaultTemplate,
  resolveTemplateConfig,
} from "./payslipTemplates";
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
  claimExchangeMode,
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

interface ProrationCtx {
  totalWorkingDays: number;
  daysWorked: number;
  unpaidLeaveDays: number;
  // Set when the day counts came from an HR override rather than auto-computed.
  overridden?: boolean;
}

// The exchange fields to seed onto a fresh payslip, given the org base currency
// and the employee's compensation. Same-currency → locked at rate 1. A foreign
// employee whose comp defaults to a manual rate is seeded with it; otherwise the
// rate is left unset for HR to fetch/enter during the run.
function seedExchangeFields(
  baseCurrency: string,
  comp: Doc<"compensation">,
): {
  baseCurrency: string;
  exchangeRate?: number;
  exchangeRateDate?: string;
  exchangeMode?: "auto" | "manual";
  exchangeProvider?: string;
} {
  if (comp.currency === baseCurrency) {
    return {
      baseCurrency,
      exchangeRate: 1,
      exchangeProvider: "same",
    };
  }
  const mode = comp.exchangeMode ?? "auto";
  if (mode === "manual" && comp.manualRate && comp.manualRate > 0) {
    return {
      baseCurrency,
      exchangeRate: comp.manualRate,
      exchangeRateDate: new Date().toISOString().slice(0, 10),
      exchangeMode: "manual",
      exchangeProvider: "manual",
    };
  }
  return { baseCurrency, exchangeMode: mode };
}

// Convert a pay-currency cent amount to the run's base currency using a
// payslip's exchange rate (rate 1 when same-currency or not yet set).
function toBaseCents(cents: number, rate: number | undefined): number {
  return Math.round(cents * (rate ?? 1));
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
  prYear: number | null;
  lines: {
    label: string;
    amountCents: number;
    type: "earning" | "deduction" | "employer";
    category?: string;
  }[];
  proration: {
    totalWorkingDays: number;
    daysWorked: number;
    unpaidLeaveDays: number;
    prorated: boolean;
    overridden?: boolean;
  };
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
// run's one-off adjustments + the proration context + org fund settings.
function computePayslip(
  comp: Doc<"compensation">,
  dob: string | undefined,
  periodEnd: string,
  adjustments: AdjustmentInput[],
  proration: ProrationCtx,
  settings: PayrollSettingsValue,
  hoursWorked: number | undefined,
): ComputedPayslip {
  // Base pay: for hourly employees it's the hourly rate × hours worked (entered
  // at the adjust stage, no monthly proration); otherwise the monthly base
  // prorated by days actually worked (MOM incomplete-month formula).
  const isHourly = comp.payType === "hourly";
  const fullBase = comp.baseMonthlyCents;
  const hours = Math.max(0, hoursWorked ?? 0);
  const proratedBase = isHourly
    ? Math.round((comp.hourlyRateCents ?? 0) * hours)
    : proratedBaseCents(
        fullBase,
        proration.totalWorkingDays,
        proration.daysWorked,
      );
  // Only monthly (fixed) pay is "prorated"; hourly pay is inherently by hours.
  const isProrated = !isHourly && proratedBase !== fullBase;

  const compAllowancesCents = comp.allowances.reduce((s, a) => s + a.amountCents, 0);

  const additions = adjustments.filter((a) => a.kind === "addition");
  const deductions = adjustments.filter((a) => a.kind === "deduction");
  const employerAdjustments = adjustments.filter((a) => a.kind === "employer");
  const grossDeductions = deductions.filter((d) => d.affectsGross); // pre-CPF
  const netDeductions = deductions.filter((d) => !d.affectsGross); // post-CPF

  // Recurring compensation deductions (pre-/post-CPF like adjustments).
  const compDeductions = comp.deductions ?? [];
  const compGrossDeductions = compDeductions.filter((d) => d.affectsGross);
  const compNetDeductions = compDeductions.filter((d) => !d.affectsGross);

  const additionsCents = additions.reduce((s, a) => s + a.amountCents, 0);
  const grossDeductCents =
    grossDeductions.reduce((s, d) => s + d.amountCents, 0) +
    compGrossDeductions.reduce((s, d) => s + d.amountCents, 0);
  const netDeductCents =
    netDeductions.reduce((s, d) => s + d.amountCents, 0) +
    compNetDeductions.reduce((s, d) => s + d.amountCents, 0);

  const allowancesCents = compAllowancesCents + additionsCents;
  const grossCents = proratedBase + allowancesCents - grossDeductCents;

  // CPF Ordinary Wage = prorated base + cpfable comp allowances + cpfable
  // additions, less any pre-CPF deductions.
  const cpfableAllowances = comp.allowances
    .filter((a) => a.cpfable)
    .reduce((s, a) => s + a.amountCents, 0);
  const cpfableAdditions = additions
    .filter((a) => a.cpfable)
    .reduce((s, a) => s + a.amountCents, 0);
  const ordinaryWage = Math.max(
    0,
    proratedBase + cpfableAllowances + cpfableAdditions - grossDeductCents,
  );
  const age = dob ? ageOn(dob, periodEnd) : 30; // assume prime-age band if unknown
  // For PRs, derive the graduated contribution year from their PR-start date.
  const prYear =
    comp.cpfStatus === "pr" ? prYearOn(comp.prStartDate, periodEnd) : null;
  const cpf = computeCpf(
    ordinaryWage,
    age,
    comp.cpfStatus,
    prYear ?? 3,
    settings.cpf,
  );

  // ─── Funds (SHG deduction, SDL + custom employer contributions) ───
  const empFunds = comp.funds;
  let shgCents = 0;
  let shgLabel = "";
  if (empFunds?.shg) {
    const fund = settings.shgFunds.find(
      (f) => f.key === empFunds.shg && f.active,
    );
    if (fund) {
      shgCents = shgContributionCents(grossCents, fund.bands);
      shgLabel = fund.name;
    }
  }
  const sdlCents = empFunds?.sdlEnabled
    ? sdlContributionCents(grossCents, settings.sdl)
    : 0;
  const customDeductionFunds = (empFunds?.custom ?? [])
    .filter((c) => c.kind === "deduction")
    .map((c) => ({ name: c.name, cents: customFundCents(c, grossCents) }))
    .filter((c) => c.cents > 0);
  const customEmployerFunds = (empFunds?.custom ?? [])
    .filter((c) => c.kind === "employer")
    .map((c) => ({ name: c.name, cents: customFundCents(c, grossCents) }))
    .filter((c) => c.cents > 0);
  const customDeductCents = customDeductionFunds.reduce((s, c) => s + c.cents, 0);

  const compEmployerContribs = comp.employerContributions ?? [];

  const netCents =
    grossCents -
    cpf.employeeCpfCents -
    shgCents -
    customDeductCents -
    netDeductCents;

  // ─── Lines ───
  const lines: ComputedPayslip["lines"] = [];
  lines.push({
    label: isHourly
      ? `Base pay (${hours} hr${hours === 1 ? "" : "s"})`
      : isProrated
        ? `Base pay (${proration.daysWorked}/${proration.totalWorkingDays} days)`
        : "Base pay",
    amountCents: proratedBase,
    type: "earning",
  });
  for (const a of comp.allowances)
    lines.push({ label: a.name, amountCents: a.amountCents, type: "earning" });
  for (const a of additions)
    lines.push({ label: a.label, amountCents: a.amountCents, type: "earning" });
  for (const d of grossDeductions)
    lines.push({ label: d.label, amountCents: d.amountCents, type: "deduction" });
  for (const d of compGrossDeductions)
    lines.push({ label: d.name, amountCents: d.amountCents, type: "deduction" });
  if (cpf.employeeCpfCents > 0)
    lines.push({
      label: "CPF (employee)",
      amountCents: cpf.employeeCpfCents,
      type: "deduction",
    });
  if (shgCents > 0)
    lines.push({
      label: shgLabel,
      amountCents: shgCents,
      type: "deduction",
      category: "fund",
    });
  for (const c of customDeductionFunds)
    lines.push({
      label: c.name,
      amountCents: c.cents,
      type: "deduction",
      category: "fund",
    });
  for (const d of netDeductions)
    lines.push({ label: d.label, amountCents: d.amountCents, type: "deduction" });
  for (const d of compNetDeductions)
    lines.push({ label: d.name, amountCents: d.amountCents, type: "deduction" });
  // Employer contributions.
  if (cpf.employerCpfCents > 0)
    lines.push({
      label: "CPF (employer)",
      amountCents: cpf.employerCpfCents,
      type: "employer",
    });
  if (sdlCents > 0)
    lines.push({
      label: "SDL",
      amountCents: sdlCents,
      type: "employer",
      category: "fund",
    });
  for (const c of customEmployerFunds)
    lines.push({
      label: c.name,
      amountCents: c.cents,
      type: "employer",
      category: "fund",
    });
  for (const e of compEmployerContribs)
    lines.push({ label: e.name, amountCents: e.amountCents, type: "employer" });
  for (const a of employerAdjustments)
    lines.push({ label: a.label, amountCents: a.amountCents, type: "employer" });

  return {
    baseCents: proratedBase,
    allowancesCents,
    grossCents,
    cpfableWageCents: cpf.cpfableWageCents,
    employeeCpfCents: cpf.employeeCpfCents,
    employerCpfCents: cpf.employerCpfCents,
    netCents,
    cpfStatus: comp.cpfStatus,
    prYear,
    lines,
    proration: {
      totalWorkingDays: proration.totalWorkingDays,
      daysWorked: proration.daysWorked,
      unpaidLeaveDays: proration.unpaidLeaveDays,
      prorated: isProrated,
      overridden: proration.overridden,
    },
  };
}

// Build the proration context for an employee's payslip: total working days in
// the month, days actually worked (inside employment, minus unpaid-leave days),
// and the unpaid-leave day count. Public holidays are treated as non-working.
async function prorationContextFor(
  ctx: QueryCtx,
  employee: Doc<"employees"> | null,
  comp: Doc<"compensation">,
  periodMonth: string,
): Promise<ProrationCtx> {
  const workingDays =
    comp.workingDays && comp.workingDays.length > 0
      ? comp.workingDays
      : DEFAULT_WORKING_DAYS;

  const monthStart = `${periodMonth}-01`;
  const monthEnd = periodEndDate(periodMonth);
  const holidayRows = await ctx.db
    .query("holidays")
    .withIndex("by_org_date", (q) =>
      q.eq("orgId", comp.orgId).gte("date", monthStart).lte("date", monthEnd),
    )
    .collect();
  const holidays = new Set(holidayRows.map((h) => h.date));

  const { total, withinEmployment } = workingDaysInMonth({
    periodMonth,
    workingDays,
    holidays,
    employmentStart: employee?.joinDate,
    employmentEnd: employee?.exitDate,
  });

  // Distinct unpaid-leave working days that fall in the month.
  let unpaidLeaveDays = 0;
  if (employee) {
    const approved = await ctx.db
      .query("leaveRequests")
      .withIndex("by_employee_status", (q) =>
        q.eq("employeeId", employee._id).eq("status", "approved"),
      )
      .collect();
    const unpaidDates = new Set<string>();
    for (const req of approved) {
      if (req.startDate > monthEnd || req.endDate < monthStart) continue;
      const lt = await ctx.db.get(req.leaveTypeId);
      if (!lt || lt.paid) continue; // only no-pay leave reduces pay
      for (const d of workingDaysBetween({
        start: req.startDate,
        end: req.endDate,
        periodMonth,
        workingDays,
        holidays,
      })) {
        unpaidDates.add(d);
      }
    }
    unpaidLeaveDays = unpaidDates.size;
  }

  const daysWorked = Math.max(0, withinEmployment - unpaidLeaveDays);
  return { totalWorkingDays: total, daysWorked, unpaidLeaveDays };
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
  const autoProration = await prorationContextFor(
    ctx,
    emp,
    comp,
    slip.periodMonth,
  );
  const proration = applyProrationOverride(autoProration, slip.prorationOverride);
  const settings = await getPayrollSettings(ctx, slip.orgId);
  const computed = computePayslip(
    comp,
    emp?.dob,
    periodEnd,
    adjustments,
    proration,
    settings,
    slip.hoursWorked,
  );
  await ctx.db.patch(slip._id, {
    baseCents: computed.baseCents,
    allowancesCents: computed.allowancesCents,
    grossCents: computed.grossCents,
    cpfableWageCents: computed.cpfableWageCents,
    employeeCpfCents: computed.employeeCpfCents,
    employerCpfCents: computed.employerCpfCents,
    netCents: computed.netCents,
    cpfStatus: computed.cpfStatus,
    prYear: computed.prYear ?? undefined,
    lines: computed.lines,
    proration: computed.proration,
  });
}

// Merge an HR proration override onto the auto-computed context. The override
// supplies the day counts; unpaid-leave days are re-derived for display.
function applyProrationOverride(
  auto: ProrationCtx,
  override: Doc<"payslips">["prorationOverride"],
): ProrationCtx {
  if (!override) return auto;
  const totalWorkingDays = Math.max(0, Math.round(override.totalWorkingDays));
  const daysWorked = Math.max(
    0,
    Math.min(totalWorkingDays, Math.round(override.daysWorked)),
  );
  return {
    totalWorkingDays,
    daysWorked,
    unpaidLeaveDays: Math.max(0, totalWorkingDays - daysWorked),
    overridden: true,
  };
}

// Recompute every DRAFT payslip for an employee across open draft runs — called
// when their compensation changes so open drafts pick up new pay/funds/etc.
export async function recomputeDraftPayslipsForEmployee(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  employeeId: Id<"employees">,
): Promise<void> {
  const slips = await ctx.db
    .query("payslips")
    .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
    .collect();
  const runIds = new Set<Id<"payrollRuns">>();
  for (const slip of slips) {
    if (slip.orgId !== orgId || slip.status !== "draft") continue;
    const run = await ctx.db.get(slip.runId);
    if (!run || run.status !== "draft") continue;
    await recomputePayslip(ctx, slip);
    runIds.add(slip.runId);
  }
  for (const runId of runIds) await recomputeRunTotals(ctx, runId);
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
  // Run totals are denominated in the run's base currency; each payslip is
  // converted from its pay currency via its exchange rate (1 when same).
  for (const s of slips) {
    const rate = s.exchangeRate;
    grossCents += toBaseCents(s.grossCents, rate);
    employeeCpfCents += toBaseCents(s.employeeCpfCents, rate);
    employerCpfCents += toBaseCents(s.employerCpfCents, rate);
    netCents += toBaseCents(s.netCents, rate);
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
    templateId: v.optional(v.id("payslipTemplates")),
  },
  returns: v.id("payrollRuns"),
  handler: async (ctx, { periodMonth, label, payDate, templateId }) => {
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

    // Resolve the template (given, or ensure/seed the org default).
    let resolvedTemplateId: Id<"payslipTemplates"> | undefined = templateId;
    if (resolvedTemplateId) {
      const tmpl = await ctx.db.get(resolvedTemplateId);
      if (!tmpl || tmpl.orgId !== orgId) resolvedTemplateId = undefined;
    }
    if (!resolvedTemplateId) {
      resolvedTemplateId = await ensureDefaultTemplate(ctx, orgId);
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
      templateId: resolvedTemplateId,
      createdBy: userId,
    });

    const settings = await getPayrollSettings(ctx, orgId);
    let grossCents = 0;
    let employeeCpfCents = 0;
    let employerCpfCents = 0;
    let netCents = 0;
    let count = 0;

    for (const e of employees) {
      const comp = await effectiveCompensation(ctx, e._id, periodEnd);
      if (!comp) continue; // no salary on file yet → skip
      const proration = await prorationContextFor(ctx, e, comp, periodMonth);
      const slip = computePayslip(
        comp,
        e.dob,
        periodEnd,
        [],
        proration,
        settings,
        undefined,
      );
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
        prYear: slip.prYear ?? undefined,
        ...seedExchangeFields(org.settings.currency, comp),
        lines: slip.lines,
        status: "draft",
        proration: slip.proration,
      });
      const ex = seedExchangeFields(org.settings.currency, comp);
      grossCents += toBaseCents(slip.grossCents, ex.exchangeRate);
      employeeCpfCents += toBaseCents(slip.employeeCpfCents, ex.exchangeRate);
      employerCpfCents += toBaseCents(slip.employerCpfCents, ex.exchangeRate);
      netCents += toBaseCents(slip.netCents, ex.exchangeRate);
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

// Run completion, approval + release live in `convex/payrollApproval.ts`.
// `monthLabel` is exported for reuse there (release notifications).
export { monthLabel };

// Recompute every payslip in a draft run from current compensation, leave and
// fund settings — picks up compensation/fund changes made after run creation.
export const refreshRun = mutation({
  args: { runId: v.id("payrollRuns") },
  returns: v.null(),
  handler: async (ctx, { runId }) => {
    const { orgId } = await requirePermission(ctx, "payroll:manage");
    const run = await ctx.db.get(runId);
    if (!run || run.orgId !== orgId) throw new Error("Run not found.");
    if (run.status !== "draft") {
      throw new Error("Only draft runs can be refreshed.");
    }
    const slips = await ctx.db
      .query("payslips")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
    for (const slip of slips) await recomputePayslip(ctx, slip);
    await recomputeRunTotals(ctx, runId);
    return null;
  },
});

// Override the prorated day counts for one employee's payslip in a draft run.
// The base pay is recomputed as base × daysWorked / totalWorkingDays and the
// override persists across refreshes (until cleared).
export const setProrationOverride = mutation({
  args: {
    runId: v.id("payrollRuns"),
    employeeId: v.id("employees"),
    daysWorked: v.number(),
    totalWorkingDays: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { runId, employeeId, daysWorked, totalWorkingDays }) => {
    const { orgId } = await requirePermission(ctx, "payroll:manage");
    const { slip } = await requireEditablePayslip(
      ctx,
      orgId,
      runId,
      employeeId,
    );
    if (!Number.isFinite(daysWorked) || !Number.isFinite(totalWorkingDays)) {
      throw new Error("Day counts must be numbers.");
    }
    if (totalWorkingDays <= 0) {
      throw new Error("Total working days must be greater than zero.");
    }
    if (daysWorked < 0 || daysWorked > totalWorkingDays) {
      throw new Error("Days worked must be between 0 and total working days.");
    }
    await ctx.db.patch(slip._id, {
      prorationOverride: {
        daysWorked: Math.round(daysWorked),
        totalWorkingDays: Math.round(totalWorkingDays),
      },
    });
    const fresh = await ctx.db.get(slip._id);
    if (fresh) await recomputePayslip(ctx, fresh);
    await recomputeRunTotals(ctx, runId);
    return null;
  },
});

// Clear a proration override, reverting to the auto-computed MOM figures.
export const clearProrationOverride = mutation({
  args: { runId: v.id("payrollRuns"), employeeId: v.id("employees") },
  returns: v.null(),
  handler: async (ctx, { runId, employeeId }) => {
    const { orgId } = await requirePermission(ctx, "payroll:manage");
    const { slip } = await requireEditablePayslip(
      ctx,
      orgId,
      runId,
      employeeId,
    );
    await ctx.db.patch(slip._id, { prorationOverride: undefined });
    const fresh = await ctx.db.get(slip._id);
    if (fresh) await recomputePayslip(ctx, fresh);
    await recomputeRunTotals(ctx, runId);
    return null;
  },
});

// Set the hours worked for an hourly-paid employee's payslip in a draft run.
// Base pay recomputes as hourlyRate × hours. Persists across refreshes.
export const setPayslipHours = mutation({
  args: {
    runId: v.id("payrollRuns"),
    employeeId: v.id("employees"),
    hours: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { runId, employeeId, hours }) => {
    const { orgId } = await requirePermission(ctx, "payroll:manage");
    const { slip } = await requireEditablePayslip(ctx, orgId, runId, employeeId);
    if (!Number.isFinite(hours) || hours < 0) {
      throw new Error("Hours must be a non-negative number.");
    }
    await ctx.db.patch(slip._id, { hoursWorked: Math.round(hours * 100) / 100 });
    const fresh = await ctx.db.get(slip._id);
    if (fresh) await recomputePayslip(ctx, fresh);
    await recomputeRunTotals(ctx, runId);
    return null;
  },
});

// Set/modify the exchange rate for a foreign-currency payslip during the run.
// The client fetches the live rate via `exchange.getRate` (auto) or the user
// enters it (manual), then passes it here with its date. Re-sums run totals.
export const setPayslipExchangeRate = mutation({
  args: {
    runId: v.id("payrollRuns"),
    employeeId: v.id("employees"),
    rate: v.number(),
    date: v.string(),
    mode: claimExchangeMode,
    provider: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { runId, employeeId, rate, date, mode, provider }) => {
    const { orgId } = await requirePermission(ctx, "payroll:manage");
    const { run, slip } = await requireEditablePayslip(
      ctx,
      orgId,
      runId,
      employeeId,
    );
    if (slip.currency === run.currency) {
      throw new Error("This employee is paid in the base currency.");
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error("Exchange rate must be greater than zero.");
    }
    await ctx.db.patch(slip._id, {
      exchangeRate: rate,
      exchangeRateDate: date,
      exchangeMode: mode,
      exchangeProvider: provider ?? (mode === "manual" ? "manual" : undefined),
    });
    await recomputeRunTotals(ctx, runId);
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
    await unmarkOvertimeForAdjustment(ctx, adj);
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

// Note: no-pay leave no longer needs an explicit "pull" — base pay is prorated
// automatically from each employee's working days (see `prorationContextFor`).
// Approved claims are pulled explicitly via `pullClaims` (per-claim selection).

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
    const proration = await prorationContextFor(ctx, emp, comp, run.periodMonth);
    const settings = await getPayrollSettings(ctx, orgId);
    const slip = computePayslip(
      comp,
      emp.dob,
      periodEnd,
      [],
      proration,
      settings,
      undefined,
    );
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
      prYear: slip.prYear ?? undefined,
      ...seedExchangeFields(run.currency, comp),
      lines: slip.lines,
      status: "draft",
      proration: slip.proration,
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
    for (const a of adjustments) {
      await unmarkOvertimeForAdjustment(ctx, a);
      await ctx.db.delete(a._id);
    }
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

// ─── Overtime pull ──────────────────────────────────────────────────────────

// Clear an overtime record's pull marks when its payroll adjustment is removed,
// so it becomes eligible to pull again (or to cancel).
async function unmarkOvertimeForAdjustment(
  ctx: MutationCtx,
  adj: Doc<"payrollAdjustments">,
) {
  if (adj.source !== "overtime" || !adj.sourceRefId) return;
  const ot = await ctx.db.get(adj.sourceRefId as Id<"overtimeRecords">);
  if (ot && ot.pulledRunId === adj.runId) {
    await ctx.db.patch(ot._id, {
      pulledRunId: undefined,
      payrollAdjustmentId: undefined,
    });
  }
}

// Pull all approved, not-yet-paid overtime for the run's period into the run as
// OT additions. Idempotent — each OT record carries its consuming run, so a
// second pull skips ones already pulled. Amount is computed from the employee's
// compensation at pay time (same as a manual OT entry).
export const pullOvertime = mutation({
  args: { runId: v.id("payrollRuns") },
  returns: v.number(),
  handler: async (ctx, { runId }) => {
    const { orgId, userId } = await requirePermission(ctx, "payroll:manage");
    const run = await ctx.db.get(runId);
    if (!run || run.orgId !== orgId) throw new Error("Run not found.");
    if (run.status !== "draft") throw new Error("Only draft runs can be edited.");

    const slips = await ctx.db
      .query("payslips")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
    const empIds = new Set(slips.map((s) => s.employeeId));

    const approved = await ctx.db
      .query("overtimeRecords")
      .withIndex("by_org_status", (q) =>
        q.eq("orgId", orgId).eq("status", "approved"),
      )
      .collect();

    const periodEnd = periodEndDate(run.periodMonth);
    const touched = new Set<Id<"employees">>();
    let added = 0;
    for (const ot of approved) {
      if (ot.pulledRunId) continue; // already paid
      if (!ot.date.startsWith(run.periodMonth)) continue;
      if (!empIds.has(ot.employeeId)) continue;
      const comp = await effectiveCompensation(ctx, ot.employeeId, periodEnd);
      if (!comp) continue;
      const hours = ot.actualHours ?? ot.plannedHours;
      const amountCents = overtimePayCents(
        comp.baseMonthlyCents,
        hours,
        ot.multiplier,
      );
      if (amountCents <= 0) continue;
      const adjustmentId = await ctx.db.insert("payrollAdjustments", {
        orgId,
        runId,
        employeeId: ot.employeeId,
        kind: "addition",
        source: "overtime",
        label: `Overtime — ${ot.date} (rate × ${ot.multiplier})`,
        amountCents,
        cpfable: true,
        affectsGross: false,
        overtime: { hours, multiplier: ot.multiplier },
        sourceRefId: ot._id,
        createdBy: userId,
      });
      await ctx.db.patch(ot._id, {
        pulledRunId: runId,
        payrollAdjustmentId: adjustmentId,
      });
      touched.add(ot.employeeId);
      added += 1;
    }

    for (const employeeId of touched) {
      const slip = slips.find((s) => s.employeeId === employeeId);
      if (slip) await recomputePayslip(ctx, slip);
    }
    if (added > 0) await recomputeRunTotals(ctx, runId);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "payroll.pull_overtime",
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
          fullBaseCents: comp?.baseMonthlyCents ?? s.baseCents,
          payType: comp?.payType ?? "fixed",
          hourlyRateCents: comp?.hourlyRateCents ?? null,
          hoursWorked: s.hoursWorked ?? null,
          allowances: comp?.allowances ?? [],
          grossCents: s.grossCents,
          cpfableWageCents: s.cpfableWageCents,
          employeeCpfCents: s.employeeCpfCents,
          employerCpfCents: s.employerCpfCents,
          netCents: s.netCents,
          cpfStatus: s.cpfStatus,
          prYear: s.prYear ?? null,
          baseCurrency: s.baseCurrency ?? null,
          exchangeRate: s.exchangeRate ?? null,
          exchangeRateDate: s.exchangeRateDate ?? null,
          exchangeMode: s.exchangeMode ?? null,
          exchangeProvider: s.exchangeProvider ?? null,
          proration: s.proration ?? null,
          lines: s.lines,
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

    // Approved overtime for this period that hasn't been pulled yet — the count
    // of items the "pull overtime" action would bring in.
    const approvedOvertime = await ctx.db
      .query("overtimeRecords")
      .withIndex("by_org_status", (q) =>
        q.eq("orgId", orgId).eq("status", "approved"),
      )
      .collect();
    const overtime = approvedOvertime.filter(
      (o) =>
        !o.pulledRunId &&
        o.date.startsWith(run.periodMonth) &&
        empIds.has(o.employeeId),
    ).length;

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
    // Only released (paid) payslips are visible to the employee — nothing leaks
    // while a run is in draft / pending approval.
    const visible = slips.filter((s) => s.status === "paid");
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
    if (!isSelf && !ctxHasPermission(orgCtx, "payroll:manage")) {
      throw new Error("Not authorized to view payslips.");
    }
    const slips = await ctx.db
      .query("payslips")
      .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
      .order("desc")
      .take(48);
    // HR/payroll see everything non-draft; the employee themselves sees only
    // released (paid) payslips.
    const visible = slips.filter((s) =>
      isSelf && !ctxHasPermission(orgCtx, "payroll:manage")
        ? s.status === "paid"
        : s.status !== "draft",
    );
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

    const canManage = ctxHasPermission(orgCtx, "payroll:manage");
    // An approver on this payslip's chain may preview it while it's pending, so
    // they can verify before signing.
    const isApprover = (slip.approvalChain ?? []).some((s) =>
      s.approverUserIds.includes(orgCtx.userId),
    );
    let isOwnPaid = false;
    if (!canManage && !isApprover) {
      const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
      isOwnPaid =
        !!own && slip.employeeId === own._id && slip.status === "paid";
      // Employees may only view their own, released (paid) payslip.
      if (!isOwnPaid) {
        throw new Error("Not authorized to view this payslip.");
      }
    }
    const emp = await ctx.db.get(slip.employeeId);
    const [dept, position, run] = await Promise.all([
      emp?.departmentId ? ctx.db.get(emp.departmentId) : Promise.resolve(null),
      emp?.positionId ? ctx.db.get(emp.positionId) : Promise.resolve(null),
      ctx.db.get(slip.runId),
    ]);
    const template = await resolveTemplateConfig(
      ctx,
      orgCtx.orgId,
      run?.templateId,
    );
    // Employees only see signatures on their own payslip when the org opts in.
    // HR/payroll managers and approvers always see them.
    let showSignatures = true;
    if (!canManage && !isApprover && isOwnPaid) {
      const settings = await getPayrollSettings(ctx, orgCtx.orgId);
      showSignatures = settings.showSignaturesToEmployees === true;
    }
    const signatures = showSignatures
      ? await Promise.all(
          (slip.signatures ?? []).map(async (s) => ({
            role: s.role,
            name: s.name,
            url: await ctx.storage.getUrl(s.signatureStorageId),
            signedAt: s.signedAt,
          })),
        )
      : [];
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
      prYear: slip.prYear ?? null,
      baseCurrency: slip.baseCurrency ?? null,
      exchangeRate: slip.exchangeRate ?? null,
      exchangeRateDate: slip.exchangeRateDate ?? null,
      exchangeMode: slip.exchangeMode ?? null,
      exchangeProvider: slip.exchangeProvider ?? null,
      lines: slip.lines,
      status: slip.status,
      proration: slip.proration ?? null,
      template,
      signatures,
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

// Every payslip in a run, in the same shape as `getPayslip`, so the client can
// render the exact employee-facing payslip document for each employee (used by
// the bulk payslip → PDF export). Payroll-manager only; signatures always shown.
export const getRunPayslipsForPrint = query({
  args: { runId: v.id("payrollRuns") },
  returns: v.array(payslipDetail),
  handler: async (ctx, { runId }) => {
    const { orgId, org } = await requirePermission(ctx, "payroll:manage");
    const run = await ctx.db.get(runId);
    if (!run || run.orgId !== orgId) throw new Error("Run not found.");
    const template = await resolveTemplateConfig(ctx, orgId, run.templateId);
    const slips = await ctx.db
      .query("payslips")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();

    return await Promise.all(
      slips.map(async (slip) => {
        const emp = await ctx.db.get(slip.employeeId);
        const [dept, position] = await Promise.all([
          emp?.departmentId
            ? ctx.db.get(emp.departmentId)
            : Promise.resolve(null),
          emp?.positionId ? ctx.db.get(emp.positionId) : Promise.resolve(null),
        ]);
        const signatures = await Promise.all(
          (slip.signatures ?? []).map(async (s) => ({
            role: s.role,
            name: s.name,
            url: await ctx.storage.getUrl(s.signatureStorageId),
            signedAt: s.signedAt,
          })),
        );
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
          prYear: slip.prYear ?? null,
          baseCurrency: slip.baseCurrency ?? null,
          exchangeRate: slip.exchangeRate ?? null,
          exchangeRateDate: slip.exchangeRateDate ?? null,
          exchangeMode: slip.exchangeMode ?? null,
          exchangeProvider: slip.exchangeProvider ?? null,
          lines: slip.lines,
          status: slip.status,
          proration: slip.proration ?? null,
          template,
          signatures,
          companyName: org.name,
          employeeNumber: emp?.employeeNumber ?? "—",
          departmentName: dept?.name ?? null,
          positionTitle: position?.title ?? null,
          payPeriodStart: `${slip.periodMonth}-01`,
          payPeriodEnd: periodEndDate(slip.periodMonth),
          payDate: run.payDate ?? null,
        };
      }),
    );
  },
});
