import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { halfDay } from "./lib/enums";
import { requireOrg, getOrgContext, OrgContext } from "./auth";
import { hasPermission } from "./lib/permissions";
import { employeeByUserId } from "./employees";
import { ensureBalance } from "./leaveBalances";
import { countLeaveDays } from "./model/leaveCalc";
import { leaveRequestRow } from "./lib/validators";
import { writeAuditLog } from "./lib/audit";

// ─── Helpers ─────────────────────────────────────────────────────────────

async function getHolidaySet(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  start: string,
  end: string,
): Promise<Set<string>> {
  const holidays = await ctx.db
    .query("holidays")
    .withIndex("by_org_date", (q) =>
      q.eq("orgId", orgId).gte("date", start).lte("date", end),
    )
    .collect();
  return new Set(holidays.map((h) => h.date));
}

async function hydrate(ctx: QueryCtx, req: Doc<"leaveRequests">) {
  const [emp, lt] = await Promise.all([
    ctx.db.get(req.employeeId),
    ctx.db.get(req.leaveTypeId),
  ]);
  return {
    _id: req._id,
    _creationTime: req._creationTime,
    employeeId: req.employeeId,
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
    leaveTypeId: req.leaveTypeId,
    leaveTypeName: lt?.name ?? "—",
    leaveTypeColor: lt?.color ?? "#6b7280",
    startDate: req.startDate,
    endDate: req.endDate,
    startHalf: req.startHalf,
    endHalf: req.endHalf,
    totalDays: req.totalDays,
    reason: req.reason,
    status: req.status,
    attachmentUrl: req.attachmentStorageId
      ? await ctx.storage.getUrl(req.attachmentStorageId)
      : null,
    decisionNote: req.decisionNote,
  };
}

async function assertCanApprove(
  ctx: QueryCtx,
  orgCtx: OrgContext,
  req: Doc<"leaveRequests">,
) {
  if (hasPermission(orgCtx.role, "leave:approve:all")) return;
  const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
  const employee = await ctx.db.get(req.employeeId);
  if (own && employee && employee.managerId === own._id) return;
  throw new Error("Not authorized to act on this request.");
}

async function notify(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  recipientUserId: Id<"users"> | undefined,
  type: string,
  title: string,
  body: string,
  requestId: Id<"leaveRequests">,
) {
  if (!recipientUserId) return;
  await ctx.db.insert("notifications", {
    orgId,
    recipientUserId,
    type,
    title,
    body,
    entityRef: { table: "leaveRequests", id: requestId },
    read: false,
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────

export const apply = mutation({
  args: {
    leaveTypeId: v.id("leaveTypes"),
    startDate: v.string(),
    endDate: v.string(),
    startHalf: v.optional(halfDay),
    endHalf: v.optional(halfDay),
    reason: v.optional(v.string()),
    attachmentStorageId: v.optional(v.id("_storage")),
  },
  returns: v.id("leaveRequests"),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requireOrg(ctx);
    const own = await employeeByUserId(ctx, orgId, userId);
    if (!own) throw new Error("You don't have an employee profile yet.");

    const leaveType = await ctx.db.get(args.leaveTypeId);
    if (!leaveType || leaveType.orgId !== orgId || !leaveType.active) {
      throw new Error("Leave type not found.");
    }
    if (args.endDate < args.startDate) {
      throw new Error("End date is before start date.");
    }
    const startHalf = leaveType.allowHalfDay ? args.startHalf : undefined;
    const endHalf = leaveType.allowHalfDay ? args.endHalf : undefined;
    const holidays = await getHolidaySet(
      ctx,
      orgId,
      args.startDate,
      args.endDate,
    );
    const totalDays = countLeaveDays({
      startDate: args.startDate,
      endDate: args.endDate,
      startHalf,
      endHalf,
      holidays,
    });
    if (totalDays <= 0) {
      throw new Error("No working days in the selected range.");
    }
    if (leaveType.requiresAttachment && !args.attachmentStorageId) {
      throw new Error("This leave type requires an attachment.");
    }

    const year = Number(args.startDate.slice(0, 4));
    const tracked = leaveType.paid && leaveType.defaultEntitlementDays > 0;
    const status = leaveType.requiresApproval ? "pending" : "approved";

    if (tracked) {
      const bal = await ensureBalance(ctx, orgId, own._id, leaveType, year);
      const available =
        bal.entitledDays +
        bal.carriedForwardDays +
        bal.adjustmentDays -
        bal.takenDays -
        bal.pendingDays;
      if (totalDays > available) {
        throw new Error(`Insufficient balance: ${available} day(s) available.`);
      }
      await ctx.db.patch(bal._id, {
        pendingDays:
          status === "pending" ? bal.pendingDays + totalDays : bal.pendingDays,
        takenDays:
          status === "approved" ? bal.takenDays + totalDays : bal.takenDays,
      });
    }

    const id = await ctx.db.insert("leaveRequests", {
      orgId,
      employeeId: own._id,
      leaveTypeId: leaveType._id,
      startDate: args.startDate,
      endDate: args.endDate,
      startHalf,
      endHalf,
      totalDays,
      reason: args.reason,
      attachmentStorageId: args.attachmentStorageId,
      status,
      approverUserId: status === "approved" ? userId : undefined,
      decidedAt: status === "approved" ? Date.now() : undefined,
    });

    if (status === "pending" && own.managerId) {
      const manager = await ctx.db.get(own.managerId);
      await notify(
        ctx,
        orgId,
        manager?.userId,
        "leave.requested",
        "Leave request",
        `${own.firstName} ${own.lastName} requested ${totalDays} day(s) of ${leaveType.name}`,
        id,
      );
    }
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "leave.apply",
      entity: "leaveRequests",
      entityId: id,
      after: { totalDays, status },
    });
    return id;
  },
});

