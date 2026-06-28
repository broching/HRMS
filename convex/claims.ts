import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requireOrg, getOrgContext, requirePermission, OrgContext } from "./auth";
import { hasPermission } from "./lib/permissions";
import { employeeByUserId } from "./employees";
import { claimRow, claimDetail, claimCommentRow } from "./lib/validators";
import { writeAuditLog } from "./lib/audit";

// ─── Helpers ─────────────────────────────────────────────────────────────

async function hydrateClaim(ctx: QueryCtx, claim: Doc<"claims">) {
  const [emp, ct] = await Promise.all([
    ctx.db.get(claim.employeeId),
    ctx.db.get(claim.claimTypeId),
  ]);
  return {
    _id: claim._id,
    _creationTime: claim._creationTime,
    employeeId: claim.employeeId,
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
    claimTypeName: ct?.name ?? "—",
    category: ct?.category ?? ("custom" as const),
    amountCents: claim.amountCents,
    currency: claim.currency,
    incurredDate: claim.incurredDate,
    description: claim.description,
    status: claim.status,
    receiptCount: claim.receiptStorageIds.length,
    decisionNote: claim.decisionNote,
  };
}

async function requireClaimAccess(ctx: QueryCtx, claimId: Id<"claims">) {
  const orgCtx = await requireOrg(ctx);
  const claim = await ctx.db.get(claimId);
  if (!claim || claim.orgId !== orgCtx.orgId) throw new Error("Claim not found.");
  if (hasPermission(orgCtx.role, "claims:approve:finance")) {
    return { orgCtx, claim };
  }
  const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
  if (own && claim.employeeId === own._id) return { orgCtx, claim };
  const employee = await ctx.db.get(claim.employeeId);
  if (own && employee && employee.managerId === own._id) {
    return { orgCtx, claim };
  }
  throw new Error("Not authorized to view this claim.");
}

// Manager step: the employee's manager, or anyone with finance approval rights.
async function assertManagerStage(
  ctx: QueryCtx,
  orgCtx: OrgContext,
  claim: Doc<"claims">,
) {
  if (hasPermission(orgCtx.role, "claims:approve:finance")) return;
  const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
  const employee = await ctx.db.get(claim.employeeId);
  if (own && employee && employee.managerId === own._id) return;
  throw new Error("Not authorized to act on this claim.");
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

// ─── Mutations ───────────────────────────────────────────────────────────

export const submit = mutation({
  args: {
    claimTypeId: v.id("claimTypes"),
    amountCents: v.number(),
    currency: v.optional(v.string()),
    incurredDate: v.string(),
    description: v.string(),
    receiptStorageIds: v.array(v.id("_storage")),
  },
  returns: v.id("claims"),
  handler: async (ctx, args) => {
    const { orgId, userId, org } = await requireOrg(ctx);
    const own = await employeeByUserId(ctx, orgId, userId);
    if (!own) throw new Error("You don't have an employee profile yet.");

    const claimType = await ctx.db.get(args.claimTypeId);
    if (!claimType || claimType.orgId !== orgId || !claimType.active) {
      throw new Error("Claim type not found.");
    }
    if (args.amountCents <= 0) throw new Error("Amount must be positive.");
    if (claimType.requiresReceipt && args.receiptStorageIds.length === 0) {
      throw new Error("This claim type requires a receipt.");
    }
    if (claimType.maxAmountCents && args.amountCents > claimType.maxAmountCents) {
      throw new Error("Amount exceeds the limit for this claim type.");
    }

    const status = own.managerId ? "pending_manager" : "pending_finance";
    const id = await ctx.db.insert("claims", {
      orgId,
      employeeId: own._id,
      claimTypeId: args.claimTypeId,
      amountCents: args.amountCents,
      currency: args.currency ?? org.settings.currency,
      incurredDate: args.incurredDate,
      description: args.description,
      receiptStorageIds: args.receiptStorageIds,
      status,
    });

    if (status === "pending_manager" && own.managerId) {
      const manager = await ctx.db.get(own.managerId);
      await notify(
        ctx,
        orgId,
        manager?.userId,
        "claim.submitted",
        "Claim to approve",
        `${own.firstName} ${own.lastName} submitted a claim`,
        id,
      );
    }
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "claim.submit",
      entity: "claims",
      entityId: id,
      after: { amountCents: args.amountCents, status },
    });
    return id;
  },
});

