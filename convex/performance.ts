import { query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requirePermission } from "./auth";
import { reviewCycleDoc } from "./lib/validators";
import { reviewStatus } from "./lib/enums";

// Derived Progress Overview: rather than a configurable workflow engine, each
// stage's completion is computed live from the underlying appraisal data.
const stageStatus = v.union(
  v.literal("pending"),
  v.literal("ongoing"),
  v.literal("completed"),
);

const stageRow = v.object({
  id: v.string(),
  label: v.string(),
  group: v.string(), // "Objectives" | "Appraisal" | "360 Feedbacks"
  status: stageStatus,
  done: v.number(),
  total: v.number(),
  completionPct: v.number(),
  dueDate: v.union(v.string(), v.null()),
});

const dashboardResult = v.object({
  cycle: reviewCycleDoc,
  cycles: v.array(
    v.object({
      _id: v.id("reviewCycles"),
      name: v.string(),
      status: reviewCycleDoc.fields.status,
    }),
  ),
  stages: v.array(stageRow),
  employees: v.array(
    v.object({
      reviewId: v.id("reviews"),
      employeeId: v.id("employees"),
      name: v.string(),
      status: reviewStatus,
    }),
  ),
  totals: v.object({
    reviews: v.number(),
    completed: v.number(),
  }),
});

function toStage(
  id: string,
  label: string,
  group: string,
  done: number,
  total: number,
  dueDate: string | undefined,
) {
  const completionPct = total === 0 ? 0 : Math.round((done / total) * 100);
  const status: "pending" | "ongoing" | "completed" =
    total > 0 && done >= total ? "completed" : done > 0 ? "ongoing" : "pending";
  return { id, label, group, status, done, total, completionPct, dueDate: dueDate ?? null };
}

// The most relevant cycle to open by default: the active one, else the newest.
async function pickCycle(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  cycleId: Id<"reviewCycles"> | undefined,
): Promise<Doc<"reviewCycles"> | null> {
  if (cycleId) {
    const c = await ctx.db.get(cycleId);
    return c && c.orgId === orgId ? c : null;
  }
  const cycles = await ctx.db
    .query("reviewCycles")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .order("desc")
    .collect();
  return cycles.find((c) => c.status === "active") ?? cycles[0] ?? null;
}

// ─── Report ───────────────────────────────────────────────────────────────

const reportEmployee = v.object({
  reviewId: v.id("reviews"),
  employeeId: v.id("employees"),
  name: v.string(),
  departmentId: v.union(v.id("departments"), v.null()),
  departmentName: v.union(v.string(), v.null()),
  officeId: v.union(v.id("offices"), v.null()),
  officeName: v.union(v.string(), v.null()),
  appraiserId: v.union(v.id("employees"), v.null()),
  appraiserName: v.union(v.string(), v.null()),
  level: v.union(v.number(), v.null()),
  status: reviewStatus,
  selfSubmitted: v.boolean(),
  appraiserCompleted: v.boolean(),
  overallRating: v.union(v.number(), v.null()),
  objectivesScore: v.union(v.number(), v.null()),
  competenciesScore: v.union(v.number(), v.null()),
});

const reportResult = v.object({
  cycle: reviewCycleDoc,
  cycles: v.array(
    v.object({
      _id: v.id("reviewCycles"),
      name: v.string(),
      status: reviewCycleDoc.fields.status,
    }),
  ),
  employees: v.array(reportEmployee),
  distribution: v.array(v.object({ range: v.string(), count: v.number() })),
  competencyAverages: v.array(
    v.object({ name: v.string(), category: v.string(), avg: v.number() }),
  ),
});

const DISTRIBUTION_BUCKETS: { range: string; lo: number; hi: number }[] = [
  { range: "<0.5", lo: -Infinity, hi: 0.5 },
  { range: "0.5–1.5", lo: 0.5, hi: 1.5 },
  { range: "1.5–2.5", lo: 1.5, hi: 2.5 },
  { range: "2.5–3.5", lo: 2.5, hi: 3.5 },
  { range: "3.5–4.5", lo: 3.5, hi: 4.5 },
  { range: ">4.5", lo: 4.5, hi: Infinity },
];

