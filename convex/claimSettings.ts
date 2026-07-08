import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requirePermission, resolveMemberPermissions } from "./auth";
import { ROLE_PRESETS } from "./lib/permissions";
import {
  claimApprovalFlow,
  claimAssigneeGroup,
  claimPayrollMode,
  CLAIM_GROUP_HR,
  CLAIM_GROUP_FINANCE,
} from "./lib/enums";
import { claimSettingsValue, claimSettingsOptions } from "./lib/validators";
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

// Sensible defaults applied when an org hasn't configured claim settings yet.
const DEFAULTS = {
  cutoffDay: 1,
  transactionValidityMonths: null as number | null,
  hrApproverUserIds: [] as Id<"users">[],
  financeApproverUserIds: [] as Id<"users">[],
  assigneeGroups: [] as { id: string; name: string; userIds: Id<"users">[] }[],
  approvalWorkflow: DEFAULT_WORKFLOW,
  approvalFlows: [DEFAULT_FLOW],
  maxGroupsPerPeriod: null as number | null,
  payrollMode: "manual" as const,
  payrollItem: null as string | null,
};

export type ResolvedClaimSettings = Omit<
  Doc<"claimSettings">,
  | "_id"
  | "_creationTime"
  | "orgId"
  | "transactionValidityMonths"
  | "payrollItem"
  | "assigneeGroups"
  | "approvalFlows"
  | "maxGroupsPerPeriod"
> & {
  transactionValidityMonths: number | null;
  payrollItem: string | null;
  assigneeGroups: { id: string; name: string; userIds: Id<"users">[] }[];
  approvalFlows: NonNullable<Doc<"claimSettings">["approvalFlows"]>;
  maxGroupsPerPeriod: number | null;
};

// Load an org's claim settings, falling back to defaults. Shared with the
// claims engine (approval chain resolution + payroll routing).
export async function resolveClaimSettings(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
): Promise<ResolvedClaimSettings> {
  const row = await ctx.db
    .query("claimSettings")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .unique();
  if (!row) return DEFAULTS;
  // Orgs configured before flows existed fall back to a single default flow
  // synthesized from the legacy `approvalWorkflow`.
  const approvalFlows = row.approvalFlows ?? [
    {
      id: "default",
      name: "Default",
      match: { type: "default" as const },
      workflow: row.approvalWorkflow,
    },
  ];
  return {
    cutoffDay: row.cutoffDay,
    transactionValidityMonths: row.transactionValidityMonths ?? null,
    hrApproverUserIds: row.hrApproverUserIds,
    financeApproverUserIds: row.financeApproverUserIds,
    assigneeGroups: row.assigneeGroups ?? [],
    approvalWorkflow: row.approvalWorkflow,
    approvalFlows,
    maxGroupsPerPeriod: row.maxGroupsPerPeriod ?? null,
    payrollMode: row.payrollMode,
    payrollItem: row.payrollItem ?? null,
  };
}

export const get = query({
  args: {},
  returns: claimSettingsValue,
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "claims:approve:finance");
    return await resolveClaimSettings(ctx, orgId);
  },
});

