import { mutation, query, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { requireOrg, requirePermission } from "./auth";
import { competencyDoc } from "./lib/validators";
import { competencyLevelDescriptor } from "./lib/enums";
import { writeAuditLog } from "./lib/audit";
import {
  DEFAULT_COMPETENCIES,
  DEFAULT_LEVEL_DESCRIPTORS,
} from "./lib/performanceDefaults";

// Insert the starter competency library for an org if it has none yet.
// Idempotent — safe to call from cycle creation and org seeding.
export async function ensureDefaultCompetencies(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
): Promise<void> {
  const existing = await ctx.db
    .query("competencies")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .first();
  if (existing) return;
  let order = 0;
  for (const c of DEFAULT_COMPETENCIES) {
    await ctx.db.insert("competencies", {
      orgId,
      category: c.category,
      name: c.name,
      description: c.description,
      levelDescriptors: DEFAULT_LEVEL_DESCRIPTORS,
      weightPct: c.weightPct,
      order: order++,
      active: true,
    });
  }
}

export const list = query({
  args: {},
  returns: v.array(competencyDoc),
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    const rows = await ctx.db
      .query("competencies")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    rows.sort((a, b) => a.order - b.order);
    return rows;
  },
});

// One-shot seeding trigger for orgs created before the competency library
// existed (the settings editor calls this when the list is empty).
export const seedDefaults = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "performance:manage");
    await ensureDefaultCompetencies(ctx, orgId);
    return null;
  },
});

export const create = mutation({
  args: {
    category: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    weightPct: v.optional(v.number()),
    levelDescriptors: v.optional(v.array(competencyLevelDescriptor)),
  },
  returns: v.id("competencies"),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(ctx, "performance:manage");
    if (!args.category.trim()) throw new Error("Competency needs a category.");
    if (!args.name.trim()) throw new Error("Competency needs a name.");
    const siblings = await ctx.db
      .query("competencies")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const order = siblings.reduce((m, c) => Math.max(m, c.order + 1), 0);
    const id = await ctx.db.insert("competencies", {
      orgId,
      category: args.category.trim(),
      name: args.name.trim(),
      description: args.description?.trim() || undefined,
      levelDescriptors: args.levelDescriptors ?? DEFAULT_LEVEL_DESCRIPTORS,
      weightPct: args.weightPct,
      order,
      active: true,
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "competency.create",
      entity: "competencies",
      entityId: id,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    competencyId: v.id("competencies"),
    category: v.optional(v.string()),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    weightPct: v.optional(v.number()),
    levelDescriptors: v.optional(v.array(competencyLevelDescriptor)),
    active: v.optional(v.boolean()),
    order: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { competencyId, ...patch }) => {
    const { orgId } = await requirePermission(ctx, "performance:manage");
    const c = await ctx.db.get(competencyId);
    if (!c || c.orgId !== orgId) throw new Error("Competency not found.");
    await ctx.db.patch(competencyId, {
      ...(patch.category !== undefined && { category: patch.category.trim() }),
      ...(patch.name !== undefined && { name: patch.name.trim() }),
      ...(patch.description !== undefined && {
        description: patch.description.trim() || undefined,
      }),
      ...(patch.weightPct !== undefined && { weightPct: patch.weightPct }),
      ...(patch.levelDescriptors !== undefined && {
        levelDescriptors: patch.levelDescriptors,
      }),
      ...(patch.active !== undefined && { active: patch.active }),
      ...(patch.order !== undefined && { order: patch.order }),
    });
    return null;
  },
});

export const remove = mutation({
  args: { competencyId: v.id("competencies") },
  returns: v.null(),
  handler: async (ctx, { competencyId }) => {
    const { orgId } = await requirePermission(ctx, "performance:manage");
    const c = await ctx.db.get(competencyId);
    if (!c || c.orgId !== orgId) throw new Error("Competency not found.");
    await ctx.db.delete(competencyId);
    return null;
  },
});
