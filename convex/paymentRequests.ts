import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import {
  requireOrg,
  getOrgContext,
  requirePermission,
  ctxHasPermission,
  OrgContext,
} from "./auth";
import { employeeByUserId } from "./employees";
import { managerUsers } from "./model/org";
import { writeAuditLog } from "./lib/audit";
import { pushNotification } from "./model/notify";
import {
  CLAIM_GROUP_HR,
  CLAIM_GROUP_FINANCE,
  paymentRequestStatus,
  paymentRequestItem,
  PaymentRequestItem,
} from "./lib/enums";
import {
  resolvePaymentRequestSettings,
  ResolvedPaymentRequestSettings,
} from "./paymentRequestSettings";

// Maximum supporting documents per payment request.
const MAX_ATTACHMENTS = 10;
// Maximum itemised line items per payment request.
const MAX_ITEMS = 50;

// Validate + normalise submitted line items and compute the request total. Each
// line's `amountCents` is re-derived server-side as round(quantity ×
// unitPriceCents) so the client can't misreport it. Rejects empty/negative/
// non-finite values. Returns null when there are no items (single-amount mode).
function sanitizeItems(
  items: PaymentRequestItem[] | undefined,
): { items: PaymentRequestItem[]; totalCents: number } | null {
  if (!items || items.length === 0) return null;
  if (items.length > MAX_ITEMS) {
    throw new ConvexError(
      `A payment request can have at most ${MAX_ITEMS} items.`,
    );
  }
  const clean: PaymentRequestItem[] = [];
  let totalCents = 0;
  for (const raw of items) {
    const description = raw.description.trim();
    if (!description) throw new ConvexError("Each item needs a description.");
    const quantity = raw.quantity;
    const unitPriceCents = Math.round(raw.unitPriceCents);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ConvexError(`"${description}" needs a quantity above zero.`);
    }
    if (!Number.isFinite(unitPriceCents) || unitPriceCents < 0) {
      throw new ConvexError(`"${description}" has an invalid unit price.`);
    }
    const amountCents = Math.round(quantity * unitPriceCents);
    clean.push({ description, quantity, unitPriceCents, amountCents });
    totalCents += amountCents;
  }
  if (totalCents <= 0) throw new ConvexError("Item total must be positive.");
  return { items: clean, totalCents };
}

