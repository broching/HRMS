import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import {
  policyAvailability,
  approverMode,
  entitlementMode,
  accrualType,
  prorateMode,
  seniorityEffective,
  incrementMode,
  roundingMode,
  seniorityRule,
  leaveApproverStep,
} from "./lib/enums";
import { requireOrg, requirePermission } from "./auth";
import {
  leavePolicyDoc,
  leaveTypeWithPolicies,
  leavePolicyAssignmentRow,
} from "./lib/validators";
import { writeAuditLog } from "./lib/audit";
import { defaultLeavePolicyFields } from "./lib/sgDefaults";

/**
 * Leave-policy configuration. A leave type owns several policies (one per
 * employee group); the `isDefault` / `availability: "all"` policy applies to
 * everyone not covered by an explicit assignment. `resolvePolicyForEmployee`
 * is the single source of truth for "which policy governs this person's leave"
 * and is reused by leaveBalances + leaveRequests.
 */

// ─── Policy resolution (shared helper) ─────────────────────────────────────

export async function resolvePolicyForEmployee(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  leaveTypeId: Id<"leaveTypes">,
  employeeId: Id<"employees">,
): Promise<Doc<"leavePolicies"> | null> {
  const assignment = await ctx.db
    .query("leavePolicyAssignments")
    .withIndex("by_org_type_employee", (q) =>
      q.eq("orgId", orgId).eq("leaveTypeId", leaveTypeId).eq("employeeId", employeeId),
    )
    .first();
  if (assignment) {
    const policy = await ctx.db.get(assignment.policyId);
    if (policy) return policy;
  }
  // Fall back to the type's default policy.
  const policies = await ctx.db
    .query("leavePolicies")
    .withIndex("by_org_type", (q) =>
      q.eq("orgId", orgId).eq("leaveTypeId", leaveTypeId),
    )
    .collect();
  return policies.find((p) => p.isDefault) ?? policies[0] ?? null;
}

// ─── Queries ───────────────────────────────────────────────────────────────

// Leave types with their policy counts, for the Leave Policies list (#28).
export const typesWithCounts = query({
  args: {},
  returns: v.array(leaveTypeWithPolicies),
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "leave:config");
    const [types, policies] = await Promise.all([
      ctx.db.query("leaveTypes").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
      ctx.db.query("leavePolicies").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
    ]);
    const counts = new Map<string, number>();
    for (const p of policies) {
      counts.set(p.leaveTypeId, (counts.get(p.leaveTypeId) ?? 0) + 1);
    }
    return types
      .filter((t) => t.active)
      .map((t) => ({ ...t, policyCount: counts.get(t._id) ?? 0 }));
  },
});

export const listForType = query({
  args: { leaveTypeId: v.id("leaveTypes") },
  returns: v.array(leavePolicyDoc),
  handler: async (ctx, { leaveTypeId }) => {
    const { orgId } = await requirePermission(ctx, "leave:config");
    const policies = await ctx.db
      .query("leavePolicies")
      .withIndex("by_org_type", (q) =>
        q.eq("orgId", orgId).eq("leaveTypeId", leaveTypeId),
      )
      .collect();
    return policies.sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return (a.order ?? 0) - (b.order ?? 0) || a._creationTime - b._creationTime;
    });
  },
});

export const get = query({
  args: { policyId: v.id("leavePolicies") },
  returns: v.union(leavePolicyDoc, v.null()),
  handler: async (ctx, { policyId }) => {
    const { orgId } = await requirePermission(ctx, "leave:config");
    const policy = await ctx.db.get(policyId);
    if (!policy || policy.orgId !== orgId) return null;
    return policy;
  },
});

// Group-policy assignments for a leave type (Assign Policy dialog state).
export const assignmentsForType = query({
  args: { leaveTypeId: v.id("leaveTypes") },
  returns: v.array(leavePolicyAssignmentRow),
  handler: async (ctx, { leaveTypeId }) => {
    const { orgId } = await requirePermission(ctx, "leave:config");
    const rows = await ctx.db
      .query("leavePolicyAssignments")
      .withIndex("by_org_type_employee", (q) =>
        q.eq("orgId", orgId).eq("leaveTypeId", leaveTypeId),
      )
      .collect();
    return await Promise.all(
      rows.map(async (r) => {
        const emp = await ctx.db.get(r.employeeId);
        return {
          _id: r._id,
          employeeId: r.employeeId,
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
          policyId: r.policyId,
        };
      }),
    );
  },
});

