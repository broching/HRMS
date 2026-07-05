import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requireOrg, getOrgContext, requirePermission, OrgContext } from "./auth";
import { hasPermission } from "./lib/permissions";
import { employeeByUserId } from "./employees";
import {
  claimRow,
  claimDetail,
  claimCommentRow,
  claimTypeBalance,
  claimApprovalGroup,
  claimApprovalItem,
  claimApprovalGroupRow,
  claimGroupApprovalItem,
} from "./lib/validators";
import { writeAuditLog } from "./lib/audit";
import type { ClaimStatus } from "./lib/enums";
import { CLAIM_GROUP_HR, CLAIM_GROUP_FINANCE, claimExchangeMode } from "./lib/enums";

// Maximum receipts/attachments per claim.
const MAX_RECEIPTS = 5;

// Server-side money formatter for audit summaries.
function formatMoneyCents(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}
import { resolveClaimSettings, ResolvedClaimSettings } from "./claimSettings";

// ─── Helpers ─────────────────────────────────────────────────────────────

// Claims that count toward a claim type's periodic limits (i.e. not rejected
// or cancelled).
const COUNTING_STATUSES: ReadonlySet<ClaimStatus> = new Set([
  "pending_manager",
  "pending_finance",
  "approved",
  "reimbursed",
]);

// Sum the employee's claims for one claim type within a calendar year and
// month, identified by ISO date prefixes (e.g. "2026" and "2026-06"). Only
// non-rejected/cancelled claims count.
async function spendForType(
  ctx: QueryCtx,
  employeeId: Id<"employees">,
  claimTypeId: Id<"claimTypes">,
  yearPrefix: string,
  monthPrefix: string,
): Promise<{ yearlyUsedCents: number; monthlyUsedCents: number }> {
  const claims = await ctx.db
    .query("claims")
    .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
    .collect();
  let yearlyUsedCents = 0;
  let monthlyUsedCents = 0;
  for (const c of claims) {
    if (c.claimTypeId !== claimTypeId) continue;
    if (!COUNTING_STATUSES.has(c.status)) continue;
    if (c.incurredDate.startsWith(yearPrefix)) yearlyUsedCents += c.amountCents;
    if (c.incurredDate.startsWith(monthPrefix)) monthlyUsedCents += c.amountCents;
  }
  return { yearlyUsedCents, monthlyUsedCents };
}

async function hydrateClaim(ctx: QueryCtx, claim: Doc<"claims">) {
  const [emp, ct] = await Promise.all([
    ctx.db.get(claim.employeeId),
    ctx.db.get(claim.claimTypeId),
  ]);
  return {
    _id: claim._id,
    _creationTime: claim._creationTime,
    employeeId: claim.employeeId,
    groupId: claim.groupId,
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
    claimTypeName: ct?.name ?? "—",
    category: ct?.category ?? ("custom" as const),
    amountCents: claim.amountCents,
    currency: claim.currency,
    incurredDate: claim.incurredDate,
    description: claim.description,
    remarks: claim.remarks,
    status: claim.status,
    receiptCount: claim.receiptStorageIds.length,
    decisionNote: claim.decisionNote,
  };
}

// Resolve receipt storage ids to servable URLs + their stored content type, so
// the UI can render images/PDFs inline and open any file in a new tab.
async function resolveReceipts(ctx: QueryCtx, storageIds: Id<"_storage">[]) {
  const out: {
    storageId: Id<"_storage">;
    url: string;
    contentType: string | null;
  }[] = [];
  for (const sid of storageIds) {
    const url = await ctx.storage.getUrl(sid);
    if (!url) continue;
    const meta = await ctx.db.system.get(sid);
    out.push({ storageId: sid, url, contentType: meta?.contentType ?? null });
  }
  return out;
}

async function requireClaimAccess(ctx: QueryCtx, claimId: Id<"claims">) {
  const orgCtx = await requireOrg(ctx);
  const claim = await ctx.db.get(claimId);
  if (!claim || claim.orgId !== orgCtx.orgId) throw new ConvexError("Claim not found.");
  if (hasPermission(orgCtx.role, "claims:approve:finance")) {
    return { orgCtx, claim };
  }
  const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
  if (own && claim.employeeId === own._id) return { orgCtx, claim };
  // Anyone in the resolved approval chain can view the claim they're routing.
  if (claim.approvalChain?.some((s) => stepEligible(s, orgCtx.userId))) {
    return { orgCtx, claim };
  }
  const employee = await ctx.db.get(claim.employeeId);
  if (own && employee && employee.managerId === own._id) {
    return { orgCtx, claim };
  }
  throw new ConvexError("Not authorized to view this claim.");
}

// Approval step: the claim's current chain approver, or anyone with finance
// rights. Falls back to the manager relationship for legacy (chain-less) claims.
async function assertManagerStage(
  ctx: QueryCtx,
  orgCtx: OrgContext,
  claim: Doc<"claims">,
) {
  if (hasPermission(orgCtx.role, "claims:approve:finance")) return;
  if (claim.approvalChain && claim.approvalChain.length > 0) {
    const step = claim.approvalChain[claim.currentStepIndex ?? 0];
    if (step && stepEligible(step, orgCtx.userId)) return;
    throw new ConvexError("Not authorized to act on this claim.");
  }
  const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
  const employee = await ctx.db.get(claim.employeeId);
  if (own && employee && employee.managerId === own._id) return;
  throw new ConvexError("Not authorized to act on this claim.");
}

async function notify(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  recipientUserId: Id<"users"> | undefined,
  type: string,
  title: string,
  body: string,
  claimId: Id<"claims">,
) {
  if (!recipientUserId) return;
  await ctx.db.insert("notifications", {
    orgId,
    recipientUserId,
    type,
    title,
    body,
    entityRef: { table: "claims", id: claimId },
    read: false,
  });
}

// Notify everyone eligible to act on a resolved step (all members for a group
// step; the single approver otherwise).
async function notifyStep(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  step: { approverUserId?: Id<"users">; approverUserIds?: Id<"users">[] },
  type: string,
  title: string,
  body: string,
  claimId: Id<"claims">,
) {
  for (const uid of eligibleApprovers(step)) {
    await notify(ctx, orgId, uid, type, title, body, claimId);
  }
}

type ChainStep = {
  approverType: "position" | "specific" | "group";
  value: string;
  approverUserId?: Id<"users">;
  approverUserIds?: Id<"users">[];
  label: string;
};

// Everyone eligible to act on a resolved step. Group steps carry the full
// member set in `approverUserIds`; single-approver steps use `approverUserId`.
function eligibleApprovers(step: {
  approverUserId?: Id<"users">;
  approverUserIds?: Id<"users">[];
}): Id<"users">[] {
  if (step.approverUserIds && step.approverUserIds.length > 0) {
    return step.approverUserIds;
  }
  return step.approverUserId ? [step.approverUserId] : [];
}

// Whether `userId` may act on the given resolved step.
function stepEligible(
  step: { approverUserId?: Id<"users">; approverUserIds?: Id<"users">[] },
  userId: Id<"users">,
): boolean {
  return eligibleApprovers(step).includes(userId);
}

// Non-throwing check of whether the caller may act on a `pending_manager`
// claim's current stage — finance rights, the current chain step, or (for
// legacy chain-less claims) the claimant's manager. Used to skip, rather than
// reject, claims in bulk approval.
async function callerCanActOnManagerStep(
  ctx: QueryCtx,
  orgCtx: OrgContext,
  claim: Doc<"claims">,
  isFinance: boolean,
): Promise<boolean> {
  if (isFinance) return true;
  const chain = claim.approvalChain;
  if (chain && chain.length > 0) {
    const step = chain[claim.currentStepIndex ?? 0];
    return !!step && stepEligible(step, orgCtx.userId);
  }
  const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
  const employee = await ctx.db.get(claim.employeeId);
  return !!(own && employee && employee.managerId === own._id);
}

