import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { reviewCompetencyRow } from "./lib/validators";
import { loadReviewAccess, selfOpen, appraiserOpen } from "./reviews";

function hydrate(c: Doc<"reviewCompetencies">) {
  return {
    _id: c._id,
    _creationTime: c._creationTime,
    reviewId: c.reviewId,
    cycleId: c.cycleId,
    employeeId: c.employeeId,
    competencyId: c.competencyId ?? null,
    category: c.category,
    name: c.name,
    description: c.description ?? null,
    level: c.level ?? null,
    weightPct: c.weightPct,
    selfRating: c.selfRating ?? null,
    selfComment: c.selfComment ?? null,
    appraiserRating: c.appraiserRating ?? null,
    appraiserComment: c.appraiserComment ?? null,
    order: c.order,
  };
}

async function listRows(ctx: QueryCtx, reviewId: Doc<"reviews">["_id"]) {
  const rows = await ctx.db
    .query("reviewCompetencies")
    .withIndex("by_review", (q) => q.eq("reviewId", reviewId))
    .collect();
  rows.sort((a, b) => a.order - b.order);
  return rows.map(hydrate);
}

export const forReview = query({
  args: { reviewId: v.id("reviews") },
  returns: v.array(reviewCompetencyRow),
  handler: async (ctx, { reviewId }) => {
    await loadReviewAccess(ctx, reviewId);
    return await listRows(ctx, reviewId);
  },
});

// Seed the review's competency lines from the org competency library. No-op if
// competencies already exist for the review.
export const ensureForReview = mutation({
  args: { reviewId: v.id("reviews") },
  returns: v.object({ created: v.number() }),
  handler: async (ctx, { reviewId }) => {
    const { orgCtx, review, isSubject, isManager, canManagePerf } =
      await loadReviewAccess(ctx, reviewId);
    if (!isSubject && !isManager && !canManagePerf) {
      throw new Error("Not authorized.");
    }
    const existing = await ctx.db
      .query("reviewCompetencies")
      .withIndex("by_review", (q) => q.eq("reviewId", reviewId))
      .first();
    if (existing) return { created: 0 };

    const library = (
      await ctx.db
        .query("competencies")
        .withIndex("by_org", (q) => q.eq("orgId", orgCtx.orgId))
        .collect()
    ).filter((c) => c.active);
    library.sort((a, b) => a.order - b.order);

    let order = 0;
    let created = 0;
    for (const c of library) {
      await ctx.db.insert("reviewCompetencies", {
        orgId: orgCtx.orgId,
        reviewId,
        cycleId: review.cycleId,
        employeeId: review.employeeId,
        competencyId: c._id,
        category: c.category,
        name: c.name,
        description: c.description,
        level: review.competencyLevel,
        weightPct: c.weightPct ?? 0,
        order: order++,
      });
      created += 1;
    }
    return { created };
  },
});

export const rate = mutation({
  args: {
    competencyId: v.id("reviewCompetencies"),
    side: v.union(v.literal("self"), v.literal("appraiser")),
    rating: v.optional(v.number()),
    comment: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { competencyId, side, rating, comment }) => {
    const row = await ctx.db.get(competencyId);
    if (!row) throw new Error("Competency not found.");
    const { review, isSubject, isManager, canManagePerf } =
      await loadReviewAccess(ctx, row.reviewId);

    if (side === "self") {
      if (!isSubject) throw new Error("Only the employee can enter self ratings.");
      if (!selfOpen(review)) {
        throw new Error("Self-appraisal is closed for this review.");
      }
    } else {
      if (!isManager && !canManagePerf) {
        throw new Error("Only the appraiser or HR can enter appraiser ratings.");
      }
      if (!appraiserOpen(review)) {
        throw new Error("This appraisal is completed.");
      }
    }

    const patch: Partial<Doc<"reviewCompetencies">> = {};
    if (side === "self") {
      if (rating !== undefined) patch.selfRating = rating;
      if (comment !== undefined) patch.selfComment = comment;
    } else {
      if (rating !== undefined) patch.appraiserRating = rating;
      if (comment !== undefined) patch.appraiserComment = comment;
    }
    await ctx.db.patch(competencyId, patch);
    return null;
  },
});
