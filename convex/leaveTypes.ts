import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { leaveCategory, accrualMethod } from "./lib/enums";
import { requireOrg, requirePermission } from "./auth";
import { leaveTypeDoc } from "./lib/validators";
import { writeAuditLog } from "./lib/audit";
import {
  SG_LEAVE_TYPES,
  SG_HOLIDAYS_2026,
  defaultLeavePolicyFields,
} from "./lib/sgDefaults";

export const list = query({
  args: { includeInactive: v.optional(v.boolean()) },
  returns: v.array(leaveTypeDoc),
  handler: async (ctx, { includeInactive }) => {
    const { orgId } = await requireOrg(ctx);
    const all = await ctx.db
      .query("leaveTypes")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    return includeInactive ? all : all.filter((t) => t.active);
  },
});

export const create = mutation({
  args: {
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
    isCredit: v.optional(v.boolean()),
    autoAssign: v.optional(v.boolean()),
  },
  returns: v.id("leaveTypes"),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(ctx, "leave:config");
    const id = await ctx.db.insert("leaveTypes", {
      orgId,
      active: true,
      ...args,
    });
    // Every type gets a default "All Employees" policy so it's bookable.
    await ctx.db.insert("leavePolicies", {
      orgId,
      leaveTypeId: id,
      ...defaultLeavePolicyFields(args),
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "leaveType.create",
      entity: "leaveTypes",
      entityId: id,
      after: { name: args.name },
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("leaveTypes"),
    name: v.optional(v.string()),
    defaultEntitlementDays: v.optional(v.number()),
    accrualMethod: v.optional(accrualMethod),
    allowCarryForward: v.optional(v.boolean()),
    maxCarryForwardDays: v.optional(v.number()),
    allowHalfDay: v.optional(v.boolean()),
    requiresAttachment: v.optional(v.boolean()),
    requiresApproval: v.optional(v.boolean()),
    color: v.optional(v.string()),
    active: v.optional(v.boolean()),
    isCredit: v.optional(v.boolean()),
    autoAssign: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { id, ...patch }) => {
    const { orgId } = await requirePermission(ctx, "leave:config");
    const existing = await ctx.db.get(id);
    if (!existing || existing.orgId !== orgId) {
      throw new Error("Leave type not found.");
    }
    await ctx.db.patch(id, patch);
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("leaveTypes") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { orgId } = await requirePermission(ctx, "leave:config");
    const existing = await ctx.db.get(id);
    if (!existing || existing.orgId !== orgId) {
      throw new Error("Leave type not found.");
    }
    // Soft-disable to preserve historical requests/balances.
    await ctx.db.patch(id, { active: false });
    return null;
  },
});

// Seed Singapore defaults into an existing org that has none (e.g. orgs
// created before M2). New orgs are seeded automatically on creation.
export const seedDefaults = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "leave:config");
    const existing = await ctx.db
      .query("leaveTypes")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .first();
    if (existing) throw new Error("Leave types already exist.");

    for (const lt of SG_LEAVE_TYPES) {
      const leaveTypeId = await ctx.db.insert("leaveTypes", { orgId, ...lt });
      await ctx.db.insert("leavePolicies", {
        orgId,
        leaveTypeId,
        ...defaultLeavePolicyFields(lt),
      });
    }
    const haveHolidays = await ctx.db
      .query("holidays")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .first();
    if (!haveHolidays) {
      for (const h of SG_HOLIDAYS_2026) {
        await ctx.db.insert("holidays", {
          orgId,
          date: h.date,
          name: h.name,
          country: "SG",
        });
      }
    }
    return null;
  },
});