// Resolve the members of an assignee group referenced by a workflow step. The
// reserved ids map to the dedicated HR/Finance fields; other ids look up a
// custom group.
function groupMembers(
  settings: ResolvedClaimSettings,
  groupId: string,
): Id<"users">[] {
  if (groupId === CLAIM_GROUP_HR) return settings.hrApproverUserIds;
  if (groupId === CLAIM_GROUP_FINANCE) return settings.financeApproverUserIds;
  return settings.assigneeGroups.find((g) => g.id === groupId)?.userIds ?? [];
}

function groupLabel(settings: ResolvedClaimSettings, groupId: string): string {
  if (groupId === CLAIM_GROUP_HR) return "HR";
  if (groupId === CLAIM_GROUP_FINANCE) return "Finance";
  return settings.assigneeGroups.find((g) => g.id === groupId)?.name ?? "Group";
}

async function safeGetUser(ctx: QueryCtx, maybeId: string) {
  try {
    return await ctx.db.get(maybeId as Id<"users">);
  } catch {
    return null;
  }
}

// Resolve the approval chain for a claim from the org's configured workflow,
// applying thresholds (amount + office scope) and resolving each step to a
// concrete approver. Steps that can't be routed (e.g. no manager) are skipped.
async function buildApprovalChain(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  employee: Doc<"employees">,
  amountCents: number,
): Promise<ChainStep[]> {
  const settings = await resolveClaimSettings(ctx, orgId);
  const chain: ChainStep[] = [];
  for (const step of settings.approvalWorkflow) {
    if (step.thresholdEnabled) {
      const matches = step.rules.some(
        (r) =>
          amountCents > r.amountMoreThanCents &&
          (r.officeIds.length === 0 ||
            (employee.officeId != null &&
              r.officeIds.includes(employee.officeId))),
      );
      if (!matches) continue;
    }

    // Group step: any member of the group can approve. Resolve the full member
    // set (minus the claimant), so the step routes to all of them.
    if (step.approverType === "group") {
      const members = groupMembers(settings, step.value).filter(
        (uid) => uid !== employee.userId,
      );
      if (members.length === 0) continue; // empty/unroutable → skip
      chain.push({
        approverType: "group",
        value: step.value,
        approverUserId: members[0],
        approverUserIds: members,
        label: groupLabel(settings, step.value),
      });
      continue;
    }

    let approverUserId: Id<"users"> | undefined;
    let name = "";
    if (step.approverType === "position") {
      if (step.value === "manager" && employee.managerId) {
        const mgr = await ctx.db.get(employee.managerId);
        approverUserId = mgr?.userId ?? undefined;
        name = mgr ? `${mgr.firstName} ${mgr.lastName}` : "";
      } else if (step.value === "department_head" && employee.departmentId) {
        const dept = await ctx.db.get(employee.departmentId);
        if (dept?.headEmployeeId) {
          const head = await ctx.db.get(dept.headEmployeeId);
          approverUserId = head?.userId ?? undefined;
          name = head ? `${head.firstName} ${head.lastName}` : "";
        }
      }
    } else {
      const user = await safeGetUser(ctx, step.value);
      approverUserId = user?._id;
      name = user?.name ?? "";
    }

    if (!approverUserId) continue; // unroutable → skip
    if (employee.userId && approverUserId === employee.userId) continue; // no self-approval

    const posLabel =
      step.approverType === "position"
        ? step.value === "manager"
          ? "Manager"
          : "Department head"
        : "Approver";
    chain.push({
      approverType: step.approverType,
      value: step.value,
      approverUserId,
      label: name ? `${posLabel} — ${name}` : posLabel,
    });
  }

  // HR is an automatic review stage: once the workflow steps above are cleared,
  // the claim routes to the configured HR approvers (who can approve/reject),
  // then on to the finance stage. This mirrors how Finance works as an implicit
  // final stage, so simply naming people under "Claim assignees → HR" routes
  // claims to them without having to wire an explicit workflow step. If the
  // admin *did* place HR explicitly in the workflow, respect that and don't
  // append a second HR step.
  const hrAlreadyInWorkflow = settings.approvalWorkflow.some(
    (s) => s.approverType === "group" && s.value === CLAIM_GROUP_HR,
  );
  if (!hrAlreadyInWorkflow) {
    const hrMembers = groupMembers(settings, CLAIM_GROUP_HR).filter(
      (uid) => uid !== employee.userId,
    );
    if (hrMembers.length > 0) {
      chain.push({
        approverType: "group",
        value: CLAIM_GROUP_HR,
        approverUserId: hrMembers[0],
        approverUserIds: hrMembers,
        label: "HR",
      });
    }
  }

  // Collapse consecutive identical steps. Single-approver steps collapse when
  // they resolve to the same person; group steps collapse when they target the
  // same group (keeping distinct groups even if members overlap).
  const deduped: ChainStep[] = [];
  for (const s of chain) {
    const prev = deduped[deduped.length - 1];
    if (prev) {
      const sameGroup =
        prev.approverType === "group" &&
        s.approverType === "group" &&
        prev.value === s.value;
      const samePerson =
        prev.approverType !== "group" &&
        s.approverType !== "group" &&
        prev.approverUserId === s.approverUserId;
      if (sameGroup || samePerson) continue;
    }
    deduped.push(s);
  }
  return deduped;
}

// Notify all configured finance approvers that a claim awaits their decision.
async function notifyFinance(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  claim: Doc<"claims">,
  employeeName: string,
) {
  const settings = await resolveClaimSettings(ctx, orgId);
  for (const userId of settings.financeApproverUserIds) {
    await notify(
      ctx,
      orgId,
      userId,
      "claim.submitted",
      "Claim to approve",
      `${employeeName}'s claim is awaiting finance approval`,
      claim._id,
    );
  }
}

// ─── Mutations ───────────────────────────────────────────────────────────

// Create a claim as a DRAFT. Drafts are the employee's private working set for
// a month — editable, deletable, and invisible to approvers — until the
// employee submits the whole month's batch via `submitMonth`.
export const submit = mutation({
  args: {
    claimTypeId: v.id("claimTypes"),
    amountCents: v.number(),
    currency: v.optional(v.string()),
    taxAmountCents: v.optional(v.number()),
    localAmountCents: v.optional(v.number()),
    localCurrency: v.optional(v.string()),
    exchangeRate: v.optional(v.number()),
    exchangeMode: v.optional(claimExchangeMode),
    exchangeRateDate: v.optional(v.string()),
    exchangeProvider: v.optional(v.string()),
    receiptNo: v.optional(v.string()),
    remarks: v.optional(v.string()),
    incurredDate: v.string(),
    description: v.string(),
    receiptStorageIds: v.array(v.id("_storage")),
  },
  returns: v.id("claims"),
  handler: async (ctx, args) => {
    const { orgId, userId, org } = await requireOrg(ctx);
    const own = await employeeByUserId(ctx, orgId, userId);
    if (!own) throw new ConvexError("You don't have an employee profile yet.");

    const claimType = await ctx.db.get(args.claimTypeId);
    if (!claimType || claimType.orgId !== orgId || !claimType.active) {
      throw new ConvexError("Claim type not found.");
    }
    if (args.amountCents <= 0) throw new ConvexError("Amount must be positive.");
    if (args.receiptStorageIds.length > MAX_RECEIPTS) {
      throw new ConvexError(`A claim can have at most ${MAX_RECEIPTS} attachments.`);
    }
    if (claimType.requiresReceipt && args.receiptStorageIds.length === 0) {
      throw new ConvexError("This claim type requires a receipt.");
    }
    if (claimType.maxAmountCents && args.amountCents > claimType.maxAmountCents) {
      throw new ConvexError("Amount exceeds the per-transaction limit for this claim type.");
    }

    const id = await ctx.db.insert("claims", {
      orgId,
      employeeId: own._id,
      claimTypeId: args.claimTypeId,
      amountCents: args.amountCents,
      currency: args.currency ?? org.settings.currency,
      taxAmountCents: args.taxAmountCents,
      localAmountCents: args.localAmountCents,
      localCurrency: args.localCurrency,
      exchangeRate: args.exchangeRate,
      exchangeMode: args.exchangeMode,
      exchangeRateDate: args.exchangeRateDate,
      exchangeProvider: args.exchangeProvider,
      receiptNo: args.receiptNo,
      remarks: args.remarks,
      incurredDate: args.incurredDate,
      description: args.description,
      receiptStorageIds: args.receiptStorageIds,
      status: "draft",
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "claim.draft",
      entity: "claims",
      entityId: id,
      after: { amountCents: args.amountCents },
    });
    return id;
  },
});

