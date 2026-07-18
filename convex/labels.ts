import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireOrg } from "./auth";
import { isProjectPrivileged } from "./model/projectAccess";
import type { OrgContext } from "./auth";
import type { QueryCtx } from "./_generated/server";

/**
 * Org-wide task labels/tags. Anyone in the org can read them (to render chips);
 * only task managers (tasks:manage / projects:manage) can create/edit/remove.
 */

const labelDoc = v.object({
  _id: v.id("taskLabels"),
  _creationTime: v.number(),
  orgId: v.id("organizations"),
  name: v.string(),
  color: v.string(),
  order: v.number(),
});

async function requireLabelManage(ctx: QueryCtx): Promise<OrgContext> {
  const orgCtx = await requireOrg(ctx);
  if (!isProjectPrivileged(orgCtx)) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "You don't have permission to manage labels.",
    });
  }
  return orgCtx;
}

export const list = query({
  args: {},
  returns: v.array(labelDoc),
  handler: async (ctx) => {
    const orgCtx = await requireOrg(ctx);
    const rows = await ctx.db
      .query("taskLabels")
      .withIndex("by_org", (q) => q.eq("orgId", orgCtx.orgId))
      .collect();
    rows.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    return rows;
  },
});

export const create = mutation({
  args: { name: v.string(), color: v.string() },
  returns: v.id("taskLabels"),
  handler: async (ctx, { name, color }) => {
    const { orgId } = await requireLabelManage(ctx);
    const trimmed = name.trim();
    if (!trimmed) throw new ConvexError({ code: "INPUT", message: "Name is required." });
    const existing = await ctx.db
      .query("taskLabels")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const order = existing.length ? Math.max(...existing.map((l) => l.order)) + 1 : 0;
    return await ctx.db.insert("taskLabels", {
      orgId,
      name: trimmed.slice(0, 40),
      color: color || "#64748b",
      order,
    });
  },
});

export const update = mutation({
  args: {
    labelId: v.id("taskLabels"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { labelId, ...args }) => {
    const { orgId } = await requireLabelManage(ctx);
    const label = await ctx.db.get(labelId);
    if (!label || label.orgId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Label not found." });
    }
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name.trim().slice(0, 40) || label.name;
    if (args.color !== undefined) patch.color = args.color || label.color;
    await ctx.db.patch(labelId, patch);
    return null;
  },
});

export const remove = mutation({
  args: { labelId: v.id("taskLabels") },
  returns: v.null(),
  handler: async (ctx, { labelId }) => {
    const { orgId } = await requireLabelManage(ctx);
    const label = await ctx.db.get(labelId);
    if (!label || label.orgId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Label not found." });
    }
    // Strip the label off any task that carries it.
    const tasks = await ctx.db
      .query("projectTasks")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    for (const t of tasks) {
      if (t.labelIds?.includes(labelId)) {
        const next = t.labelIds.filter((id) => id !== labelId);
        await ctx.db.patch(t._id, { labelIds: next.length ? next : undefined });
      }
    }
    await ctx.db.delete(labelId);
    return null;
  },
});