function formatMoneyCents(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(
      cents / 100,
    );
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

// ─── Resolved-chain type + approver helpers (mirror claims, no group barrier) ──

type ChainStep = {
  approverType: "position" | "specific" | "group";
  value: string;
  approverUserId?: Id<"users">;
  approverUserIds?: Id<"users">[];
  label: string;
  requiresSignature?: boolean;
};

async function userDisplayName(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<string> {
  const u = await ctx.db.get(userId);
  if (!u) return "Unknown";
  return u.name?.trim() || u.username || u.email || "Unknown";
}

function eligibleApprovers(step: {
  approverUserId?: Id<"users">;
  approverUserIds?: Id<"users">[];
}): Id<"users">[] {
  if (step.approverUserIds && step.approverUserIds.length > 0) {
    return step.approverUserIds;
  }
  return step.approverUserId ? [step.approverUserId] : [];
}

function stepEligible(
  step: { approverUserId?: Id<"users">; approverUserIds?: Id<"users">[] },
  userId: Id<"users">,
): boolean {
  return eligibleApprovers(step).includes(userId);
}

function isFinanceApprover(
  settings: ResolvedPaymentRequestSettings,
  userId: Id<"users">,
): boolean {
  return settings.financeApproverUserIds.includes(userId);
}

function groupMembers(
  settings: ResolvedPaymentRequestSettings,
  groupId: string,
): Id<"users">[] {
  if (groupId === CLAIM_GROUP_HR) return settings.hrApproverUserIds;
  if (groupId === CLAIM_GROUP_FINANCE) return settings.financeApproverUserIds;
  return settings.assigneeGroups.find((g) => g.id === groupId)?.userIds ?? [];
}

function groupLabel(
  settings: ResolvedPaymentRequestSettings,
  groupId: string,
): string {
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

function selectFlowWorkflow(
  settings: ResolvedPaymentRequestSettings,
  member: Doc<"members"> | null,
  roleId: Id<"roles"> | null,
): ResolvedPaymentRequestSettings["approvalWorkflow"] {
  const flows = settings.approvalFlows;
  if (member) {
    const person = flows.find(
      (f) =>
        f.match.type === "person" &&
        (f.match.userIds
          ? f.match.userIds.includes(member.userId)
          : f.match.userId === member.userId),
    );
    if (person) return person.workflow;
    if (roleId) {
      const role = flows.find(
        (f) => f.match.type === "role" && f.match.roleId === roleId,
      );
      if (role) return role.workflow;
    }
  }
  const def = flows.find((f) => f.match.type === "default");
  return def?.workflow ?? [];
}

async function effectiveRoleId(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  member: Doc<"members"> | null,
): Promise<Id<"roles"> | null> {
  if (!member) return null;
  if (member.roleId) return member.roleId;
  const preset = await ctx.db
    .query("roles")
    .withIndex("by_org_key", (q) => q.eq("orgId", orgId).eq("key", member.role))
    .unique();
  return preset?._id ?? null;
}

// Resolve the approval chain for a request from the flow that matches the
// requestor, applying thresholds (amount + office scope) and resolving each step
// to a concrete approver. An implicit HR stage is appended (like claims). Steps
// that can't be routed are skipped. Individual approval — no group barrier, so
// no `workflowIndex` is set.
async function buildApprovalChain(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  employee: Doc<"employees">,
  amountCents: number,
): Promise<ChainStep[]> {
  const settings = await resolvePaymentRequestSettings(ctx, orgId);
  const member = employee.userId
    ? await ctx.db
        .query("members")
        .withIndex("by_org_and_user", (q) =>
          q.eq("orgId", orgId).eq("userId", employee.userId!),
        )
        .unique()
    : null;
  const roleId = await effectiveRoleId(ctx, orgId, member);
  const workflow = selectFlowWorkflow(settings, member, roleId);
  const chain: ChainStep[] = [];
  for (const step of workflow) {
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

    if (step.approverType === "group") {
      const members = groupMembers(settings, step.value).filter(
        (uid) => uid !== employee.userId,
      );
      if (members.length === 0) continue;
      chain.push({
        approverType: "group",
        value: step.value,
        approverUserId: members[0],
        approverUserIds: members,
        label: groupLabel(settings, step.value),
        requiresSignature: step.requiresSignature ?? false,
      });
      continue;
    }

    let approverUserId: Id<"users"> | undefined;
    // Set when a step resolves to multiple eligible approvers (e.g. a person
    // with several managers) so any of them can act on it.
    let approverUserIds: Id<"users">[] | undefined;
    let name = "";
    if (step.approverType === "position") {
      if (step.value === "manager") {
        // Route to every manager (primary + additional); any can approve.
        const mgrs = await managerUsers(ctx, employee);
        if (mgrs.length > 0) {
          approverUserId = mgrs[0].userId;
          if (mgrs.length > 1) approverUserIds = mgrs.map((m) => m.userId);
          name = mgrs.map((m) => m.name).join(", ");
        }
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

    if (!approverUserId) continue;
    if (employee.userId && approverUserId === employee.userId) continue;

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
      ...(approverUserIds ? { approverUserIds } : {}),
      label: name ? `${posLabel} — ${name}` : posLabel,
      requiresSignature: step.requiresSignature ?? false,
    });
  }

  // Implicit HR stage (unless HR is already an explicit workflow step).
  const hrAlreadyInWorkflow = workflow.some(
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
        requiresSignature: false,
      });
    }
  }

  // Collapse consecutive identical steps.
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

function currentApproverLabel(request: Doc<"paymentRequests">): string | null {
  if (request.status === "pending_finance") return "Finance";
  if (request.status === "pending_manager") {
    const chain = request.approvalChain ?? [];
    const step = chain[request.currentStepIndex ?? 0];
    return step?.label ?? "Manager";
  }
  return null;
}

async function notify(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  recipientUserId: Id<"users"> | undefined,
  type: string,
  title: string,
  body: string,
  requestId: Id<"paymentRequests">,
) {
  if (!recipientUserId) return;
  await pushNotification(ctx, {
    orgId,
    recipientUserId,
    type,
    title,
    body,
    entityRef: { table: "paymentRequests", id: requestId },
  });
}

async function notifyStep(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  step: { approverUserId?: Id<"users">; approverUserIds?: Id<"users">[] },
  type: string,
  title: string,
  body: string,
  requestId: Id<"paymentRequests">,
) {
  for (const uid of eligibleApprovers(step)) {
    await notify(ctx, orgId, uid, type, title, body, requestId);
  }
}

async function notifyFinance(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  request: Doc<"paymentRequests">,
  requestorName: string,
) {
  const settings = await resolvePaymentRequestSettings(ctx, orgId);
  for (const userId of settings.financeApproverUserIds) {
    await notify(
      ctx,
      orgId,
      userId,
      "payment_request.submitted",
      "Payment request to approve",
      `${requestorName}'s payment request is awaiting finance approval`,
      request._id,
    );
  }
}

// ─── Hydration + access ────────────────────────────────────────────────────

async function resolveAttachments(ctx: QueryCtx, storageIds: Id<"_storage">[]) {
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

// `canMarkPaid` reflects whether the *caller* may mark this row paid — passed in
// by the query after resolving finance/oversight once, and only true for
// approved rows. Requestor-facing lists pass false.
async function hydrateRow(
  ctx: QueryCtx,
  r: Doc<"paymentRequests">,
  canMarkPaid = false,
) {
  const emp = await ctx.db.get(r.employeeId);
  return {
    _id: r._id,
    _creationTime: r._creationTime,
    requestNumber: r.requestNumber,
    employeeId: r.employeeId,
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
    purpose: r.purpose,
    payeeName: r.payeeName,
    country: r.country ?? null,
    amountCents: r.amountCents,
    currency: r.currency,
    requestDate: r.requestDate,
    // "Date of Invoice" custom field (key `invoiceDate` on the default
    // template), surfaced for sorting/filtering. Null when unset.
    invoiceDate: r.fieldValues?.invoiceDate ?? null,
    status: r.status,
    attachmentCount: r.attachmentStorageIds.length,
    itemCount: r.items?.length ?? 0,
    currentApprover: currentApproverLabel(r),
    canMarkPaid: canMarkPaid && r.status === "approved",
  };
}

async function requireRequestAccess(
  ctx: QueryCtx,
  requestId: Id<"paymentRequests">,
) {
  const orgCtx = await requireOrg(ctx);
  const request = await ctx.db.get(requestId);
  if (!request || request.orgId !== orgCtx.orgId) {
    throw new ConvexError("Payment request not found.");
  }
  if (ctxHasPermission(orgCtx, "payment_requests:read:all")) {
    return { orgCtx, request };
  }
  const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
  if (own && request.employeeId === own._id) return { orgCtx, request };
  const settings = await resolvePaymentRequestSettings(ctx, orgCtx.orgId);
  if (isFinanceApprover(settings, orgCtx.userId)) return { orgCtx, request };
  if (request.approvalChain?.some((s) => stepEligible(s, orgCtx.userId))) {
    return { orgCtx, request };
  }
  throw new ConvexError("Not authorized to view this payment request.");
}

// Can the caller act on the request's current pending stage?
async function canActNow(
  ctx: QueryCtx,
  orgCtx: OrgContext,
  request: Doc<"paymentRequests">,
  settings: ResolvedPaymentRequestSettings,
): Promise<boolean> {
  const isOversight = ctxHasPermission(orgCtx, "payment_requests:read:all");
  if (request.status === "pending_finance") {
    return isOversight || isFinanceApprover(settings, orgCtx.userId);
  }
  if (request.status === "pending_manager") {
    if (isOversight) return true;
    const chain = request.approvalChain ?? [];
    const step = chain[request.currentStepIndex ?? 0];
    return !!step && stepEligible(step, orgCtx.userId);
  }
  return false;
}

// ─── Routing (build chain + set status) ────────────────────────────────────

async function routeRequest(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  request: Doc<"paymentRequests">,
) {
  const employee = await ctx.db.get(request.employeeId);
  if (!employee) throw new ConvexError("Employee not found.");
  const settings = await resolvePaymentRequestSettings(ctx, orgId);
  const chain = await buildApprovalChain(ctx, orgId, employee, request.amountCents);
  const requiresFinance = settings.financeApproverUserIds.length > 0;
  const empName = `${employee.firstName} ${employee.lastName}`;

  if (chain.length > 0) {
    await ctx.db.patch(request._id, {
      status: "pending_manager",
      approvalChain: chain,
      currentStepIndex: 0,
      requiresFinance,
    });
    await notifyStep(
      ctx,
      orgId,
      chain[0],
      "payment_request.submitted",
      "Payment request to approve",
      `${empName}'s payment request needs your approval`,
      request._id,
    );
  } else if (requiresFinance) {
    await ctx.db.patch(request._id, {
      status: "pending_finance",
      approvalChain: [],
      currentStepIndex: 0,
      requiresFinance: true,
    });
    await notifyFinance(ctx, orgId, request, empName);
  } else {
    await ctx.db.patch(request._id, {
      status: "approved",
      requiresFinance: false,
      decidedAt: Date.now(),
    });
    await notify(
      ctx,
      orgId,
      employee.userId,
      "payment_request.approved",
      "Payment request approved",
      "Your payment request was approved.",
      request._id,
    );
  }
}

// ─── Mutations ───────────────────────────────────────────────────────────

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireOrg(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

async function nextRequestNumber(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
): Promise<number> {
  const rows = await ctx.db
    .query("paymentRequests")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  return rows.reduce((m, r) => Math.max(m, r.requestNumber), 0) + 1;
}

// Create a payment request. When `andSubmit` it routes into the approval chain
// immediately; otherwise it's saved as a draft the requestor can edit/submit
// later.
export const create = mutation({
  args: {
    templateId: v.optional(v.id("paymentRequestTemplates")),
    purpose: v.string(),
    amountCents: v.number(),
    currency: v.optional(v.string()),
    payeeName: v.string(),
    items: v.optional(v.array(paymentRequestItem)),
    country: v.optional(v.string()),
    requestDate: v.string(),
    fieldValues: v.optional(v.record(v.string(), v.string())),
    attachmentStorageIds: v.array(v.id("_storage")),
    remarks: v.optional(v.string()),
    requestorSignatureStorageId: v.optional(v.id("_storage")),
    andSubmit: v.boolean(),
  },
  returns: v.id("paymentRequests"),
  handler: async (ctx, args) => {
    const { orgId, userId, org } = await requireOrg(ctx);
    const own = await employeeByUserId(ctx, orgId, userId);
    if (!own) throw new ConvexError("You don't have an employee profile yet.");

    // When itemised, the total is the sum of the line items (authoritative).
    const sanitized = sanitizeItems(args.items);
    const amountCents = sanitized ? sanitized.totalCents : args.amountCents;
    if (amountCents <= 0) throw new ConvexError("Amount must be positive.");
    if (!args.purpose.trim()) throw new ConvexError("Purpose is required.");
    if (!args.payeeName.trim()) throw new ConvexError("Payee is required.");
    if (args.attachmentStorageIds.length > MAX_ATTACHMENTS) {
      throw new ConvexError(
        `A payment request can have at most ${MAX_ATTACHMENTS} attachments.`,
      );
    }

    // Validate required custom fields against the chosen template.
    if (args.templateId) {
      const template = await ctx.db.get(args.templateId);
      if (!template || template.orgId !== orgId) {
        throw new ConvexError("Template not found.");
      }
      for (const f of template.fields) {
        if (f.required && !args.fieldValues?.[f.key]?.trim()) {
          throw new ConvexError(`${f.label} is required.`);
        }
      }
    }

    const currency = args.currency ?? org.settings.currency;
    const requestNumber = await nextRequestNumber(ctx, orgId);
    const id = await ctx.db.insert("paymentRequests", {
      orgId,
      employeeId: own._id,
      templateId: args.templateId,
      requestNumber,
      purpose: args.purpose.trim(),
      amountCents,
      currency,
      payeeName: args.payeeName.trim(),
      items: sanitized?.items,
      country: args.country?.trim().toUpperCase() || org.country,
      requestDate: args.requestDate,
      incurredMonth: args.requestDate.slice(0, 7),
      fieldValues: args.fieldValues,
      attachmentStorageIds: args.attachmentStorageIds,
      remarks: args.remarks?.trim() || undefined,
      status: "draft",
      requestorSignatureStorageId: args.requestorSignatureStorageId,
      createdBy: userId,
    });

    if (args.andSubmit) {
      const created = await ctx.db.get(id);
      if (created) await routeRequest(ctx, orgId, created);
    }

    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: args.andSubmit ? "payment_request.submit" : "payment_request.draft",
      entity: "paymentRequests",
      entityId: id,
    });
    return id;
  },
});

// Route an existing draft into the approval chain. Only drafts submit — a
// rejected request is frozen; the requestor resubmits it via `resubmitRequest`,
// which duplicates it into a fresh draft (mirrors claims).
export const submitRequest = mutation({
  args: { requestId: v.id("paymentRequests") },
  returns: v.null(),
  handler: async (ctx, { requestId }) => {
    const { orgId, userId } = await requireOrg(ctx);
    const request = await ctx.db.get(requestId);
    if (!request || request.orgId !== orgId) {
      throw new ConvexError("Payment request not found.");
    }
    const own = await employeeByUserId(ctx, orgId, userId);
    if (!own || request.employeeId !== own._id) {
      throw new ConvexError("Only the requestor can submit this request.");
    }
    if (request.status !== "draft") {
      throw new ConvexError("Only draft requests can be submitted.");
    }
    await routeRequest(ctx, orgId, request);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "payment_request.submit",
      entity: "paymentRequests",
      entityId: requestId,
    });
    return null;
  },
});

