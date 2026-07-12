import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { halfDay } from "./lib/enums";
import { requireOrg, getOrgContext, OrgContext } from "./auth";
import { ctxHasPermission } from "./auth";
import { employeeByUserId } from "./employees";
import { ensureBalance } from "./leaveBalances";
import { resolvePolicyForEmployee } from "./leavePolicies";
import { computeEntitlement, effectiveCarryForward } from "./model/leavePolicy";
import { countLeaveDays, eachDateISO } from "./model/leaveCalc";
import {
  leaveRequestRow,
  leaveRequestDetail,
  myLeaveRequestRow,
} from "./lib/validators";
import { writeAuditLog } from "./lib/audit";
import { pushNotification } from "./model/notify";

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

// ─── Approval chain ────────────────────────────────────────────────────────

// One resolved step of a leave request's approval chain (mirrors the
// `leaveChainStep` validator). Any of `approverUserIds` may act on it.
type ResolvedLeaveStep = {
  approverType: "position" | "role" | "specific";
  value: string;
  approverUserId?: Id<"users">;
  approverUserIds?: Id<"users">[];
  label: string;
  decidedByUserId?: Id<"users">;
  decidedAt?: number;
  note?: string;
  requiresSignature?: boolean;
};

// A member's effective role document id: the explicitly assigned `roleId`, else
// the org's preset role doc mapped from the legacy `role` enum. Mirrors the
// claims engine so role steps match Clerk-synced members that carry only `role`.
async function effectiveRoleId(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  member: Doc<"members">,
): Promise<Id<"roles"> | null> {
  if (member.roleId) return member.roleId;
  const preset = await ctx.db
    .query("roles")
    .withIndex("by_org_key", (q) => q.eq("orgId", orgId).eq("key", member.role))
    .unique();
  return preset?._id ?? null;
}

// Every active member's userId whose effective role is `roleId`.
async function membersWithRole(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  roleId: Id<"roles">,
): Promise<Id<"users">[]> {
  const members = await ctx.db
    .query("members")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  const ids: Id<"users">[] = [];
  for (const m of members) {
    if (m.status !== "active") continue;
    const rid = await effectiveRoleId(ctx, orgId, m);
    if (rid === roleId) ids.push(m.userId);
  }
  return ids;
}

// Convert a policy's legacy two-step approver modes into chain steps, so
// policies saved before the chain existed still resolve a chain.
function legacyChainSteps(
  policy: Doc<"leavePolicies">,
): NonNullable<Doc<"leavePolicies">["approvalChain"]> {
  const steps: NonNullable<Doc<"leavePolicies">["approvalChain"]> = [];
  const modes = [
    [policy.firstApproverMode, policy.firstApproverValue] as const,
    [policy.secondApproverMode, policy.secondApproverValue] as const,
  ];
  for (const [mode, value] of modes) {
    if (mode === "manager" || mode === "department_head") {
      steps.push({ approverType: "position", value: mode, thresholdEnabled: false });
    } else if (mode === "specific" && value) {
      steps.push({
        approverType: "specific",
        value: "",
        userIds: [value as Id<"users">],
        thresholdEnabled: false,
      });
    }
  }
  return steps;
}

