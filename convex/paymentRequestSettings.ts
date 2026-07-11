import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requirePermission, resolveMemberPermissions } from "./auth";
import { ROLE_PRESETS } from "./lib/permissions";
import {
  claimApprovalFlow,
  claimAssigneeGroup,
  CLAIM_GROUP_HR,
  CLAIM_GROUP_FINANCE,
} from "./lib/enums";
import {
  paymentRequestSettingsValue,
  claimSettingsOptions,
} from "./lib/validators";
import { writeAuditLog } from "./lib/audit";

// The out-of-the-box approval chain: a single manager step.
const DEFAULT_WORKFLOW = [
  {
    approverType: "position" as const,
    value: "manager",
    thresholdEnabled: false,
    rules: [],
  },
];

// The out-of-the-box "everyone else" flow, wrapping the default workflow.
const DEFAULT_FLOW = {
  id: "default",
  name: "Default",
  match: { type: "default" as const },
  workflow: DEFAULT_WORKFLOW,
};

// Applied when an org hasn't configured payment-request settings yet.
const DEFAULTS = {
  hrApproverUserIds: [] as Id<"users">[],
  financeApproverUserIds: [] as Id<"users">[],
  financeRequiresSignature: false,
  assigneeGroups: [] as { id: string; name: string; userIds: Id<"users">[] }[],
  approvalWorkflow: DEFAULT_WORKFLOW,
  approvalFlows: [DEFAULT_FLOW],
  defaultTemplateId: null as Id<"paymentRequestTemplates"> | null,
};

export type ResolvedPaymentRequestSettings = {
  hrApproverUserIds: Id<"users">[];
  financeApproverUserIds: Id<"users">[];
  financeRequiresSignature: boolean;
  assigneeGroups: { id: string; name: string; userIds: Id<"users">[] }[];
  approvalWorkflow: Doc<"paymentRequestSettings">["approvalWorkflow"];
  approvalFlows: NonNullable<Doc<"paymentRequestSettings">["approvalFlows"]>;
  defaultTemplateId: Id<"paymentRequestTemplates"> | null;
};

// Load an org's payment-request settings, falling back to defaults. Shared with
// the engine (approval-chain resolution). Mirrors `resolveClaimSettings`.
export async function resolvePaymentRequestSettings(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
): Promise<ResolvedPaymentRequestSettings> {
  const row = await ctx.db
    .query("paymentRequestSettings")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .unique();
  if (!row) return DEFAULTS;
  const approvalFlows = row.approvalFlows ?? [
    {
      id: "default",
      name: "Default",
      match: { type: "default" as const },
      workflow: row.approvalWorkflow,
    },
  ];
  return {
    hrApproverUserIds: row.hrApproverUserIds,
    financeApproverUserIds: row.financeApproverUserIds,
    financeRequiresSignature: row.financeRequiresSignature ?? false,
    assigneeGroups: row.assigneeGroups ?? [],
    approvalWorkflow: row.approvalWorkflow,
    approvalFlows,
    defaultTemplateId: row.defaultTemplateId ?? null,
  };
}

export const get = query({
  args: {},
  returns: paymentRequestSettingsValue,
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "payment_requests:read:all");
    return await resolvePaymentRequestSettings(ctx, orgId);
  },
});

// Members (for assignee/approver pickers) + offices (for threshold rules) +
// roles (for the per-flow role matcher). Same shape as claimSettings.options.
export const options = query({
  args: {},
  returns: claimSettingsOptions,
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "payment_requests:read:all");
    const members = await ctx.db
      .query("members")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const active = members.filter((m) => m.status === "active");
    const resolved = await Promise.all(
      active.map(async (m) => {
        const user = await ctx.db.get(m.userId);
        const name =
          user?.name?.trim() || user?.username || user?.email || "Unknown";
        const roleDoc = m.roleId ? await ctx.db.get(m.roleId) : null;
        const isCustomRole = !!roleDoc && !roleDoc.isPreset;
        const roleName = roleDoc?.name ?? ROLE_PRESETS[m.role].label;
        const perms = await resolveMemberPermissions(ctx, m);
        return {
          userId: m.userId,
          memberId: m._id,
          name,
          role: m.role,
          roleName,
          isCustomRole,
          hasFinanceAccess: perms.has("payment_requests:read:all"),
        };
      }),
    );
    resolved.sort((a, b) => a.name.localeCompare(b.name));
    const offices = await ctx.db
      .query("offices")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const roles = await ctx.db
      .query("roles")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    roles.sort((a, b) => a.order - b.order);
    return {
      members: resolved,
      offices: offices.map((o) => ({ _id: o._id, name: o.name })),
      roles: roles.map((r) => ({ _id: r._id, name: r.name })),
    };
  },
});

