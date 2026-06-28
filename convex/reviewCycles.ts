import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrg, requirePermission } from "./auth";
import { writeAuditLog } from "./lib/audit";
import { reviewCycleDoc } from "./lib/validators";

// Any org member can see cycles (to find their active review); management is
// gated by performance:manage.
export const list = query({
  args: {},
  returns: v.array(reviewCycleDoc),
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    const cycles = await ctx.db
      .query("reviewCycles")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .order("desc")
      .collect();
    return cycles;
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    ratingScaleMax: v.optional(v.number()),
  },
  returns: v.id("reviewCycles"),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(ctx, "performance:manage");
    if (!args.name.trim()) throw new Error("Cycle needs a name.");
    const id = await ctx.db.insert("reviewCycles", {
      orgId,
      name: args.name.trim(),
      startDate: args.startDate,
      endDate: args.endDate,
      status: "draft",
      ratingScaleMax: args.ratingScaleMax ?? 5,
      createdBy: userId,
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "reviewCycle.create",
      entity: "reviewCycles",
      entityId: id,
      after: { name: args.name },
    });
    return id;
  },
});

// Activate a draft cycle: generate a review row for every active employee and
// notify them to begin their self-review.
export const activate = mutation({
  args: { cycleId: v.id("reviewCycles") },
  returns: v.object({ created: v.number() }),
  handler: async (ctx, { cycleId }) => {
    const { orgId, userId } = await requirePermission(ctx, "performance:manage");
    const cycle = await ctx.db.get(cycleId);
    if (!cycle || cycle.orgId !== orgId) throw new Error("Cycle not found.");
    if (cycle.status === "closed") throw new Error("Cycle is closed.");

    const employees = (
      await ctx.db
        .query("employees")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .collect()
    ).filter((e) => e.status !== "terminated");

    let created = 0;
    for (const e of employees) {
      const existing = await ctx.db
        .query("reviews")
        .withIndex("by_employee_cycle", (q) =>
          q.eq("employeeId", e._id).eq("cycleId", cycleId),
        )
        .first();
      if (existing) continue;
      await ctx.db.insert("reviews", {
        orgId,
        cycleId,
        employeeId: e._id,
        managerId: e.managerId,
        status: "self_review",
      });
      created += 1;
      if (e.userId) {
        await ctx.db.insert("notifications", {
          orgId,
          recipientUserId: e.userId,
          type: "review.opened",
          title: "Self-review open",
          body: `Your self-review for ${cycle.name} is ready.`,
          entityRef: { table: "reviewCycles", id: cycleId },
          read: false,
        });
      }
    }

    if (cycle.status !== "active") {
      await ctx.db.patch(cycleId, { status: "active" });
    }
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "reviewCycle.activate",
      entity: "reviewCycles",
      entityId: cycleId,
      after: { created },
    });
    return { created };
  },
});

export const close = mutation({
  args: { cycleId: v.id("reviewCycles") },
  returns: v.null(),
  handler: async (ctx, { cycleId }) => {
    const { orgId, userId } = await requirePermission(ctx, "performance:manage");
    const cycle = await ctx.db.get(cycleId);
    if (!cycle || cycle.orgId !== orgId) throw new Error("Cycle not found.");
    await ctx.db.patch(cycleId, { status: "closed" });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "reviewCycle.close",
      entity: "reviewCycles",
      entityId: cycleId,
    });
    return null;
  },
});

export const remove = mutation({
  args: { cycleId: v.id("reviewCycles") },
  returns: v.null(),
  handler: async (ctx, { cycleId }) => {
    const { orgId, userId } = await requirePermission(ctx, "performance:manage");
    const cycle = await ctx.db.get(cycleId);
    if (!cycle || cycle.orgId !== orgId) throw new Error("Cycle not found.");
    if (cycle.status !== "draft") {
      throw new Error("Only draft cycles can be deleted.");
    }
    await ctx.db.delete(cycleId);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "reviewCycle.delete",
      entity: "reviewCycles",
      entityId: cycleId,
    });
    return null;
  },
});