// Resubmit a rejected request by DUPLICATING it into a fresh draft owned by the
// requestor, linked back to the original via `resubmittedFromRequestId`. The
// original stays rejected (still visible, but excluded from exports); the copy
// is a brand-new draft the owner can edit before submitting it back through the
// approval workflow. Mirrors claims' resubmit-as-duplicate. Returns the new id.
export const resubmitRequest = mutation({
  args: { requestId: v.id("paymentRequests") },
  returns: v.id("paymentRequests"),
  handler: async (ctx, { requestId }) => {
    const { orgId, userId } = await requireOrg(ctx);
    const request = await ctx.db.get(requestId);
    if (!request || request.orgId !== orgId) {
      throw new ConvexError("Payment request not found.");
    }
    const own = await employeeByUserId(ctx, orgId, userId);
    if (!own || request.employeeId !== own._id) {
      throw new ConvexError("Only the requestor can resubmit this request.");
    }
    if (request.status !== "rejected") {
      throw new ConvexError("Only rejected requests can be resubmitted.");
    }

    // Fresh draft copy of the request's content. Decision/approval/signature
    // state is intentionally not carried over — the copy routes fresh on submit,
    // against current settings. Attachment files are shared with the original
    // (delete is guarded so removing one keeps the other's attachments).
    const requestNumber = await nextRequestNumber(ctx, orgId);
    const dupId = await ctx.db.insert("paymentRequests", {
      orgId,
      employeeId: own._id,
      templateId: request.templateId,
      requestNumber,
      purpose: request.purpose,
      amountCents: request.amountCents,
      currency: request.currency,
      payeeName: request.payeeName,
      items: request.items,
      country: request.country,
      requestDate: request.requestDate,
      incurredMonth: request.incurredMonth,
      fieldValues: request.fieldValues,
      attachmentStorageIds: request.attachmentStorageIds,
      remarks: request.remarks,
      status: "draft",
      requestorSignatureStorageId: request.requestorSignatureStorageId,
      resubmittedFromRequestId: request._id,
      createdBy: userId,
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "payment_request.resubmit_duplicate",
      entity: "paymentRequests",
      entityId: dupId,
      after: { from: request._id },
    });
    return dupId;
  },
});

