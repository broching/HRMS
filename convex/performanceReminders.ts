import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx } from "./_generated/server";
import { pushNotification } from "./model/notify";

// Due-date reminders for released appraisal forms. A daily cron fans out one
// mutation per org (staying within per-transaction limits), each nudging the
// participants of active cycles whose self/appraiser due date is approaching or
// overdue. Reviews carry `lastRemindedAt` so a review is nudged at most once a
// day.

const MS_DAY = 86_400_000;

function utcMidnight(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// Whole days from today (UTC) until an ISO date. Negative = already past.
function daysUntil(isoDate: string, todayUTC: number): number | null {
  const t = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return Math.round((utcMidnight(new Date(t)) - todayUTC) / MS_DAY);
}

// Whether a due date warrants a reminder today: overdue, due today, or matching
// one of the configured "days before" offsets.
function shouldRemind(
  isoDate: string | undefined,
  todayUTC: number,
  daysBefore: number[],
): boolean {
  if (!isoDate) return false;
  const d = daysUntil(isoDate, todayUTC);
  if (d == null) return false;
  return d <= 0 || daysBefore.includes(d);
}

export const remindAll = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const orgs = await ctx.db.query("organizations").take(1000);
    for (const org of orgs) {
      await ctx.scheduler.runAfter(0, internal.performanceReminders.remindOrg, {
        orgId: org._id,
      });
    }
    return null;
  },
});

async function nudge(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  cycle: Doc<"reviewCycles">,
  review: Doc<"reviews">,
): Promise<boolean> {
  const due = cycle.dueDates ?? {};
  const daysBefore = cycle.reminders?.daysBefore ?? [];
  const todayUTC = utcMidnight(new Date());

  let sent = false;

  // Employee's self side.
  if (
    review.selfSubmittedAt == null &&
    shouldRemind(due.self, todayUTC, daysBefore)
  ) {
    const emp = await ctx.db.get(review.employeeId);
    if (emp?.userId) {
      await pushNotification(ctx, {
        orgId,
        recipientUserId: emp.userId,
        type: "review.reminder",
        title: "Appraisal due soon",
        body: `Your appraisal for ${cycle.name} is due ${due.self}.`,
        entityRef: { table: "reviews", id: review._id },
      });
      sent = true;
    }
  }

  // Appraiser side.
  if (
    review.managerId &&
    review.managerSubmittedAt == null &&
    shouldRemind(due.appraiser, todayUTC, daysBefore)
  ) {
    const mgr = await ctx.db.get(review.managerId);
    const emp = await ctx.db.get(review.employeeId);
    if (mgr?.userId) {
      await pushNotification(ctx, {
        orgId,
        recipientUserId: mgr.userId,
        type: "review.appraiser_reminder",
        title: "Appraisal to complete",
        body: `${emp ? `${emp.firstName} ${emp.lastName}'s` : "An"} appraisal for ${cycle.name} is due ${due.appraiser}.`,
        entityRef: { table: "reviews", id: review._id },
      });
      sent = true;
    }
  }

  return sent;
}

export const remindOrg = internalMutation({
  args: { orgId: v.id("organizations") },
  returns: v.null(),
  handler: async (ctx, { orgId }) => {
    const cycles = await ctx.db
      .query("reviewCycles")
      .withIndex("by_org_status", (q) =>
        q.eq("orgId", orgId).eq("status", "active"),
      )
      .collect();

    const todayUTC = utcMidnight(new Date());

    for (const cycle of cycles) {
      if (!cycle.reminders?.enabled) continue;
      const reviews = await ctx.db
        .query("reviews")
        .withIndex("by_cycle", (q) => q.eq("cycleId", cycle._id))
        .collect();
      for (const review of reviews) {
        if (review.status === "completed") continue;
        // Already nudged today? Skip (guards against double cron runs).
        if (
          review.lastRemindedAt != null &&
          utcMidnight(new Date(review.lastRemindedAt)) === todayUTC
        ) {
          continue;
        }
        const sent = await nudge(ctx, orgId, cycle, review);
        if (sent) {
          await ctx.db.patch(review._id, { lastRemindedAt: Date.now() });
        }
      }
    }
    return null;
  },
});