export const approve = mutation({
  args: { requestId: v.id("leaveRequests"), note: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { requestId, note }) => {
    const orgCtx = await requireOrg(ctx);
    const req = await ctx.db.get(requestId);
    if (!req || req.orgId !== orgCtx.orgId) throw new Error("Request not found.");
    if (req.status !== "pending") throw new Error("Request is not pending.");
    await assertCanApprove(ctx, orgCtx, req);

    const leaveType = await ctx.db.get(req.leaveTypeId);
    if (leaveType && leaveType.paid && leaveType.defaultEntitlementDays > 0) {
      const year = Number(req.startDate.slice(0, 4));
      const bal = await ensureBalance(
        ctx,
        orgCtx.orgId,
        req.employeeId,
        leaveType,
        year,
      );
      await ctx.db.patch(bal._id, {
        pendingDays: Math.max(0, bal.pendingDays - req.totalDays),
        takenDays: bal.takenDays + req.totalDays,
      });
    }
    await ctx.db.patch(requestId, {
      status: "approved",
      approverUserId: orgCtx.userId,
      decidedAt: Date.now(),
      decisionNote: note,
    });
    const emp = await ctx.db.get(req.employeeId);
    await notify(
      ctx,
      orgCtx.orgId,
      emp?.userId,
      "leave.approved",
      "Leave approved",
      `Your leave on ${req.startDate} was approved.`,
      requestId,
    );
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "leave.approve",
      entity: "leaveRequests",
      entityId: requestId,
    });
    return null;
  },
});

export const reject = mutation({
  args: { requestId: v.id("leaveRequests"), note: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { requestId, note }) => {
    const orgCtx = await requireOrg(ctx);
    const req = await ctx.db.get(requestId);
    if (!req || req.orgId !== orgCtx.orgId) throw new Error("Request not found.");
    if (req.status !== "pending") throw new Error("Request is not pending.");
    await assertCanApprove(ctx, orgCtx, req);

    const leaveType = await ctx.db.get(req.leaveTypeId);
    if (leaveType && leaveType.paid && leaveType.defaultEntitlementDays > 0) {
      const year = Number(req.startDate.slice(0, 4));
      const bal = await ensureBalance(
        ctx,
        orgCtx.orgId,
        req.employeeId,
        leaveType,
        year,
      );
      await ctx.db.patch(bal._id, {
        pendingDays: Math.max(0, bal.pendingDays - req.totalDays),
      });
    }
    await ctx.db.patch(requestId, {
      status: "rejected",
      approverUserId: orgCtx.userId,
      decidedAt: Date.now(),
      decisionNote: note,
    });
    const emp = await ctx.db.get(req.employeeId);
    await notify(
      ctx,
      orgCtx.orgId,
      emp?.userId,
      "leave.rejected",
      "Leave rejected",
      `Your leave on ${req.startDate} was rejected.`,
      requestId,
    );
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "leave.reject",
      entity: "leaveRequests",
      entityId: requestId,
    });
    return null;
  },
});

