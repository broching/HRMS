import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getOrgContext, requirePermission } from "./auth";
import { requireEmployeeAccess, employeeByUserId } from "./employees";
import { writeAuditLog } from "./lib/audit";

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
  return types
    .filter((t) => t.active)
    .map((t) => {
      const b = byType.get(t._id);
      const entitledDays = b?.entitledDays ?? t.defaultEntitlementDays;
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
    });
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
