import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { customFieldType } from "./lib/enums";
import { requireOrg, requirePermission } from "./auth";
import { customFieldDefDoc } from "./lib/validators";
import { writeAuditLog } from "./lib/audit";

// Custom field definitions for employees (extensible profile fields).
export const list = query({
  args: {},
  returns: v.array(customFieldDefDoc),
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    return await ctx.db
      .query("customFieldDefs")
      .withIndex("by_org_entity", (q) =>
        q.eq("orgId", orgId).eq("entity", "employee"),
      )
      .collect();
  },
});

export const create = mutation({
  args: {
    key: v.string(),
    label: v.string(),
    fieldType: customFieldType,
    options: v.optional(v.array(v.string())),
    required: v.boolean(),
  },
  returns: v.id("customFieldDefs"),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(ctx, "employees:manage");
    const dup = await ctx.db
      .query("customFieldDefs")
      .withIndex("by_org_entity", (q) =>
        q.eq("orgId", orgId).eq("entity", "employee"),
      )
      .collect();
    if (dup.some((d) => d.key === args.key)) {
      throw new Error("A custom field with that key already exists.");
    }
    const id = await ctx.db.insert("customFieldDefs", {
      orgId,
      entity: "employee",
      ...args,
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "customField.create",
      entity: "customFieldDefs",
      entityId: id,
      after: args,
    });
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("customFieldDefs") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { orgId } = await requirePermission(ctx, "employees:manage");
    const existing = await ctx.db.get(id);
    if (!existing || existing.orgId !== orgId) {
      throw new Error("Custom field not found.");
    }
    await ctx.db.delete(id);
    return null;
  },
});