// Approve the current stage. Handles both the workflow chain (`pending_manager`)
// and the finance stage (`pending_finance`) based on the request's status.
export const approve = mutation({
  args: {
    requestId: v.id("paymentRequests"),
    note: v.optional(v.string()),
    signatureStorageId: v.optional(v.id("_storage")),
  },
  returns: v.null(),
  handler: async (ctx, { requestId, note, signatureStorageId }) => {
    const orgCtx = await requireOrg(ctx);
    const { orgId, userId } = orgCtx;
    const request = await ctx.db.get(requestId);
    if (!request || request.orgId !== orgId) {
      throw new ConvexError("Payment request not found.");
    }
    const settings = await resolvePaymentRequestSettings(ctx, orgId);
    const isOversight = ctxHasPermission(orgCtx, "payment_requests:read:all");
    const employee = await ctx.db.get(request.employeeId);
    const empName = employee
      ? `${employee.firstName} ${employee.lastName}`
      : "An employee";

    if (request.status === "pending_finance") {
      if (!isOversight && !isFinanceApprover(settings, userId)) {
        throw new ConvexError("Not authorized to approve as finance.");
      }
      if (settings.financeRequiresSignature && !signatureStorageId) {
        throw new ConvexError("A signature is required to approve as finance.");
      }
      const signatures = [...(request.signatures ?? [])];
      if (signatureStorageId) {
        signatures.push({
          role: "Finance",
          byUserId: userId,
          name: await userDisplayName(ctx, userId),
          signatureStorageId,
          signedAt: Date.now(),
        });
      }
      await ctx.db.patch(requestId, {
        status: "approved",
        financeApproverUserId: userId,
        decidedAt: Date.now(),
        decisionNote: note,
        signatures,
      });
      await notify(
        ctx,
        orgId,
        employee?.userId,
        "payment_request.approved",
        "Payment request approved",
        "Your payment request was approved by finance.",
        requestId,
      );
      await writeAuditLog(ctx, {
        orgId,
        actorUserId: userId,
        action: "payment_request.finance_approve",
        entity: "paymentRequests",
        entityId: requestId,
      });
      return null;
    }

    if (request.status !== "pending_manager") {
      throw new ConvexError("Payment request is not awaiting approval.");
    }

    const chain = request.approvalChain ?? [];
    const idx = request.currentStepIndex ?? 0;
    const step = chain[idx];
    const isApprover = !!step && stepEligible(step, userId);
    if (!isApprover && !isOversight) {
      throw new ConvexError("Not authorized to approve this step.");
    }
    if (step?.requiresSignature && !signatureStorageId) {
      throw new ConvexError("A signature is required to approve this step.");
    }

    const signatures = [...(request.signatures ?? [])];
    if (signatureStorageId) {
      signatures.push({
        role: step?.label ?? "Approver",
        byUserId: userId,
        name: await userDisplayName(ctx, userId),
        signatureStorageId,
        signedAt: Date.now(),
      });
    }
    const updatedChain = chain.map((s, i) =>
      i === idx
        ? { ...s, decidedByUserId: userId, decidedAt: Date.now(), note }
        : s,
    );
    const nextIdx = idx + 1;

    if (nextIdx < updatedChain.length) {
      await ctx.db.patch(requestId, {
        approvalChain: updatedChain,
        currentStepIndex: nextIdx,
        decisionNote: note,
        signatures,
      });
      await notifyStep(
        ctx,
        orgId,
        updatedChain[nextIdx],
        "payment_request.submitted",
        "Payment request to approve",
        `${empName}'s payment request needs your approval`,
        requestId,
      );
    } else if (request.requiresFinance) {
      await ctx.db.patch(requestId, {
        status: "pending_finance",
        approvalChain: updatedChain,
        currentStepIndex: nextIdx,
        managerApproverUserId: userId,
        decisionNote: note,
        signatures,
      });
      await notify(
        ctx,
        orgId,
        employee?.userId,
        "payment_request.progressed",
        "Payment request progressed",
        "Your payment request cleared approvals and was sent to finance.",
        requestId,
      );
      await notifyFinance(ctx, orgId, request, empName);
    } else {
      await ctx.db.patch(requestId, {
        status: "approved",
        approvalChain: updatedChain,
        currentStepIndex: nextIdx,
        managerApproverUserId: userId,
        decidedAt: Date.now(),
        decisionNote: note,
        signatures,
      });
      await notify(
        ctx,
        orgId,
        employee?.userId,
        "payment_request.approved",
        "Payment request approved",
        "Your payment request was approved.",
        requestId,
      );
    }
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "payment_request.approve_step",
      entity: "paymentRequests",
      entityId: requestId,
      after: { step: idx },
    });
    return null;
  },
});

