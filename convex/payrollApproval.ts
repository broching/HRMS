import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import {
  requireOrg,
  requirePermission,
  ctxHasPermission,
  getOrgContext,
} from "./auth";
import { getPayrollSettings } from "./payrollSettings";
import { writeAuditLog } from "./lib/audit";
import { pushNotification } from "./model/notify";
import { monthLabel } from "./payroll";

type ChainStep = Doc<"payslips">["approvalChain"] extends
  | Array<infer T>
  | undefined
  ? T
  : never;

async function userName(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<string> {
  const u = await ctx.db.get(userId);
  if (!u) return "Unknown";
  const name = u.name?.trim();
  // Username-only accounts have an empty `name` — fall back so approver pickers
  // and signatures never render blank.
  return name || u.username || u.email || "Unknown";
}

// Notify a set of approvers that payslips are waiting at their step (skips the
// acting user and de-dupes). Links to the approver inbox.
async function notifyApprovers(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  run: Doc<"payrollRuns">,
  userIds: Iterable<Id<"users">>,
  actorUserId: Id<"users"> | null,
): Promise<void> {
  const label = monthLabel(run.periodMonth);
  const seen = new Set<string>();
  for (const uid of userIds) {
    if (actorUserId && uid === actorUserId) continue;
    if (seen.has(uid)) continue;
    seen.add(uid);
    await pushNotification(ctx, {
      orgId,
      recipientUserId: uid,
      type: "payroll.approval_pending",
      title: "Payslips awaiting your approval",
      body: `Payroll for ${label} has payslips awaiting your approval.`,
      entityRef: { table: "payrollRuns", id: run._id },
    });
  }
}

// Resolve the org's configured approval steps into a per-payslip chain snapshot
// (eligible approver user ids + display label per step).
async function resolveApprovalChain(
  ctx: QueryCtx,
  steps: {
    approverType: "role" | "specific";
    roleId?: Id<"roles">;
    userIds?: Id<"users">[];
    requiresSignature: boolean;
  }[],
): Promise<ChainStep[]> {
  const out: ChainStep[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    let approverUserIds: Id<"users">[] = [];
    let label = `Approver ${i + 1}`;
    if (step.approverType === "role" && step.roleId) {
      const role = await ctx.db.get(step.roleId);
      const roleId = step.roleId;
      const members = await ctx.db
        .query("members")
        .withIndex("by_role", (q) => q.eq("roleId", roleId))
        .collect();
      approverUserIds = members
        .filter((m) => m.status === "active")
        .map((m) => m.userId);
      label = role ? `Role — ${role.name}` : label;
    } else if (step.approverType === "specific") {
      approverUserIds = step.userIds ?? [];
      if (approverUserIds.length === 1) {
        label = await userName(ctx, approverUserIds[0]);
      } else if (approverUserIds.length > 1) {
        label = `Approvers (${approverUserIds.length})`;
      }
    }
    out.push({
      approverType: step.approverType,
      approverUserIds,
      requiresSignature: step.requiresSignature,
      label,
    });
  }
  return out;
}

// ─── Complete a run (preparer signs; snapshot the approval chain) ─────────────

export const completeRun = mutation({
  args: {
    runId: v.id("payrollRuns"),
    signatureStorageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, { runId, signatureStorageId }) => {
    const { orgId, userId } = await requirePermission(ctx, "payroll:manage");
    const run = await ctx.db.get(runId);
    if (!run || run.orgId !== orgId) throw new Error("Run not found.");
    if (run.status !== "draft") {
      throw new Error("Only draft runs can be completed.");
    }
    const settings = await getPayrollSettings(ctx, orgId);
    const slips = await ctx.db
      .query("payslips")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
    if (slips.length === 0) throw new Error("This run has no payslips.");

    // Foreign-currency payslips must have an exchange rate before completion so
    // base-currency totals and the bank file are correct.
    const missingRate = slips.find(
      (s) => s.currency !== run.currency && !s.exchangeRate,
    );
    if (missingRate) {
      const emp = await ctx.db.get(missingRate.employeeId);
      const who = emp ? `${emp.firstName} ${emp.lastName}` : "an employee";
      throw new Error(
        `Set an exchange rate for ${who} (${missingRate.currency}) before completing the run.`,
      );
    }

    const name = await userName(ctx, userId);
    const now = Date.now();
    const preparerSig = {
      role: "Prepared by",
      byUserId: userId,
      name,
      signatureStorageId,
      signedAt: now,
    };

    const useApproval =
      settings.approval.enabled && settings.approval.steps.length > 0;

    if (useApproval) {
      const chain = await resolveApprovalChain(ctx, settings.approval.steps);
      const emptyStep = chain.findIndex((s) => s.approverUserIds.length === 0);
      if (emptyStep >= 0) {
        throw new Error(
          `Approval step "${chain[emptyStep].label}" has no eligible approver. Fix the approval flow in Payroll Settings.`,
        );
      }
      for (const s of slips) {
        await ctx.db.patch(s._id, {
          status: "pending_approval",
          approvalChain: chain.map((c) => ({ ...c })),
          currentStepIndex: 0,
          signatures: [preparerSig],
        });
      }
      await ctx.db.patch(runId, {
        status: "pending_approval",
        completedBy: userId,
        preparerSignatureStorageId: signatureStorageId,
        finalizedAt: now,
      });
      // Remind the first step's approvers there are payslips to approve.
      await notifyApprovers(ctx, orgId, run, chain[0].approverUserIds, userId);
    } else {
      // No approval configured — the preparer's signature finalizes each slip.
      for (const s of slips) {
        await ctx.db.patch(s._id, {
          status: "approved",
          currentStepIndex: 0,
          approvalChain: [],
          signatures: [preparerSig],
        });
      }
      await ctx.db.patch(runId, {
        status: "approved",
        completedBy: userId,
        preparerSignatureStorageId: signatureStorageId,
        finalizedAt: now,
      });
    }

    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "payroll.complete_run",
      entity: "payrollRuns",
      entityId: runId,
      after: { approval: useApproval },
    });
    return null;
  },
});

