import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getOrgContext, requirePermission } from "./auth";
import { requireEmployeeAccess, employeeByUserId } from "./employees";
import { writeAuditLog } from "./lib/audit";
import { resolvePolicyForEmployee } from "./leavePolicies";
import { computeEntitlement } from "./model/leavePolicy";

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Leave balances are created lazily (on first apply) and synthesized from the
 * leave type defaults when reading, so every employee shows a full balance
 * sheet without pre-provisioning rows.
 */

export async function ensureBalance(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  employeeId: Id<"employees">,
  leaveType: Doc<"leaveTypes">,
  year: number,
): Promise<Doc<"leaveBalances">> {
  const existing = await ctx.db
    .query("leaveBalances")
    .withIndex("by_employee_type_year", (q) =>
      q
        .eq("employeeId", employeeId)
        .eq("leaveTypeId", leaveType._id)
        .eq("year", year),
    )
    .unique();
  if (existing) return existing;
  const id = await ctx.db.insert("leaveBalances", {
    orgId,
    employeeId,
    leaveTypeId: leaveType._id,
    year,
    entitledDays: leaveType.defaultEntitlementDays,
    carriedForwardDays: 0,
    takenDays: 0,
    pendingDays: 0,
    adjustmentDays: 0,
  });
  return (await ctx.db.get(id))!;
}

const balanceRow = v.object({
  leaveTypeId: v.id("leaveTypes"),
  leaveTypeName: v.string(),
  color: v.string(),
  paid: v.boolean(),
  entitledDays: v.number(),
  carriedForwardDays: v.number(),
  takenDays: v.number(),
  pendingDays: v.number(),
  adjustmentDays: v.number(),
  availableDays: v.number(),
});

async function balanceSheet(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  employeeId: Id<"employees">,
  year: number,
) {
  const employee = await ctx.db.get(employeeId);
  const joinDate = employee?.joinDate ?? `${year}-01-01`;
  // Accrual is computed "as of" today, clamped into the year by the engine, so
  // current years show accrued-to-date and past years show the full year.
  const asOf = todayISO();
  const types = await ctx.db
    .query("leaveTypes")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  const balances = await ctx.db
    .query("leaveBalances")
    .withIndex("by_org_employee_year", (q) =>
      q.eq("orgId", orgId).eq("employeeId", employeeId).eq("year", year),
    )
    .collect();
  const byType = new Map(balances.map((b) => [b.leaveTypeId, b]));
  const active = types.filter((t) => t.active);
  return await Promise.all(
    active.map(async (t) => {
      const b = byType.get(t._id);
      const policy = await resolvePolicyForEmployee(ctx, orgId, t._id, employeeId);
      // Entitlement is derived from the policy (fixed/earned/proration/
      // seniority/rounding); the stored row only tracks usage + adjustments.
      const entitledDays = policy
        ? computeEntitlement(policy, joinDate, year, asOf)
        : t.defaultEntitlementDays;
      const carriedForwardDays = b?.carriedForwardDays ?? 0;
      const takenDays = b?.takenDays ?? 0;
      const pendingDays = b?.pendingDays ?? 0;
      const adjustmentDays = b?.adjustmentDays ?? 0;
      return {
        leaveTypeId: t._id,
        leaveTypeName: t.name,
        color: t.color,
        paid: t.paid,
        entitledDays,
        carriedForwardDays,
        takenDays,
        pendingDays,
        adjustmentDays,
        availableDays:
          entitledDays +
          carriedForwardDays +
          adjustmentDays -
          takenDays -
          pendingDays,
      };
    }),
  );
}

export const myBalances = query({
  args: { year: v.optional(v.number()) },
  returns: v.array(balanceRow),
  handler: async (ctx, { year }) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    if (!own) return [];
    return await balanceSheet(
      ctx,
      orgCtx.orgId,
      own._id,
      year ?? new Date().getFullYear(),
    );
  },
});

export const forEmployee = query({
  args: { employeeId: v.id("employees"), year: v.optional(v.number()) },
  returns: v.array(balanceRow),
  handler: async (ctx, { employeeId, year }) => {
    const { orgCtx } = await requireEmployeeAccess(ctx, employeeId);
    return await balanceSheet(
      ctx,
      orgCtx.orgId,
      employeeId,
      year ?? new Date().getFullYear(),
    );
  },
});

