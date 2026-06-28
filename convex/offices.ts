import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrg, requirePermission } from "./auth";
import { writeAuditLog } from "./lib/audit";
import { officeDoc } from "./lib/validators";

const geo = v.object({ lat: v.number(), lng: v.number() });

export const list = query({
  args: {},
  returns: v.array(officeDoc),
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    return await ctx.db
      .query("offices")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    address: v.optional(v.string()),
    timezone: v.string(),
    geo: v.optional(geo),
    radiusMeters: v.optional(v.number()),
  },
  returns: v.id("offices"),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(ctx, "attendance:config");
    const id = await ctx.db.insert("offices", {
      orgId,
      qrEnabled: false,
      ...args,
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "office.create",
      entity: "offices",
      entityId: id,
      after: args,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("offices"),
    name: v.optional(v.string()),
    address: v.optional(v.string()),
    timezone: v.optional(v.string()),
    geo: v.optional(geo),
    radiusMeters: v.optional(v.number()),
    qrEnabled: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { id, ...patch }) => {
    const { orgId } = await requirePermission(ctx, "attendance:config");
    const existing = await ctx.db.get(id);
    if (!existing || existing.orgId !== orgId)
      throw new Error("Office not found.");
    await ctx.db.patch(id, patch);
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("offices") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { orgId, userId } = await requirePermission(ctx, "attendance:config");
    const existing = await ctx.db.get(id);
    if (!existing || existing.orgId !== orgId)
      throw new Error("Office not found.");
    await ctx.db.delete(id);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "office.delete",
      entity: "offices",
      entityId: id,
      before: existing,
    });
    return null;
  },
});
