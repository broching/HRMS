import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { reviewObjectiveRow } from "./lib/validators";
import { loadReviewAccess } from "./reviews";
import { writeAuditLog } from "./lib/audit";

function hydrate(o: Doc<"reviewObjectives">) {
  return {
    _id: o._id,
    _creationTime: o._creationTime,
    reviewId: o.reviewId,
    cycleId: o.cycleId,
    employeeId: o.employeeId,
    category: o.category ?? null,
    title: o.title,
    weight: o.weight,
    progress: o.progress,
    selfRating: o.selfRating ?? null,
    selfComment: o.selfComment ?? null,
    appraiserRating: o.appraiserRating ?? null,
    appraiserComment: o.appraiserComment ?? null,
    order: o.order,
  };
}

async function listRows(ctx: QueryCtx, reviewId: Doc<"reviews">["_id"]) {
  const rows = await ctx.db
    .query("reviewObjectives")
    .withIndex("by_review", (q) => q.eq("reviewId", reviewId))
    .collect();
  rows.sort((a, b) => a.order - b.order);
  return rows.map(hydrate);
}

export const forReview = query({
  args: { reviewId: v.id("reviews") },
  returns: v.array(reviewObjectiveRow),
  handler: async (ctx, { reviewId }) => {
    await loadReviewAccess(ctx, reviewId); // authorizes read
    return await listRows(ctx, reviewId);
  },
});

// Seed the review's objectives from the employee's goals for this cycle (falling
// back to their unscoped goals). No-op if objectives already exist.
export const confirmFromGoals = mutation({
  args: { reviewId: v.id("reviews") },
  returns: v.object({ created: v.number() }),
  handler: async (ctx, { reviewId }) => {
    const { orgCtx, review, isSubject, isManager, canManagePerf } =
      await loadReviewAccess(ctx, reviewId);
    if (!isSubject && !isManager && !canManagePerf) {
      throw new Error("Not authorized to confirm objectives.");
    }
    const existing = await ctx.db
      .query("reviewObjectives")
      .withIndex("by_review", (q) => q.eq("reviewId", reviewId))
      .first();
    if (existing) return { created: 0 };

    const goals = await ctx.db
      .query("goals")
      .withIndex("by_employee", (q) => q.eq("employeeId", review.employeeId))
      .collect();
    const scoped = goals.filter(
      (g) => g.cycleId === review.cycleId || g.cycleId === undefined,
    );

    let order = 0;
    let created = 0;
    for (const g of scoped) {
      await ctx.db.insert("reviewObjectives", {
        orgId: orgCtx.orgId,
        reviewId,
        cycleId: review.cycleId,
        employeeId: review.employeeId,
        category: undefined,
        title: g.title,
        weight: g.weight,
        progress: g.progress,
        order: order++,
        sourceGoalId: g._id,
      });
      created += 1;
    }
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "reviewObjective.confirm_from_goals",
      entity: "reviews",
      entityId: reviewId,
      after: { created },
    });
    return { created };
  },
});

export const add = mutation({
  args: {
    reviewId: v.id("reviews"),
    title: v.string(),
    category: v.optional(v.string()),
    weight: v.optional(v.number()),
    progress: v.optional(v.number()),
  },
  returns: v.id("reviewObjectives"),
  handler: async (ctx, args) => {
    const { orgCtx, review, isSubject, isManager, canManagePerf } =
      await loadReviewAccess(ctx, args.reviewId);
    if (!isSubject && !isManager && !canManagePerf) {
      throw new Error("Not authorized to add objectives.");
    }
    if (!args.title.trim()) throw new Error("Objective needs a title.");
    const siblings = await ctx.db
      .query("reviewObjectives")
      .withIndex("by_review", (q) => q.eq("reviewId", args.reviewId))
      .collect();
    const order = siblings.reduce((m, o) => Math.max(m, o.order + 1), 0);
    return await ctx.db.insert("reviewObjectives", {
      orgId: orgCtx.orgId,
      reviewId: args.reviewId,
      cycleId: review.cycleId,
      employeeId: review.employeeId,
      category: args.category?.trim() || undefined,
      title: args.title.trim(),
      weight: args.weight ?? 0,
      progress: Math.max(0, Math.min(100, args.progress ?? 0)),
      order,
    });
  },
});

// Rate an objective. `side` selects whose rating/comment is written; gated by
// relationship + review stage.
export const rate = mutation({
  args: {
    objectiveId: v.id("reviewObjectives"),
    side: v.union(v.literal("self"), v.literal("appraiser")),
    rating: v.optional(v.number()),
    comment: v.optional(v.string()),
    progress: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { objectiveId, side, rating, comment, progress }) => {
    const objective = await ctx.db.get(objectiveId);
    if (!objective) throw new Error("Objective not found.");
    const { review, isSubject, isManager, canManagePerf } =
      await loadReviewAccess(ctx, objective.reviewId);

    if (side === "self") {
      if (!isSubject) throw new Error("Only the employee can enter self ratings.");
      if (review.status !== "self_review") {
        throw new Error("Self-appraisal is closed for this review.");
      }
    } else {
      if (!isManager && !canManagePerf) {
        throw new Error("Only the appraiser or HR can enter appraiser ratings.");
      }
      if (review.status === "completed") {
        throw new Error("This appraisal is completed.");
      }
    }

    const patch: Partial<Doc<"reviewObjectives">> = {};
    if (progress !== undefined) {
      patch.progress = Math.max(0, Math.min(100, progress));
    }
    if (side === "self") {
      if (rating !== undefined) patch.selfRating = rating;
      if (comment !== undefined) patch.selfComment = comment;
    } else {
      if (rating !== undefined) patch.appraiserRating = rating;
      if (comment !== undefined) patch.appraiserComment = comment;
    }
    await ctx.db.patch(objectiveId, patch);
    return null;
  },
});

export const remove = mutation({
  args: { objectiveId: v.id("reviewObjectives") },
  returns: v.null(),
  handler: async (ctx, { objectiveId }) => {
    const objective = await ctx.db.get(objectiveId);
    if (!objective) throw new Error("Objective not found.");
    const { isManager, canManagePerf, isSubject, review } =
      await loadReviewAccess(ctx, objective.reviewId);
    if (!isSubject && !isManager && !canManagePerf) {
      throw new Error("Not authorized.");
    }
    if (review.status === "completed") {
      throw new Error("This appraisal is completed.");
    }
    await ctx.db.delete(objectiveId);
    return null;
  },
});
