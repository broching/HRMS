import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrg, requirePermission } from "./auth";
import { writeAuditLog } from "./lib/audit";
import { teamDoc } from "./lib/validators";

export const list = query({
  args: {},
  returns: v.array(teamDoc),
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    return await ctx.db
      .query("teams")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    departmentId: v.optional(v.id("departments")),
  },
  returns: v.id("teams"),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(ctx, "employees:manage");
    const id = await ctx.db.insert("teams", { orgId, ...args });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "team.create",
      entity: "teams",
      entityId: id,
      after: args,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("teams"),
    name: v.optional(v.string()),
    departmentId: v.optional(v.id("departments")),
    leadEmployeeId: v.optional(v.id("employees")),
  },
  returns: v.null(),
  handler: async (ctx, { id, ...patch }) => {
    const { orgId } = await requirePermission(ctx, "employees:manage");
    const existing = await ctx.db.get(id);
    if (!existing || existing.orgId !== orgId) throw new Error("Team not found.");
    await ctx.db.patch(id, patch);
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("teams") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { orgId, userId } = await requirePermission(ctx, "employees:manage");
    const existing = await ctx.db.get(id);
    if (!existing || existing.orgId !== orgId) throw new Error("Team not found.");
    await ctx.db.delete(id);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "team.delete",
      entity: "teams",
      entityId: id,
      before: existing,
    });
    return null;
  },
});