// Manual entitlement adjustment (e.g. carry-forward, corrections).
export const adjust = mutation({
  args: {
    employeeId: v.id("employees"),
    leaveTypeId: v.id("leaveTypes"),
    year: v.number(),
    adjustmentDays: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(ctx, "leave:config");
    const leaveType = await ctx.db.get(args.leaveTypeId);
    if (!leaveType || leaveType.orgId !== orgId) {
      throw new Error("Leave type not found.");
    }
    const balance = await ensureBalance(
      ctx,
      orgId,
      args.employeeId,
      leaveType,
      args.year,
    );
    await ctx.db.patch(balance._id, { adjustmentDays: args.adjustmentDays });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "leaveBalance.adjust",
      entity: "leaveBalances",
      entityId: balance._id,
      after: { adjustmentDays: args.adjustmentDays },
    });
    return null;
  },
});

// Tools → Initial Balances: set the starting carried-forward and/or manual
// adjustment days for an employee+type+year (e.g. migrating from another HRIS).
export const initialBalances = mutation({
  args: {
    employeeId: v.id("employees"),
    leaveTypeId: v.id("leaveTypes"),
    year: v.number(),
    carriedForwardDays: v.optional(v.number()),
    adjustmentDays: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(ctx, "leave:config");
    const leaveType = await ctx.db.get(args.leaveTypeId);
    if (!leaveType || leaveType.orgId !== orgId) {
      throw new Error("Leave type not found.");
    }
    const balance = await ensureBalance(
      ctx,
      orgId,
      args.employeeId,
      leaveType,
      args.year,
    );
    const patch: Partial<Doc<"leaveBalances">> = {};
    if (args.carriedForwardDays != null)
      patch.carriedForwardDays = args.carriedForwardDays;
    if (args.adjustmentDays != null) patch.adjustmentDays = args.adjustmentDays;
    await ctx.db.patch(balance._id, patch);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "leaveBalance.initial",
      entity: "leaveBalances",
      entityId: balance._id,
      after: patch,
    });
    return null;
  },
});

/**
 * Roll unused balance from `fromYear` into `fromYear + 1` for every employee,
 * for leave types whose applicable policy allows carry-forward (capped at the
 * policy's `maxCarryForwardDays`). Idempotent — re-running sets, not adds.
 * Shared by the public trigger below and the yearly cron in crons.ts.
 */
export async function carryForwardForOrg(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  fromYear: number,
): Promise<number> {
  const employees = await ctx.db
    .query("employees")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  const types = (
    await ctx.db
      .query("leaveTypes")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect()
  ).filter((t) => t.active);
  const asOf = `${fromYear}-12-31`;
  let rolled = 0;
  for (const emp of employees) {
    if (emp.isVacant) continue;
    for (const t of types) {
      const policy = await resolvePolicyForEmployee(ctx, orgId, t._id, emp._id);
      if (!policy || !policy.carryForwardEnabled) continue;
      const bal = await ctx.db
        .query("leaveBalances")
        .withIndex("by_employee_type_year", (q) =>
          q.eq("employeeId", emp._id).eq("leaveTypeId", t._id).eq("year", fromYear),
        )
        .unique();
      const entitled = computeEntitlement(policy, emp.joinDate, fromYear, asOf);
      const available =
        entitled +
        (bal?.carriedForwardDays ?? 0) +
        (bal?.adjustmentDays ?? 0) -
        (bal?.takenDays ?? 0) -
        (bal?.pendingDays ?? 0);
      const unused = Math.max(0, available);
      if (unused <= 0) continue;
      const carry =
        policy.maxCarryForwardDays != null
          ? Math.min(unused, policy.maxCarryForwardDays)
          : unused;
      const next = await ensureBalance(ctx, orgId, emp._id, t, fromYear + 1);
      await ctx.db.patch(next._id, { carriedForwardDays: carry });
      rolled++;
    }
  }
  return rolled;
}

// Manual admin trigger for the carry-forward rollover (also runs yearly via
// crons.ts). Returns how many balance rows were credited.
export const runCarryForward = mutation({
  args: { fromYear: v.number() },
  returns: v.number(),
  handler: async (ctx, { fromYear }) => {
    const { orgId, userId } = await requirePermission(ctx, "leave:config");
    const rolled = await carryForwardForOrg(ctx, orgId, fromYear);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "leaveBalance.carryForward",
      entity: "organizations",
      entityId: orgId,
      after: { fromYear, rolled },
    });
    return rolled;
  },
});
