import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requireOrg, requirePermission } from "./auth";
import { ctxHasPermission } from "./auth";
import { recomputeDraftPayslipsForEmployee } from "./payroll";
import { writeAuditLog } from "./lib/audit";
import {
  allowanceItem,
  cpfStatus,
  payType,
  employeeFunds,
  deductionItem,
  employerContribItem,
  claimExchangeMode,
} from "./lib/enums";
import { compensationDoc, compensationRow } from "./lib/validators";
import { upsertIr8aLabels } from "./payrollSettings";

// Sort compensation rows most-recent first: latest effectiveDate wins, and on a
// tie (two records saved the same day) the most recently created one leads — so
// the "current" record and its note/base reflect the latest save.
function byEffectiveThenNewest(
  a: Doc<"compensation">,
  b: Doc<"compensation">,
): number {
  if (a.effectiveDate !== b.effectiveDate)
    return a.effectiveDate < b.effectiveDate ? 1 : -1;
  return b._creationTime - a._creationTime;
}

// The compensation in effect for an employee on `onDate` = the row with the
// latest effectiveDate on or before it. Shared with the payroll engine.
export async function effectiveCompensation(
  ctx: QueryCtx,
  employeeId: Id<"employees">,
  onDate: string,
): Promise<Doc<"compensation"> | null> {
  const rows = await ctx.db
    .query("compensation")
    .withIndex("by_employee_effective", (q) => q.eq("employeeId", employeeId))
    .collect();
  const eligible = rows.filter((c) => c.effectiveDate <= onDate);
  if (eligible.length === 0) return null;
  // Latest effective date wins; on a tie (two records saved the same day) the
  // most recently created one wins, so re-saving compensation takes effect.
  return eligible.reduce((a, b) => {
    if (b.effectiveDate > a.effectiveDate) return b;
    if (b.effectiveDate < a.effectiveDate) return a;
    return b._creationTime >= a._creationTime ? b : a;
  });
}

// Full salary history for one employee (most recent first).
export const listForEmployee = query({
  args: { employeeId: v.id("employees") },
  returns: v.array(compensationDoc),
  handler: async (ctx, { employeeId }) => {
    const { orgId } = await requirePermission(ctx, "payroll:manage");
    const employee = await ctx.db.get(employeeId);
    if (!employee || employee.orgId !== orgId) {
      throw new Error("Employee not found.");
    }
    const rows = await ctx.db
      .query("compensation")
      .withIndex("by_employee_effective", (q) =>
        q.eq("employeeId", employeeId),
      )
      .collect();
    rows.sort(byEffectiveThenNewest);
    return rows;
  },
});

// Salary history for the profile Compensation section — visible to the
// employee themselves OR HR/payroll (payroll:manage). Most recent first.
export const forProfile = query({
  args: { employeeId: v.id("employees") },
  returns: v.array(compensationDoc),
  handler: async (ctx, { employeeId }) => {
    const orgCtx = await requireOrg(ctx);
    const employee = await ctx.db.get(employeeId);
    if (!employee || employee.orgId !== orgCtx.orgId) {
      throw new Error("Employee not found.");
    }
    const isSelf = !!employee.userId && employee.userId === orgCtx.userId;
    if (!isSelf && !ctxHasPermission(orgCtx, "payroll:manage")) {
      throw new Error("Not authorized to view compensation.");
    }
    const rows = await ctx.db
      .query("compensation")
      .withIndex("by_employee_effective", (q) => q.eq("employeeId", employeeId))
      .collect();
    rows.sort(byEffectiveThenNewest);
    return rows;
  },
});

// Active employees with their current base pay (compensation management view).
export const overview = query({
  args: {},
  returns: v.array(compensationRow),
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "payroll:manage");
    const today = new Date().toISOString().slice(0, 10);
    const employees = (
      await ctx.db
        .query("employees")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .collect()
    ).filter((e) => e.status !== "terminated");

    const [positions, departments, teams] = await Promise.all([
      ctx.db.query("positions").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
      ctx.db.query("departments").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
      ctx.db.query("teams").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
    ]);
    const posTitle = new Map(positions.map((p) => [p._id, p.title]));
    const deptName = new Map(departments.map((d) => [d._id, d.name]));
    const teamName = new Map(teams.map((t) => [t._id, t.name]));

    const rows = await Promise.all(
      employees.map(async (e) => {
        const comp = await effectiveCompensation(ctx, e._id, today);
        return {
          employeeId: e._id,
          name: `${e.preferredName ?? e.firstName} ${e.lastName}`,
          positionTitle: e.positionId
            ? (posTitle.get(e.positionId) ?? null)
            : null,
          departmentId: e.departmentId ?? null,
          departmentName: e.departmentId
            ? (deptName.get(e.departmentId) ?? null)
            : null,
          teamId: e.teamId ?? null,
          teamName: e.teamId ? (teamName.get(e.teamId) ?? null) : null,
          currency: comp?.currency ?? null,
          payType: comp?.payType ?? null,
          baseMonthlyCents: comp?.baseMonthlyCents ?? null,
          hourlyRateCents: comp?.hourlyRateCents ?? null,
          cpfStatus: comp?.cpfStatus ?? null,
          effectiveDate: comp?.effectiveDate ?? null,
        };
      }),
    );
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  },
});