// ─── Approve + sign a payslip ─────────────────────────────────────────────────

// Apply one approver's decision (+ optional signature) to a single payslip at
// its current step. Returns true if it advanced, false if the caller couldn't
// act on it (wrong step / not an approver / missing signature in bulk mode).
async function approveOne(
  ctx: MutationCtx,
  slip: Doc<"payslips">,
  userId: Id<"users">,
  name: string,
  signatureStorageId: Id<"_storage"> | undefined,
  note: string | undefined,
  throwOnError: boolean,
): Promise<{ advanced: boolean; nextApproverIds: Id<"users">[] }> {
  const noop = { advanced: false, nextApproverIds: [] as Id<"users">[] };
  if (slip.status !== "pending_approval" || !slip.approvalChain) {
    if (throwOnError) throw new Error("This payslip is not awaiting approval.");
    return noop;
  }
  const idx = slip.currentStepIndex ?? 0;
  const step = slip.approvalChain[idx];
  if (!step) {
    if (throwOnError) throw new Error("No pending approval step.");
    return noop;
  }
  if (!step.approverUserIds.includes(userId)) {
    if (throwOnError) throw new Error("You are not an approver for this step.");
    return noop;
  }
  if (step.requiresSignature && !signatureStorageId) {
    if (throwOnError) throw new Error("A signature is required to approve.");
    return noop;
  }

  const now = Date.now();
  const chain = slip.approvalChain.map((c, i) =>
    i === idx
      ? { ...c, decidedByUserId: userId, decidedAt: now, note }
      : { ...c },
  );
  const signatures = [...(slip.signatures ?? [])];
  if (signatureStorageId) {
    signatures.push({
      role: step.label,
      byUserId: userId,
      name,
      signatureStorageId,
      signedAt: now,
    });
  }
  const nextIdx = idx + 1;
  const done = nextIdx >= chain.length;
  await ctx.db.patch(slip._id, {
    approvalChain: chain,
    currentStepIndex: nextIdx,
    signatures,
    status: done ? "approved" : "pending_approval",
  });
  return {
    advanced: true,
    nextApproverIds: done ? [] : chain[nextIdx].approverUserIds,
  };
}

