import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requirePermission } from "./auth";
import { claimApproverStep, claimPayrollMode } from "./lib/enums";
import { claimSettingsValue, claimSettingsOptions } from "./lib/validators";
import { writeAuditLog } from "./lib/audit";

// Sensible defaults applied when an org hasn't configured claim settings yet.
const DEFAULTS = {
  cutoffDay: 1,
  transactionValidityMonths: null as number | null,
  hrApproverUserIds: [] as Id<"users">[],
  financeApproverUserIds: [] as Id<"users">[],
  approvalWorkflow: [
    {
      approverType: "position" as const,
      value: "manager",
      thresholdEnabled: false,
      rules: [],
    },
  ],
  payrollMode: "manual" as const,
  payrollItem: null as string | null,
};

export type ResolvedClaimSettings = Omit<
  Doc<"claimSettings">,
  "_id" | "_creationTime" | "orgId" | "transactionValidityMonths" | "payrollItem"
> & { transactionValidityMonths: number | null; payrollItem: string | null };

// Load an org's claim settings, falling back to defaults. Shared with the
// claims engine (approval chain resolution + payroll routing).
export async function resolveClaimSettings(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
): Promise<ResolvedClaimSettings> {
  const row = await ctx.db
    .query("claimSettings")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .unique();
  if (!row) return DEFAULTS;
  return {
    cutoffDay: row.cutoffDay,
    transactionValidityMonths: row.transactionValidityMonths ?? null,
    hrApproverUserIds: row.hrApproverUserIds,
    financeApproverUserIds: row.financeApproverUserIds,
    approvalWorkflow: row.approvalWorkflow,
    payrollMode: row.payrollMode,
    payrollItem: row.payrollItem ?? null,
  };
}

export const get = query({
  args: {},
  returns: claimSettingsValue,
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "claims:approve:finance");
    return await resolveClaimSettings(ctx, orgId);
  },
});

// Members (for assignee/approver pickers) + offices (for threshold rules).
export const options = query({
  args: {},
  returns: claimSettingsOptions,
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "claims:approve:finance");
    const members = await ctx.db
      .query("members")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const active = members.filter((m) => m.status === "active");
    const resolved = await Promise.all(
      active.map(async (m) => {
        const user = await ctx.db.get(m.userId);
        return {
          userId: m.userId,
          name: user?.name ?? "Unknown",
          role: m.role,
        };
      }),
    );
    resolved.sort((a, b) => a.name.localeCompare(b.name));
    const offices = await ctx.db
      .query("offices")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    return {
      members: resolved,
      offices: offices.map((o) => ({ _id: o._id, name: o.name })),
    };
  },
});

export const save = mutation({
  args: {
    cutoffDay: v.number(),
    transactionValidityMonths: v.union(v.number(), v.null()),
    hrApproverUserIds: v.array(v.id("users")),
    financeApproverUserIds: v.array(v.id("users")),
    approvalWorkflow: v.array(claimApproverStep),
    payrollMode: claimPayrollMode,
    payrollItem: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(
      ctx,
      "claims:approve:finance",
    );
    if (args.cutoffDay < 1 || args.cutoffDay > 31) {
      throw new Error("Cut-off day must be between 1 and 31.");
    }
    if (args.approvalWorkflow.length === 0) {
      throw new Error("At least one approver is required.");
    }

    const patch = {
      cutoffDay: args.cutoffDay,
      transactionValidityMonths: args.transactionValidityMonths ?? undefined,
      hrApproverUserIds: args.hrApproverUserIds,
      financeApproverUserIds: args.financeApproverUserIds,
      approvalWorkflow: args.approvalWorkflow,
      payrollMode: args.payrollMode,
      payrollItem: args.payrollItem ?? undefined,
    };

    const existing = await ctx.db
      .query("claimSettings")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("claimSettings", { orgId, ...patch });
    }
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "claimSettings.save",
      entity: "claimSettings",
      entityId: existing?._id,
    });
    return null;
  },
});
