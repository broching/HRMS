import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requireOrg, getOrgContext, requirePermission, OrgContext } from "./auth";
import { hasPermission } from "./lib/permissions";
import { employeeByUserId } from "./employees";
import { reviewRow, reviewDetail, appraisalDetail } from "./lib/validators";
import { writeAuditLog } from "./lib/audit";
import { DEFAULT_RATING_BANDS } from "./lib/performanceDefaults";

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
export async function loadReviewAccess(ctx: QueryCtx, reviewId: Id<"reviews">) {
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

// ─── Rich appraisal (weighted objectives + competencies) ──────────────────────

// Weighted average of the appraiser ratings on a set of lines, weighted by
// `weightKey`. Falls back to a simple mean when all weights are zero. Returns
// null when nothing is rated.
function weightedAppraiserScore<T extends { appraiserRating?: number }>(
  lines: T[],
  weightOf: (line: T) => number,
): number | null {
  const rated = lines.filter((l) => l.appraiserRating != null);
  if (rated.length === 0) return null;
  const totalWeight = rated.reduce((s, l) => s + (weightOf(l) || 0), 0);
  if (totalWeight > 0) {
    const sum = rated.reduce(
      (s, l) => s + (weightOf(l) || 0) * (l.appraiserRating as number),
      0,
    );
    return sum / totalWeight;
  }
  const sum = rated.reduce((s, l) => s + (l.appraiserRating as number), 0);
  return sum / rated.length;
}

function bandFor(
  overall: number | null,
  bands: { min: number; label: string }[] | undefined,
): string | null {
  if (overall == null) return null;
  const list = (bands && bands.length ? bands : [...DEFAULT_RATING_BANDS])
    .slice()
    .sort((a, b) => a.min - b.min);
  let label: string | null = null;
  for (const b of list) if (overall >= b.min) label = b.label;
  return label;
}

// Recompute objectives/competencies/overall scores + band and persist them.
async function computeAndPersistScores(
  ctx: MutationCtx,
  review: Doc<"reviews">,
): Promise<void> {
  const cycle = await ctx.db.get(review.cycleId);
  const objW = cycle?.objectivesWeightPct ?? 70;
  const compW = cycle?.competenciesWeightPct ?? 30;

  const objectives = await ctx.db
    .query("reviewObjectives")
    .withIndex("by_review", (q) => q.eq("reviewId", review._id))
    .collect();
  const competencies = await ctx.db
    .query("reviewCompetencies")
    .withIndex("by_review", (q) => q.eq("reviewId", review._id))
    .collect();

  const objectivesScore = weightedAppraiserScore(objectives, (o) => o.weight);
  const competenciesScore = weightedAppraiserScore(
    competencies,
    (c) => c.weightPct,
  );

  const parts: { w: number; s: number }[] = [];
  if (objectivesScore != null) parts.push({ w: objW, s: objectivesScore });
  if (competenciesScore != null) parts.push({ w: compW, s: competenciesScore });
  const totalW = parts.reduce((s, p) => s + p.w, 0);
  const overall =
    parts.length === 0 || totalW === 0
      ? null
      : parts.reduce((s, p) => s + p.w * p.s, 0) / totalW;

  await ctx.db.patch(review._id, {
    objectivesScore: objectivesScore ?? undefined,
    competenciesScore: competenciesScore ?? undefined,
    overallRating: overall ?? undefined,
    managerRating: overall ?? undefined,
    ratingBand: bandFor(overall, cycle?.ratingBands) ?? undefined,
  });
}

export const getAppraisal = query({
  args: { reviewId: v.id("reviews") },
  returns: appraisalDetail,
  handler: async (ctx, { reviewId }) => {
    const { review, isSubject, isManager, canManagePerf } =
      await loadReviewAccess(ctx, reviewId);
    const [cycle, emp, mgr] = await Promise.all([
      ctx.db.get(review.cycleId),
      ctx.db.get(review.employeeId),
      review.managerId ? ctx.db.get(review.managerId) : Promise.resolve(null),
    ]);
    const [position, department] = await Promise.all([
      emp?.positionId ? ctx.db.get(emp.positionId) : Promise.resolve(null),
      emp?.departmentId ? ctx.db.get(emp.departmentId) : Promise.resolve(null),
    ]);

    const questions = cycle?.questionnaire ?? [];
    const questionnaire = questions.map((q, i) => ({
      question: q,
      selfAnswer: review.selfAnswers?.[i] ?? null,
      appraiserAnswer: review.appraiserAnswers?.[i] ?? null,
    }));

    // 360 results are visible to HR + the subject's manager only, never the subject.
    const canView = canManagePerf || isManager;

    return {
      _id: review._id,
      cycleId: review.cycleId,
      cycleName: cycle?.name ?? "—",
      cycleStartDate: cycle?.startDate ?? "",
      cycleEndDate: cycle?.endDate ?? "",
      ratingScaleMax: cycle?.ratingScaleMax ?? 5,
      employeeId: review.employeeId,
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
      employeeTitle: position?.title ?? null,
      departmentName: department?.name ?? null,
      appraiserId: review.managerId ?? null,
      appraiserName: mgr ? `${mgr.firstName} ${mgr.lastName}` : null,
      status: review.status,
      competencyLevel: review.competencyLevel ?? null,
      objectivesWeightPct: cycle?.objectivesWeightPct ?? 70,
      competenciesWeightPct: cycle?.competenciesWeightPct ?? 30,
      objectivesScore: review.objectivesScore ?? null,
      competenciesScore: review.competenciesScore ?? null,
      overallRating: review.overallRating ?? null,
      ratingBand: review.ratingBand ?? null,
      selfSubmittedAt: review.selfSubmittedAt ?? null,
      managerSubmittedAt: review.managerSubmittedAt ?? null,
      acknowledgedAt: review.acknowledgedAt ?? null,
      questionnaire,
      canSelf: isSubject && review.status === "self_review",
      canAppraiser:
        (isManager || canManagePerf) && review.status !== "completed",
      canAcknowledge:
        isSubject && review.status === "completed" && !review.acknowledgedAt,
      canViewFeedback: canView,
    };
  },
});

// Save a single questionnaire answer (self or appraiser side).
export const saveAnswer = mutation({
  args: {
    reviewId: v.id("reviews"),
    side: v.union(v.literal("self"), v.literal("appraiser")),
    index: v.number(),
    answer: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { reviewId, side, index, answer }) => {
    const { review, isSubject, isManager, canManagePerf } =
      await loadReviewAccess(ctx, reviewId);
    const cycle = await ctx.db.get(review.cycleId);
    const count = cycle?.questionnaire?.length ?? 0;
    if (index < 0 || index >= count) throw new Error("Invalid question.");

    if (side === "self") {
      if (!isSubject) throw new Error("Only the employee can answer here.");
      if (review.status !== "self_review") {
        throw new Error("Self-appraisal is closed.");
      }
      const answers = [...(review.selfAnswers ?? [])];
      while (answers.length < count) answers.push("");
      answers[index] = answer;
      await ctx.db.patch(reviewId, { selfAnswers: answers });
    } else {
      if (!isManager && !canManagePerf) {
        throw new Error("Only the appraiser or HR can answer here.");
      }
      if (review.status === "completed") throw new Error("Appraisal completed.");
      const answers = [...(review.appraiserAnswers ?? [])];
      while (answers.length < count) answers.push("");
      answers[index] = answer;
      await ctx.db.patch(reviewId, { appraiserAnswers: answers });
    }
    return null;
  },
});

// Employee submits their self-appraisal → moves to appraiser review.
export const submitSelfAppraisal = mutation({
  args: { reviewId: v.id("reviews") },
  returns: v.null(),
  handler: async (ctx, { reviewId }) => {
    const { orgCtx, review, isSubject } = await loadReviewAccess(ctx, reviewId);
    if (!isSubject) throw new Error("Only the employee can submit.");
    if (review.status !== "self_review") {
      throw new Error("Self-appraisal already submitted.");
    }
    await ctx.db.patch(reviewId, {
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
        "Appraisal to complete",
        "A self-appraisal is ready for your review.",
        reviewId,
      );
    }
    return null;
  },
});

// Appraiser (or HR) submits their appraisal → computes weighted overall + band
// and completes the review.
export const submitAppraiserAppraisal = mutation({
  args: { reviewId: v.id("reviews") },
  returns: v.null(),
  handler: async (ctx, { reviewId }) => {
    const { orgCtx, review, isManager, canManagePerf } = await loadReviewAccess(
      ctx,
      reviewId,
    );
    if (!isManager && !canManagePerf) {
      throw new Error("Only the appraiser or HR can complete this appraisal.");
    }
    if (review.status === "completed") {
      throw new Error("This appraisal is already completed.");
    }
    await computeAndPersistScores(ctx, review);
    await ctx.db.patch(reviewId, {
      managerSubmittedAt: Date.now(),
      status: "completed",
    });
    const emp = await ctx.db.get(review.employeeId);
    await notify(
      ctx,
      orgCtx.orgId,
      emp?.userId,
      "review.completed",
      "Appraisal completed",
      "Your performance appraisal has been completed.",
      reviewId,
    );
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "review.submit_appraiser",
      entity: "reviews",
      entityId: reviewId,
    });
    return null;
  },
});

// Re-open a completed appraisal back to appraiser review (HR / appraiser).
export const reopenAppraisal = mutation({
  args: { reviewId: v.id("reviews") },
  returns: v.null(),
  handler: async (ctx, { reviewId }) => {
    const { review, isManager, canManagePerf } = await loadReviewAccess(
      ctx,
      reviewId,
    );
    if (!isManager && !canManagePerf) throw new Error("Not authorized.");
    await ctx.db.patch(reviewId, {
      status: "manager_review",
      managerSubmittedAt: undefined,
      acknowledgedAt: undefined,
    });
    return null;
  },
});

// Employee acknowledges their completed appraisal.
export const acknowledgeAppraisal = mutation({
  args: { reviewId: v.id("reviews") },
  returns: v.null(),
  handler: async (ctx, { reviewId }) => {
    const { review, isSubject } = await loadReviewAccess(ctx, reviewId);
    if (!isSubject) throw new Error("Only the employee can acknowledge.");
    if (review.status !== "completed") {
      throw new Error("Appraisal is not ready to acknowledge.");
    }
    await ctx.db.patch(reviewId, { acknowledgedAt: Date.now() });
    return null;
  },
});