// Route a single draft claim into the approval workflow: resolve the chain
// (with thresholds) and finance stage, set the resulting status, and notify the
// first approver / finance. Returns the resulting status.
async function routeDraftClaim(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  employee: Doc<"employees">,
  claim: Doc<"claims">,
): Promise<ClaimStatus> {
  const settings = await resolveClaimSettings(ctx, orgId);
  const requiresFinance = settings.financeApproverUserIds.length > 0;
  const chain = await buildApprovalChain(ctx, orgId, employee, claim.amountCents);
  const status: ClaimStatus =
    chain.length > 0
      ? "pending_manager"
      : requiresFinance
        ? "pending_finance"
        : "approved";
  const autoApproved = status === "approved";
  await ctx.db.patch(claim._id, {
    status,
    requiresFinance,
    approvalChain: chain,
    currentStepIndex: chain.length > 0 ? 0 : undefined,
    decidedAt: autoApproved ? Date.now() : undefined,
    sentToPayroll:
      autoApproved && settings.payrollMode === "automatic" ? true : undefined,
  });
  const empName = `${employee.firstName} ${employee.lastName}`;
  if (chain.length > 0) {
    await notifyStep(
      ctx,
      orgId,
      chain[0],
      "claim.submitted",
      "Claim to approve",
      `${empName} submitted a claim`,
      claim._id,
    );
  } else if (requiresFinance) {
    const fresh = (await ctx.db.get(claim._id))!;
    await notifyFinance(ctx, orgId, fresh, empName);
  }
  await writeAuditLog(ctx, {
    orgId,
    actorUserId: employee.userId ?? undefined,
    action: "claim.submit",
    entity: "claims",
    entityId: claim._id,
    after: { amountCents: claim.amountCents, status },
  });
  return status;
}

// Create a new claim group (monthly batch) for an employee. `sequence` is the
// next 1-based number for that (employee, month) — resubmissions of rejected
// claims create later groups for the same month.
async function createClaimGroup(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  employeeId: Id<"employees">,
  month: string,
): Promise<Id<"claimGroups">> {
  const existing = await ctx.db
    .query("claimGroups")
    .withIndex("by_employee_month", (q) =>
      q.eq("employeeId", employeeId).eq("periodMonth", month),
    )
    .collect();
  const sequence = existing.length + 1;
  return await ctx.db.insert("claimGroups", {
    orgId,
    employeeId,
    periodMonth: month,
    sequence,
    // Only later batches carry a label; the first is just the month.
    title: sequence > 1 ? `Resubmission ${sequence - 1}` : undefined,
    submittedAt: Date.now(),
  });
}

// Submit the whole month's batch: bundle every draft claim of the caller whose
// incurred date falls in `month` (YYYY-MM) into a new claim group and route each
// into the approval workflow. After this, those claims are visible to approvers
// (as a group) and can no longer be edited by the employee.
export const submitMonth = mutation({
  args: { month: v.string() },
  returns: v.object({ submitted: v.number(), groupId: v.id("claimGroups") }),
  handler: async (ctx, { month }) => {
    const { orgId, userId } = await requireOrg(ctx);
    const own = await employeeByUserId(ctx, orgId, userId);
    if (!own) throw new ConvexError("You don't have an employee profile yet.");
    const drafts = (
      await ctx.db
        .query("claims")
        .withIndex("by_employee", (q) => q.eq("employeeId", own._id))
        .collect()
    ).filter(
      (c) => c.status === "draft" && c.incurredDate.startsWith(month),
    );
    if (drafts.length === 0) {
      throw new ConvexError("No draft claims to submit for this month.");
    }
    const groupId = await createClaimGroup(ctx, orgId, own._id, month);
    for (const claim of drafts) {
      await routeDraftClaim(ctx, orgId, own, claim);
      await ctx.db.patch(claim._id, { groupId });
    }
    return { submitted: drafts.length, groupId };
  },
});

// Resubmit rejected claims: bundle the selected rejected claims (all owned by
// the caller, from the same month) into a fresh claim group and route them back
// through the approval workflow from the start. Their prior decision state is
// cleared so the new chain resolves against current settings.
export const resubmitClaims = mutation({
  args: { claimIds: v.array(v.id("claims")) },
  returns: v.object({ submitted: v.number(), groupId: v.id("claimGroups") }),
  handler: async (ctx, { claimIds }) => {
    const { orgId, userId } = await requireOrg(ctx);
    const own = await employeeByUserId(ctx, orgId, userId);
    if (!own) throw new ConvexError("You don't have an employee profile yet.");
    if (claimIds.length === 0) {
      throw new ConvexError("Select at least one rejected claim to resubmit.");
    }
    const claims: Doc<"claims">[] = [];
    let month: string | null = null;
    for (const id of claimIds) {
      const c = await ctx.db.get(id);
      if (!c || c.orgId !== orgId || c.employeeId !== own._id) {
        throw new ConvexError("Claim not found.");
      }
      if (c.status !== "rejected") {
        throw new ConvexError("Only rejected claims can be resubmitted.");
      }
      const m = c.incurredDate.slice(0, 7);
      if (month === null) month = m;
      else if (month !== m) {
        throw new ConvexError("Resubmit claims from the same month together.");
      }
      claims.push(c);
    }
    const groupId = await createClaimGroup(ctx, orgId, own._id, month!);
    for (const claim of claims) {
      // Reset decision state back to a clean draft, then route fresh (rebuilds
      // the approval chain from current settings).
      await ctx.db.patch(claim._id, {
        groupId,
        status: "draft",
        decidedAt: undefined,
        decisionNote: undefined,
        rejectedStepIndex: undefined,
        managerApproverUserId: undefined,
        financeApproverUserId: undefined,
        approvalChain: undefined,
        currentStepIndex: undefined,
        sentToPayroll: undefined,
      });
      const fresh = (await ctx.db.get(claim._id))!;
      await routeDraftClaim(ctx, orgId, own, fresh);
    }
    return { submitted: claims.length, groupId };
  },
});