// Members (for assignee/approver pickers) + offices (for threshold rules).
export const options = query({
  args: {},
  returns: claimSettingsOptions,
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "claims:approve:finance");
    const members = await ctx.db
      .query("members")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const active = members.filter((m) => m.status === "active");
    const resolved = await Promise.all(
      active.map(async (m) => {
        const user = await ctx.db.get(m.userId);
        // Username-only accounts have no first/last name; fall back to their
        // username (then email) so they're selectable with a readable label.
        const name =
          user?.name?.trim() || user?.username || user?.email || "Unknown";
        // Role/permission context for the assignee guardrail.
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
          hasFinanceAccess: perms.has("claims:approve:finance"),
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
    cutoffDay: v.number(),
    transactionValidityMonths: v.union(v.number(), v.null()),
    hrApproverUserIds: v.array(v.id("users")),
    financeApproverUserIds: v.array(v.id("users")),
    assigneeGroups: v.array(claimAssigneeGroup),
    approvalFlows: v.array(claimApprovalFlow),
    payrollMode: claimPayrollMode,
    payrollItem: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(
      ctx,
      "claims:approve:finance",
    );
    if (args.cutoffDay < 1 || args.cutoffDay > 31) {
      throw new Error("Cut-off day must be between 1 and 31.");
    }

    // Custom groups must be named and uniquely identified, and can't collide
    // with the reserved built-in ids.
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

    // Exactly one "default" flow, each flow named, its steps valid, and each
    // role/person matcher targeting a distinct role/person.
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
        // New saves carry `userIds`; tolerate the legacy single `userId`.
        const people =
          flow.match.userIds && flow.match.userIds.length > 0
            ? flow.match.userIds
            : flow.match.userId
              ? [flow.match.userId]
              : [];
        if (people.length === 0) {
          throw new Error("Pick at least one person for each specific-person flow.");
        }
        for (const userId of people) {
          if (matchedPeople.has(userId)) {
            throw new Error("Two flows can't target the same person.");
          }
          matchedPeople.add(userId);
        }
      }
      // Every workflow step targeting a group must reference an existing one.
      for (const step of flow.workflow) {
        if (step.approverType !== "group") continue;
        const known =
          step.value === CLAIM_GROUP_HR ||
          step.value === CLAIM_GROUP_FINANCE ||
          groupIds.has(step.value);
        if (!known) throw new Error("Approval step references an unknown group.");
      }
    }
    // The legacy `approvalWorkflow` field stays mirrored to the default flow's
    // steps so anything still reading it keeps working.
    const defaultWorkflow = defaultFlows[0].workflow;

    const patch = {
      cutoffDay: args.cutoffDay,
      transactionValidityMonths: args.transactionValidityMonths ?? undefined,
      hrApproverUserIds: args.hrApproverUserIds,
      financeApproverUserIds: args.financeApproverUserIds,
      assigneeGroups: args.assigneeGroups.map((g) => ({
        id: g.id,
        name: g.name.trim(),
        userIds: g.userIds,
      })),
      approvalWorkflow: defaultWorkflow,
      approvalFlows: args.approvalFlows.map((f) => ({
        ...f,
        name: f.name.trim(),
      })),
      payrollMode: args.payrollMode,
      payrollItem: args.payrollItem ?? undefined,
    };

    const existing = await ctx.db
      .query("claimSettings")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("claimSettings", { orgId, ...patch });
    }
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "claimSettings.save",
      entity: "claimSettings",
      entityId: existing?._id,
    });
    return null;
  },
});

// Claim-group settings live on their own tab. This targeted mutation owns the
// per-period submission cap so it can be saved independently of the general
// settings form (which no longer touches this field). `null` = no limit.
export const setMaxGroupsPerPeriod = mutation({
  args: { maxGroupsPerPeriod: v.union(v.number(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { maxGroupsPerPeriod }) => {
    const { orgId, userId } = await requirePermission(
      ctx,
      "claims:approve:finance",
    );
    if (maxGroupsPerPeriod !== null && maxGroupsPerPeriod < 1) {
      throw new Error("Max claim submissions per period must be at least 1.");
    }
    const existing = await ctx.db
      .query("claimSettings")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        maxGroupsPerPeriod: maxGroupsPerPeriod ?? undefined,
      });
    } else {
      // Seed a fresh settings row from defaults, carrying this one override.
      await ctx.db.insert("claimSettings", {
        orgId,
        cutoffDay: DEFAULTS.cutoffDay,
        hrApproverUserIds: DEFAULTS.hrApproverUserIds,
        financeApproverUserIds: DEFAULTS.financeApproverUserIds,
        approvalWorkflow: DEFAULTS.approvalWorkflow,
        approvalFlows: DEFAULTS.approvalFlows,
        payrollMode: DEFAULTS.payrollMode,
        maxGroupsPerPeriod: maxGroupsPerPeriod ?? undefined,
      });
    }
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "claimSettings.setMaxGroupsPerPeriod",
      entity: "claimSettings",
      entityId: existing?._id,
    });
    return null;
  },
});
