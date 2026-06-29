import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { halfDay } from "./lib/enums";
import { requireOrg, getOrgContext, OrgContext } from "./auth";
import { hasPermission } from "./lib/permissions";
import { employeeByUserId } from "./employees";
import { ensureBalance } from "./leaveBalances";
import { resolvePolicyForEmployee } from "./leavePolicies";
import { computeEntitlement } from "./model/leavePolicy";
import { countLeaveDays, eachDateISO } from "./model/leaveCalc";
import { leaveRequestRow, leaveRequestDetail } from "./lib/validators";
import { writeAuditLog } from "./lib/audit";

const todayISO = () => new Date().toISOString().slice(0, 10);

function diffDays(aIso: string, bIso: string): number {
  const a = new Date(`${aIso}T00:00:00Z`).getTime();
  const b = new Date(`${bIso}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

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

// Count leave days honouring the policy's working-days vs calendar-days setting.
function countDays(
  useWorkingDays: boolean,
  params: {
    startDate: string;
    endDate: string;
    startHalf?: "am" | "pm";
    endHalf?: "am" | "pm";
    holidays: Set<string>;
  },
): number {
  if (useWorkingDays) return countLeaveDays(params);
  const all = eachDateISO(params.startDate, params.endDate);
  let total = all.length;
  if (total === 0) return 0;
  if (params.startDate === params.endDate) return params.startHalf ? 0.5 : total;
  if (params.startHalf) total -= 0.5;
  if (params.endHalf) total -= 0.5;
  return total;
}

// Resolve the user who approves at a step, per the policy's approver mode.
async function resolveApprover(
  ctx: QueryCtx,
  employee: Doc<"employees">,
  mode: Doc<"leavePolicies">["firstApproverMode"],
  value: string | undefined,
): Promise<Id<"users"> | undefined> {
  if (mode === "none") return undefined;
  if (mode === "manager") {
    if (!employee.managerId) return undefined;
    const m = await ctx.db.get(employee.managerId);
    return m?.userId;
  }
  if (mode === "department_head") {
    if (!employee.departmentId) return undefined;
    const dept = await ctx.db.get(employee.departmentId);
    if (!dept?.headEmployeeId) return undefined;
    const head = await ctx.db.get(dept.headEmployeeId);
    return head?.userId;
  }
  if (mode === "specific" && value) return value as Id<"users">;
  return undefined;
}

type TimelineEvent = {
  at: number;
  actorUserId?: Id<"users">;
  type: string;
  note?: string;
};

function pushTimeline(
  req: Doc<"leaveRequests">,
  ev: TimelineEvent,
): TimelineEvent[] {
  return [...(req.timeline ?? []), ev];
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

async function userName(
  ctx: QueryCtx,
  userId: Id<"users"> | undefined | null,
): Promise<string | null> {
  if (!userId) return null;
  const u = await ctx.db.get(userId);
  return u?.name ?? null;
}

async function assertCanApprove(
  ctx: QueryCtx,
  orgCtx: OrgContext,
  req: Doc<"leaveRequests">,
) {
  if (hasPermission(orgCtx.role, "leave:approve:all")) return;
  const approverForStep =
    req.approvalStep === 2 ? req.secondApproverUserId : req.firstApproverUserId;
  if (approverForStep && approverForStep === orgCtx.userId) return;
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

// Reverse a request's outstanding balance effect (used by cancel/modify/delete).
async function reverseBalance(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  req: Doc<"leaveRequests">,
) {
  const leaveType = await ctx.db.get(req.leaveTypeId);
  if (!leaveType) return;
  const policy = await resolvePolicyForEmployee(
    ctx,
    orgId,
    req.leaveTypeId,
    req.employeeId,
  );
  const tracked = policy ? policy.entitlementMode === "fixed" : false;
  if (!tracked) return;
  const year = Number(req.startDate.slice(0, 4));
  const bal = await ensureBalance(ctx, orgId, req.employeeId, leaveType, year);
  if (req.status === "pending" || req.status === "info_requested") {
    await ctx.db.patch(bal._id, {
      pendingDays: Math.max(0, bal.pendingDays - req.totalDays),
    });
  } else if (req.status === "approved") {
    await ctx.db.patch(bal._id, {
      takenDays: Math.max(0, bal.takenDays - req.totalDays),
    });
  }
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

    const policy = await resolvePolicyForEmployee(ctx, orgId, leaveType._id, own._id);
    if (!policy) throw new Error("No leave policy is configured for this type.");

    const startHalf = leaveType.allowHalfDay ? args.startHalf : undefined;
    const endHalf = leaveType.allowHalfDay ? args.endHalf : undefined;
    const holidays = await getHolidaySet(ctx, orgId, args.startDate, args.endDate);
    const totalDays = countDays(policy.useWorkingDays, {
      startDate: args.startDate,
      endDate: args.endDate,
      startHalf,
      endHalf,
      holidays,
    });
    if (totalDays <= 0) {
      throw new Error("No bookable days in the selected range.");
    }

    // Advance-booking rules from the policy.
    const today = todayISO();
    if (!policy.allowApplyInPast && args.startDate < today) {
      throw new Error("This leave type can't be applied for past dates.");
    }
    const lead = diffDays(today, args.startDate);
    if (policy.minAdvanceDays != null && lead < policy.minAdvanceDays) {
      throw new Error(`Requires at least ${policy.minAdvanceDays} day(s) notice.`);
    }
    if (policy.maxAdvanceDays != null && lead > policy.maxAdvanceDays) {
      throw new Error(
        `Can't be booked more than ${policy.maxAdvanceDays} day(s) in advance.`,
      );
    }
    if (policy.maxConsecutiveDays != null && totalDays > policy.maxConsecutiveDays) {
      throw new Error(
        `At most ${policy.maxConsecutiveDays} consecutive day(s) can be booked.`,
      );
    }
    if (leaveType.requiresAttachment && !args.attachmentStorageId) {
      throw new Error("This leave type requires an attachment.");
    }

    const year = Number(args.startDate.slice(0, 4));
    const tracked = policy.entitlementMode === "fixed";

    // Resolve the approval chain.
    const firstApproverUserId = await resolveApprover(
      ctx,
      own,
      policy.firstApproverMode,
      policy.firstApproverValue,
    );
    const secondApproverUserId = await resolveApprover(
      ctx,
      own,
      policy.secondApproverMode,
      policy.secondApproverValue,
    );
    const step1Active = policy.firstApproverMode !== "none" && !!firstApproverUserId;
    const step2Active = policy.secondApproverMode !== "none" && !!secondApproverUserId;

    let status: Doc<"leaveRequests">["status"] = "approved";
    let approvalStep: number | undefined = undefined;
    if (leaveType.requiresApproval) {
      if (step1Active) {
        status = "pending";
        approvalStep = 1;
      } else if (step2Active) {
        status = "pending";
        approvalStep = 2;
      }
    }

    if (tracked) {
      const bal = await ensureBalance(ctx, orgId, own._id, leaveType, year);
      const entitled = computeEntitlement(policy, own.joinDate, year, today);
      const available =
        entitled +
        bal.carriedForwardDays +
        bal.adjustmentDays -
        bal.takenDays -
        bal.pendingDays;
      const allowed = available + (policy.toleranceDays ?? 0);
      if (totalDays > allowed) {
        throw new Error(
          `Insufficient balance: ${available} day(s) available.`,
        );
      }
      await ctx.db.patch(bal._id, {
        pendingDays:
          status === "pending" ? bal.pendingDays + totalDays : bal.pendingDays,
        takenDays:
          status === "approved" ? bal.takenDays + totalDays : bal.takenDays,
      });
    }

    const timeline: TimelineEvent[] = [
      { at: Date.now(), actorUserId: userId, type: "created", note: args.reason },
    ];

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
      approvalStep,
      firstApproverUserId,
      secondApproverUserId,
      timeline,
    });

    if (status === "pending") {
      const recipient =
        approvalStep === 2 ? secondApproverUserId : firstApproverUserId;
      await notify(
        ctx,
        orgId,
        recipient,
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
    if (req.status !== "pending" && req.status !== "info_requested") {
      throw new Error("Request is not awaiting approval.");
    }
    await assertCanApprove(ctx, orgCtx, req);

    const advanceToStep2 =
      req.approvalStep === 1 && !!req.secondApproverUserId;

    if (advanceToStep2) {
      await ctx.db.patch(requestId, {
        status: "pending",
        approvalStep: 2,
        timeline: pushTimeline(req, {
          at: Date.now(),
          actorUserId: orgCtx.userId,
          type: "approved_step1",
          note,
        }),
      });
      await notify(
        ctx,
        orgCtx.orgId,
        req.secondApproverUserId,
        "leave.requested",
        "Leave request (2nd approval)",
        `A leave request needs your approval.`,
        requestId,
      );
      return null;
    }

    // Finalize.
    const policy = await resolvePolicyForEmployee(
      ctx,
      orgCtx.orgId,
      req.leaveTypeId,
      req.employeeId,
    );
    const leaveType = await ctx.db.get(req.leaveTypeId);
    if (leaveType && policy?.entitlementMode === "fixed") {
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
      timeline: pushTimeline(req, {
        at: Date.now(),
        actorUserId: orgCtx.userId,
        type: "approved",
        note,
      }),
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
    if (req.status !== "pending" && req.status !== "info_requested") {
      throw new Error("Request is not awaiting approval.");
    }
    await assertCanApprove(ctx, orgCtx, req);
    await reverseBalance(ctx, orgCtx.orgId, req);
    await ctx.db.patch(requestId, {
      status: "rejected",
      approverUserId: orgCtx.userId,
      decidedAt: Date.now(),
      decisionNote: note,
      timeline: pushTimeline(req, {
        at: Date.now(),
        actorUserId: orgCtx.userId,
        type: "rejected",
        note,
      }),
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

// Approver asks the requester for more information (keeps the request open).
export const requireInfo = mutation({
  args: { requestId: v.id("leaveRequests"), note: v.string() },
  returns: v.null(),
  handler: async (ctx, { requestId, note }) => {
    const orgCtx = await requireOrg(ctx);
    const req = await ctx.db.get(requestId);
    if (!req || req.orgId !== orgCtx.orgId) throw new Error("Request not found.");
    if (req.status !== "pending") throw new Error("Request is not pending.");
    await assertCanApprove(ctx, orgCtx, req);
    await ctx.db.patch(requestId, {
      status: "info_requested",
      decisionNote: note,
      timeline: pushTimeline(req, {
        at: Date.now(),
        actorUserId: orgCtx.userId,
        type: "info_requested",
        note,
      }),
    });
    const emp = await ctx.db.get(req.employeeId);
    await notify(
      ctx,
      orgCtx.orgId,
      emp?.userId,
      "leave.info_requested",
      "More info needed",
      `Your leave on ${req.startDate} needs more information.`,
      requestId,
    );
    return null;
  },
});

// Cancel by the requester (pending/info/future approved) or an approver/HR.
export const cancel = mutation({
  args: { requestId: v.id("leaveRequests") },
  returns: v.null(),
  handler: async (ctx, { requestId }) => {
    const orgCtx = await requireOrg(ctx);
    const req = await ctx.db.get(requestId);
    if (!req || req.orgId !== orgCtx.orgId) throw new Error("Request not found.");
    if (
      req.status !== "pending" &&
      req.status !== "approved" &&
      req.status !== "info_requested"
    ) {
      throw new Error("Request cannot be cancelled.");
    }
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    const isOwner = own && req.employeeId === own._id;
    if (!isOwner && !hasPermission(orgCtx.role, "leave:approve:all")) {
      throw new Error("Not authorized to cancel this request.");
    }
    await reverseBalance(ctx, orgCtx.orgId, req);
    await ctx.db.patch(requestId, {
      status: "cancelled",
      timeline: pushTimeline(req, {
        at: Date.now(),
        actorUserId: orgCtx.userId,
        type: "cancelled",
      }),
    });
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

// Requester edits + explains a request that was rejected or had info
// requested, then resubmits it for approval (re-enters the approval chain).
export const respond = mutation({
  args: {
    requestId: v.id("leaveRequests"),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    reason: v.optional(v.string()),
    note: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const orgCtx = await requireOrg(ctx);
    const req = await ctx.db.get(args.requestId);
    if (!req || req.orgId !== orgCtx.orgId) throw new Error("Request not found.");
    if (req.status !== "info_requested" && req.status !== "rejected") {
      throw new Error("Only rejected or info-requested leave can be resubmitted.");
    }
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    if (!own || own._id !== req.employeeId) {
      throw new Error("You can only respond to your own leave requests.");
    }
    if (!args.note.trim()) throw new Error("Please explain your reasoning.");

    const leaveType = await ctx.db.get(req.leaveTypeId);
    if (!leaveType || !leaveType.active) {
      throw new Error("This leave type is no longer available.");
    }
    const policy = await resolvePolicyForEmployee(
      ctx,
      orgCtx.orgId,
      req.leaveTypeId,
      req.employeeId,
    );
    if (!policy) throw new Error("No leave policy is configured for this type.");

    const startDate = args.startDate ?? req.startDate;
    const endDate = args.endDate ?? req.endDate;
    if (endDate < startDate) throw new Error("End date is before start date.");

    const holidays = await getHolidaySet(ctx, orgCtx.orgId, startDate, endDate);
    const startHalf = leaveType.allowHalfDay ? req.startHalf : undefined;
    const endHalf = leaveType.allowHalfDay ? req.endHalf : undefined;
    const totalDays = countDays(policy.useWorkingDays, {
      startDate,
      endDate,
      startHalf,
      endHalf,
      holidays,
    });
    if (totalDays <= 0) throw new Error("No bookable days in the selected range.");

    const today = todayISO();
    if (!policy.allowApplyInPast && startDate < today) {
      throw new Error("This leave type can't be applied for past dates.");
    }
    if (
      policy.maxConsecutiveDays != null &&
      totalDays > policy.maxConsecutiveDays
    ) {
      throw new Error(
        `At most ${policy.maxConsecutiveDays} consecutive day(s) can be booked.`,
      );
    }

    // Resolve the approval chain afresh and re-enter at the first active step.
    const firstApproverUserId = await resolveApprover(
      ctx,
      own,
      policy.firstApproverMode,
      policy.firstApproverValue,
    );
    const secondApproverUserId = await resolveApprover(
      ctx,
      own,
      policy.secondApproverMode,
      policy.secondApproverValue,
    );
    const step1Active = policy.firstApproverMode !== "none" && !!firstApproverUserId;
    const step2Active = policy.secondApproverMode !== "none" && !!secondApproverUserId;

    let status: Doc<"leaveRequests">["status"] = "approved";
    let approvalStep: number | undefined = undefined;
    if (leaveType.requiresApproval) {
      if (step1Active) {
        status = "pending";
        approvalStep = 1;
      } else if (step2Active) {
        status = "pending";
        approvalStep = 2;
      }
    }

    // Rebalance: drop the old effect, then re-apply the new pending/taken days.
    await reverseBalance(ctx, orgCtx.orgId, req);
    if (policy.entitlementMode === "fixed") {
      const year = Number(startDate.slice(0, 4));
      const bal = await ensureBalance(
        ctx,
        orgCtx.orgId,
        req.employeeId,
        leaveType,
        year,
      );
      const entitled = computeEntitlement(policy, own.joinDate, year, today);
      const available =
        entitled +
        bal.carriedForwardDays +
        bal.adjustmentDays -
        bal.takenDays -
        bal.pendingDays;
      if (totalDays > available + (policy.toleranceDays ?? 0)) {
        throw new Error(`Insufficient balance: ${available} day(s) available.`);
      }
      await ctx.db.patch(bal._id, {
        pendingDays:
          status === "pending" ? bal.pendingDays + totalDays : bal.pendingDays,
        takenDays:
          status === "approved" ? bal.takenDays + totalDays : bal.takenDays,
      });
    }

    await ctx.db.patch(args.requestId, {
      startDate,
      endDate,
      startHalf,
      endHalf,
      totalDays,
      reason: args.reason ?? req.reason,
      status,
      approvalStep,
      firstApproverUserId,
      secondApproverUserId,
      approverUserId: status === "approved" ? orgCtx.userId : undefined,
      decidedAt: status === "approved" ? Date.now() : undefined,
      decisionNote: undefined,
      timeline: pushTimeline(req, {
        at: Date.now(),
        actorUserId: orgCtx.userId,
        type: "employee_responded",
        note: args.note.trim(),
      }),
    });

    if (status === "pending") {
      const recipient =
        approvalStep === 2 ? secondApproverUserId : firstApproverUserId;
      await notify(
        ctx,
        orgCtx.orgId,
        recipient,
        "leave.resubmitted",
        "Leave resubmitted",
        `${own.firstName} ${own.lastName} updated and resubmitted a ${leaveType.name} request.`,
        args.requestId,
      );
    }
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "leave.respond",
      entity: "leaveRequests",
      entityId: args.requestId,
      after: { totalDays, status },
    });
    return null;
  },
});

// Admin edit of a request's dates/type/reason (recomputes days + rebalances).
export const modify = mutation({
  args: {
    requestId: v.id("leaveRequests"),
    leaveTypeId: v.optional(v.id("leaveTypes")),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    startHalf: v.optional(v.union(halfDay, v.null())),
    endHalf: v.optional(v.union(halfDay, v.null())),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const orgCtx = await requireOrg(ctx);
    if (!hasPermission(orgCtx.role, "leave:approve:all")) {
      throw new Error("Not authorized to modify leave.");
    }
    const req = await ctx.db.get(args.requestId);
    if (!req || req.orgId !== orgCtx.orgId) throw new Error("Request not found.");

    const newTypeId = args.leaveTypeId ?? req.leaveTypeId;
    const leaveType = await ctx.db.get(newTypeId);
    if (!leaveType || leaveType.orgId !== orgCtx.orgId) {
      throw new Error("Leave type not found.");
    }
    const startDate = args.startDate ?? req.startDate;
    const endDate = args.endDate ?? req.endDate;
    if (endDate < startDate) throw new Error("End date is before start date.");
    const startHalf =
      args.startHalf === null
        ? undefined
        : (args.startHalf ?? req.startHalf);
    const endHalf =
      args.endHalf === null ? undefined : (args.endHalf ?? req.endHalf);

    const policy = await resolvePolicyForEmployee(
      ctx,
      orgCtx.orgId,
      newTypeId,
      req.employeeId,
    );
    const holidays = await getHolidaySet(ctx, orgCtx.orgId, startDate, endDate);
    const totalDays = countDays(policy?.useWorkingDays ?? true, {
      startDate,
      endDate,
      startHalf: leaveType.allowHalfDay ? startHalf : undefined,
      endHalf: leaveType.allowHalfDay ? endHalf : undefined,
      holidays,
    });
    if (totalDays <= 0) throw new Error("No bookable days in the selected range.");

    // Reverse the old balance effect, then apply the new one with same status.
    await reverseBalance(ctx, orgCtx.orgId, req);
    if (policy?.entitlementMode === "fixed") {
      const year = Number(startDate.slice(0, 4));
      const bal = await ensureBalance(
        ctx,
        orgCtx.orgId,
        req.employeeId,
        leaveType,
        year,
      );
      if (req.status === "approved") {
        await ctx.db.patch(bal._id, { takenDays: bal.takenDays + totalDays });
      } else if (req.status === "pending" || req.status === "info_requested") {
        await ctx.db.patch(bal._id, { pendingDays: bal.pendingDays + totalDays });
      }
    }

    await ctx.db.patch(args.requestId, {
      leaveTypeId: newTypeId,
      startDate,
      endDate,
      startHalf: leaveType.allowHalfDay ? startHalf : undefined,
      endHalf: leaveType.allowHalfDay ? endHalf : undefined,
      totalDays,
      reason: args.reason ?? req.reason,
      timeline: pushTimeline(req, {
        at: Date.now(),
        actorUserId: orgCtx.userId,
        type: "modified",
      }),
    });
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "leave.modify",
      entity: "leaveRequests",
      entityId: args.requestId,
      after: { totalDays },
    });
    return null;
  },
});

// Admin hard-delete (reverses any outstanding balance effect).
export const deleteRequest = mutation({
  args: { requestId: v.id("leaveRequests") },
  returns: v.null(),
  handler: async (ctx, { requestId }) => {
    const orgCtx = await requireOrg(ctx);
    if (!hasPermission(orgCtx.role, "leave:approve:all")) {
      throw new Error("Not authorized to delete leave.");
    }
    const req = await ctx.db.get(requestId);
    if (!req || req.orgId !== orgCtx.orgId) throw new Error("Request not found.");
    await reverseBalance(ctx, orgCtx.orgId, req);
    await ctx.db.delete(requestId);
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "leave.delete",
      entity: "leaveRequests",
      entityId: requestId,
    });
    return null;
  },
});

// Remind the current approver of every pending request (in-app notification).
export const nudgeApprovers = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const orgCtx = await requireOrg(ctx);
    if (!hasPermission(orgCtx.role, "leave:approve:all")) {
      throw new Error("Not authorized.");
    }
    const pending = await ctx.db
      .query("leaveRequests")
      .withIndex("by_org_status", (q) =>
        q.eq("orgId", orgCtx.orgId).eq("status", "pending"),
      )
      .collect();
    const counts = new Map<Id<"users">, number>();
    for (const req of pending) {
      const approver =
        req.approvalStep === 2 ? req.secondApproverUserId : req.firstApproverUserId;
      if (!approver) continue;
      counts.set(approver, (counts.get(approver) ?? 0) + 1);
    }
    let nudged = 0;
    for (const [approver, count] of counts) {
      if (nudged >= 200) break;
      await ctx.db.insert("notifications", {
        orgId: orgCtx.orgId,
        recipientUserId: approver,
        type: "leave.nudge",
        title: "Leave approvals pending",
        body: `You have ${count} leave request(s) awaiting your approval.`,
        read: false,
      });
      nudged++;
    }
    return nudged;
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
    const pending = await ctx.db
      .query("leaveRequests")
      .withIndex("by_org_status", (q) =>
        q.eq("orgId", orgCtx.orgId).eq("status", "pending"),
      )
      .collect();
    // A manager sees requests routed to them (either approval step).
    const mineToApprove = pending.filter(
      (r) =>
        r.firstApproverUserId === orgCtx.userId ||
        r.secondApproverUserId === orgCtx.userId,
    );
    return await Promise.all(mineToApprove.map((r) => hydrate(ctx, r)));
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

// Full request detail for the slide-over.
export const get = query({
  args: { requestId: v.id("leaveRequests") },
  returns: v.union(leaveRequestDetail, v.null()),
  handler: async (ctx, { requestId }) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return null;
    const req = await ctx.db.get(requestId);
    if (!req || req.orgId !== orgCtx.orgId) return null;

    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    const isOwner = !!own && own._id === req.employeeId;
    const canManage = hasPermission(orgCtx.role, "leave:approve:all");
    const isApprover =
      req.firstApproverUserId === orgCtx.userId ||
      req.secondApproverUserId === orgCtx.userId;
    if (!isOwner && !canManage && !isApprover) return null;

    const [emp, lt] = await Promise.all([
      ctx.db.get(req.employeeId),
      ctx.db.get(req.leaveTypeId),
    ]);
    const dept = emp?.departmentId ? await ctx.db.get(emp.departmentId) : null;
    const position = emp?.positionId ? await ctx.db.get(emp.positionId) : null;
    const [firstApproverName, secondApproverName] = await Promise.all([
      userName(ctx, req.firstApproverUserId),
      userName(ctx, req.secondApproverUserId),
    ]);
    const currentApproverName =
      req.approvalStep === 2 ? secondApproverName : firstApproverName;

    const timeline = await Promise.all(
      (req.timeline ?? []).map(async (e) => ({
        at: e.at,
        actorName: await userName(ctx, e.actorUserId),
        type: e.type,
        note: e.note ?? null,
      })),
    );

    return {
      _id: req._id,
      _creationTime: req._creationTime,
      employeeId: req.employeeId,
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
      employeeNumber: emp?.employeeNumber ?? "—",
      employeePhotoUrl: emp?.photoStorageId
        ? await ctx.storage.getUrl(emp.photoStorageId)
        : null,
      departmentName: dept?.name ?? null,
      positionTitle: position?.title ?? null,
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
      approvalStep: req.approvalStep ?? null,
      firstApproverName,
      secondApproverName,
      currentApproverName,
      timeline,
      canApprove:
        (canManage || isApprover) &&
        (req.status === "pending" || req.status === "info_requested"),
      canManage,
    };
  },
});