// The org's base/reporting currency — the reference for converting a
// foreign-currency salary (payslips in the pay currency, totals in base).
export const orgBaseCurrency = query({
  args: {},
  returns: v.object({ currency: v.string() }),
  handler: async (ctx) => {
    const { org } = await requirePermission(ctx, "payroll:manage");
    return { currency: org.settings.currency };
  },
});

export const setCompensation = mutation({
  args: {
    employeeId: v.id("employees"),
    effectiveDate: v.string(),
    payType: v.optional(payType),
    baseMonthlyCents: v.number(),
    hourlyRateCents: v.optional(v.number()),
    allowances: v.optional(v.array(allowanceItem)),
    cpfStatus: cpfStatus,
    prStartDate: v.optional(v.string()),
    workingDays: v.optional(v.array(v.number())),
    funds: v.optional(employeeFunds),
    deductions: v.optional(v.array(deductionItem)),
    employerContributions: v.optional(v.array(employerContribItem)),
    currency: v.optional(v.string()),
    exchangeMode: v.optional(claimExchangeMode),
    manualRate: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  returns: v.id("compensation"),
  handler: async (ctx, args) => {
    const { orgId, userId, org } = await requirePermission(ctx, "payroll:manage");
    const employee = await ctx.db.get(args.employeeId);
    if (!employee || employee.orgId !== orgId) {
      throw new Error("Employee not found.");
    }
    if (args.baseMonthlyCents < 0) throw new Error("Base pay can't be negative.");
    if ((args.hourlyRateCents ?? 0) < 0) {
      throw new Error("Hourly rate can't be negative.");
    }
    const payTypeValue = args.payType ?? "fixed";

    const id = await ctx.db.insert("compensation", {
      orgId,
      employeeId: args.employeeId,
      effectiveDate: args.effectiveDate,
      currency: args.currency ?? org.settings.currency,
      payType: payTypeValue,
      // Hourly employees don't carry a monthly base; store 0 to keep it explicit.
      baseMonthlyCents:
        payTypeValue === "hourly" ? 0 : args.baseMonthlyCents,
      hourlyRateCents:
        payTypeValue === "hourly" ? (args.hourlyRateCents ?? 0) : undefined,
      allowances: args.allowances ?? [],
      cpfStatus: args.cpfStatus,
      prStartDate: args.cpfStatus === "pr" ? args.prStartDate : undefined,
      exchangeMode: args.exchangeMode,
      manualRate: args.manualRate,
      workingDays: args.workingDays,
      funds: args.funds,
      deductions: args.deductions,
      employerContributions: args.employerContributions,
      note: args.note,
      createdBy: userId,
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "compensation.set",
      entity: "compensation",
      entityId: id,
      after: {
        employeeId: args.employeeId,
        baseMonthlyCents: args.baseMonthlyCents,
        effectiveDate: args.effectiveDate,
      },
    });
    // Remember any IR8A classifications chosen on allowances org-wide, so IR8A
    // generation picks them up and they persist for future items.
    await upsertIr8aLabels(
      ctx,
      orgId,
      (args.allowances ?? [])
        .filter((a) => a.ir8aCategory)
        .map((a) => ({ label: a.name, category: a.ir8aCategory! })),
    );
    // Reflect the change in any open draft payroll runs immediately.
    await recomputeDraftPayslipsForEmployee(ctx, orgId, args.employeeId);
    return id;
  },
});

export const removeCompensation = mutation({
  args: { id: v.id("compensation") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { orgId, userId } = await requirePermission(ctx, "payroll:manage");
    const existing = await ctx.db.get(id);
    if (!existing || existing.orgId !== orgId) {
      throw new Error("Compensation record not found.");
    }
    await ctx.db.delete(id);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "compensation.remove",
      entity: "compensation",
      entityId: id,
      before: existing,
    });
    await recomputeDraftPayslipsForEmployee(ctx, orgId, existing.employeeId);
    return null;
  },
});