// Reject the request at its current stage. Records the step index (for top-down
// reject visibility) and requires a reason.
export const reject = mutation({
  args: { requestId: v.id("paymentRequests"), note: v.string() },
  returns: v.null(),
  handler: async (ctx, { requestId, note }) => {
    const orgCtx = await requireOrg(ctx);
    const { orgId, userId } = orgCtx;
    if (!note.trim()) throw new ConvexError("A reason is required to reject.");
    const request = await ctx.db.get(requestId);
    if (!request || request.orgId !== orgId) {
      throw new ConvexError("Payment request not found.");
    }
    const settings = await resolvePaymentRequestSettings(ctx, orgId);
    if (!(await canActNow(ctx, orgCtx, request, settings))) {
      throw new ConvexError("Not authorized to act on this payment request.");
    }
    const rejectedStepIndex =
      request.status === "pending_finance"
        ? (request.approvalChain?.length ?? 0)
        : (request.currentStepIndex ?? 0);
    await ctx.db.patch(requestId, {
      status: "rejected",
      decidedAt: Date.now(),
      decisionNote: note.trim(),
      rejectedStepIndex,
    });
    const employee = await ctx.db.get(request.employeeId);
    await notify(
      ctx,
      orgId,
      employee?.userId,
      "payment_request.rejected",
      "Payment request rejected",
      note.trim(),
      requestId,
    );
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "payment_request.reject",
      entity: "paymentRequests",
      entityId: requestId,
    });
    return null;
  },
});

// Edit a request. The owner edits a draft; an approver/HR edits a pending one
// (append to the edit audit trail).
export const editRequest = mutation({
  args: {
    requestId: v.id("paymentRequests"),
    purpose: v.string(),
    amountCents: v.number(),
    currency: v.optional(v.string()),
    payeeName: v.string(),
    items: v.optional(v.array(paymentRequestItem)),
    country: v.optional(v.string()),
    requestDate: v.string(),
    fieldValues: v.optional(v.record(v.string(), v.string())),
    attachmentStorageIds: v.array(v.id("_storage")),
    remarks: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const orgCtx = await requireOrg(ctx);
    const { orgId, userId } = orgCtx;
    const request = await ctx.db.get(args.requestId);
    if (!request || request.orgId !== orgId) {
      throw new ConvexError("Payment request not found.");
    }
    const own = await employeeByUserId(ctx, orgId, userId);
    const isOwner = !!own && request.employeeId === own._id;
    const isPending =
      request.status === "pending_manager" ||
      request.status === "pending_finance";
    const settings = await resolvePaymentRequestSettings(ctx, orgId);
    const canApprover = isPending && (await canActNow(ctx, orgCtx, request, settings));
    // The requestor can only edit their own DRAFT — once submitted the request
    // is locked to them. To change a rejected request they resubmit it (which
    // duplicates it into a fresh draft). An eligible approver can still correct a
    // pending request.
    const canEdit = (isOwner && request.status === "draft") || canApprover;
    if (!canEdit) throw new ConvexError("You can't edit this payment request.");
    const sanitized = sanitizeItems(args.items);
    const amountCents = sanitized ? sanitized.totalCents : args.amountCents;
    if (amountCents <= 0) throw new ConvexError("Amount must be positive.");
    if (args.attachmentStorageIds.length > MAX_ATTACHMENTS) {
      throw new ConvexError(
        `A payment request can have at most ${MAX_ATTACHMENTS} attachments.`,
      );
    }

    const currency = args.currency ?? request.currency;
    const changes: string[] = [];
    if (request.amountCents !== amountCents || request.currency !== currency) {
      changes.push(
        `amount ${formatMoneyCents(request.amountCents, request.currency)} → ${formatMoneyCents(amountCents, currency)}`,
      );
    }
    if (request.purpose !== args.purpose.trim()) changes.push("purpose");
    if (request.payeeName !== args.payeeName.trim()) changes.push("payee");

    const edits = [...(request.edits ?? [])];
    if (!isOwner || request.status !== "draft") {
      edits.push({
        editedByUserId: userId,
        editedAt: Date.now(),
        summary: changes.length ? changes.join(", ") : "edited details",
      });
    }

    await ctx.db.patch(args.requestId, {
      purpose: args.purpose.trim(),
      amountCents,
      currency,
      payeeName: args.payeeName.trim(),
      items: sanitized?.items,
      country: args.country?.trim().toUpperCase() || request.country,
      requestDate: args.requestDate,
      incurredMonth: args.requestDate.slice(0, 7),
      fieldValues: args.fieldValues,
      attachmentStorageIds: args.attachmentStorageIds,
      remarks: args.remarks?.trim() || undefined,
      edits,
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "payment_request.edit",
      entity: "paymentRequests",
      entityId: args.requestId,
    });
    return null;
  },
});