// Resolve the approval chain for a leave request from its policy: apply each
// step's day threshold, resolve eligible approvers (manager / department head /
// role holders / named people), drop the requester and unroutable steps. Leave
// is approved individually, so this is a plain ordered list — no batching.
async function buildLeaveApprovalChain(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  employee: Doc<"employees">,
  policy: Doc<"leavePolicies">,
  totalDays: number,
): Promise<ResolvedLeaveStep[]> {
  const steps =
    policy.approvalChain && policy.approvalChain.length > 0
      ? policy.approvalChain
      : legacyChainSteps(policy);
  const chain: ResolvedLeaveStep[] = [];
  for (const step of steps) {
    if (
      step.thresholdEnabled &&
      step.daysMoreThan != null &&
      !(totalDays > step.daysMoreThan)
    ) {
      continue;
    }
    let ids: Id<"users">[] = [];
    let label = "";
    if (step.approverType === "position") {
      if (step.value === "manager" && employee.managerId) {
        const mgr = await ctx.db.get(employee.managerId);
        if (mgr?.userId) {
          ids = [mgr.userId];
          label = `Manager — ${mgr.firstName} ${mgr.lastName}`;
        }
      } else if (step.value === "department_head" && employee.departmentId) {
        const dept = await ctx.db.get(employee.departmentId);
        if (dept?.headEmployeeId) {
          const head = await ctx.db.get(dept.headEmployeeId);
          if (head?.userId) {
            ids = [head.userId];
            label = `Department head — ${head.firstName} ${head.lastName}`;
          }
        }
      }
    } else if (step.approverType === "role") {
      const role = await ctx.db.get(step.value as Id<"roles">);
      ids = await membersWithRole(ctx, orgId, step.value as Id<"roles">);
      label = `Role — ${role?.name ?? "Role"}`;
    } else {
      ids = step.userIds ?? [];
    }
    // Drop the requester and dedupe; skip a step nobody can act on.
    ids = [...new Set(ids)].filter((uid) => uid !== employee.userId);
    if (ids.length === 0) continue;
    if (step.approverType === "specific") {
      const names = await Promise.all(ids.map((id) => userName(ctx, id)));
      label = names.filter(Boolean).join(", ") || "Specific approver";
    }
    chain.push({
      approverType: step.approverType,
      value: step.value,
      approverUserId: ids[0],
      approverUserIds: ids,
      label,
      requiresSignature: step.requiresSignature ?? false,
    });
  }
  return chain;
}

// The userIds that may act on a request's current step (chain-aware, with a
// fallback to the legacy two-step fields for in-flight requests).
function currentStepApprovers(req: Doc<"leaveRequests">): {
  ids: Id<"users">[];
  index: number;
} {
  if (req.approvalChain && req.approvalChain.length > 0) {
    const index = req.currentStepIndex ?? 0;
    const step = req.approvalChain[index];
    const ids =
      step?.approverUserIds ??
      (step?.approverUserId ? [step.approverUserId] : []);
    return { ids, index };
  }
  const legacy =
    req.approvalStep === 2 ? req.secondApproverUserId : req.firstApproverUserId;
  return { ids: legacy ? [legacy] : [], index: (req.approvalStep ?? 1) - 1 };
}

