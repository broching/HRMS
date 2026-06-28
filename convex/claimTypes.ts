import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { claimCategory } from "./lib/enums";
import { requireOrg, requirePermission } from "./auth";
import { claimTypeDoc } from "./lib/validators";
import { writeAuditLog } from "./lib/audit";
import { CLAIM_TYPE_DEFAULTS } from "./lib/sgDefaults";

export const list = query({
  args: { includeInactive: v.optional(v.boolean()) },
  returns: v.array(claimTypeDoc),
  handler: async (ctx, { includeInactive }) => {
    const { orgId } = await requireOrg(ctx);
    const all = await ctx.db
      .query("claimTypes")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    return includeInactive ? all : all.filter((t) => t.active);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    category: claimCategory,
    requiresReceipt: v.boolean(),
    maxAmountCents: v.optional(v.number()),
    glCode: v.optional(v.string()),
  },
  returns: v.id("claimTypes"),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(
      ctx,
      "claims:approve:finance",
    );
    const id = await ctx.db.insert("claimTypes", {
      orgId,
      active: true,
      ...args,
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "claimType.create",
      entity: "claimTypes",
      entityId: id,
      after: { name: args.name },
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("claimTypes"),
    name: v.optional(v.string()),
    requiresReceipt: v.optional(v.boolean()),
    maxAmountCents: v.optional(v.number()),
    glCode: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { id, ...patch }) => {
    const { orgId } = await requirePermission(ctx, "claims:approve:finance");
    const existing = await ctx.db.get(id);
    if (!existing || existing.orgId !== orgId) {
      throw new Error("Claim type not found.");
    }
    await ctx.db.patch(id, patch);
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("claimTypes") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { orgId } = await requirePermission(ctx, "claims:approve:finance");
    const existing = await ctx.db.get(id);
    if (!existing || existing.orgId !== orgId) {
      throw new Error("Claim type not found.");
    }
    await ctx.db.patch(id, { active: false });
    return null;
  },
});

// Seed default claim types into an org that has none (e.g. created pre-M4).
export const seedDefaults = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "claims:approve:finance");
    const existing = await ctx.db
      .query("claimTypes")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .first();
    if (existing) throw new Error("Claim types already exist.");
    for (const ct of CLAIM_TYPE_DEFAULTS) {
      await ctx.db.insert("claimTypes", { orgId, ...ct });
    }
    return null;
  },
});