// Delete a request. Owner may delete a draft; approver/HR may delete a pending
// one. Rejected requests are not deletable (mirrors claims).
export const deleteRequest = mutation({
  args: { requestId: v.id("paymentRequests") },
  returns: v.null(),
  handler: async (ctx, { requestId }) => {
    const orgCtx = await requireOrg(ctx);
    const { orgId, userId } = orgCtx;
    const request = await ctx.db.get(requestId);
    if (!request || request.orgId !== orgId) {
      throw new ConvexError("Payment request not found.");
    }
    const own = await employeeByUserId(ctx, orgId, userId);
    const isOwner = !!own && request.employeeId === own._id;
    const isPending =
      request.status === "pending_manager" ||
      request.status === "pending_finance";
    const settings = await resolvePaymentRequestSettings(ctx, orgId);
    const canApprover = isPending && (await canActNow(ctx, orgCtx, request, settings));
    const allowed = (request.status === "draft" && isOwner) || canApprover;
    if (!allowed) {
      throw new ConvexError("You can't delete this payment request.");
    }
    // Best-effort cleanup of attachments + signatures + comments.
    for (const sid of request.attachmentStorageIds) {
      try {
        await ctx.storage.delete(sid);
      } catch {
        /* ignore */
      }
    }
    const comments = await ctx.db
      .query("paymentRequestComments")
      .withIndex("by_request", (q) => q.eq("requestId", requestId))
      .collect();
    for (const c of comments) await ctx.db.delete(c._id);
    await ctx.db.delete(requestId);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "payment_request.delete",
      entity: "paymentRequests",
      entityId: requestId,
    });
    return null;
  },
});

// Mark an approved request as paid. Finance/HR (read:all or finance approver).
export const markPaid = mutation({
  args: { requestId: v.id("paymentRequests") },
  returns: v.null(),
  handler: async (ctx, { requestId }) => {
    const orgCtx = await requireOrg(ctx);
    const { orgId, userId } = orgCtx;
    const request = await ctx.db.get(requestId);
    if (!request || request.orgId !== orgId) {
      throw new ConvexError("Payment request not found.");
    }
    if (request.status !== "approved") {
      throw new ConvexError("Only approved requests can be marked paid.");
    }
    const settings = await resolvePaymentRequestSettings(ctx, orgId);
    const isOversight = ctxHasPermission(orgCtx, "payment_requests:read:all");
    if (!isOversight && !isFinanceApprover(settings, userId)) {
      throw new ConvexError("Not authorized to mark this request paid.");
    }
    await ctx.db.patch(requestId, { status: "paid", paidAt: Date.now() });
    const employee = await ctx.db.get(request.employeeId);
    await notify(
      ctx,
      orgId,
      employee?.userId,
      "payment_request.paid",
      "Payment request paid",
      "Your payment request has been marked paid.",
      requestId,
    );
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "payment_request.mark_paid",
      entity: "paymentRequests",
      entityId: requestId,
    });
    return null;
  },
});

export const setRemarks = mutation({
  args: { requestId: v.id("paymentRequests"), remarks: v.string() },
  returns: v.null(),
  handler: async (ctx, { requestId, remarks }) => {
    const { orgCtx, request } = await requireRequestAccess(ctx, requestId);
    await ctx.db.patch(request._id, { remarks: remarks.trim() || undefined });
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "payment_request.set_remarks",
      entity: "paymentRequests",
      entityId: requestId,
    });
    return null;
  },
});

export const addComment = mutation({
  args: { requestId: v.id("paymentRequests"), body: v.string() },
  returns: v.null(),
  handler: async (ctx, { requestId, body }) => {
    const { orgCtx } = await requireRequestAccess(ctx, requestId);
    if (!body.trim()) throw new ConvexError("Comment can't be empty.");
    await ctx.db.insert("paymentRequestComments", {
      orgId: orgCtx.orgId,
      requestId,
      authorUserId: orgCtx.userId,
      body: body.trim(),
    });
    return null;
  },
});

// ─── Queries ───────────────────────────────────────────────────────────────

const prRow = v.object({
  _id: v.id("paymentRequests"),
  _creationTime: v.number(),
  requestNumber: v.number(),
  employeeId: v.id("employees"),
  employeeName: v.string(),
  purpose: v.string(),
  payeeName: v.string(),
  country: v.union(v.string(), v.null()),
  amountCents: v.number(),
  currency: v.string(),
  requestDate: v.string(),
  invoiceDate: v.union(v.string(), v.null()),
  status: paymentRequestStatus,
  attachmentCount: v.number(),
  itemCount: v.number(),
  currentApprover: v.union(v.string(), v.null()),
  canMarkPaid: v.boolean(),
});

// The current employee's payment requests, optionally filtered to a month.
export const mine = query({
  args: { month: v.optional(v.string()) },
  returns: v.array(prRow),
  handler: async (ctx, { month }) => {
    const { orgId, userId } = await requireOrg(ctx);
    const own = await employeeByUserId(ctx, orgId, userId);
    if (!own) return [];
    let rows = await ctx.db
      .query("paymentRequests")
      .withIndex("by_employee", (q) => q.eq("employeeId", own._id))
      .collect();
    if (month) rows = rows.filter((r) => r.incurredMonth === month);
    rows.sort((a, b) => b._creationTime - a._creationTime);
    // The requestor's own list never surfaces a mark-paid action.
    return await Promise.all(rows.map((r) => hydrateRow(ctx, r)));
  },
});