// After approvals, promote the run to `approved` once every payslip is approved.
async function maybeApproveRun(
  ctx: MutationCtx,
  runId: Id<"payrollRuns">,
): Promise<void> {
  const run = await ctx.db.get(runId);
  if (!run || run.status !== "pending_approval") return;
  const slips = await ctx.db
    .query("payslips")
    .withIndex("by_run", (q) => q.eq("runId", runId))
    .collect();
  if (slips.length > 0 && slips.every((s) => s.status === "approved")) {
    await ctx.db.patch(runId, { status: "approved" });
  }
}

export const approvePayslip = mutation({
  args: {
    payslipId: v.id("payslips"),
    signatureStorageId: v.optional(v.id("_storage")),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { payslipId, signatureStorageId, note }) => {
    const { orgId, userId } = await requireOrg(ctx);
    const slip = await ctx.db.get(payslipId);
    if (!slip || slip.orgId !== orgId) throw new Error("Payslip not found.");
    const name = await userName(ctx, userId);
    const res = await approveOne(
      ctx,
      slip,
      userId,
      name,
      signatureStorageId,
      note,
      true,
    );
    await maybeApproveRun(ctx, slip.runId);
    // Nudge the next step's approvers once work reaches them.
    if (res.advanced && res.nextApproverIds.length > 0) {
      const run = await ctx.db.get(slip.runId);
      if (run)
        await notifyApprovers(ctx, orgId, run, res.nextApproverIds, userId);
    }
    return null;
  },
});

export const approvePayslipsBulk = mutation({
  args: {
    payslipIds: v.array(v.id("payslips")),
    signatureStorageId: v.optional(v.id("_storage")),
    note: v.optional(v.string()),
  },
  returns: v.number(),
  handler: async (ctx, { payslipIds, signatureStorageId, note }) => {
    const { orgId, userId } = await requireOrg(ctx);
    const name = await userName(ctx, userId);
    const runIds = new Set<Id<"payrollRuns">>();
    // Per-run set of approvers to nudge once work advances to their step.
    const nextByRun = new Map<Id<"payrollRuns">, Set<Id<"users">>>();
    let approved = 0;
    for (const id of payslipIds) {
      const slip = await ctx.db.get(id);
      if (!slip || slip.orgId !== orgId) continue;
      const res = await approveOne(
        ctx,
        slip,
        userId,
        name,
        signatureStorageId,
        note,
        false,
      );
      if (res.advanced) {
        approved += 1;
        runIds.add(slip.runId);
        if (res.nextApproverIds.length > 0) {
          const set = nextByRun.get(slip.runId) ?? new Set<Id<"users">>();
          for (const uid of res.nextApproverIds) set.add(uid);
          nextByRun.set(slip.runId, set);
        }
      }
    }
    for (const runId of runIds) await maybeApproveRun(ctx, runId);
    for (const [runId, users] of nextByRun) {
      const run = await ctx.db.get(runId);
      // Only nudge for runs still pending (a fully-approved run needs no nudge).
      if (run && run.status === "pending_approval")
        await notifyApprovers(ctx, orgId, run, users, userId);
    }
    return approved;
  },
});

// ─── Release an approved run to employees ─────────────────────────────────────

