import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrg, requirePermission } from "./auth";
import { writeAuditLog } from "./lib/audit";
import { departmentDoc } from "./lib/validators";

// Any member can read the org structure (used by selectors and profiles).
export const list = query({
  args: {},
  returns: v.array(departmentDoc),
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    return await ctx.db
      .query("departments")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    code: v.optional(v.string()),
    parentId: v.optional(v.id("departments")),
  },
  returns: v.id("departments"),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(ctx, "employees:manage");
    const id = await ctx.db.insert("departments", { orgId, ...args });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "department.create",
      entity: "departments",
      entityId: id,
      after: args,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("departments"),
    name: v.optional(v.string()),
    code: v.optional(v.string()),
    parentId: v.optional(v.id("departments")),
    headEmployeeId: v.optional(v.id("employees")),
  },
  returns: v.null(),
  handler: async (ctx, { id, ...patch }) => {
    const { orgId } = await requirePermission(ctx, "employees:manage");
    const existing = await ctx.db.get(id);
    if (!existing || existing.orgId !== orgId) {
      throw new Error("Department not found.");
    }
    await ctx.db.patch(id, patch);
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("departments") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { orgId, userId } = await requirePermission(ctx, "employees:manage");
    const existing = await ctx.db.get(id);
    if (!existing || existing.orgId !== orgId) {
      throw new Error("Department not found.");
    }
    // Block deletion while people still belong here — move them first.
    const holders = await ctx.db
      .query("employees")
      .withIndex("by_org_department", (q) =>
        q.eq("orgId", orgId).eq("departmentId", id),
      )
      .collect();
    const people = holders.filter(
      (e) => e.status !== "terminated" && !e.isVacant,
    );
    if (people.length > 0) {
      throw new Error(
        `Move the ${people.length} ${
          people.length === 1 ? "person" : "people"
        } in this department to another one before deleting it.`,
      );
    }
    await ctx.db.delete(id);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "department.delete",
      entity: "departments",
      entityId: id,
      before: existing,
    });
    return null;
  },
});