// Members (for the "specific person(s)" picker) + roles (for the "role" picker)
// used by the leave approval-chain editor.
export const approverOptions = query({
  args: {},
  returns: v.object({
    members: v.array(v.object({ userId: v.id("users"), name: v.string() })),
    roles: v.array(v.object({ _id: v.id("roles"), name: v.string() })),
  }),
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "leave:config");
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
        return { userId: m.userId, name };
      }),
    );
    resolved.sort((a, b) => a.name.localeCompare(b.name));
    const roles = await ctx.db
      .query("roles")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    roles.sort((a, b) => a.order - b.order);
    return {
      members: resolved,
      roles: roles.map((r) => ({ _id: r._id, name: r.name })),
    };
  },
});

// ─── Mutations ───────────────────────────────────────────────────────────────

// Patch arguments — every configurable field is optional so the editor can
// save the whole form (or a single section) with one call.
const policyPatchArgs = {
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  availability: v.optional(policyAvailability),
  order: v.optional(v.number()),
  approvalChain: v.optional(v.array(leaveApproverStep)),
  firstApproverMode: v.optional(approverMode),
  firstApproverValue: v.optional(v.string()),
  secondApproverMode: v.optional(approverMode),
  secondApproverValue: v.optional(v.string()),
  entitlementMode: v.optional(entitlementMode),
  entitlementDays: v.optional(v.number()),
  toleranceDays: v.optional(v.number()),
  earnedEnabled: v.optional(v.boolean()),
  accrualType: v.optional(accrualType),
  proratedEnabled: v.optional(v.boolean()),
  prorateMode: v.optional(prorateMode),
  prorateRounding: v.optional(roundingMode),
  carryForwardEnabled: v.optional(v.boolean()),
  maxCarryForwardDays: v.optional(v.number()),
  carryForwardExpiry: v.optional(v.string()),
  seniorityEnabled: v.optional(v.boolean()),
  seniorityEffective: v.optional(seniorityEffective),
  seniorityIncrementMode: v.optional(incrementMode),
  seniorityRules: v.optional(v.array(seniorityRule)),
  seniorityMaxDays: v.optional(v.number()),
  seniorityFirstYearMinMonths: v.optional(v.number()),
  rounding: v.optional(roundingMode),
  linkedLeaveTypeId: v.optional(v.id("leaveTypes")),
  useWorkingDays: v.optional(v.boolean()),
  allowApplyInPast: v.optional(v.boolean()),
  minAdvanceDays: v.optional(v.number()),
  maxAdvanceDays: v.optional(v.number()),
  maxConsecutiveDays: v.optional(v.number()),
};

// Create a new (non-default) group policy with sensible blanks; the editor
// then fills it in via `update`.
export const create = mutation({
  args: {
    leaveTypeId: v.id("leaveTypes"),
    name: v.string(),
  },
  returns: v.id("leavePolicies"),
  handler: async (ctx, { leaveTypeId, name }) => {
    const { orgId, userId } = await requirePermission(ctx, "leave:config");
    const leaveType = await ctx.db.get(leaveTypeId);
    if (!leaveType || leaveType.orgId !== orgId) {
      throw new Error("Leave type not found.");
    }
    const id = await ctx.db.insert("leavePolicies", {
      orgId,
      leaveTypeId,
      name,
      availability: "groups",
      isDefault: false,
      approvalChain: [
        { approverType: "position", value: "manager", thresholdEnabled: false },
      ],
      firstApproverMode: "manager",
      secondApproverMode: "none",
      entitlementMode: "fixed",
      entitlementDays: leaveType.defaultEntitlementDays,
      earnedEnabled: false,
      proratedEnabled: false,
      carryForwardEnabled: false,
      seniorityEnabled: false,
      rounding: "none",
      useWorkingDays: true,
      allowApplyInPast: false,
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "leavePolicy.create",
      entity: "leavePolicies",
      entityId: id,
      after: { name },
    });
    return id;
  },
});