// Core of a manager-stage approval: advances the chain to the next approver,
// hands off to finance once the chain completes, or finalises when there's no
// finance stage. Assumes `claim.status === "pending_manager"` in this org, and
// enforces that the caller may act on the current step (chain approver, or
// anyone with finance rights). Shared by `managerApprove` and the bulk
// `approveAllForEmployee`.
async function advanceManagerStep(
  ctx: MutationCtx,
  orgCtx: OrgContext,
  claim: Doc<"claims">,
  note?: string,
) {
  const claimId = claim._id;
  const chain = claim.approvalChain;
  const idx = claim.currentStepIndex ?? 0;

  // Legacy claims (submitted before configurable chains): manager → finance.
  if (!chain || chain.length === 0) {
    await assertManagerStage(ctx, orgCtx, claim);
    await ctx.db.patch(claimId, {
      status: "pending_finance",
      managerApproverUserId: orgCtx.userId,
      decisionNote: note,
    });
    const emp = await ctx.db.get(claim.employeeId);
    await notifyFinance(
      ctx,
      orgCtx.orgId,
      claim,
      emp ? `${emp.firstName} ${emp.lastName}` : "An employee",
    );
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "claim.manager_approve",
      entity: "claims",
      entityId: claimId,
    });
    return;
  }

  const step = chain[idx];
  const isApprover = !!step && stepEligible(step, orgCtx.userId);
  if (!isApprover && !hasPermission(orgCtx.role, "claims:approve:finance")) {
    throw new ConvexError("Not authorized to approve this step.");
  }

  const updatedChain = chain.map((s, i) =>
    i === idx
      ? { ...s, decidedByUserId: orgCtx.userId, decidedAt: Date.now(), note }
      : s,
  );
  const nextIdx = idx + 1;
  const emp = await ctx.db.get(claim.employeeId);
  const empName = emp ? `${emp.firstName} ${emp.lastName}` : "An employee";

  if (nextIdx < updatedChain.length) {
    await ctx.db.patch(claimId, {
      approvalChain: updatedChain,
      currentStepIndex: nextIdx,
      decisionNote: note,
    });
    await notifyStep(
      ctx,
      orgCtx.orgId,
      updatedChain[nextIdx],
      "claim.submitted",
      "Claim to approve",
      `${empName}'s claim needs your approval`,
      claimId,
    );
  } else if (claim.requiresFinance) {
    // Chain complete, finance stage configured → hand off to finance.
    await ctx.db.patch(claimId, {
      status: "pending_finance",
      approvalChain: updatedChain,
      currentStepIndex: nextIdx,
      managerApproverUserId: orgCtx.userId,
      decisionNote: note,
    });
    await notify(
      ctx,
      orgCtx.orgId,
      emp?.userId,
      "claim.manager_approved",
      "Claim progressed",
      "Your claim cleared approvals and was sent to finance.",
      claimId,
    );
    await notifyFinance(ctx, orgCtx.orgId, claim, empName);
  } else {
    // Chain complete, no finance stage → the approval is final.
    const settings = await resolveClaimSettings(ctx, orgCtx.orgId);
    await ctx.db.patch(claimId, {
      status: "approved",
      approvalChain: updatedChain,
      currentStepIndex: nextIdx,
      managerApproverUserId: orgCtx.userId,
      decidedAt: Date.now(),
      decisionNote: note,
      sentToPayroll: settings.payrollMode === "automatic" ? true : undefined,
    });
    await notify(
      ctx,
      orgCtx.orgId,
      emp?.userId,
      "claim.approved",
      "Claim approved",
      "Your claim was approved. You can mark it reimbursed once paid.",
      claimId,
    );
  }

  await writeAuditLog(ctx, {
    orgId: orgCtx.orgId,
    actorUserId: orgCtx.userId,
    action: "claim.approve_step",
    entity: "claims",
    entityId: claimId,
    after: { step: idx },
  });
}

// Core of a finance-stage approval: finalises a `pending_finance` claim and
// auto-queues payroll when the org is on "automatic". Assumes the caller holds
// `claims:approve:finance`. Shared by `financeApprove` and `approveAllForEmployee`.
async function doFinanceApprove(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  userId: Id<"users">,
  claim: Doc<"claims">,
  note?: string,
) {
  const settings = await resolveClaimSettings(ctx, orgId);
  await ctx.db.patch(claim._id, {
    status: "approved",
    financeApproverUserId: userId,
    decidedAt: Date.now(),
    decisionNote: note,
    sentToPayroll: settings.payrollMode === "automatic" ? true : undefined,
  });
  const emp = await ctx.db.get(claim.employeeId);
  await notify(
    ctx,
    orgId,
    emp?.userId,
    "claim.approved",
    "Claim approved",
    "Your claim was approved by finance.",
    claim._id,
  );
  await writeAuditLog(ctx, {
    orgId,
    actorUserId: userId,
    action: "claim.finance_approve",
    entity: "claims",
    entityId: claim._id,
  });
}

// Approve the current step of a claim's approval chain. Advances to the next
// approver, or hands off to finance once the chain is complete. (Named
// `managerApprove` for backward compatibility with the approval queue UI.)
export const managerApprove = mutation({
  args: { claimId: v.id("claims"), note: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { claimId, note }) => {
    const orgCtx = await requireOrg(ctx);
    const claim = await ctx.db.get(claimId);
    if (!claim || claim.orgId !== orgCtx.orgId) throw new ConvexError("Claim not found.");
    if (claim.status !== "pending_manager") {
      throw new ConvexError("Claim is not awaiting approval.");
    }
    await advanceManagerStep(ctx, orgCtx, claim, note);
    return null;
  },
});

export const financeApprove = mutation({
  args: { claimId: v.id("claims"), note: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { claimId, note }) => {
    const { orgId, userId } = await requirePermission(
      ctx,
      "claims:approve:finance",
    );
    const claim = await ctx.db.get(claimId);
    if (!claim || claim.orgId !== orgId) throw new ConvexError("Claim not found.");
    if (claim.status !== "pending_finance") {
      throw new ConvexError("Claim is not awaiting finance approval.");
    }
    await doFinanceApprove(ctx, orgId, userId, claim, note);
    return null;
  },
});