// Cancel by the requester (pending or future approved) or an approver/HR.
export const cancel = mutation({
  args: { requestId: v.id("leaveRequests") },
  returns: v.null(),
  handler: async (ctx, { requestId }) => {
    const orgCtx = await requireOrg(ctx);
    const req = await ctx.db.get(requestId);
    if (!req || req.orgId !== orgCtx.orgId) throw new Error("Request not found.");
    if (req.status !== "pending" && req.status !== "approved") {
      throw new Error("Request cannot be cancelled.");
    }
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    const isOwner = own && req.employeeId === own._id;
    if (!isOwner && !hasPermission(orgCtx.role, "leave:approve:all")) {
      throw new Error("Not authorized to cancel this request.");
    }

    const leaveType = await ctx.db.get(req.leaveTypeId);
    if (leaveType && leaveType.paid && leaveType.defaultEntitlementDays > 0) {
      const year = Number(req.startDate.slice(0, 4));
      const bal = await ensureBalance(
        ctx,
        orgCtx.orgId,
        req.employeeId,
        leaveType,
        year,
      );
      if (req.status === "pending") {
        await ctx.db.patch(bal._id, {
          pendingDays: Math.max(0, bal.pendingDays - req.totalDays),
        });
      } else {
        await ctx.db.patch(bal._id, {
          takenDays: Math.max(0, bal.takenDays - req.totalDays),
        });
      }
    }
    await ctx.db.patch(requestId, { status: "cancelled" });
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "leave.cancel",
      entity: "leaveRequests",
      entityId: requestId,
    });
    return null;
  },
});

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireOrg(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

// ─── Queries ─────────────────────────────────────────────────────────────

export const mine = query({
  args: {},
  returns: v.array(leaveRequestRow),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    if (!own) return [];
    const reqs = await ctx.db
      .query("leaveRequests")
      .withIndex("by_employee", (q) => q.eq("employeeId", own._id))
      .collect();
    reqs.sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
    return await Promise.all(reqs.map((r) => hydrate(ctx, r)));
  },
});

// Pending requests the caller can approve.
export const approvalQueue = query({
  args: {},
  returns: v.array(leaveRequestRow),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    if (hasPermission(orgCtx.role, "leave:approve:all")) {
      const reqs = await ctx.db
        .query("leaveRequests")
        .withIndex("by_org_status", (q) =>
          q.eq("orgId", orgCtx.orgId).eq("status", "pending"),
        )
        .collect();
      return await Promise.all(reqs.map((r) => hydrate(ctx, r)));
    }
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    if (!own) return [];
    const reports = await ctx.db
      .query("employees")
      .withIndex("by_org_manager", (q) =>
        q.eq("orgId", orgCtx.orgId).eq("managerId", own._id),
      )
      .collect();
    const reportIds = new Set(reports.map((e) => e._id));
    const pending = await ctx.db
      .query("leaveRequests")
      .withIndex("by_org_status", (q) =>
        q.eq("orgId", orgCtx.orgId).eq("status", "pending"),
      )
      .collect();
    return await Promise.all(
      pending.filter((r) => reportIds.has(r.employeeId)).map((r) => hydrate(ctx, r)),
    );
  },
});

// Approved leave overlapping a date range, for the team calendar.
export const calendar = query({
  args: { start: v.string(), end: v.string() },
  returns: v.array(leaveRequestRow),
  handler: async (ctx, { start, end }) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    const approved = await ctx.db
      .query("leaveRequests")
      .withIndex("by_org_status", (q) =>
        q.eq("orgId", orgCtx.orgId).eq("status", "approved"),
      )
      .collect();
    const overlapping = approved.filter(
      (r) => r.startDate <= end && r.endDate >= start,
    );
    return await Promise.all(overlapping.map((r) => hydrate(ctx, r)));
  },
});