// Whether the caller is involved in a request as an approver — eligible for any
// chain step, a finance approver on a request that routes through finance, or the
// recorded manager/finance approver. Drives the Team approver view, which shows
// everything the caller has a stake in (pending they can act on AND completed
// they handled), rather than only the currently-actionable items.
function involvedIn(
  r: Doc<"paymentRequests">,
  settings: ResolvedPaymentRequestSettings,
  userId: Id<"users">,
  isOversight: boolean,
): boolean {
  if (isOversight) return true;
  if (r.approvalChain?.some((s) => stepEligible(s, userId))) return true;
  if (
    isFinanceApprover(settings, userId) &&
    (r.requiresFinance || r.status === "pending_finance" || r.financeApproverUserId != null)
  ) {
    return true;
  }
  return r.managerApproverUserId === userId || r.financeApproverUserId === userId;
}

// The Team approver view: every payment request the caller is involved in, across
// all statuses (so completed/rejected/paid history is visible), narrowable by
// status. Drafts are never shown (they belong to the requestor's own view).
export const approvalQueue = query({
  args: { month: v.optional(v.string()), status: v.optional(v.string()) },
  returns: v.array(prRow),
  handler: async (ctx, { month, status }) => {
    const orgCtx = await requireOrg(ctx);
    const settings = await resolvePaymentRequestSettings(ctx, orgCtx.orgId);
    const isOversight = ctxHasPermission(orgCtx, "payment_requests:read:all");
    const rows = await ctx.db
      .query("paymentRequests")
      .withIndex("by_org", (q) => q.eq("orgId", orgCtx.orgId))
      .collect();
    const out: Doc<"paymentRequests">[] = [];
    for (const r of rows) {
      if (r.status === "draft") continue;
      if (month && r.incurredMonth !== month) continue;
      if (status && r.status !== status) continue;
      if (!involvedIn(r, settings, orgCtx.userId, isOversight)) continue;
      out.push(r);
    }
    out.sort((a, b) => b._creationTime - a._creationTime);
    const canPay = isOversight || isFinanceApprover(settings, orgCtx.userId);
    return await Promise.all(out.map((r) => hydrateRow(ctx, r, canPay)));
  },
});

// Count of payment requests awaiting the caller's decision right now. Powers the
// dashboard quick-action badge — unlike `approvalQueue` this counts only items
// the caller can act on this moment, not everything they're involved in.
export const pendingApprovalCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return 0;
    const settings = await resolvePaymentRequestSettings(ctx, orgCtx.orgId);
    const rows = await ctx.db
      .query("paymentRequests")
      .withIndex("by_org", (q) => q.eq("orgId", orgCtx.orgId))
      .collect();
    let count = 0;
    for (const r of rows) {
      if (r.status !== "pending_manager" && r.status !== "pending_finance") continue;
      if (await canActNow(ctx, orgCtx, r, settings)) count += 1;
    }
    return count;
  },
});

// Every payment request in the org (HR Lounge oversight), month/status filters.
export const allRequests = query({
  args: { month: v.optional(v.string()), status: v.optional(v.string()) },
  returns: v.array(prRow),
  handler: async (ctx, { month, status }) => {
    const { orgId } = await requirePermission(ctx, "payment_requests:read:all");
    let rows = await ctx.db
      .query("paymentRequests")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    if (month) rows = rows.filter((r) => r.incurredMonth === month);
    if (status) rows = rows.filter((r) => r.status === status);
    rows.sort((a, b) => b._creationTime - a._creationTime);
    // read:all is oversight — the caller may mark approved requests paid.
    return await Promise.all(rows.map((r) => hydrateRow(ctx, r, true)));
  },
});

// Full hydrated detail for one request.
export const get = query({
  args: { requestId: v.id("paymentRequests") },
  handler: async (ctx, { requestId }) => {
    const { orgCtx, request } = await requireRequestAccess(ctx, requestId);
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    const isMine = !!own && request.employeeId === own._id;
    const settings = await resolvePaymentRequestSettings(ctx, orgCtx.orgId);
    const canApprove = await canActNow(ctx, orgCtx, request, settings);

    let needsSignature = false;
    if (canApprove) {
      if (request.status === "pending_finance") {
        needsSignature = settings.financeRequiresSignature;
      } else if (request.status === "pending_manager") {
        const step = (request.approvalChain ?? [])[request.currentStepIndex ?? 0];
        needsSignature = !!step?.requiresSignature;
      }
    }

    const employee = await ctx.db.get(request.employeeId);
    const template = request.templateId
      ? await ctx.db.get(request.templateId)
      : null;
    const attachments = await resolveAttachments(ctx, request.attachmentStorageIds);
    const requestorSignatureUrl = request.requestorSignatureStorageId
      ? await ctx.storage.getUrl(request.requestorSignatureStorageId)
      : null;
    const signatures = await Promise.all(
      (request.signatures ?? []).map(async (s) => ({
        role: s.role,
        name: s.name,
        signedAt: s.signedAt,
        url: await ctx.storage.getUrl(s.signatureStorageId),
      })),
    );
    const edits = await Promise.all(
      (request.edits ?? []).map(async (e) => {
        const u = await ctx.db.get(e.editedByUserId);
        return {
          editedByName: u?.name ?? "Unknown",
          editedAt: e.editedAt,
          summary: e.summary,
        };
      }),
    );
    const stepIdx = request.currentStepIndex ?? 0;
    const approvalChain = (request.approvalChain ?? []).map((s, i) => ({
      label: s.label,
      done: s.decidedByUserId != null,
      current: request.status === "pending_manager" && i === stepIdx,
    }));

    const isPending =
      request.status === "pending_manager" ||
      request.status === "pending_finance";
    const isRejected = request.status === "rejected";
    // The requestor can only edit their own draft; approvers can correct a
    // pending request. Once submitted the request is locked to the requestor.
    const canEdit =
      (isMine && request.status === "draft") || (isPending && canApprove);
    // The requestor resubmits their own rejected request — this duplicates it
    // into a fresh draft they then edit and submit.
    const canResubmit = isMine && isRejected;

    return {
      _id: request._id,
      _creationTime: request._creationTime,
      requestNumber: request.requestNumber,
      employeeId: request.employeeId,
      employeeName: employee
        ? `${employee.firstName} ${employee.lastName}`
        : "Unknown",
      templateId: request.templateId ?? null,
      templateName: template?.name ?? null,
      templateFields: template?.fields ?? [],
      headerText: template?.headerText ?? null,
      purpose: request.purpose,
      amountCents: request.amountCents,
      currency: request.currency,
      payeeName: request.payeeName,
      items: request.items ?? [],
      country: request.country ?? null,
      requestDate: request.requestDate,
      fieldValues: request.fieldValues ?? {},
      remarks: request.remarks ?? null,
      status: request.status,
      attachments,
      requestorSignatureUrl,
      signatures,
      edits,
      approvalChain,
      decisionNote: request.decisionNote ?? null,
      isMine,
      canApprove,
      canEdit,
      canResubmit,
      needsSignature,
      requiresFinance: request.requiresFinance ?? false,
    };
  },
});