export const save = mutation({
  args: {
    hrApproverUserIds: v.array(v.id("users")),
    financeApproverUserIds: v.array(v.id("users")),
    financeRequiresSignature: v.optional(v.boolean()),
    assigneeGroups: v.array(claimAssigneeGroup),
    approvalFlows: v.array(claimApprovalFlow),
    defaultTemplateId: v.union(v.id("paymentRequestTemplates"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(
      ctx,
      "payment_requests:read:all",
    );

    // Custom groups must be named + uniquely identified, no reserved-id clash.
    const groupIds = new Set<string>();
    for (const g of args.assigneeGroups) {
      const name = g.name.trim();
      if (!name) throw new Error("Every assignee group needs a name.");
      if (g.id === CLAIM_GROUP_HR || g.id === CLAIM_GROUP_FINANCE) {
        throw new Error("Group id is reserved.");
      }
      if (groupIds.has(g.id)) throw new Error("Duplicate assignee group.");
      groupIds.add(g.id);
    }

    // Exactly one default flow; each flow named, non-empty, distinct matchers.
    const defaultFlows = args.approvalFlows.filter(
      (f) => f.match.type === "default",
    );
    if (defaultFlows.length !== 1) {
      throw new Error("There must be exactly one default flow.");
    }
    const matchedRoles = new Set<string>();
    const matchedPeople = new Set<string>();
    for (const flow of args.approvalFlows) {
      if (!flow.name.trim()) throw new Error("Every flow needs a name.");
      if (flow.workflow.length === 0) {
        throw new Error(`Flow "${flow.name}" needs at least one approver.`);
      }
      if (flow.match.type === "role") {
        if (!flow.match.roleId) throw new Error("Pick a role for each role flow.");
        if (matchedRoles.has(flow.match.roleId)) {
          throw new Error("Two flows can't target the same role.");
        }
        matchedRoles.add(flow.match.roleId);
      } else if (flow.match.type === "person") {
        const people =
          flow.match.userIds && flow.match.userIds.length > 0
            ? flow.match.userIds
            : flow.match.userId
              ? [flow.match.userId]
              : [];
        if (people.length === 0) {
          throw new Error("Pick at least one person for each specific-person flow.");
        }
        for (const uid of people) {
          if (matchedPeople.has(uid)) {
            throw new Error("Two flows can't target the same person.");
          }
          matchedPeople.add(uid);
        }
      }
      for (const step of flow.workflow) {
        if (step.approverType !== "group") continue;
        const known =
          step.value === CLAIM_GROUP_HR ||
          step.value === CLAIM_GROUP_FINANCE ||
          groupIds.has(step.value);
        if (!known) throw new Error("Approval step references an unknown group.");
      }
    }
    const defaultWorkflow = defaultFlows[0].workflow;

    const patch = {
      hrApproverUserIds: args.hrApproverUserIds,
      financeApproverUserIds: args.financeApproverUserIds,
      financeRequiresSignature: args.financeRequiresSignature ?? false,
      assigneeGroups: args.assigneeGroups.map((g) => ({
        id: g.id,
        name: g.name.trim(),
        userIds: g.userIds,
      })),
      approvalWorkflow: defaultWorkflow,
      approvalFlows: args.approvalFlows.map((f) => ({ ...f, name: f.name.trim() })),
      defaultTemplateId: args.defaultTemplateId ?? undefined,
    };

    const existing = await ctx.db
      .query("paymentRequestSettings")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("paymentRequestSettings", { orgId, ...patch });
    }
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "paymentRequestSettings.save",
      entity: "paymentRequestSettings",
      entityId: existing?._id,
    });
    return null;
  },
});
