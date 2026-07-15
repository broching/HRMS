import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requireOrg, getOrgContext, requirePermission, OrgContext } from "./auth";
import { ctxHasPermission } from "./auth";
import { employeeByUserId } from "./employees";
import { pushNotification } from "./model/notify";
import {
  reviewRow,
  reviewDetail,
  appraisalDetail,
  appraisalFormResult,
} from "./lib/validators";
import { writeAuditLog } from "./lib/audit";
import { DEFAULT_RATING_BANDS } from "./lib/performanceDefaults";
import { normalizeForm, answerableFields } from "./lib/performanceForm";
import { reviewAnswerSide } from "./lib/enums";

// ─── Parallel-flow gating ────────────────────────────────────────────────────
// Both sides open at release; each side is editable until it submits (or the
// review completes). Gating keys off the per-side timestamps, NOT `status`.
export function selfOpen(review: Doc<"reviews">): boolean {
  return review.selfSubmittedAt == null && review.status !== "completed";
}
export function appraiserOpen(review: Doc<"reviews">): boolean {
  return review.managerSubmittedAt == null && review.status !== "completed";
}

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
  const canManagePerf = ctxHasPermission(orgCtx, "performance:manage");
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
  // Route through the shared entry point so the appraisal email is sent (when
  // the org has opted performance into email) and deep-links to the form.
  await pushNotification(ctx, {
    orgId,
    recipientUserId,
    type,
    title,
    body,
    entityRef: { table: "reviews", id: reviewId },
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

// Reviews awaiting the calling manager's input. Parallel flow: the appraiser can
// start as soon as the cycle is released, so this surfaces every not-yet-
// completed review for the manager's reports (not only post-self-submit ones).
export const managerQueue = query({
  args: {},
  returns: v.array(reviewRow),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    if (!own) return [];
    const reviews = (
      await ctx.db
        .query("reviews")
        .withIndex("by_manager_status", (q) => q.eq("managerId", own._id))
        .collect()
    ).filter((r) => r.status !== "completed");
    return await Promise.all(reviews.map((r) => hydrateRow(ctx, r)));
  },
});

// Count of appraisal reviews awaiting the caller's input — as the subject (their
// self-review) plus as the appraiser (their reports' reviews still open). Powers
// the dashboard quick-action badge.
export const pendingCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return 0;
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    if (!own) return 0;
    const [asSubject, asManager] = await Promise.all([
      ctx.db
        .query("reviews")
        .withIndex("by_employee", (q) => q.eq("employeeId", own._id))
        .collect(),
      ctx.db
        .query("reviews")
        .withIndex("by_manager_status", (q) => q.eq("managerId", own._id))
        .collect(),
    ]);
    let count = 0;
    for (const r of asSubject) if (selfOpen(r)) count += 1;
    for (const r of asManager) if (appraiserOpen(r)) count += 1;
    return count;
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
//
// Generalized weighted scorer: every scored element of the form contributes a
// score on the cycle's rating scale, weighted by its `weightPct`:
//   • objectives block  → weighted-average appraiser rating of its objectives
//   • competencies block → weighted-average appraiser rating of its competencies
//   • ratingScale field  → the appraiser's answer, normalized to the cycle scale
// Overall = Σ(weight × score) / Σweight (equal-weighted mean if no weights set).
async function computeAndPersistScores(
  ctx: MutationCtx,
  review: Doc<"reviews">,
): Promise<void> {
  const cycle = await ctx.db.get(review.cycleId);
  if (!cycle) return;
  const scaleMax = cycle.ratingScaleMax ?? 5;
  const form = normalizeForm(cycle);

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

  // Appraiser-side rating answers, keyed by field id.
  const answers = await ctx.db
    .query("reviewAnswers")
    .withIndex("by_review_side", (q) =>
      q.eq("reviewId", review._id).eq("side", "appraiser"),
    )
    .collect();
  const ratingByField = new Map(
    answers.filter((a) => a.rating != null).map((a) => [a.fieldId, a.rating!]),
  );

  const parts: { w: number; s: number }[] = [];
  for (const field of form.sections.flatMap((s) => s.fields)) {
    const weight = field.weightPct ?? 0;
    if (field.type === "objectives") {
      if (objectivesScore != null) parts.push({ w: weight, s: objectivesScore });
    } else if (field.type === "competencies") {
      if (competenciesScore != null)
        parts.push({ w: weight, s: competenciesScore });
    } else if (field.type === "ratingScale") {
      const rating = ratingByField.get(field.id);
      if (rating != null) {
        const fieldMax = field.scaleMax ?? scaleMax;
        const normalized = fieldMax > 0 ? (rating / fieldMax) * scaleMax : 0;
        parts.push({ w: weight, s: normalized });
      }
    }
  }

  const totalW = parts.reduce((s, p) => s + p.w, 0);
  const overall =
    parts.length === 0
      ? null
      : totalW > 0
        ? parts.reduce((s, p) => s + p.w * p.s, 0) / totalW
        : parts.reduce((s, p) => s + p.s, 0) / parts.length;

  await ctx.db.patch(review._id, {
    objectivesScore: objectivesScore ?? undefined,
    competenciesScore: competenciesScore ?? undefined,
    overallRating: overall ?? undefined,
    managerRating: overall ?? undefined,
    ratingBand: bandFor(overall, cycle.ratingBands) ?? undefined,
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
      // Parallel flow: both sides open at release, gated by per-side submits.
      canSelf: isSubject && selfOpen(review),
      canAppraiser: (isManager || canManagePerf) && appraiserOpen(review),
      // 1b: the appraiser may fill in parallel but can only finalize once the
      // employee has submitted their self side.
      canFinalizeAppraiser:
        (isManager || canManagePerf) &&
        appraiserOpen(review) &&
        review.selfSubmittedAt != null,
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
    if (!selfOpen(review)) {
      throw new Error("Self-appraisal already submitted.");
    }
    await ctx.db.patch(reviewId, {
      selfSubmittedAt: Date.now(),
      // Advance the status marker only if the appraiser hasn't finalized.
      ...(review.status === "self_review" && { status: "manager_review" }),
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
    if (!appraiserOpen(review)) {
      throw new Error("This appraisal is already completed.");
    }
    if (review.selfSubmittedAt == null) {
      throw new Error(
        "Wait for the employee to submit their self-appraisal before finalizing.",
      );
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

// ─── Form-driven fill ────────────────────────────────────────────────────────

// Resolve the structured form + both sides' answers + caller capabilities. The
// FormRenderer drives entirely off this. Objectives/competencies blocks are
// still fetched via their own queries (they have per-line rating editors).
export const getAppraisalForm = query({
  args: { reviewId: v.id("reviews") },
  returns: appraisalFormResult,
  handler: async (ctx, { reviewId }) => {
    const { review, isSubject, isManager, canManagePerf } =
      await loadReviewAccess(ctx, reviewId);
    const [cycle, emp, mgr] = await Promise.all([
      ctx.db.get(review.cycleId),
      ctx.db.get(review.employeeId),
      review.managerId ? ctx.db.get(review.managerId) : Promise.resolve(null),
    ]);
    if (!cycle) throw new Error("Cycle not found.");
    const form = normalizeForm(cycle);

    const rows = await ctx.db
      .query("reviewAnswers")
      .withIndex("by_review_side", (q) => q.eq("reviewId", reviewId))
      .collect();
    const answers = await Promise.all(
      rows.map(async (a) => ({
        fieldId: a.fieldId,
        side: a.side,
        text: a.text ?? null,
        rating: a.rating ?? null,
        choice: a.choice ?? null,
        choices: a.choices ?? null,
        boolValue: a.boolValue ?? null,
        date: a.date ?? null,
        files: await Promise.all(
          (a.fileStorageIds ?? []).map(async (sid) => ({
            storageId: sid,
            url: await ctx.storage.getUrl(sid),
          })),
        ),
        signatureStorageId: a.signatureStorageId ?? null,
        signatureUrl: a.signatureStorageId
          ? await ctx.storage.getUrl(a.signatureStorageId)
          : null,
      })),
    );

    return {
      _id: review._id,
      cycleId: review.cycleId,
      cycleName: cycle.name,
      employeeId: review.employeeId,
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
      appraiserName: mgr ? `${mgr.firstName} ${mgr.lastName}` : null,
      ratingScaleMax: cycle.ratingScaleMax ?? 5,
      status: review.status,
      form,
      answers,
      viewerIsSubject: isSubject,
      viewerIsAppraiser: (isManager || canManagePerf) && !isSubject,
      canSelf: isSubject && selfOpen(review),
      canAppraiser: (isManager || canManagePerf) && appraiserOpen(review),
      canFinalizeAppraiser:
        (isManager || canManagePerf) &&
        appraiserOpen(review) &&
        review.selfSubmittedAt != null,
      canAcknowledge:
        isSubject && review.status === "completed" && !review.acknowledgedAt,
      selfSubmittedAt: review.selfSubmittedAt ?? null,
      managerSubmittedAt: review.managerSubmittedAt ?? null,
      acknowledgedAt: review.acknowledgedAt ?? null,
    };
  },
});

// Upsert one field answer for one side. Validates the field exists + is
// answerable by that side, and that the side is still open.
export const saveFieldAnswer = mutation({
  args: {
    reviewId: v.id("reviews"),
    fieldId: v.string(),
    side: reviewAnswerSide,
    value: v.object({
      text: v.optional(v.string()),
      rating: v.optional(v.number()),
      choice: v.optional(v.string()),
      choices: v.optional(v.array(v.string())),
      boolValue: v.optional(v.boolean()),
      date: v.optional(v.string()),
      fileStorageIds: v.optional(v.array(v.id("_storage"))),
      signatureStorageId: v.optional(v.id("_storage")),
    }),
  },
  returns: v.null(),
  handler: async (ctx, { reviewId, fieldId, side, value }) => {
    const { orgCtx, review, isSubject, isManager, canManagePerf } =
      await loadReviewAccess(ctx, reviewId);
    const cycle = await ctx.db.get(review.cycleId);
    if (!cycle) throw new Error("Cycle not found.");
    const field = answerableFields(normalizeForm(cycle)).find(
      (f) => f.id === fieldId,
    );
    if (!field) throw new Error("Unknown field.");
    if (field.type === "objectives" || field.type === "competencies") {
      throw new Error("Use the objectives/competencies editors for this block.");
    }

    if (side === "self") {
      if (field.side === "appraiser") {
        throw new Error("This field isn't answered by the employee.");
      }
      if (!isSubject) throw new Error("Only the employee can answer here.");
      if (!selfOpen(review)) throw new Error("Your appraisal is already submitted.");
    } else {
      if (field.side === "self") {
        throw new Error("This field isn't answered by the appraiser.");
      }
      if (!isManager && !canManagePerf) {
        throw new Error("Only the appraiser or HR can answer here.");
      }
      if (!appraiserOpen(review)) throw new Error("This appraisal is completed.");
    }

    if (field.type === "ratingScale" && value.rating != null) {
      const max = field.scaleMax ?? cycle.ratingScaleMax ?? 5;
      if (!Number.isFinite(value.rating) || value.rating < 0 || value.rating > max) {
        throw new Error(`Rating must be between 0 and ${max}.`);
      }
    }

    const fields = {
      text: value.text,
      rating: value.rating,
      choice: value.choice,
      choices: value.choices,
      boolValue: value.boolValue,
      date: value.date,
      fileStorageIds: value.fileStorageIds,
      signatureStorageId: value.signatureStorageId,
      updatedAt: Date.now(),
    };
    const existing = await ctx.db
      .query("reviewAnswers")
      .withIndex("by_review_field_side", (q) =>
        q.eq("reviewId", reviewId).eq("fieldId", fieldId).eq("side", side),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, fields);
    } else {
      await ctx.db.insert("reviewAnswers", {
        orgId: orgCtx.orgId,
        reviewId,
        cycleId: review.cycleId,
        employeeId: review.employeeId,
        fieldId,
        side,
        ...fields,
      });
    }
    return null;
  },
});

// Upload URL for file / signature answers. Any participant on the review may
// upload; the file is only referenced once saved via saveFieldAnswer.
export const generateUploadUrl = mutation({
  args: { reviewId: v.id("reviews") },
  returns: v.string(),
  handler: async (ctx, { reviewId }) => {
    const { isSubject, isManager, canManagePerf } = await loadReviewAccess(
      ctx,
      reviewId,
    );
    if (!isSubject && !isManager && !canManagePerf) {
      throw new Error("Not authorized.");
    }
    return await ctx.storage.generateUploadUrl();
  },
});
