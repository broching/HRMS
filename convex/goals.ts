import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requireOrg, getOrgContext, OrgContext } from "./auth";
import { ctxHasPermission } from "./auth";
import { employeeByUserId } from "./employees";
import { goalStatus } from "./lib/enums";
import { goalRow } from "./lib/validators";
import { writeAuditLog } from "./lib/audit";

// A caller may manage an employee's goals if it's their own, they manage that
// employee, or they have performance:manage.
async function assertGoalAccess(
  ctx: QueryCtx,
  orgCtx: OrgContext,
  employeeId: Id<"employees">,
) {
  if (ctxHasPermission(orgCtx, "performance:manage")) return;
  const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
  if (own && own._id === employeeId) return;
  const target = await ctx.db.get(employeeId);
  if (own && target && target.managerId === own._id) return;
  throw new Error("Not authorized to manage these goals.");
}

async function hydrate(ctx: QueryCtx, g: Doc<"goals">) {
  const [emp, cycle] = await Promise.all([
    ctx.db.get(g.employeeId),
    g.cycleId ? ctx.db.get(g.cycleId) : Promise.resolve(null),
  ]);
  return {
    _id: g._id,
    _creationTime: g._creationTime,
    employeeId: g.employeeId,
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
    cycleId: g.cycleId ?? null,
    cycleName: cycle?.name ?? null,
    title: g.title,
    description: g.description ?? null,
    weight: g.weight,
    progress: g.progress,
    status: g.status,
    dueDate: g.dueDate ?? null,
  };
}

export const mine = query({
  args: {},
  returns: v.array(goalRow),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    if (!own) return [];
    const goals = await ctx.db
      .query("goals")
      .withIndex("by_employee", (q) => q.eq("employeeId", own._id))
      .order("desc")
      .collect();
    return await Promise.all(goals.map((g) => hydrate(ctx, g)));
  },
});

export const forEmployee = query({
  args: { employeeId: v.id("employees") },
  returns: v.array(goalRow),
  handler: async (ctx, { employeeId }) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    await assertGoalAccess(ctx, orgCtx, employeeId);
    const goals = await ctx.db
      .query("goals")
      .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
      .order("desc")
      .collect();
    return await Promise.all(goals.map((g) => hydrate(ctx, g)));
  },
});

export const create = mutation({
  args: {
    employeeId: v.optional(v.id("employees")),
    cycleId: v.optional(v.id("reviewCycles")),
    title: v.string(),
    description: v.optional(v.string()),
    weight: v.optional(v.number()),
    dueDate: v.optional(v.string()),
  },
  returns: v.id("goals"),
  handler: async (ctx, args) => {
    const orgCtx = await requireOrg(ctx);
    // Default to the caller's own employee record.
    let employeeId = args.employeeId;
    if (!employeeId) {
      const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
      if (!own) throw new Error("You don't have an employee profile yet.");
      employeeId = own._id;
    }
    await assertGoalAccess(ctx, orgCtx, employeeId);
    if (!args.title.trim()) throw new Error("Goal needs a title.");

    const id = await ctx.db.insert("goals", {
      orgId: orgCtx.orgId,
      employeeId,
      cycleId: args.cycleId,
      title: args.title.trim(),
      description: args.description,
      weight: args.weight ?? 0,
      progress: 0,
      status: "not_started",
      dueDate: args.dueDate,
      createdBy: orgCtx.userId,
    });
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "goal.create",
      entity: "goals",
      entityId: id,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    goalId: v.id("goals"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    weight: v.optional(v.number()),
    progress: v.optional(v.number()),
    status: v.optional(goalStatus),
    dueDate: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { goalId, ...patch }) => {
    const orgCtx = await requireOrg(ctx);
    const goal = await ctx.db.get(goalId);
    if (!goal || goal.orgId !== orgCtx.orgId) throw new Error("Goal not found.");
    await assertGoalAccess(ctx, orgCtx, goal.employeeId);

    if (patch.progress !== undefined) {
      patch.progress = Math.max(0, Math.min(100, patch.progress));
      // Keep status in step with progress unless explicitly overridden.
      if (patch.status === undefined) {
        patch.status =
          patch.progress >= 100
            ? "completed"
            : patch.progress > 0
              ? "in_progress"
              : goal.status;
      }
    }
    await ctx.db.patch(goalId, patch);
    return null;
  },
});

export const remove = mutation({
  args: { goalId: v.id("goals") },
  returns: v.null(),
  handler: async (ctx, { goalId }) => {
    const orgCtx = await requireOrg(ctx);
    const goal = await ctx.db.get(goalId);
    if (!goal || goal.orgId !== orgCtx.orgId) throw new Error("Goal not found.");
    await assertGoalAccess(ctx, orgCtx, goal.employeeId);
    await ctx.db.delete(goalId);
    return null;
  },
});