export const update = mutation({
  args: { policyId: v.id("leavePolicies"), ...policyPatchArgs },
  returns: v.null(),
  handler: async (ctx, { policyId, ...patch }) => {
    const { orgId, userId } = await requirePermission(ctx, "leave:config");
    const policy = await ctx.db.get(policyId);
    if (!policy || policy.orgId !== orgId) throw new Error("Policy not found.");
    await ctx.db.patch(policyId, patch);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "leavePolicy.update",
      entity: "leavePolicies",
      entityId: policyId,
    });
    return null;
  },
});

export const remove = mutation({
  args: { policyId: v.id("leavePolicies") },
  returns: v.null(),
  handler: async (ctx, { policyId }) => {
    const { orgId, userId } = await requirePermission(ctx, "leave:config");
    const policy = await ctx.db.get(policyId);
    if (!policy || policy.orgId !== orgId) throw new Error("Policy not found.");
    if (policy.isDefault) {
      throw new Error("The default policy cannot be deleted.");
    }
    // Drop assignments pointing at this policy.
    const assignments = await ctx.db
      .query("leavePolicyAssignments")
      .withIndex("by_policy", (q) => q.eq("policyId", policyId))
      .collect();
    for (const a of assignments) await ctx.db.delete(a._id);
    await ctx.db.delete(policyId);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "leavePolicy.remove",
      entity: "leavePolicies",
      entityId: policyId,
    });
    return null;
  },
});

// Assign a policy to an employee for a leave type (replaces any existing
// assignment). Assigning the default policy clears the override instead.
export const assign = mutation({
  args: {
    leaveTypeId: v.id("leaveTypes"),
    policyId: v.id("leavePolicies"),
    employeeIds: v.array(v.id("employees")),
  },
  returns: v.null(),
  handler: async (ctx, { leaveTypeId, policyId, employeeIds }) => {
    const { orgId, userId } = await requirePermission(ctx, "leave:config");
    const policy = await ctx.db.get(policyId);
    if (!policy || policy.orgId !== orgId || policy.leaveTypeId !== leaveTypeId) {
      throw new Error("Policy not found.");
    }
    for (const employeeId of employeeIds) {
      const existing = await ctx.db
        .query("leavePolicyAssignments")
        .withIndex("by_org_type_employee", (q) =>
          q.eq("orgId", orgId).eq("leaveTypeId", leaveTypeId).eq("employeeId", employeeId),
        )
        .first();
      if (policy.isDefault) {
        if (existing) await ctx.db.delete(existing._id);
        continue;
      }
      if (existing) {
        await ctx.db.patch(existing._id, { policyId });
      } else {
        await ctx.db.insert("leavePolicyAssignments", {
          orgId,
          leaveTypeId,
          policyId,
          employeeId,
        });
      }
    }
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "leavePolicy.assign",
      entity: "leavePolicies",
      entityId: policyId,
      after: { count: employeeIds.length },
    });
    return null;
  },
});

export const unassign = mutation({
  args: { assignmentId: v.id("leavePolicyAssignments") },
  returns: v.null(),
  handler: async (ctx, { assignmentId }) => {
    const { orgId } = await requirePermission(ctx, "leave:config");
    const row = await ctx.db.get(assignmentId);
    if (!row || row.orgId !== orgId) throw new Error("Assignment not found.");
    await ctx.db.delete(assignmentId);
    return null;
  },
});

// Backfill a default policy for any leave type that lacks one (pre-engine orgs).
export const seedDefaults = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "leave:config");
    const [types, policies] = await Promise.all([
      ctx.db.query("leaveTypes").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
      ctx.db.query("leavePolicies").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
    ]);
    const haveDefault = new Set(
      policies.filter((p) => p.isDefault).map((p) => p.leaveTypeId),
    );
    let created = 0;
    for (const t of types) {
      if (haveDefault.has(t._id)) continue;
      await ctx.db.insert("leavePolicies", {
        orgId,
        leaveTypeId: t._id,
        ...defaultLeavePolicyFields(t),
      });
      created++;
    }
    return created;
  },
});