// Whether `userId` appears anywhere in the request's approval chain (used to let
// an approver open a request they've already acted on or will act on later).
function isChainApprover(
  req: Doc<"leaveRequests">,
  userId: Id<"users">,
): boolean {
  if (req.approvalChain && req.approvalChain.length > 0) {
    return req.approvalChain.some((s) =>
      (s.approverUserIds ?? (s.approverUserId ? [s.approverUserId] : [])).includes(
        userId,
      ),
    );
  }
  return (
    req.firstApproverUserId === userId || req.secondApproverUserId === userId
  );
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

// Append the approving user's signature to the request's signature list, tagged
// with the current step's label. Returns the updated array, or undefined when no
// signature was supplied (so callers can skip patching the field).
async function appendSignature(
  ctx: MutationCtx,
  req: Doc<"leaveRequests">,
  step: ResolvedLeaveStep | undefined,
  userId: Id<"users">,
  signatureStorageId: Id<"_storage"> | undefined,
): Promise<Doc<"leaveRequests">["signatures"] | undefined> {
  if (!signatureStorageId) return undefined;
  const u = await ctx.db.get(userId);
  const name = u?.name?.trim() || u?.username || u?.email || "Approver";
  return [
    ...(req.signatures ?? []),
    {
      role: step?.label ?? "Approver",
      byUserId: userId,
      name,
      signatureStorageId,
      signedAt: Date.now(),
    },
  ];
}

// Resolve a request's approval chain into the stepper view (label + primary
// approver name + state relative to the request's progress). Shared by the
// detail slide-over and the requester's "My leave" popup.
async function resolveChainView(ctx: QueryCtx, req: Doc<"leaveRequests">) {
  if (!req.approvalChain) return [];
  const curIndex = req.currentStepIndex ?? 0;
  return await Promise.all(
    req.approvalChain.map(async (s, idx) => {
      let state: "approved" | "current" | "upcoming" | "rejected";
      if (req.status === "approved") state = "approved";
      else if (req.status === "rejected")
        state =
          idx < curIndex ? "approved" : idx === curIndex ? "rejected" : "upcoming";
      else
        state =
          idx < curIndex ? "approved" : idx === curIndex ? "current" : "upcoming";
      return {
        label: s.label,
        approverName: await userName(ctx, s.approverUserId),
        state,
        note: s.note ?? null,
        decidedAt: s.decidedAt ?? null,
      };
    }),
  );
}

// Whether the caller must clock a signature to approve the request's current
// step (chain step flagged `requiresSignature`, and the caller can act now).
function currentStepNeedsSignature(
  req: Doc<"leaveRequests">,
  userId: Id<"users">,
): boolean {
  if (!req.approvalChain || req.approvalChain.length === 0) return false;
  if (req.status !== "pending" && req.status !== "info_requested") return false;
  const step = req.approvalChain[req.currentStepIndex ?? 0];
  if (!step?.requiresSignature) return false;
  return currentStepApprovers(req).ids.includes(userId);
}

async function assertCanApprove(
  ctx: QueryCtx,
  orgCtx: OrgContext,
  req: Doc<"leaveRequests">,
) {
  // Only the current step's eligible approvers may act — the chain is enforced
  // in order, so even a `leave:approve:all` admin can't approve a later step
  // before the earlier ones are done (they'd act on the current step, which is
  // the manager's/earlier approver's, bypassing them).
  const { ids } = currentStepApprovers(req);
  if (ids.includes(orgCtx.userId)) return;
  // Legacy in-flight requests (no chain) keep the old behavior: admins with
  // org-wide approval and the requester's direct manager may act.
  if (!req.approvalChain || req.approvalChain.length === 0) {
    if (ctxHasPermission(orgCtx, "leave:approve:all")) return;
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    const employee = await ctx.db.get(req.employeeId);
    if (own && employee && employee.managerId === own._id) return;
  }
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
  await pushNotification(ctx, {
    orgId,
    recipientUserId,
    type,
    title,
    body,
    entityRef: { table: "leaveRequests", id: requestId },
  });
}

// Notify every eligible approver of a resolved chain step.
async function notifyStep(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  step: ResolvedLeaveStep | undefined,
  type: string,
  title: string,
  body: string,
  requestId: Id<"leaveRequests">,
) {
  if (!step) return;
  const ids = step.approverUserIds ??
    (step.approverUserId ? [step.approverUserId] : []);
  for (const id of ids) {
    await notify(ctx, orgId, id, type, title, body, requestId);
  }
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

    // Advance-booking rules from the policy. Backdated leave is never allowed.
    const today = todayISO();
    if (args.startDate < today) {
      throw new Error("Leave can't be applied for past dates.");
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

    // Resolve the approval chain from the policy. No routable approver (or a
    // type that doesn't require approval) auto-approves.
    const chain = await buildLeaveApprovalChain(ctx, orgId, own, policy, totalDays);
    let status: Doc<"leaveRequests">["status"] = "approved";
    let currentStepIndex: number | undefined = undefined;
    if (leaveType.requiresApproval && chain.length > 0) {
      status = "pending";
      currentStepIndex = 0;
    }

    if (tracked) {
      const bal = await ensureBalance(ctx, orgId, own._id, leaveType, year);
      const entitled = computeEntitlement(policy, own.joinDate, year, today);
      const carried = effectiveCarryForward(
        policy,
        year,
        bal.carriedForwardDays,
        today,
      );
      const available =
        entitled +
        carried +
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
      approvalChain: status === "pending" ? chain : undefined,
      currentStepIndex,
      timeline,
    });

    if (status === "pending") {
      await notifyStep(
        ctx,
        orgId,
        chain[0],
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
  args: {
    requestId: v.id("leaveRequests"),
    note: v.optional(v.string()),
    signatureStorageId: v.optional(v.id("_storage")),
  },
  returns: v.null(),
  handler: async (ctx, { requestId, note, signatureStorageId }) => {
    const orgCtx = await requireOrg(ctx);
    const req = await ctx.db.get(requestId);
    if (!req || req.orgId !== orgCtx.orgId) throw new Error("Request not found.");
    if (req.status !== "pending" && req.status !== "info_requested") {
      throw new Error("Request is not awaiting approval.");
    }
    await assertCanApprove(ctx, orgCtx, req);

    // ── Chain-based approval (individual, one step at a time) ──
    if (req.approvalChain && req.approvalChain.length > 0) {
      const i = req.currentStepIndex ?? 0;
      const now = Date.now();
      const step = req.approvalChain[i];
      if (step?.requiresSignature && !signatureStorageId) {
        throw new Error("A signature is required to approve this step.");
      }
      const signatures = await appendSignature(
        ctx,
        req,
        step,
        orgCtx.userId,
        signatureStorageId,
      );
      const chain = req.approvalChain.map((s, idx) =>
        idx === i
          ? { ...s, decidedByUserId: orgCtx.userId, decidedAt: now, note }
          : s,
      );
      const nextIndex = i + 1;
      if (nextIndex < chain.length) {
        // Advance to the next approver.
        await ctx.db.patch(requestId, {
          approvalChain: chain,
          currentStepIndex: nextIndex,
          status: "pending",
          ...(signatures ? { signatures } : {}),
          timeline: pushTimeline(req, {
            at: now,
            actorUserId: orgCtx.userId,
            type: "approved_step",
            note,
          }),
        });
        await notifyStep(
          ctx,
          orgCtx.orgId,
          chain[nextIndex] as ResolvedLeaveStep,
          "leave.requested",
          "Leave request (next approval)",
          "A leave request needs your approval.",
          requestId,
        );
        await writeAuditLog(ctx, {
          orgId: orgCtx.orgId,
          actorUserId: orgCtx.userId,
          action: "leave.approve",
          entity: "leaveRequests",
          entityId: requestId,
          after: { step: nextIndex },
        });
        return null;
      }
      // Final step approved → finalize the request.
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
        approvalChain: chain,
        approverUserId: orgCtx.userId,
        decidedAt: now,
        decisionNote: note,
        ...(signatures ? { signatures } : {}),
        timeline: pushTimeline(req, {
          at: now,
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
    }

    // ── Legacy two-step path (in-flight requests without a chain) ──
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
    const now = Date.now();
    // Record the rejection on the current chain step, if any.
    const rejectedChain =
      req.approvalChain && req.approvalChain.length > 0
        ? req.approvalChain.map((s, idx) =>
            idx === (req.currentStepIndex ?? 0)
              ? { ...s, decidedByUserId: orgCtx.userId, decidedAt: now, note }
              : s,
          )
        : undefined;
    await ctx.db.patch(requestId, {
      status: "rejected",
      approverUserId: orgCtx.userId,
      decidedAt: now,
      decisionNote: note,
      ...(rejectedChain ? { approvalChain: rejectedChain } : {}),
      timeline: pushTimeline(req, {
        at: now,
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
    if (!isOwner && !ctxHasPermission(orgCtx, "leave:approve:all")) {
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
    if (startDate < today) {
      throw new Error("Leave can't be applied for past dates.");
    }
    if (
      policy.maxConsecutiveDays != null &&
      totalDays > policy.maxConsecutiveDays
    ) {
      throw new Error(
        `At most ${policy.maxConsecutiveDays} consecutive day(s) can be booked.`,
      );
    }

    // Rebuild the approval chain afresh and re-enter at the first step.
    const chain = await buildLeaveApprovalChain(
      ctx,
      orgCtx.orgId,
      own,
      policy,
      totalDays,
    );
    let status: Doc<"leaveRequests">["status"] = "approved";
    let currentStepIndex: number | undefined = undefined;
    if (leaveType.requiresApproval && chain.length > 0) {
      status = "pending";
      currentStepIndex = 0;
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
      const carried = effectiveCarryForward(
        policy,
        year,
        bal.carriedForwardDays,
        today,
      );
      const available =
        entitled +
        carried +
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
      approvalChain: status === "pending" ? chain : undefined,
      currentStepIndex,
      // Clear any legacy two-step fields so the rebuilt chain is authoritative.
      approvalStep: undefined,
      firstApproverUserId: undefined,
      secondApproverUserId: undefined,
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
      await notifyStep(
        ctx,
        orgCtx.orgId,
        chain[0],
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
    if (!ctxHasPermission(orgCtx, "leave:approve:all")) {
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
    if (!ctxHasPermission(orgCtx, "leave:approve:all")) {
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
    if (!ctxHasPermission(orgCtx, "leave:approve:all")) {
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
      for (const approver of currentStepApprovers(req).ids) {
        counts.set(approver, (counts.get(approver) ?? 0) + 1);
      }
    }
    let nudged = 0;
    for (const [approver, count] of counts) {
      if (nudged >= 200) break;
      await pushNotification(ctx, {
        orgId: orgCtx.orgId,
        recipientUserId: approver,
        type: "leave.nudge",
        title: "Leave approvals pending",
        body: `You have ${count} leave request(s) awaiting your approval.`,
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
  returns: v.array(myLeaveRequestRow),
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
    return await Promise.all(
      reqs.map(async (r) => {
        const base = await hydrate(ctx, r);
        const approvalChain = await resolveChainView(ctx, r);
        const curIndex = r.currentStepIndex ?? 0;
        const meta = r.attachmentStorageId
          ? await ctx.db.system.get(r.attachmentStorageId)
          : null;
        return {
          ...base,
          attachmentContentType: meta?.contentType ?? null,
          currentApproverName:
            r.status === "pending" || r.status === "info_requested"
              ? (approvalChain[curIndex]?.approverName ??
                approvalChain[curIndex]?.label ??
                null)
              : null,
          approvalChain,
        };
      }),
    );
  },
});

// Requests currently awaiting the caller's decision — i.e. sitting on the step
// the caller is an approver for. Deliberately NOT everything-pending for
// `leave:approve:all` holders: the chain is chronological, so a later approver
// must not see (or act on) a request until the earlier steps have approved.
// Org-wide oversight of all requests lives in the HR Lounge (`leaveDashboard`).
export const approvalQueue = query({
  args: {},
  returns: v.array(leaveRequestRow),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    const pending = await ctx.db
      .query("leaveRequests")
      .withIndex("by_org_status", (q) =>
        q.eq("orgId", orgCtx.orgId).eq("status", "pending"),
      )
      .collect();
    const mineToApprove = pending.filter((r) =>
      currentStepApprovers(r).ids.includes(orgCtx.userId),
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
    const canManage = ctxHasPermission(orgCtx, "leave:approve:all");
    // Anyone in the chain (past, current, or upcoming) may view the request; the
    // current step's approvers may act on it.
    const isApprover = isChainApprover(req, orgCtx.userId);
    const canActNow = currentStepApprovers(req).ids.includes(orgCtx.userId);
    if (!isOwner && !canManage && !isApprover) return null;

    const [emp, lt] = await Promise.all([
      ctx.db.get(req.employeeId),
      ctx.db.get(req.leaveTypeId),
    ]);
    const dept = emp?.departmentId ? await ctx.db.get(emp.departmentId) : null;
    const position = emp?.positionId ? await ctx.db.get(emp.positionId) : null;

    // Resolve the chain for the stepper. Legacy in-flight requests (no chain)
    // still report their two-step approver names below.
    const curIndex = req.currentStepIndex ?? 0;
    const approvalChainView = await resolveChainView(ctx, req);

    const [firstApproverName, secondApproverName] = await Promise.all([
      userName(ctx, req.firstApproverUserId),
      userName(ctx, req.secondApproverUserId),
    ]);
    const currentApproverName = req.approvalChain
      ? (approvalChainView[curIndex]?.approverName ?? null)
      : req.approvalStep === 2
        ? secondApproverName
        : firstApproverName;

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
      firstApproverName: req.approvalChain ? null : firstApproverName,
      secondApproverName: req.approvalChain ? null : secondApproverName,
      currentApproverName,
      approvalChain: approvalChainView,
      timeline,
      // For chain requests only the current-step approver may act (order is
      // enforced); legacy requests keep the manage-can-approve behavior.
      canApprove:
        (req.approvalChain && req.approvalChain.length > 0
          ? canActNow
          : canManage || canActNow) &&
        (req.status === "pending" || req.status === "info_requested"),
      canManage,
      needsSignature: currentStepNeedsSignature(req, orgCtx.userId),
    };
  },
});