// Bulk-approve every claim of one employee that awaits the caller — the
// "approve all at once" action in the per-employee approval view. Each claim is
// advanced through the stage the caller is entitled to act on (chain step or
// finance); claims the caller can't act on are skipped. When the caller holds
// finance rights and a manager-stage claim lands straight in `pending_finance`,
// it is finance-approved in the same pass so it fully clears.
export const approveAllForEmployee = mutation({
  args: {
    employeeId: v.id("employees"),
    month: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  returns: v.object({ approved: v.number() }),
  handler: async (ctx, { employeeId, month, note }) => {
    const orgCtx = await requireOrg(ctx);
    const employee = await ctx.db.get(employeeId);
    if (!employee || employee.orgId !== orgCtx.orgId) {
      throw new ConvexError("Employee not found.");
    }
    const isFinance = hasPermission(orgCtx.role, "claims:approve:finance");
    const claims = await ctx.db
      .query("claims")
      .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
      .collect();

    let approved = 0;
    for (const claim of claims) {
      if (claim.orgId !== orgCtx.orgId) continue;
      if (month && !claim.incurredDate.startsWith(month)) continue;
      if (claim.status === "pending_manager") {
        if (!(await callerCanActOnManagerStep(ctx, orgCtx, claim, isFinance)))
          continue;
        await advanceManagerStep(ctx, orgCtx, claim, note);
        approved++;
        // If it dropped into the finance stage and the caller is finance, clear
        // it in the same pass so "approve all" fully approves.
        if (isFinance) {
          const updated = await ctx.db.get(claim._id);
          if (updated && updated.status === "pending_finance") {
            await doFinanceApprove(ctx, orgCtx.orgId, orgCtx.userId, updated, note);
          }
        }
      } else if (claim.status === "pending_finance" && isFinance) {
        await doFinanceApprove(ctx, orgCtx.orgId, orgCtx.userId, claim, note);
        approved++;
      }
    }
    if (approved === 0) {
      throw new ConvexError("No claims awaiting your approval for this employee.");
    }
    return { approved };
  },
});

// Approvers can correct a pending claim (amount, currency/exchange, tax,
// description, receipt no, incurred date, attachments). Every edit is logged
// with who made it and a summary of what changed, appended to the claim's
// audit trail and visible on the claim. Editing is locked once the claim is
// no longer pending.
export const editClaim = mutation({
  args: {
    claimId: v.id("claims"),
    amountCents: v.number(),
    description: v.string(),
    incurredDate: v.string(),
    taxAmountCents: v.optional(v.number()),
    localAmountCents: v.optional(v.number()),
    localCurrency: v.optional(v.string()),
    exchangeRate: v.optional(v.number()),
    exchangeMode: v.optional(claimExchangeMode),
    exchangeRateDate: v.optional(v.string()),
    exchangeProvider: v.optional(v.string()),
    receiptNo: v.optional(v.string()),
    remarks: v.optional(v.string()),
    receiptStorageIds: v.array(v.id("_storage")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const orgCtx = await requireOrg(ctx);
    const claim = await ctx.db.get(args.claimId);
    if (!claim || claim.orgId !== orgCtx.orgId) {
      throw new ConvexError("Claim not found.");
    }
    // Editable while a draft (by the owner) or while pending (by an approver).
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    const isOwner = !!own && claim.employeeId === own._id;
    const isFinance = hasPermission(orgCtx.role, "claims:approve:finance");
    if (claim.status === "draft") {
      if (!isOwner) throw new ConvexError("Only the owner can edit a draft.");
    } else if (
      claim.status === "pending_manager" ||
      claim.status === "pending_finance"
    ) {
      const canAct =
        claim.status === "pending_finance"
          ? isFinance
          : await callerCanActOnManagerStep(ctx, orgCtx, claim, isFinance);
      if (!canAct) throw new ConvexError("Not authorized to edit this claim.");
    } else {
      throw new ConvexError("This claim can no longer be edited.");
    }

    if (args.amountCents <= 0) throw new ConvexError("Amount must be positive.");
    if (args.receiptStorageIds.length > MAX_RECEIPTS) {
      throw new ConvexError(`A claim can have at most ${MAX_RECEIPTS} attachments.`);
    }
    const claimType = await ctx.db.get(claim.claimTypeId);
    if (
      claimType?.maxAmountCents &&
      args.amountCents > claimType.maxAmountCents
    ) {
      throw new ConvexError(
        "Amount exceeds the per-transaction limit for this claim type.",
      );
    }
    if (claimType?.requiresReceipt && args.receiptStorageIds.length === 0) {
      throw new ConvexError("This claim type requires a receipt.");
    }

    // Build a human-readable diff for the audit trail.
    const cur = claim.currency;
    const money = (c?: number | null) =>
      c == null ? "—" : formatMoneyCents(c, cur);
    const changes: string[] = [];
    if (args.amountCents !== claim.amountCents) {
      changes.push(
        `Amount ${money(claim.amountCents)} → ${money(args.amountCents)}`,
      );
    }
    if (args.description !== claim.description) changes.push("Description");
    if (args.incurredDate !== claim.incurredDate) {
      changes.push(`Date ${claim.incurredDate} → ${args.incurredDate}`);
    }
    if ((args.taxAmountCents ?? null) !== (claim.taxAmountCents ?? null)) {
      changes.push("Tax amount");
    }
    if (
      (args.localAmountCents ?? null) !== (claim.localAmountCents ?? null) ||
      (args.localCurrency ?? null) !== (claim.localCurrency ?? null) ||
      (args.exchangeRate ?? null) !== (claim.exchangeRate ?? null)
    ) {
      changes.push("Foreign currency / exchange");
    }
    if ((args.receiptNo ?? null) !== (claim.receiptNo ?? null)) {
      changes.push("Receipt no");
    }
    if ((args.remarks ?? null) !== (claim.remarks ?? null)) {
      changes.push("Remarks");
    }
    if (args.receiptStorageIds.length !== claim.receiptStorageIds.length) {
      changes.push("Attachments");
    }
    const summary = changes.length ? changes.join("; ") : "No field changes";

    // Approver corrections are recorded in the visible edit trail; a draft owner
    // tidying their own claim before submitting is not.
    const edits =
      claim.status === "draft"
        ? claim.edits
        : [
            ...(claim.edits ?? []),
            { editedByUserId: orgCtx.userId, editedAt: Date.now(), summary },
          ];

    await ctx.db.patch(args.claimId, {
      amountCents: args.amountCents,
      description: args.description,
      incurredDate: args.incurredDate,
      taxAmountCents: args.taxAmountCents,
      localAmountCents: args.localAmountCents,
      localCurrency: args.localCurrency,
      exchangeRate: args.exchangeRate,
      exchangeMode: args.exchangeMode,
      exchangeRateDate: args.exchangeRateDate,
      exchangeProvider: args.exchangeProvider,
      receiptNo: args.receiptNo,
      remarks: args.remarks,
      receiptStorageIds: args.receiptStorageIds,
      edits,
    });
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "claim.edit",
      entity: "claims",
      entityId: args.claimId,
      after: { summary },
    });
    return null;
  },
});

export const reject = mutation({
  args: { claimId: v.id("claims"), note: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { claimId, note }) => {
    const orgCtx = await requireOrg(ctx);
    const claim = await ctx.db.get(claimId);
    if (!claim || claim.orgId !== orgCtx.orgId) throw new ConvexError("Claim not found.");
    // Record the chain step the rejection happened at, so the rejected claim
    // stays visible only to the claimant + approvers up to and including this
    // step (top-down), never to later approvers who never saw it.
    let rejectedStepIndex: number;
    if (claim.status === "pending_manager") {
      await assertManagerStage(ctx, orgCtx, claim);
      rejectedStepIndex = claim.currentStepIndex ?? 0;
    } else if (claim.status === "pending_finance") {
      if (!hasPermission(orgCtx.role, "claims:approve:finance")) {
        throw new ConvexError("Not authorized to reject this claim.");
      }
      rejectedStepIndex = claim.approvalChain?.length ?? 0;
    } else {
      throw new ConvexError("Claim is not pending.");
    }
    await ctx.db.patch(claimId, {
      status: "rejected",
      decidedAt: Date.now(),
      decisionNote: note,
      rejectedStepIndex,
    });
    const emp = await ctx.db.get(claim.employeeId);
    await notify(
      ctx,
      orgCtx.orgId,
      emp?.userId,
      "claim.rejected",
      "Claim rejected",
      "Your claim was rejected.",
      claimId,
    );
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "claim.reject",
      entity: "claims",
      entityId: claimId,
    });
    return null;
  },
});

// Mark an approved claim as reimbursed. Available to whoever owns the claim
// (confirming they received the money) as well as finance.
export const markReimbursed = mutation({
  args: { claimId: v.id("claims") },
  returns: v.null(),
  handler: async (ctx, { claimId }) => {
    const orgCtx = await requireOrg(ctx);
    const { orgId, userId } = orgCtx;
    const claim = await ctx.db.get(claimId);
    if (!claim || claim.orgId !== orgId) throw new ConvexError("Claim not found.");
    if (claim.status !== "approved") {
      throw new ConvexError("Only approved claims can be marked reimbursed.");
    }
    const own = await employeeByUserId(ctx, orgId, userId);
    const isOwner = own && claim.employeeId === own._id;
    const isFinance = hasPermission(orgCtx.role, "claims:approve:finance");
    if (!isOwner && !isFinance) {
      throw new ConvexError("Not authorized to update this claim.");
    }
    // A claim queued for payroll is reimbursed through the payroll run; only
    // finance can close it out manually.
    if (isOwner && !isFinance && claim.sentToPayroll) {
      throw new ConvexError(
        "This claim is queued for payroll and will be reimbursed in your payslip.",
      );
    }
    await ctx.db.patch(claimId, { status: "reimbursed", reimbursedAt: Date.now() });
    const emp = await ctx.db.get(claim.employeeId);
    await notify(
      ctx,
      orgId,
      emp?.userId,
      "claim.reimbursed",
      "Claim reimbursed",
      "Your claim has been marked reimbursed.",
      claimId,
    );
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "claim.reimburse",
      entity: "claims",
      entityId: claimId,
    });
    return null;
  },
});