export const releaseRun = mutation({
  args: { runId: v.id("payrollRuns"), payDate: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { runId, payDate }) => {
    const { orgId, userId } = await requirePermission(ctx, "payroll:manage");
    const run = await ctx.db.get(runId);
    if (!run || run.orgId !== orgId) throw new Error("Run not found.");
    if (run.status !== "approved" && run.status !== "finalized") {
      throw new Error("Only fully-approved runs can be released.");
    }
    const now = Date.now();
    await ctx.db.patch(runId, {
      status: "paid",
      paidAt: now,
      payDate: payDate ?? run.payDate ?? new Date().toISOString().slice(0, 10),
    });

    const slips = await ctx.db
      .query("payslips")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
    for (const s of slips) {
      if (s.orgId === orgId) await ctx.db.patch(s._id, { status: "paid" });
    }

    // Close out claims pulled into this run (reimbursed via payroll).
    const adjustments = await ctx.db
      .query("payrollAdjustments")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
    for (const adj of adjustments) {
      if (adj.source !== "claim" || !adj.sourceRefId) continue;
      const claim = await ctx.db.get(adj.sourceRefId as Id<"claims">);
      if (!claim || claim.orgId !== orgId) continue;
      if (claim.status === "reimbursed") continue;
      await ctx.db.patch(claim._id, {
        status: "reimbursed",
        reimbursedAt: now,
      });
    }

    // Notify each employee their payslip is available.
    const label = monthLabel(run.periodMonth);
    for (const slip of slips) {
      if (slip.orgId !== orgId) continue;
      const emp = await ctx.db.get(slip.employeeId);
      if (!emp?.userId) continue;
      await pushNotification(ctx, {
        orgId,
        recipientUserId: emp.userId,
        type: "payroll.payslip_released",
        title: "Payslip available",
        body: `Your payslip for ${label} has been released.`,
        entityRef: { table: "payslips", id: slip._id },
      });
    }
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "payroll.release_run",
      entity: "payrollRuns",
      entityId: runId,
    });
    return null;
  },
});

// Upload URL for a signature image (any authenticated org member — approvers
// aren't necessarily payroll managers). Eligibility is enforced on approve.
export const generateSignatureUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireOrg(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

// Member + role options for the approval-flow editor.
export const approverOptions = query({
  args: {},
  returns: v.object({
    members: v.array(v.object({ userId: v.id("users"), name: v.string() })),
    roles: v.array(v.object({ _id: v.id("roles"), name: v.string() })),
  }),
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "payroll:manage");
    const members = await ctx.db
      .query("members")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const activeMembers = members.filter((m) => m.status === "active");
    const memberRows = await Promise.all(
      activeMembers.map(async (m) => ({
        userId: m.userId,
        name: await userName(ctx, m.userId),
      })),
    );
    memberRows.sort((a, b) => a.name.localeCompare(b.name));
    const roles = await ctx.db
      .query("roles")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    return {
      members: memberRows,
      roles: roles.map((r) => ({ _id: r._id, name: r.name })),
    };
  },
});

// ─── Queries ─────────────────────────────────────────────────────────────────

const approvalRow = v.object({
  _id: v.id("payslips"),
  employeeName: v.string(),
  netCents: v.number(),
  currency: v.string(),
  status: v.string(),
  currentStepIndex: v.number(),
  chain: v.array(
    v.object({
      label: v.string(),
      requiresSignature: v.boolean(),
      decidedByName: v.union(v.string(), v.null()),
      decidedAt: v.union(v.number(), v.null()),
    }),
  ),
  canAct: v.boolean(),
  needsSignature: v.boolean(),
});

export const getRunApprovals = query({
  args: { runId: v.id("payrollRuns") },
  returns: v.union(
    v.null(),
    v.object({
      status: v.string(),
      canManage: v.boolean(),
      payslips: v.array(approvalRow),
    }),
  ),
  handler: async (ctx, { runId }) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return null;
    const run = await ctx.db.get(runId);
    if (!run || run.orgId !== orgCtx.orgId) return null;
    const canManage = ctxHasPermission(orgCtx, "payroll:manage");

    const slips = await ctx.db
      .query("payslips")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();

    const rows = await Promise.all(
      slips.map(async (s) => {
        const emp = await ctx.db.get(s.employeeId);
        const chain = s.approvalChain ?? [];
        const idx = s.currentStepIndex ?? 0;
        const step = chain[idx];
        const canAct =
          s.status === "pending_approval" &&
          !!step &&
          step.approverUserIds.includes(orgCtx.userId);
        const chainView = await Promise.all(
          chain.map(async (c) => ({
            label: c.label,
            requiresSignature: c.requiresSignature,
            decidedByName: c.decidedByUserId
              ? await userName(ctx, c.decidedByUserId)
              : null,
            decidedAt: c.decidedAt ?? null,
          })),
        );
        return {
          _id: s._id,
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
          netCents: s.netCents,
          currency: s.currency,
          status: s.status,
          currentStepIndex: idx,
          chain: chainView,
          canAct,
          needsSignature: canAct && !!step?.requiresSignature,
        };
      }),
    );
    rows.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
    return { status: run.status, canManage, payslips: rows };
  },
});

