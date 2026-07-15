import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { requireOrg, getOrgContext, OrgContext } from "./auth";
import { ctxHasPermission } from "./auth";
import { employeeByUserId } from "./employees";
import { isDirectManager } from "./model/org";
import {
  feedback360Relationship,
  feedback360Answer,
} from "./lib/enums";
import {
  feedback360AssignmentRow,
  feedback360QueueRow,
} from "./lib/validators";
import { writeAuditLog } from "./lib/audit";

// Results (who said what) are visible to HR + the subject's manager only — never
// the subject, keeping peer feedback candid. Mirrors feedback.ts.
async function assertCanManageSubject(
  ctx: QueryCtx,
  orgCtx: OrgContext,
  subjectEmployeeId: Id<"employees">,
) {
  if (ctxHasPermission(orgCtx, "performance:manage")) return;
  const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
  const subject = await ctx.db.get(subjectEmployeeId);
  if (own && subject && isDirectManager(subject, own._id)) return;
  throw new Error("Not authorized for this employee's 360 feedback.");
}

// ─── Queries ─────────────────────────────────────────────────────────────────

// All assignments about a subject for a cycle, with results. HR/manager only.
export const forSubject = query({
  args: {
    subjectEmployeeId: v.id("employees"),
    cycleId: v.id("reviewCycles"),
  },
  returns: v.array(feedback360AssignmentRow),
  handler: async (ctx, { subjectEmployeeId, cycleId }) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    await assertCanManageSubject(ctx, orgCtx, subjectEmployeeId);
    const cycle = await ctx.db.get(cycleId);
    const rows = await ctx.db
      .query("feedback360Assignments")
      .withIndex("by_cycle_subject", (q) =>
        q.eq("cycleId", cycleId).eq("subjectEmployeeId", subjectEmployeeId),
      )
      .collect();
    const [subject] = await Promise.all([ctx.db.get(subjectEmployeeId)]);
    return await Promise.all(
      rows.map(async (a) => {
        const giver = await ctx.db.get(a.giverEmployeeId);
        return {
          _id: a._id,
          _creationTime: a._creationTime,
          cycleId: a.cycleId,
          cycleName: cycle?.name ?? "—",
          subjectEmployeeId: a.subjectEmployeeId,
          subjectName: subject
            ? `${subject.firstName} ${subject.lastName}`
            : "Unknown",
          giverEmployeeId: a.giverEmployeeId,
          giverName: giver ? `${giver.firstName} ${giver.lastName}` : null,
          relationship: a.relationship,
          status: a.status,
          submittedAt: a.submittedAt ?? null,
          answers: a.answers ?? null,
        };
      }),
    );
  },
});

// The caller's own pending/submitted 360 requests (giver queue).
export const myAssignments = query({
  args: {},
  returns: v.array(feedback360QueueRow),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    if (!own) return [];
    const rows = await ctx.db
      .query("feedback360Assignments")
      .withIndex("by_giver_status", (q) => q.eq("giverEmployeeId", own._id))
      .collect();
    return await Promise.all(
      rows.map(async (a) => {
        const [cycle, subject] = await Promise.all([
          ctx.db.get(a.cycleId),
          ctx.db.get(a.subjectEmployeeId),
        ]);
        const questions = cycle?.feedback360Questions ?? [];
        return {
          _id: a._id,
          _creationTime: a._creationTime,
          cycleId: a.cycleId,
          cycleName: cycle?.name ?? "—",
          subjectEmployeeId: a.subjectEmployeeId,
          subjectName: subject
            ? `${subject.firstName} ${subject.lastName}`
            : "Unknown",
          relationship: a.relationship,
          status: a.status,
          questions,
          answers:
            a.answers ??
            questions.map((q) => ({ question: q, rating: undefined, comment: undefined })),
        };
      }),
    );
  },
});

// ─── Mutations ───────────────────────────────────────────────────────────────

export const assign = mutation({
  args: {
    cycleId: v.id("reviewCycles"),
    subjectEmployeeId: v.id("employees"),
    giverEmployeeId: v.id("employees"),
    relationship: feedback360Relationship,
  },
  returns: v.id("feedback360Assignments"),
  handler: async (ctx, args) => {
    const orgCtx = await requireOrg(ctx);
    await assertCanManageSubject(ctx, orgCtx, args.subjectEmployeeId);
    const [cycle, subject, giver] = await Promise.all([
      ctx.db.get(args.cycleId),
      ctx.db.get(args.subjectEmployeeId),
      ctx.db.get(args.giverEmployeeId),
    ]);
    if (!cycle || cycle.orgId !== orgCtx.orgId) throw new Error("Cycle not found.");
    if (!subject || subject.orgId !== orgCtx.orgId)
      throw new Error("Subject not found.");
    if (!giver || giver.orgId !== orgCtx.orgId) throw new Error("Giver not found.");
    if (args.giverEmployeeId === args.subjectEmployeeId) {
      throw new Error("A person can't give 360 feedback about themselves.");
    }
    // Prevent duplicate assignment for the same giver/subject/cycle.
    const existing = await ctx.db
      .query("feedback360Assignments")
      .withIndex("by_cycle_subject", (q) =>
        q.eq("cycleId", args.cycleId).eq("subjectEmployeeId", args.subjectEmployeeId),
      )
      .collect();
    if (existing.some((a) => a.giverEmployeeId === args.giverEmployeeId)) {
      throw new Error("This person is already assigned.");
    }
    const id = await ctx.db.insert("feedback360Assignments", {
      orgId: orgCtx.orgId,
      cycleId: args.cycleId,
      subjectEmployeeId: args.subjectEmployeeId,
      giverEmployeeId: args.giverEmployeeId,
      relationship: args.relationship,
      status: "pending",
      assignedByUserId: orgCtx.userId,
    });
    if (giver.userId) {
      await ctx.db.insert("notifications", {
        orgId: orgCtx.orgId,
        recipientUserId: giver.userId,
        type: "feedback360.assigned",
        title: "360 feedback requested",
        body: `You've been asked to give feedback for ${subject.firstName} ${subject.lastName}.`,
        entityRef: { table: "feedback360Assignments", id },
        read: false,
      });
    }
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "feedback360.assign",
      entity: "feedback360Assignments",
      entityId: id,
    });
    return id;
  },
});

// Giver submits (or updates) their answers.
export const submit = mutation({
  args: {
    assignmentId: v.id("feedback360Assignments"),
    answers: v.array(feedback360Answer),
  },
  returns: v.null(),
  handler: async (ctx, { assignmentId, answers }) => {
    const orgCtx = await requireOrg(ctx);
    const assignment = await ctx.db.get(assignmentId);
    if (!assignment || assignment.orgId !== orgCtx.orgId) {
      throw new Error("Assignment not found.");
    }
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    if (!own || own._id !== assignment.giverEmployeeId) {
      throw new Error("Only the assigned giver can submit this feedback.");
    }
    await ctx.db.patch(assignmentId, {
      answers,
      status: "submitted",
      submittedAt: Date.now(),
    });
    return null;
  },
});

export const remove = mutation({
  args: { assignmentId: v.id("feedback360Assignments") },
  returns: v.null(),
  handler: async (ctx, { assignmentId }) => {
    const orgCtx = await requireOrg(ctx);
    const assignment = await ctx.db.get(assignmentId);
    if (!assignment || assignment.orgId !== orgCtx.orgId) {
      throw new Error("Assignment not found.");
    }
    await assertCanManageSubject(ctx, orgCtx, assignment.subjectEmployeeId);
    await ctx.db.delete(assignmentId);
    return null;
  },
});