// Permanently delete a claim (and its receipt files + comments). Replaces the
// old "cancel". Allowed while draft/rejected (by the owner) or while pending (by
// an approver who can act on it, or finance). Approved/reimbursed claims — the
// financial records — can't be deleted.
export const deleteClaim = mutation({
  args: { claimId: v.id("claims") },
  returns: v.null(),
  handler: async (ctx, { claimId }) => {
    const orgCtx = await requireOrg(ctx);
    const claim = await ctx.db.get(claimId);
    if (!claim || claim.orgId !== orgCtx.orgId) throw new ConvexError("Claim not found.");
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    const isOwner = !!own && claim.employeeId === own._id;
    const isFinance = hasPermission(orgCtx.role, "claims:approve:finance");

    let allowed = false;
    if (claim.status === "draft" || claim.status === "rejected") {
      allowed = isOwner || isFinance;
    } else if (
      claim.status === "pending_manager" ||
      claim.status === "pending_finance"
    ) {
      allowed =
        isFinance ||
        (claim.status === "pending_manager" &&
          (await callerCanActOnManagerStep(ctx, orgCtx, claim, isFinance)));
    }
    if (!allowed) throw new ConvexError("This claim can't be deleted.");

    for (const sid of claim.receiptStorageIds) {
      try {
        await ctx.storage.delete(sid);
      } catch {
        // best-effort; ignore already-removed files
      }
    }
    const comments = await ctx.db
      .query("claimComments")
      .withIndex("by_claim", (q) => q.eq("claimId", claimId))
      .collect();
    for (const c of comments) await ctx.db.delete(c._id);
    await ctx.db.delete(claimId);
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "claim.delete",
      entity: "claims",
      entityId: claimId,
    });
    return null;
  },
});

// Set/replace the free-text remarks on a claim. The owner may annotate their
// own draft; an approver may annotate a claim pending their decision.
export const setRemarks = mutation({
  args: { claimId: v.id("claims"), remarks: v.string() },
  returns: v.null(),
  handler: async (ctx, { claimId, remarks }) => {
    const orgCtx = await requireOrg(ctx);
    const claim = await ctx.db.get(claimId);
    if (!claim || claim.orgId !== orgCtx.orgId) throw new ConvexError("Claim not found.");
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    const isOwner = !!own && claim.employeeId === own._id;
    const isFinance = hasPermission(orgCtx.role, "claims:approve:finance");
    let allowed = false;
    if (claim.status === "draft") {
      allowed = isOwner;
    } else if (
      claim.status === "pending_manager" ||
      claim.status === "pending_finance"
    ) {
      allowed =
        claim.status === "pending_finance"
          ? isFinance
          : await callerCanActOnManagerStep(ctx, orgCtx, claim, isFinance);
    }
    if (!allowed) throw new ConvexError("Not authorized to add remarks.");
    await ctx.db.patch(claimId, { remarks: remarks.trim() || undefined });
    return null;
  },
});