// Distinct signatures across a run's payslips (preparer + each approver), with
// image URLs — for embedding at the bottom of the detailed Excel export. Only
// returns signatures once the run is at least approved.
export const runSignatures = query({
  args: { runId: v.id("payrollRuns") },
  returns: v.array(
    v.object({
      role: v.string(),
      name: v.string(),
      url: v.union(v.string(), v.null()),
      signedAt: v.number(),
    }),
  ),
  handler: async (ctx, { runId }) => {
    const { orgId } = await requirePermission(ctx, "payroll:manage");
    const run = await ctx.db.get(runId);
    if (!run || run.orgId !== orgId) return [];
    if (run.status !== "approved" && run.status !== "finalized" && run.status !== "paid") {
      return [];
    }
    const slips = await ctx.db
      .query("payslips")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
    // De-dupe by signer + role (the same approver signs every payslip).
    const seen = new Map<
      string,
      { role: string; name: string; storageId: Id<"_storage">; signedAt: number }
    >();
    for (const s of slips) {
      for (const sig of s.signatures ?? []) {
        const key = `${sig.byUserId}:${sig.role}`;
        if (!seen.has(key)) {
          seen.set(key, {
            role: sig.role,
            name: sig.name,
            storageId: sig.signatureStorageId,
            signedAt: sig.signedAt,
          });
        }
      }
    }
    const out = await Promise.all(
      [...seen.values()].map(async (s) => ({
        role: s.role,
        name: s.name,
        url: await ctx.storage.getUrl(s.storageId),
        signedAt: s.signedAt,
      })),
    );
    out.sort((a, b) => a.signedAt - b.signedAt);
    return out;
  },
});

// Runs with payslips currently awaiting the caller's approval (approver inbox).
export const myApprovalRuns = query({
  args: {},
  returns: v.array(
    v.object({
      runId: v.id("payrollRuns"),
      label: v.string(),
      periodMonth: v.string(),
      currency: v.string(),
      pendingCount: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    const runs = await ctx.db
      .query("payrollRuns")
      .withIndex("by_org", (q) => q.eq("orgId", orgCtx.orgId))
      .order("desc")
      .take(24);
    const out: {
      runId: Id<"payrollRuns">;
      label: string;
      periodMonth: string;
      currency: string;
      pendingCount: number;
    }[] = [];
    for (const run of runs) {
      if (run.status !== "pending_approval") continue;
      const slips = await ctx.db
        .query("payslips")
        .withIndex("by_run", (q) => q.eq("runId", run._id))
        .collect();
      let pendingCount = 0;
      for (const s of slips) {
        if (s.status !== "pending_approval" || !s.approvalChain) continue;
        const step = s.approvalChain[s.currentStepIndex ?? 0];
        if (step && step.approverUserIds.includes(orgCtx.userId)) pendingCount += 1;
      }
      if (pendingCount > 0)
        out.push({
          runId: run._id,
          label: run.label,
          periodMonth: run.periodMonth,
          currency: run.currency,
          pendingCount,
        });
    }
    return out;
  },
});

// Count of payslips currently awaiting the caller's approval (for badges).
export const pendingCountForMe = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return 0;
    // Scan recent pending runs' payslips for ones the caller can act on.
    const runs = await ctx.db
      .query("payrollRuns")
      .withIndex("by_org", (q) => q.eq("orgId", orgCtx.orgId))
      .order("desc")
      .take(24);
    let count = 0;
    for (const run of runs) {
      if (run.status !== "pending_approval") continue;
      const runSlips = await ctx.db
        .query("payslips")
        .withIndex("by_run", (q) => q.eq("runId", run._id))
        .collect();
      for (const s of runSlips) {
        if (s.status !== "pending_approval" || !s.approvalChain) continue;
        const step = s.approvalChain[s.currentStepIndex ?? 0];
        if (step && step.approverUserIds.includes(orgCtx.userId)) count += 1;
      }
    }
    return count;
  },
});
