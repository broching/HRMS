import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrg, requirePermission } from "./auth";
import { writeAuditLog } from "./lib/audit";
import { positionDoc } from "./lib/validators";

export const list = query({
  args: {},
  returns: v.array(positionDoc),
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    return await ctx.db
      .query("positions")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    level: v.optional(v.string()),
    departmentId: v.optional(v.id("departments")),
  },
  returns: v.id("positions"),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(ctx, "employees:manage");
    const id = await ctx.db.insert("positions", { orgId, ...args });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "position.create",
      entity: "positions",
      entityId: id,
      after: args,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("positions"),
    title: v.optional(v.string()),
    level: v.optional(v.string()),
    departmentId: v.optional(v.id("departments")),
  },
  returns: v.null(),
  handler: async (ctx, { id, ...patch }) => {
    const { orgId } = await requirePermission(ctx, "employees:manage");
    const existing = await ctx.db.get(id);
    if (!existing || existing.orgId !== orgId)
      throw new Error("Position not found.");
    await ctx.db.patch(id, patch);
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("positions") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { orgId, userId } = await requirePermission(ctx, "employees:manage");
    const existing = await ctx.db.get(id);
    if (!existing || existing.orgId !== orgId)
      throw new Error("Position not found.");
    // Block deletion while people still hold this position — move them first.
    const holders = await ctx.db
      .query("employees")
      .withIndex("by_org_position", (q) =>
        q.eq("orgId", orgId).eq("positionId", id),
      )
      .collect();
    const people = holders.filter(
      (e) => e.status !== "terminated" && !e.isVacant,
    );
    if (people.length > 0) {
      throw new Error(
        `Reassign the ${people.length} ${
          people.length === 1 ? "person" : "people"
        } in this position before deleting it.`,
      );
    }
    await ctx.db.delete(id);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "position.delete",
      entity: "positions",
      entityId: id,
      before: existing,
    });
    return null;
  },
});