// Manually queue/unqueue an approved claim for payroll reimbursement (used when
// the org's payroll connection is "manual").
export const setSentToPayroll = mutation({
  args: { claimId: v.id("claims"), value: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { claimId, value }) => {
    const { orgId } = await requirePermission(ctx, "claims:approve:finance");
    const claim = await ctx.db.get(claimId);
    if (!claim || claim.orgId !== orgId) throw new ConvexError("Claim not found.");
    if (claim.status !== "approved") {
      throw new ConvexError("Only approved claims can be sent to payroll.");
    }
    await ctx.db.patch(claimId, { sentToPayroll: value || undefined });
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

export const addComment = mutation({
  args: { claimId: v.id("claims"), body: v.string() },
  returns: v.null(),
  handler: async (ctx, { claimId, body }) => {
    const { orgCtx } = await requireClaimAccess(ctx, claimId);
    if (!body.trim()) throw new ConvexError("Comment is empty.");
    await ctx.db.insert("claimComments", {
      orgId: orgCtx.orgId,
      claimId,
      authorUserId: orgCtx.userId,
      body: body.trim(),
    });
    return null;
  },
});

// ─── Queries ─────────────────────────────────────────────────────────────

export const mine = query({
  args: {},
  returns: v.array(claimRow),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    if (!own) return [];
    const claims = await ctx.db
      .query("claims")
      .withIndex("by_employee", (q) => q.eq("employeeId", own._id))
      .collect();
    claims.sort((a, b) => b._creationTime - a._creationTime);
    return await Promise.all(claims.map((c) => hydrateClaim(ctx, c)));
  },
});

export const get = query({
  args: { claimId: v.id("claims") },
  returns: claimDetail,
  handler: async (ctx, { claimId }) => {
    const { orgCtx, claim } = await requireClaimAccess(ctx, claimId);
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    const isMine = !!own && claim.employeeId === own._id;
    const isFinance = hasPermission(orgCtx.role, "claims:approve:finance");

    // Can the viewer act on the current pending stage?
    let canApprove = false;
    if (claim.status === "pending_finance") {
      canApprove = isFinance;
    } else if (claim.status === "pending_manager") {
      if (isFinance) {
        canApprove = true;
      } else if (claim.approvalChain && claim.approvalChain.length > 0) {
        const step = claim.approvalChain[claim.currentStepIndex ?? 0];
        canApprove = !!step && stepEligible(step, orgCtx.userId);
      } else {
        // Legacy chain-less claim → the claimant's manager decides.
        const employee = await ctx.db.get(claim.employeeId);
        canApprove = !!own && employee?.managerId === own._id;
      }
    }

    const base = await hydrateClaim(ctx, claim);
    const receipts = await resolveReceipts(ctx, claim.receiptStorageIds);
    const isPending =
      claim.status === "pending_manager" ||
      claim.status === "pending_finance";
    // The owner edits their own draft; an approver edits a pending claim.
    const canEdit =
      (claim.status === "draft" && isMine) || (isPending && canApprove);
    const edits = await Promise.all(
      (claim.edits ?? []).map(async (e) => {
        const u = await ctx.db.get(e.editedByUserId);
        return {
          editedByName: u?.name ?? "Unknown",
          editedAt: e.editedAt,
          summary: e.summary,
        };
      }),
    );
    const stepIdx = claim.currentStepIndex ?? 0;
    const approvalChain = (claim.approvalChain ?? []).map((s, i) => ({
      label: s.label,
      done: s.decidedByUserId != null,
      current: claim.status === "pending_manager" && i === stepIdx,
    }));

    // Build the status timeline from the claim's actual configured process.
    // Legacy claims (submitted before `requiresFinance` was snapshotted) always
    // routed manager → finance, so keep both stages for them.
    const legacy = claim.requiresFinance === undefined;
    const hasManager = legacy
      ? true
      : (claim.approvalChain?.length ?? 0) > 0;
    const hasFinance = legacy ? true : claim.requiresFinance === true;
    const flow: ClaimStatus[] = [
      ...(claim.status === "draft" ? (["draft"] as const) : []),
      ...(hasManager ? (["pending_manager"] as const) : []),
      ...(hasFinance ? (["pending_finance"] as const) : []),
      "approved",
      "reimbursed",
    ];

    return {
      ...base,
      taxAmountCents: claim.taxAmountCents ?? null,
      localAmountCents: claim.localAmountCents ?? null,
      localCurrency: claim.localCurrency ?? null,
      exchangeRate: claim.exchangeRate ?? null,
      exchangeMode: claim.exchangeMode ?? null,
      exchangeRateDate: claim.exchangeRateDate ?? null,
      exchangeProvider: claim.exchangeProvider ?? null,
      receiptNo: claim.receiptNo ?? null,
      receipts,
      managerApproverUserId: claim.managerApproverUserId ?? null,
      financeApproverUserId: claim.financeApproverUserId ?? null,
      isMine,
      canApprove,
      canEdit,
      edits,
      flow,
      approvalChain,
      sentToPayroll: claim.sentToPayroll ?? false,
    };
  },
});

// Live spend-vs-limit for a claim type, for the current employee, used by the
// "Balance available to claim" card in the submit form. Periods are the current
// calendar year / month.
export const typeBalance = query({
  args: { claimTypeId: v.id("claimTypes") },
  returns: claimTypeBalance,
  handler: async (ctx, { claimTypeId }) => {
    const { orgId, userId, org } = await requireOrg(ctx);
    const claimType = await ctx.db.get(claimTypeId);
    if (!claimType || claimType.orgId !== orgId) {
      throw new ConvexError("Claim type not found.");
    }
    const own = await employeeByUserId(ctx, orgId, userId);

    const now = new Date();
    const yearPrefix = String(now.getUTCFullYear());
    const monthPrefix = `${yearPrefix}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    const { yearlyUsedCents, monthlyUsedCents } = own
      ? await spendForType(ctx, own._id, claimTypeId, yearPrefix, monthPrefix)
      : { yearlyUsedCents: 0, monthlyUsedCents: 0 };

    const yearly = claimType.yearlyLimitCents ?? null;
    const monthly = claimType.monthlyLimitCents ?? null;
    const remainders: number[] = [];
    if (yearly !== null) remainders.push(Math.max(0, yearly - yearlyUsedCents));
    if (monthly !== null) remainders.push(Math.max(0, monthly - monthlyUsedCents));

    return {
      claimTypeId,
      currency: org.settings.currency,
      guidelines: claimType.guidelines ?? null,
      yearlyLimitCents: yearly,
      monthlyLimitCents: monthly,
      perTransactionLimitCents: claimType.maxAmountCents ?? null,
      yearlyUsedCents,
      monthlyUsedCents,
      availableCents: remainders.length ? Math.min(...remainders) : null,
    };
  },
});

export const listComments = query({
  args: { claimId: v.id("claims") },
  returns: v.array(claimCommentRow),
  handler: async (ctx, { claimId }) => {
    await requireClaimAccess(ctx, claimId);
    const comments = await ctx.db
      .query("claimComments")
      .withIndex("by_claim", (q) => q.eq("claimId", claimId))
      .collect();
    return await Promise.all(
      comments.map(async (c) => {
        const author = await ctx.db.get(c.authorUserId);
        return {
          _id: c._id,
          _creationTime: c._creationTime,
          authorName: author?.name ?? "Unknown",
          body: c.body,
        };
      }),
    );
  },
});

// Every claim awaiting the caller's action across both stages: pending_finance
// (when they hold finance rights) plus pending_manager claims whose current
// chain step is theirs (legacy chain-less claims fall back to the manager
// relationship). Shared by the flat queue and the per-employee views.
async function claimsAwaitingCaller(
  ctx: QueryCtx,
  orgCtx: OrgContext,
): Promise<Doc<"claims">[]> {
  const out: Doc<"claims">[] = [];
  if (hasPermission(orgCtx.role, "claims:approve:finance")) {
    const finance = await ctx.db
      .query("claims")
      .withIndex("by_org_status", (q) =>
        q.eq("orgId", orgCtx.orgId).eq("status", "pending_finance"),
      )
      .collect();
    out.push(...finance);
  }
  const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
  const pendingManager = await ctx.db
    .query("claims")
    .withIndex("by_org_status", (q) =>
      q.eq("orgId", orgCtx.orgId).eq("status", "pending_manager"),
    )
    .collect();
  for (const c of pendingManager) {
    if (c.approvalChain && c.approvalChain.length > 0) {
      const step = c.approvalChain[c.currentStepIndex ?? 0];
      if (step && stepEligible(step, orgCtx.userId)) out.push(c);
    } else if (own) {
      const emp = await ctx.db.get(c.employeeId);
      if (emp?.managerId === own._id) out.push(c);
    }
  }
  return out;
}

// Filter awaiting claims by incurred month and/or the claimant's department /
// team (HR uses the org-wide filters; managers typically just the month).
async function applyApprovalFilters(
  ctx: QueryCtx,
  claims: Doc<"claims">[],
  filters: {
    month?: string;
    departmentId?: Id<"departments">;
    teamId?: Id<"teams">;
  },
): Promise<Doc<"claims">[]> {
  let out = claims;
  if (filters.month) {
    out = out.filter((c) => c.incurredDate.startsWith(filters.month!));
  }
  if (filters.departmentId || filters.teamId) {
    const cache = new Map<Id<"employees">, Doc<"employees"> | null>();
    const next: Doc<"claims">[] = [];
    for (const c of out) {
      let emp = cache.get(c.employeeId);
      if (emp === undefined) {
        emp = await ctx.db.get(c.employeeId);
        cache.set(c.employeeId, emp);
      }
      if (filters.departmentId && emp?.departmentId !== filters.departmentId)
        continue;
      if (filters.teamId && emp?.teamId !== filters.teamId) continue;
      next.push(c);
    }
    out = next;
  }
  return out;
}

// Claims awaiting the caller's action across both approval stages (flat list).
export const approvalQueue = query({
  args: {},
  returns: v.array(claimRow),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    const out = await claimsAwaitingCaller(ctx, orgCtx);
    return await Promise.all(out.map((c) => hydrateClaim(ctx, c)));
  },
});

// The approver's queue grouped by employee: one row per employee with claims
// awaiting the caller, carrying the pending count and base-currency total.
export const approvalGroups = query({
  args: {
    month: v.optional(v.string()),
    departmentId: v.optional(v.id("departments")),
    teamId: v.optional(v.id("teams")),
  },
  returns: v.array(claimApprovalGroup),
  handler: async (ctx, filters) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    const awaiting = await applyApprovalFilters(
      ctx,
      await claimsAwaitingCaller(ctx, orgCtx),
      filters,
    );
    const byEmployee = new Map<
      Id<"employees">,
      { total: number; count: number; currency: string }
    >();
    for (const c of awaiting) {
      const g = byEmployee.get(c.employeeId) ?? {
        total: 0,
        count: 0,
        currency: c.currency,
      };
      g.total += c.amountCents;
      g.count += 1;
      byEmployee.set(c.employeeId, g);
    }
    const groups = await Promise.all(
      [...byEmployee.entries()].map(async ([employeeId, g]) => {
        const emp = await ctx.db.get(employeeId);
        return {
          employeeId,
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
          pendingCount: g.count,
          totalAmountCents: g.total,
          currency: g.currency,
        };
      }),
    );
    groups.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
    return groups;
  },
});

// One employee's claims awaiting the caller, with receipts resolved. Drives the
// per-employee drill-down (grouped by month client-side, with "approve all").
export const approvalClaimsForEmployee = query({
  args: { employeeId: v.id("employees"), month: v.optional(v.string()) },
  returns: v.array(claimApprovalItem),
  handler: async (ctx, { employeeId, month }) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    const awaiting = await claimsAwaitingCaller(ctx, orgCtx);
    const mine = awaiting.filter(
      (c) =>
        c.employeeId === employeeId &&
        (!month || c.incurredDate.startsWith(month)),
    );
    mine.sort((a, b) => (a.incurredDate < b.incurredDate ? 1 : -1));
    return await Promise.all(
      mine.map(async (c) => ({
        ...(await hydrateClaim(ctx, c)),
        receipts: await resolveReceipts(ctx, c.receiptStorageIds),
      })),
    );
  },
});

// ─── Claim groups (approver views) ─────────────────────────────────────────

type ApproverView = "awaiting" | "visible" | "hidden";

// How the caller relates to a claim as an approver, for the group queue:
//   "awaiting" – pending the caller's decision right now
//   "visible"  – the caller may see it but can't act (already approved by them /
//                the chain; or rejected within the top-down cutoff)
//   "hidden"   – not the caller's concern
// The rejected-claim rule is top-down: a rejection at step N is visible to
// approvers eligible for steps 0..N (and the claimant + finance), never later
// approvers who never routed it.
async function approverClaimView(
  ctx: QueryCtx,
  orgCtx: OrgContext,
  claim: Doc<"claims">,
  isFinance: boolean,
  own: Doc<"employees"> | null,
): Promise<ApproverView> {
  const chain = claim.approvalChain ?? [];
  const stepIdx = claim.currentStepIndex ?? 0;
  const myStep = chain.findIndex((s) => stepEligible(s, orgCtx.userId));

  switch (claim.status) {
    case "pending_manager": {
      if (chain.length > 0) {
        const now = chain[stepIdx];
        if (now && stepEligible(now, orgCtx.userId)) return "awaiting";
        if (isFinance) return "visible";
        // An earlier approver who already cleared their step can watch progress.
        if (myStep !== -1 && myStep < stepIdx) return "visible";
        return "hidden";
      }
      // Legacy chain-less claim → the claimant's manager decides.
      if (own) {
        const emp = await ctx.db.get(claim.employeeId);
        if (emp?.managerId === own._id) return "awaiting";
      }
      return isFinance ? "visible" : "hidden";
    }
    case "pending_finance": {
      if (isFinance) return "awaiting";
      return myStep !== -1 ? "visible" : "hidden";
    }
    case "approved":
    case "reimbursed": {
      if (isFinance) return "visible";
      return myStep !== -1 ? "visible" : "hidden";
    }
    case "rejected": {
      if (isFinance) return "visible";
      const cutoff = claim.rejectedStepIndex ?? chain.length;
      for (let i = 0; i < chain.length && i <= cutoff; i++) {
        if (stepEligible(chain[i], orgCtx.userId)) return "visible";
      }
      return "hidden";
    }
    default:
      return "hidden"; // draft / cancelled never surface to approvers
  }
}

// The approver's queue grouped by claim group (monthly batch). Returns every
// group the caller is involved in (active = something awaits them; completed =
// they've cleared everything but can still see the outcome). The UI splits them
// into the live list and a "completed" section.
export const approvalClaimGroups = query({
  args: {
    month: v.optional(v.string()),
    departmentId: v.optional(v.id("departments")),
    teamId: v.optional(v.id("teams")),
  },
  returns: v.array(claimApprovalGroupRow),
  handler: async (ctx, filters) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    const isFinance = hasPermission(orgCtx.role, "claims:approve:finance");
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);

    let claims = (
      await ctx.db
        .query("claims")
        .withIndex("by_org", (q) => q.eq("orgId", orgCtx.orgId))
        .collect()
    ).filter((c) => c.groupId != null);
    claims = await applyApprovalFilters(ctx, claims, filters);

    type Acc = {
      pending: number;
      visible: number;
      approved: number;
      rejected: number;
      total: number;
      currency: string;
    };
    const byGroup = new Map<Id<"claimGroups">, Acc>();
    for (const c of claims) {
      const view = await approverClaimView(ctx, orgCtx, c, isFinance, own);
      if (view === "hidden") continue;
      const acc = byGroup.get(c.groupId!) ?? {
        pending: 0,
        visible: 0,
        approved: 0,
        rejected: 0,
        total: 0,
        currency: c.currency,
      };
      acc.visible += 1;
      acc.total += c.amountCents;
      if (view === "awaiting") acc.pending += 1;
      if (c.status === "approved" || c.status === "reimbursed") acc.approved += 1;
      if (c.status === "rejected") acc.rejected += 1;
      byGroup.set(c.groupId!, acc);
    }

    const rows = await Promise.all(
      [...byGroup.entries()].map(async ([groupId, acc]) => {
        const group = await ctx.db.get(groupId);
        if (!group) return null;
        const emp = await ctx.db.get(group.employeeId);
        return {
          groupId,
          employeeId: group.employeeId,
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
          periodMonth: group.periodMonth,
          sequence: group.sequence,
          title: group.title ?? null,
          submittedAt: group.submittedAt,
          pendingCount: acc.pending,
          visibleCount: acc.visible,
          approvedCount: acc.approved,
          rejectedCount: acc.rejected,
          totalAmountCents: acc.total,
          currency: acc.currency,
          complete: acc.pending === 0,
        };
      }),
    );
    return rows
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0));
  },
});

// One claim group's claims that the caller may see, with receipts resolved and a
// `canAct` flag (true = awaiting the caller now). Includes approved/rejected
// claims so the group shows the full outcome (rejected ones per the top-down
// visibility rule).
export const approvalClaimsForGroup = query({
  args: { groupId: v.id("claimGroups") },
  returns: v.array(claimGroupApprovalItem),
  handler: async (ctx, { groupId }) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    const group = await ctx.db.get(groupId);
    if (!group || group.orgId !== orgCtx.orgId) return [];
    const isFinance = hasPermission(orgCtx.role, "claims:approve:finance");
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    const claims = await ctx.db
      .query("claims")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .collect();
    const out: Array<
      Awaited<ReturnType<typeof hydrateClaim>> & {
        receipts: Awaited<ReturnType<typeof resolveReceipts>>;
        canAct: boolean;
      }
    > = [];
    for (const c of claims) {
      const view = await approverClaimView(ctx, orgCtx, c, isFinance, own);
      if (view === "hidden") continue;
      out.push({
        ...(await hydrateClaim(ctx, c)),
        receipts: await resolveReceipts(ctx, c.receiptStorageIds),
        canAct: view === "awaiting",
      });
    }
    out.sort((a, b) => (a.incurredDate < b.incurredDate ? 1 : -1));
    return out;
  },
});

// Bulk-approve every claim in one group that awaits the caller (the group's
// "approve all" action). Mirrors approveAllForEmployee but scoped to a group.
export const approveAllForGroup = mutation({
  args: { groupId: v.id("claimGroups"), note: v.optional(v.string()) },
  returns: v.object({ approved: v.number() }),
  handler: async (ctx, { groupId, note }) => {
    const orgCtx = await requireOrg(ctx);
    const group = await ctx.db.get(groupId);
    if (!group || group.orgId !== orgCtx.orgId) {
      throw new ConvexError("Claim group not found.");
    }
    const isFinance = hasPermission(orgCtx.role, "claims:approve:finance");
    const claims = await ctx.db
      .query("claims")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .collect();
    let approved = 0;
    for (const claim of claims) {
      if (claim.status === "pending_manager") {
        if (!(await callerCanActOnManagerStep(ctx, orgCtx, claim, isFinance)))
          continue;
        await advanceManagerStep(ctx, orgCtx, claim, note);
        approved++;
        if (isFinance) {
          const updated = await ctx.db.get(claim._id);
          if (updated && updated.status === "pending_finance") {
            await doFinanceApprove(ctx, orgCtx.orgId, orgCtx.userId, updated, note);
          }
        }
      } else if (claim.status === "pending_finance" && isFinance) {
        await doFinanceApprove(ctx, orgCtx.orgId, orgCtx.userId, claim, note);
        approved++;
      }
    }
    if (approved === 0) {
      throw new ConvexError("No claims awaiting your approval in this group.");
    }
    return { approved };
  },
});

// Mark every approved claim in a group as reimbursed at once (finance only) —
// the group's "mark all reimbursed" action.
export const markGroupReimbursed = mutation({
  args: { groupId: v.id("claimGroups") },
  returns: v.object({ reimbursed: v.number() }),
  handler: async (ctx, { groupId }) => {
    const { orgId, userId } = await requirePermission(
      ctx,
      "claims:approve:finance",
    );
    const group = await ctx.db.get(groupId);
    if (!group || group.orgId !== orgId) {
      throw new ConvexError("Claim group not found.");
    }
    const claims = await ctx.db
      .query("claims")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .collect();
    let reimbursed = 0;
    for (const claim of claims) {
      if (claim.status !== "approved") continue;
      await ctx.db.patch(claim._id, {
        status: "reimbursed",
        reimbursedAt: Date.now(),
      });
      const emp = await ctx.db.get(claim.employeeId);
      await notify(
        ctx,
        orgId,
        emp?.userId,
        "claim.reimbursed",
        "Claim reimbursed",
        "Your claim has been marked reimbursed.",
        claim._id,
      );
      reimbursed++;
    }
    if (reimbursed === 0) {
      throw new ConvexError("No approved claims to reimburse in this group.");
    }
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "claim.group_reimburse",
      entity: "claimGroups",
      entityId: groupId,
    });
    return { reimbursed };
  },
});
