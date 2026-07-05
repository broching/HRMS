import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { requireOrg, getOrgContext, OrgContext } from "./auth";
import { ctxHasPermission } from "./auth";
import { employeeByUserId } from "./employees";
import { feedbackRow } from "./lib/validators";
import { writeAuditLog } from "./lib/audit";

// Feedback about an employee is visible to their manager and to HR/admin — not
// broadcast to the subject, so peers can be candid.
async function assertCanViewFeedback(
  ctx: QueryCtx,
  orgCtx: OrgContext,
  subjectEmployeeId: Id<"employees">,
) {
  if (ctxHasPermission(orgCtx, "performance:manage")) return;
  const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
  const subject = await ctx.db.get(subjectEmployeeId);
  if (own && subject && subject.managerId === own._id) return;
  throw new Error("Not authorized to view this feedback.");
}

export const give = mutation({
  args: {
    subjectEmployeeId: v.id("employees"),
    cycleId: v.optional(v.id("reviewCycles")),
    body: v.string(),
  },
  returns: v.id("feedback"),
  handler: async (ctx, args) => {
    const orgCtx = await requireOrg(ctx);
    const subject = await ctx.db.get(args.subjectEmployeeId);
    if (!subject || subject.orgId !== orgCtx.orgId) {
      throw new Error("Employee not found.");
    }
    if (!args.body.trim()) throw new Error("Feedback can't be empty.");

    const id = await ctx.db.insert("feedback", {
      orgId: orgCtx.orgId,
      subjectEmployeeId: args.subjectEmployeeId,
      cycleId: args.cycleId,
      authorUserId: orgCtx.userId,
      body: args.body.trim(),
    });
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "feedback.give",
      entity: "feedback",
      entityId: id,
    });
    return id;
  },
});

export const forEmployee = query({
  args: { employeeId: v.id("employees") },
  returns: v.array(feedbackRow),
  handler: async (ctx, { employeeId }) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    await assertCanViewFeedback(ctx, orgCtx, employeeId);
    const rows = await ctx.db
      .query("feedback")
      .withIndex("by_subject", (q) => q.eq("subjectEmployeeId", employeeId))
      .order("desc")
      .collect();
    return await Promise.all(
      rows.map(async (f) => {
        const author = await ctx.db.get(f.authorUserId);
        return {
          _id: f._id,
          _creationTime: f._creationTime,
          subjectEmployeeId: f.subjectEmployeeId,
          authorName: author?.name ?? "Unknown",
          body: f.body,
        };
      }),
    );
  },
});
