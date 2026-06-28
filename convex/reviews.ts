import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requireOrg, getOrgContext, requirePermission, OrgContext } from "./auth";
import { hasPermission } from "./lib/permissions";
import { employeeByUserId } from "./employees";
import { reviewRow, reviewDetail } from "./lib/validators";
import { writeAuditLog } from "./lib/audit";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function hydrateRow(ctx: QueryCtx, r: Doc<"reviews">) {
  const [cycle, emp, mgr] = await Promise.all([
    ctx.db.get(r.cycleId),
    ctx.db.get(r.employeeId),
    r.managerId ? ctx.db.get(r.managerId) : Promise.resolve(null),
  ]);
  return {
    _id: r._id,
    _creationTime: r._creationTime,
    cycleId: r.cycleId,
    cycleName: cycle?.name ?? "—",
    employeeId: r.employeeId,
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
    managerId: r.managerId ?? null,
    managerName: mgr ? `${mgr.firstName} ${mgr.lastName}` : null,
    status: r.status,
    selfRating: r.selfRating ?? null,
    managerRating: r.managerRating ?? null,
    overallRating: r.overallRating ?? null,
    ratingScaleMax: cycle?.ratingScaleMax ?? 5,
  };
}

// Resolve access + the caller's own employee record + manager relationship.
async function loadReviewAccess(ctx: QueryCtx, reviewId: Id<"reviews">) {
  const orgCtx = await requireOrg(ctx);
  const review = await ctx.db.get(reviewId);
  if (!review || review.orgId !== orgCtx.orgId) {
    throw new Error("Review not found.");
  }
  const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
  const isSubject = !!own && own._id === review.employeeId;
  const isManager = !!own && review.managerId === own._id;
  const canManagePerf = hasPermission(orgCtx.role, "performance:manage");
  if (!isSubject && !isManager && !canManagePerf) {
    throw new Error("Not authorized to view this review.");
  }
  return { orgCtx, review, own, isSubject, isManager, canManagePerf };
}

async function notify(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  recipientUserId: Id<"users"> | undefined,
  type: string,
  title: string,
  body: string,
  reviewId: Id<"reviews">,
) {
  if (!recipientUserId) return;
  await ctx.db.insert("notifications", {
    orgId,
    recipientUserId,
    type,
    title,
    body,
    entityRef: { table: "reviews", id: reviewId },
    read: false,
  });
}

function assertRating(rating: number, max: number) {
  if (!Number.isFinite(rating) || rating < 1 || rating > max) {
    throw new Error(`Rating must be between 1 and ${max}.`);
  }
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export const mine = query({
  args: {},
  returns: v.array(reviewRow),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    if (!own) return [];
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_employee", (q) => q.eq("employeeId", own._id))
      .order("desc")
      .collect();
    return await Promise.all(reviews.map((r) => hydrateRow(ctx, r)));
  },
});

// Reviews awaiting the calling manager's input.
export const managerQueue = query({
  args: {},
  returns: v.array(reviewRow),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    if (!own) return [];
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_manager_status", (q) =>
        q.eq("managerId", own._id).eq("status", "manager_review"),
      )
      .collect();
    return await Promise.all(reviews.map((r) => hydrateRow(ctx, r)));
  },
});

// Every review in a cycle (HR/admin oversight).
export const listForCycle = query({
  args: { cycleId: v.id("reviewCycles") },
  returns: v.array(reviewRow),
  handler: async (ctx, { cycleId }) => {
    const { orgId } = await requirePermission(ctx, "performance:manage");
    const cycle = await ctx.db.get(cycleId);
    if (!cycle || cycle.orgId !== orgId) return [];
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_cycle", (q) => q.eq("cycleId", cycleId))
      .collect();
    const rows = await Promise.all(reviews.map((r) => hydrateRow(ctx, r)));
    rows.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
    return rows;
  },
});

export const get = query({
  args: { reviewId: v.id("reviews") },
  returns: reviewDetail,
  handler: async (ctx, { reviewId }) => {
    const { review, isSubject, isManager, canManagePerf } =
      await loadReviewAccess(ctx, reviewId);
    const [cycle, emp, mgr] = await Promise.all([
      ctx.db.get(review.cycleId),
      ctx.db.get(review.employeeId),
      review.managerId ? ctx.db.get(review.managerId) : Promise.resolve(null),
    ]);
    return {
      _id: review._id,
      _creationTime: review._creationTime,
      cycleId: review.cycleId,
      cycleName: cycle?.name ?? "—",
      employeeId: review.employeeId,
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
      managerId: review.managerId ?? null,
      managerName: mgr ? `${mgr.firstName} ${mgr.lastName}` : null,
      status: review.status,
      selfRating: review.selfRating ?? null,
      selfComments: review.selfComments ?? null,
      managerRating: review.managerRating ?? null,
      managerComments: review.managerComments ?? null,
      overallRating: review.overallRating ?? null,
      ratingScaleMax: cycle?.ratingScaleMax ?? 5,
      canSelf: isSubject && review.status === "self_review",
      canManager:
        (isManager || canManagePerf) && review.status === "manager_review",
    };
  },
});

// ─── Mutations ───────────────────────────────────────────────────────────────

export const submitSelf = mutation({
  args: {
    reviewId: v.id("reviews"),
    rating: v.number(),
    comments: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { reviewId, rating, comments }) => {
    const { orgCtx, review, isSubject } = await loadReviewAccess(ctx, reviewId);
    if (!isSubject) throw new Error("Only the employee can submit their self-review.");
    if (review.status !== "self_review") {
      throw new Error("This self-review has already been submitted.");
    }
    const cycle = await ctx.db.get(review.cycleId);
    assertRating(rating, cycle?.ratingScaleMax ?? 5);

    await ctx.db.patch(reviewId, {
      selfRating: rating,
      selfComments: comments,
      selfSubmittedAt: Date.now(),
      status: "manager_review",
    });

    if (review.managerId) {
      const mgr = await ctx.db.get(review.managerId);
      await notify(
        ctx,
        orgCtx.orgId,
        mgr?.userId,
        "review.self_submitted",
        "Review to complete",
        "A self-review is ready for your input.",
        reviewId,
      );
    }
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "review.submit_self",
      entity: "reviews",
      entityId: reviewId,
    });
    return null;
  },
});

export const submitManager = mutation({
  args: {
    reviewId: v.id("reviews"),
    rating: v.number(),
    comments: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { reviewId, rating, comments }) => {
    const { orgCtx, review, isManager, canManagePerf } = await loadReviewAccess(
      ctx,
      reviewId,
    );
    if (!isManager && !canManagePerf) {
      throw new Error("Only the manager or HR can complete this review.");
    }
    if (review.status !== "manager_review") {
      throw new Error("This review is not awaiting manager input.");
    }
    const cycle = await ctx.db.get(review.cycleId);
    assertRating(rating, cycle?.ratingScaleMax ?? 5);

    await ctx.db.patch(reviewId, {
      managerRating: rating,
      managerComments: comments,
      managerSubmittedAt: Date.now(),
      overallRating: rating,
      status: "completed",
    });

    const emp = await ctx.db.get(review.employeeId);
    await notify(
      ctx,
      orgCtx.orgId,
      emp?.userId,
      "review.completed",
      "Review completed",
      "Your performance review has been completed.",
      reviewId,
    );
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "review.submit_manager",
      entity: "reviews",
      entityId: reviewId,
    });
    return null;
  },
});
