import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireOrg } from "./auth";
import { isProjectPrivileged } from "./model/projectAccess";

/**
 * Saved filter presets for the board/list views. Personal by default; a task
 * manager can publish one org-wide (`isShared`). `filter` is opaque JSON owned by
 * the client (the filter-bar state).
 */

const viewDoc = v.object({
  _id: v.id("savedTaskViews"),
  _creationTime: v.number(),
  orgId: v.id("organizations"),
  userId: v.id("users"),
  projectId: v.union(v.id("projects"), v.null()),
  name: v.string(),
  filter: v.string(),
  isShared: v.boolean(),
  mine: v.boolean(),
});

export const list = query({
  args: { projectId: v.optional(v.id("projects")) },
  returns: v.array(viewDoc),
  handler: async (ctx, { projectId }) => {
    const { orgId, userId } = await requireOrg(ctx);
    // The caller's own views + every shared view in the org.
    const [mine, orgAll] = await Promise.all([
      ctx.db
        .query("savedTaskViews")
        .withIndex("by_user", (q) => q.eq("orgId", orgId).eq("userId", userId))
        .collect(),
      ctx.db
        .query("savedTaskViews")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .collect(),
    ]);
    const seen = new Set<string>();
    const rows = [];
    for (const r of [...mine, ...orgAll.filter((r) => r.isShared)]) {
      if (seen.has(r._id)) continue;
      seen.add(r._id);
      // Scope: views tied to a project only show on that project; global views
      // (no projectId) show everywhere.
      if (r.projectId && projectId && r.projectId !== projectId) continue;
      if (r.projectId && !projectId) continue;
      rows.push({
        _id: r._id,
        _creationTime: r._creationTime,
        orgId: r.orgId,
        userId: r.userId,
        projectId: r.projectId ?? null,
        name: r.name,
        filter: r.filter,
        isShared: r.isShared,
        mine: r.userId === userId,
      });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  },
});

export const save = mutation({
  args: {
    name: v.string(),
    filter: v.string(),
    projectId: v.optional(v.id("projects")),
    isShared: v.optional(v.boolean()),
  },
  returns: v.id("savedTaskViews"),
  handler: async (ctx, args) => {
    const orgCtx = await requireOrg(ctx);
    const name = args.name.trim();
    if (!name) throw new ConvexError({ code: "INPUT", message: "Give the view a name." });
    // Only managers may publish a shared view.
    const isShared = !!args.isShared && isProjectPrivileged(orgCtx);
    return await ctx.db.insert("savedTaskViews", {
      orgId: orgCtx.orgId,
      userId: orgCtx.userId,
      projectId: args.projectId,
      name: name.slice(0, 60),
      filter: args.filter,
      isShared,
    });
  },
});

export const remove = mutation({
  args: { viewId: v.id("savedTaskViews") },
  returns: v.null(),
  handler: async (ctx, { viewId }) => {
    const orgCtx = await requireOrg(ctx);
    const view = await ctx.db.get(viewId);
    if (!view || view.orgId !== orgCtx.orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "View not found." });
    }
    // The owner can always remove; managers can remove shared views.
    const canRemove =
      view.userId === orgCtx.userId ||
      (view.isShared && isProjectPrivileged(orgCtx));
    if (!canRemove) {
      throw new ConvexError({ code: "FORBIDDEN", message: "You can't remove this view." });
    }
    await ctx.db.delete(viewId);
    return null;
  },
});