export const report = query({
  args: { cycleId: v.optional(v.id("reviewCycles")) },
  returns: v.union(v.null(), reportResult),
  handler: async (ctx, { cycleId }) => {
    const { orgId } = await requirePermission(ctx, "performance:manage");
    const allCycles = await ctx.db
      .query("reviewCycles")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .order("desc")
      .collect();
    if (allCycles.length === 0) return null;
    const cycle = await pickCycle(ctx, orgId, cycleId);
    if (!cycle) return null;

    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_cycle", (q) => q.eq("cycleId", cycle._id))
      .collect();

    // Aggregate competency averages (appraiser ratings) across the cycle.
    const compAgg = new Map<
      string,
      { name: string; category: string; sum: number; n: number }
    >();

    const employees = await Promise.all(
      reviews.map(async (r) => {
        const emp = await ctx.db.get(r.employeeId);
        const [dept, office, mgr] = await Promise.all([
          emp?.departmentId ? ctx.db.get(emp.departmentId) : Promise.resolve(null),
          emp?.officeId ? ctx.db.get(emp.officeId) : Promise.resolve(null),
          r.managerId ? ctx.db.get(r.managerId) : Promise.resolve(null),
        ]);
        const comps = await ctx.db
          .query("reviewCompetencies")
          .withIndex("by_review", (q) => q.eq("reviewId", r._id))
          .collect();
        for (const c of comps) {
          if (c.appraiserRating == null) continue;
          const key = c.name;
          const cur =
            compAgg.get(key) ??
            { name: c.name, category: c.category, sum: 0, n: 0 };
          cur.sum += c.appraiserRating;
          cur.n += 1;
          compAgg.set(key, cur);
        }
        return {
          reviewId: r._id,
          employeeId: r.employeeId,
          name: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
          departmentId: emp?.departmentId ?? null,
          departmentName: dept?.name ?? null,
          officeId: emp?.officeId ?? null,
          officeName: office?.name ?? null,
          appraiserId: r.managerId ?? null,
          appraiserName: mgr ? `${mgr.firstName} ${mgr.lastName}` : null,
          level: r.competencyLevel ?? null,
          status: r.status,
          selfSubmitted: r.selfSubmittedAt != null,
          appraiserCompleted: r.managerSubmittedAt != null,
          overallRating: r.overallRating ?? null,
          objectivesScore: r.objectivesScore ?? null,
          competenciesScore: r.competenciesScore ?? null,
        };
      }),
    );
    employees.sort((a, b) => a.name.localeCompare(b.name));

    const distribution = DISTRIBUTION_BUCKETS.map((b) => ({
      range: b.range,
      count: employees.filter(
        (e) => e.overallRating != null && e.overallRating >= b.lo && e.overallRating < b.hi,
      ).length,
    }));

    const competencyAverages = Array.from(compAgg.values()).map((c) => ({
      name: c.name,
      category: c.category,
      avg: Math.round((c.sum / c.n) * 100) / 100,
    }));

    return {
      cycle,
      cycles: allCycles.map((c) => ({ _id: c._id, name: c.name, status: c.status })),
      employees,
      distribution,
      competencyAverages,
    };
  },
});

export const dashboard = query({
  args: { cycleId: v.optional(v.id("reviewCycles")) },
  returns: v.union(v.null(), dashboardResult),
  handler: async (ctx, { cycleId }) => {
    const { orgId } = await requirePermission(ctx, "performance:manage");

    const allCycles = await ctx.db
      .query("reviewCycles")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .order("desc")
      .collect();
    if (allCycles.length === 0) return null;

    const cycle = await pickCycle(ctx, orgId, cycleId);
    if (!cycle) return null;

    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_cycle", (q) => q.eq("cycleId", cycle._id))
      .collect();
    const totalReviews = reviews.length;

    // Objectives confirmed: reviews with ≥1 objective row.
    let reviewsWithObjectivesCount = 0;
    for (const r of reviews) {
      const o = await ctx.db
        .query("reviewObjectives")
        .withIndex("by_review", (q) => q.eq("reviewId", r._id))
        .first();
      if (o) reviewsWithObjectivesCount += 1;
    }

    // 360 assignments for the cycle, grouped by relationship.
    const assignments = await ctx.db
      .query("feedback360Assignments")
      .withIndex("by_cycle", (q) => q.eq("cycleId", cycle._id))
      .collect();
    const subjectsWithAssignment = new Set(
      assignments.map((a) => a.subjectEmployeeId),
    );
    const upward = assignments.filter((a) => a.relationship === "upward");
    const peer = assignments.filter((a) => a.relationship === "peer");

    const selfDone = reviews.filter((r) => r.selfSubmittedAt != null).length;
    const appraiserDone = reviews.filter(
      (r) => r.managerSubmittedAt != null,
    ).length;
    const calibratedDone = reviews.filter(
      (r) =>
        r.calibratedRating != null ||
        r.status === "released" ||
        r.status === "completed",
    ).length;
    const releasedDone = reviews.filter(
      (r) => r.releasedAt != null || r.status === "completed",
    ).length;
    const acknowledgedDone = reviews.filter(
      (r) => r.acknowledgedAt != null,
    ).length;

    const due = cycle.dueDates ?? {};
    const stages = [
      toStage("confirm_objectives", "Confirm objectives", "Objectives", reviewsWithObjectivesCount, totalReviews, due.confirm_objectives),
      toStage("self_appraisal", "Appraisal - Self appraisal", "Appraisal", selfDone, totalReviews, due.self_appraisal),
      toStage("appraiser_appraisal", "Appraisal - Appraiser appraisal", "Appraisal", appraiserDone, totalReviews, due.appraiser_appraisal),
      toStage("calibration", "Appraisal - Calibration", "Appraisal", calibratedDone, totalReviews, due.calibration),
      toStage("release", "Appraisal - Release appraisal", "Appraisal", releasedDone, totalReviews, due.release),
      toStage("acknowledge", "Appraisal - Acknowledge appraisal", "Appraisal", acknowledgedDone, totalReviews, due.acknowledge),
      toStage("assign_360", "360 Feedbacks - Assign feedback givers", "360 Feedbacks", subjectsWithAssignment.size, totalReviews, due.assign_360),
      toStage("upward_360", "360 Feedbacks - Upwards", "360 Feedbacks", upward.filter((a) => a.status === "submitted").length, upward.length, due.upward_360),
      toStage("peer_360", "360 Feedbacks - Peer", "360 Feedbacks", peer.filter((a) => a.status === "submitted").length, peer.length, due.peer_360),
    ];

    const employees = (
      await Promise.all(
        reviews.map(async (r) => {
          const emp = await ctx.db.get(r.employeeId);
          return {
            reviewId: r._id,
            employeeId: r.employeeId,
            name: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
            status: r.status,
          };
        }),
      )
    ).sort((a, b) => a.name.localeCompare(b.name));

    return {
      cycle,
      cycles: allCycles.map((c) => ({ _id: c._id, name: c.name, status: c.status })),
      stages,
      employees,
      totals: {
        reviews: totalReviews,
        completed: reviews.filter((r) => r.status === "completed").length,
      },
    };
  },
});
