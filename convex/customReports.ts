import { query, mutation } from "./_generated/server";
import { v, ConvexError, type Infer } from "convex/values";
import { Id } from "./_generated/dataModel";
import { requirePermission } from "./auth";
import { customReportChart } from "./lib/enums";

type CustomChart = Infer<typeof customReportChart>;

/**
 * HR Lounge → Reports → Custom reports. A saved custom report is a small
 * dashboard of chart tiles built over one of the report-builder datasets. The
 * aggregation is computed client-side from the dataset rows (see
 * `features/reports/lib/custom-report.ts`); this module only persists the chart
 * configuration. Every entry point is gated by `reports:view`, and each report
 * is scoped to the caller's organization.
 */

// A chart tile can name at most this many; keep the array bounded so the doc
// stays small and the dashboard stays legible.
const MAX_CHARTS = 24;
// Category cap for a single chart (top-N). Clamped so a client can't ask for an
// unbounded render.
const MAX_LIMIT = 200;

// Reject the free-magnitude `limit` before it is stored (see convex-lint note
// on unbounded numbers). Returns a clamped integer or undefined.
function sanitizeLimit(limit: number | undefined): number | undefined {
  if (limit === undefined) return undefined;
  if (!Number.isFinite(limit)) return undefined;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

function sanitizeCharts(charts: CustomChart[]): CustomChart[] {
  return charts.slice(0, MAX_CHARTS).map((c) => ({
    ...c,
    limit: sanitizeLimit(c.limit),
  }));
}

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("customReports"),
      name: v.string(),
      description: v.union(v.string(), v.null()),
      dataset: v.string(),
      chartCount: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const orgCtx = await requirePermission(ctx, "reports:view");
    const reports = await ctx.db
      .query("customReports")
      .withIndex("by_org", (q) => q.eq("orgId", orgCtx.orgId))
      .take(500);
    return reports
      .map((r) => ({
        _id: r._id,
        name: r.name,
        description: r.description ?? null,
        dataset: r.dataset,
        chartCount: r.charts.length,
        updatedAt: r.updatedAt,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const get = query({
  args: { id: v.id("customReports") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("customReports"),
      _creationTime: v.number(),
      orgId: v.id("organizations"),
      name: v.string(),
      description: v.optional(v.string()),
      dataset: v.string(),
      charts: v.array(customReportChart),
      createdByUserId: v.id("users"),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, { id }) => {
    const orgCtx = await requirePermission(ctx, "reports:view");
    const report = await ctx.db.get(id);
    if (!report || report.orgId !== orgCtx.orgId) return null;
    return report;
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    dataset: v.string(),
    charts: v.array(customReportChart),
  },
  returns: v.id("customReports"),
  handler: async (ctx, args) => {
    const orgCtx = await requirePermission(ctx, "reports:view");
    const name = args.name.trim() || "Untitled report";
    const id = await ctx.db.insert("customReports", {
      orgId: orgCtx.orgId,
      name,
      description: args.description?.trim() || undefined,
      dataset: args.dataset,
      charts: sanitizeCharts(args.charts),
      createdByUserId: orgCtx.userId,
      updatedAt: Date.now(),
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("customReports"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    dataset: v.optional(v.string()),
    charts: v.optional(v.array(customReportChart)),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const orgCtx = await requirePermission(ctx, "reports:view");
    const report = await ctx.db.get(args.id);
    if (!report || report.orgId !== orgCtx.orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Report not found." });
    }
    const patch: {
      name?: string;
      description?: string | undefined;
      dataset?: string;
      charts?: CustomChart[];
      updatedAt: number;
    } = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name.trim() || "Untitled report";
    if (args.description !== undefined)
      patch.description = args.description.trim() || undefined;
    if (args.dataset !== undefined) patch.dataset = args.dataset;
    if (args.charts !== undefined) patch.charts = sanitizeCharts(args.charts);
    await ctx.db.patch(args.id, patch);
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("customReports") },
  returns: v.null(),
  handler: async (ctx, { id }: { id: Id<"customReports"> }) => {
    const orgCtx = await requirePermission(ctx, "reports:view");
    const report = await ctx.db.get(id);
    if (!report || report.orgId !== orgCtx.orgId) return null;
    await ctx.db.delete(id);
    return null;
  },
});
