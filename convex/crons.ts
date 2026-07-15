import { cronJobs } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { carryForwardForOrg } from "./leaveBalances";

/**
 * Scheduled jobs. The only recurring leave-engine mutation is the yearly
 * carry-forward rollover — accrual itself is computed deterministically on
 * read (see model/leavePolicy.ts), so there is no high-frequency cron.
 */

// Roll one organization's unused balance into the new year.
export const rolloverOrg = internalMutation({
  args: { orgId: v.id("organizations"), fromYear: v.number() },
  returns: v.number(),
  handler: async (ctx, { orgId, fromYear }) => {
    return await carryForwardForOrg(ctx, orgId, fromYear);
  },
});

// Fan out the rollover across every organization (one scheduled mutation each,
// so a big tenant can't blow the per-transaction limits).
export const rolloverAll = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const fromYear = new Date().getFullYear() - 1;
    const orgs = await ctx.db.query("organizations").take(500);
    for (const org of orgs) {
      await ctx.scheduler.runAfter(0, internal.crons.rolloverOrg, {
        orgId: org._id,
        fromYear,
      });
    }
    return null;
  },
});

const crons = cronJobs();

// 01:00 UTC on January 1st — carry the previous year's unused leave forward.
crons.cron(
  "annual leave carry-forward",
  "0 1 1 1 *",
  internal.crons.rolloverAll,
  {},
);

// 08:00 UTC daily — nudge participants of released appraisal forms whose due
// date is approaching or overdue.
crons.cron(
  "performance appraisal reminders",
  "0 8 * * *",
  internal.performanceReminders.remindAll,
  {},
);

export default crons;
