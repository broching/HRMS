import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrg, requirePermission } from "./auth";
import { writeAuditLog } from "./lib/audit";
import { shiftTemplateDoc } from "./lib/validators";
import { parseHHMM } from "./model/shiftTime";

function assertValidTimes(startTime: string, endTime: string) {
  if (parseHHMM(startTime) === null || parseHHMM(endTime) === null) {
    throw new Error("Times must be in HH:MM format.");
  }
}

export const list = query({
  args: {},
  returns: v.array(shiftTemplateDoc),
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    return await ctx.db
      .query("shiftTemplates")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    startTime: v.string(),
    endTime: v.string(),
    breakMinutes: v.optional(v.number()),
    color: v.optional(v.string()),
    officeId: v.optional(v.id("offices")),
  },
  returns: v.id("shiftTemplates"),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(ctx, "scheduling:manage");
    assertValidTimes(args.startTime, args.endTime);
    const id = await ctx.db.insert("shiftTemplates", {
      orgId,
      name: args.name,
      startTime: args.startTime,
      endTime: args.endTime,
      breakMinutes: args.breakMinutes ?? 0,
      color: args.color ?? "#6366f1",
      officeId: args.officeId,
      active: true,
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "shiftTemplate.create",
      entity: "shiftTemplates",
      entityId: id,
      after: { name: args.name },
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("shiftTemplates"),
    name: v.optional(v.string()),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
    breakMinutes: v.optional(v.number()),
    color: v.optional(v.string()),
    officeId: v.optional(v.id("offices")),
    active: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { id, ...patch }) => {
    const { orgId } = await requirePermission(ctx, "scheduling:manage");
    const existing = await ctx.db.get(id);
    if (!existing || existing.orgId !== orgId) {
      throw new Error("Shift template not found.");
    }
    if (patch.startTime || patch.endTime) {
      assertValidTimes(
        patch.startTime ?? existing.startTime,
        patch.endTime ?? existing.endTime,
      );
    }
    await ctx.db.patch(id, patch);
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("shiftTemplates") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { orgId, userId } = await requirePermission(ctx, "scheduling:manage");
    const existing = await ctx.db.get(id);
    if (!existing || existing.orgId !== orgId) {
      throw new Error("Shift template not found.");
    }
    await ctx.db.delete(id);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "shiftTemplate.delete",
      entity: "shiftTemplates",
      entityId: id,
      before: existing,
    });
    return null;
  },
});