export const managerApprove = mutation({
  args: { claimId: v.id("claims"), note: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { claimId, note }) => {
    const orgCtx = await requireOrg(ctx);
    const claim = await ctx.db.get(claimId);
    if (!claim || claim.orgId !== orgCtx.orgId) throw new Error("Claim not found.");
    if (claim.status !== "pending_manager") {
      throw new Error("Claim is not awaiting manager approval.");
    }
    await assertManagerStage(ctx, orgCtx, claim);
    await ctx.db.patch(claimId, {
      status: "pending_finance",
      managerApproverUserId: orgCtx.userId,
      decisionNote: note,
    });
    const emp = await ctx.db.get(claim.employeeId);
    await notify(
      ctx,
      orgCtx.orgId,
      emp?.userId,
      "claim.manager_approved",
      "Claim progressed",
      "Your claim was approved by your manager and sent to finance.",
      claimId,
    );
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "claim.manager_approve",
      entity: "claims",
      entityId: claimId,
    });
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
    if (!claim || claim.orgId !== orgId) throw new Error("Claim not found.");
    if (claim.status !== "pending_finance") {
      throw new Error("Claim is not awaiting finance approval.");
    }
    await ctx.db.patch(claimId, {
      status: "approved",
      financeApproverUserId: userId,
      decidedAt: Date.now(),
      decisionNote: note,
    });
    const emp = await ctx.db.get(claim.employeeId);
    await notify(
      ctx,
      orgId,
      emp?.userId,
      "claim.approved",
      "Claim approved",
      "Your claim was approved by finance.",
      claimId,
    );
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "claim.finance_approve",
      entity: "claims",
      entityId: claimId,
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
    if (!claim || claim.orgId !== orgCtx.orgId) throw new Error("Claim not found.");
    if (claim.status === "pending_manager") {
      await assertManagerStage(ctx, orgCtx, claim);
    } else if (claim.status === "pending_finance") {
      if (!hasPermission(orgCtx.role, "claims:approve:finance")) {
        throw new Error("Not authorized to reject this claim.");
      }
    } else {
      throw new Error("Claim is not pending.");
    }
    await ctx.db.patch(claimId, {
      status: "rejected",
      decidedAt: Date.now(),
      decisionNote: note,
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

export const markReimbursed = mutation({
  args: { claimId: v.id("claims") },
  returns: v.null(),
  handler: async (ctx, { claimId }) => {
    const { orgId, userId } = await requirePermission(
      ctx,
      "claims:approve:finance",
    );
    const claim = await ctx.db.get(claimId);
    if (!claim || claim.orgId !== orgId) throw new Error("Claim not found.");
    if (claim.status !== "approved") {
      throw new Error("Only approved claims can be reimbursed.");
    }
    await ctx.db.patch(claimId, { status: "reimbursed", reimbursedAt: Date.now() });
    const emp = await ctx.db.get(claim.employeeId);
    await notify(
      ctx,
      orgId,
      emp?.userId,
      "claim.reimbursed",
      "Claim reimbursed",
      "Your claim has been reimbursed.",
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

export const cancel = mutation({
  args: { claimId: v.id("claims") },
  returns: v.null(),
  handler: async (ctx, { claimId }) => {
    const orgCtx = await requireOrg(ctx);
    const claim = await ctx.db.get(claimId);
    if (!claim || claim.orgId !== orgCtx.orgId) throw new Error("Claim not found.");
    if (claim.status !== "pending_manager" && claim.status !== "pending_finance") {
      throw new Error("Claim cannot be cancelled.");
    }
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    const isOwner = own && claim.employeeId === own._id;
    if (!isOwner && !hasPermission(orgCtx.role, "claims:approve:finance")) {
      throw new Error("Not authorized to cancel this claim.");
    }
    await ctx.db.patch(claimId, { status: "cancelled" });
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "claim.cancel",
      entity: "claims",
      entityId: claimId,
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

export const addComment = mutation({
  args: { claimId: v.id("claims"), body: v.string() },
  returns: v.null(),
  handler: async (ctx, { claimId, body }) => {
    const { orgCtx } = await requireClaimAccess(ctx, claimId);
    if (!body.trim()) throw new Error("Comment is empty.");
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
    const { claim } = await requireClaimAccess(ctx, claimId);
    const base = await hydrateClaim(ctx, claim);
    const receiptUrls = (
      await Promise.all(
        claim.receiptStorageIds.map((sid) => ctx.storage.getUrl(sid)),
      )
    ).filter((u): u is string => u !== null);
    return {
      ...base,
      receiptUrls,
      managerApproverUserId: claim.managerApproverUserId ?? null,
      financeApproverUserId: claim.financeApproverUserId ?? null,
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

// Claims awaiting the caller's action across both approval stages.
export const approvalQueue = query({
  args: {},
  returns: v.array(claimRow),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
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
    if (own) {
      const reports = await ctx.db
        .query("employees")
        .withIndex("by_org_manager", (q) =>
          q.eq("orgId", orgCtx.orgId).eq("managerId", own._id),
        )
        .collect();
      const reportIds = new Set(reports.map((e) => e._id));
      if (reportIds.size > 0) {
        const pendingManager = await ctx.db
          .query("claims")
          .withIndex("by_org_status", (q) =>
            q.eq("orgId", orgCtx.orgId).eq("status", "pending_manager"),
          )
          .collect();
        out.push(...pendingManager.filter((c) => reportIds.has(c.employeeId)));
      }
    }

    return await Promise.all(out.map((c) => hydrateClaim(ctx, c)));
  },
});