export const listComments = query({
  args: { requestId: v.id("paymentRequests") },
  handler: async (ctx, { requestId }) => {
    const { orgCtx } = await requireRequestAccess(ctx, requestId);
    const rows = await ctx.db
      .query("paymentRequestComments")
      .withIndex("by_request", (q) => q.eq("requestId", requestId))
      .collect();
    void orgCtx;
    return await Promise.all(
      rows.map(async (c) => {
        const u = await ctx.db.get(c.authorUserId);
        return {
          _id: c._id,
          _creationTime: c._creationTime,
          authorName: u?.name?.trim() || u?.username || u?.email || "Unknown",
          body: c.body,
        };
      }),
    );
  },
});

// Rows for the monthly Excel export + PDF: one entry per request the caller can
// see (HR → all; approver → requests they route or finance-approve), with
// resolved attachment + signature URLs.
export const exportRows = query({
  args: { month: v.string() },
  handler: async (ctx, { month }) => {
    const orgCtx = await requireOrg(ctx);
    const isOversight = ctxHasPermission(orgCtx, "payment_requests:read:all");
    const settings = await resolvePaymentRequestSettings(ctx, orgCtx.orgId);
    const rows = await ctx.db
      .query("paymentRequests")
      .withIndex("by_org_month", (q) =>
        q.eq("orgId", orgCtx.orgId).eq("incurredMonth", month),
      )
      .collect();

    const visible = rows.filter((r) => {
      // Drafts (not yet submitted) and rejected requests are never exported —
      // rejected ones stay visible in-app but are excluded from every report.
      if (r.status === "draft" || r.status === "rejected") return false;
      if (isOversight) return true;
      if (isFinanceApprover(settings, orgCtx.userId)) return true;
      return !!r.approvalChain?.some((s) => stepEligible(s, orgCtx.userId));
    });
    visible.sort((a, b) => a.requestNumber - b.requestNumber);

    return await Promise.all(
      visible.map(async (r) => {
        const emp = await ctx.db.get(r.employeeId);
        return {
          _id: r._id,
          requestNumber: r.requestNumber,
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
          purpose: r.purpose,
          payeeName: r.payeeName,
          country: r.country ?? null,
          amountCents: r.amountCents,
          currency: r.currency,
          requestDate: r.requestDate,
          status: r.status,
          signatures: await Promise.all(
            (r.signatures ?? []).map(async (s) => ({
              role: s.role,
              name: s.name,
              signedAt: s.signedAt,
              url: await ctx.storage.getUrl(s.signatureStorageId),
            })),
          ),
        };
      }),
    );
  },
});

// Full print payloads for a set of requests (for PDF / ZIP / merge). Access is
// checked per id (requestor, chain approver, finance, or HR oversight).
export const getForPrint = query({
  args: { requestIds: v.array(v.id("paymentRequests")) },
  handler: async (ctx, { requestIds }) => {
    const orgCtx = await requireOrg(ctx);
    const isOversight = ctxHasPermission(orgCtx, "payment_requests:read:all");
    const settings = await resolvePaymentRequestSettings(ctx, orgCtx.orgId);
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    const org = orgCtx.org;
    const logoUrl = org.logoStorageId
      ? await ctx.storage.getUrl(org.logoStorageId)
      : (org.imageUrl ?? null);

    const out = [];
    for (const id of requestIds) {
      const r = await ctx.db.get(id);
      if (!r || r.orgId !== orgCtx.orgId) continue;
      const allowed =
        isOversight ||
        (own && r.employeeId === own._id) ||
        isFinanceApprover(settings, orgCtx.userId) ||
        !!r.approvalChain?.some((s) => stepEligible(s, orgCtx.userId));
      if (!allowed) continue;

      const emp = await ctx.db.get(r.employeeId);
      const template = r.templateId ? await ctx.db.get(r.templateId) : null;
      out.push({
        _id: r._id,
        requestNumber: r.requestNumber,
        orgName: org.name,
        logoUrl,
        headerText: template?.headerText ?? "REQUEST FOR PAYMENT",
        style: {
          accentColor: template?.accentColor ?? null,
          fontFamily: template?.fontFamily ?? null,
          textColor: template?.textColor ?? null,
          fontScale: template?.fontScale ?? null,
          density: template?.density ?? null,
          show: template?.show ?? null,
        },
        employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
        purpose: r.purpose,
        amountCents: r.amountCents,
        currency: r.currency,
        payeeName: r.payeeName,
        items: r.items ?? [],
        country: r.country ?? null,
        requestDate: r.requestDate,
        status: r.status,
        templateFields: template?.fields ?? [],
        fieldValues: r.fieldValues ?? {},
        remarks: r.remarks ?? null,
        requestorSignatureUrl: r.requestorSignatureStorageId
          ? await ctx.storage.getUrl(r.requestorSignatureStorageId)
          : null,
        signatures: await Promise.all(
          (r.signatures ?? []).map(async (s) => ({
            role: s.role,
            name: s.name,
            signedAt: s.signedAt,
            url: await ctx.storage.getUrl(s.signatureStorageId),
          })),
        ),
        attachments: await resolveAttachments(ctx, r.attachmentStorageIds),
      });
    }
    return out;
  },
});
