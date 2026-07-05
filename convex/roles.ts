import { v, ConvexError } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { hrmsRole, HrmsRole } from "./lib/enums";
import { requirePermission } from "./auth";
import { writeAuditLog } from "./lib/audit";
import { ROLE_PRESETS, sanitizePermissions } from "./lib/permissions";

/**
 * Data-driven roles. Every org's `roles` table is seeded from ROLE_PRESETS; the
 * preset rows carry a `key` tying them back to the legacy HrmsRole enum so
 * legacy members resolve to the right role before they're explicitly assigned
 * one. Custom roles have no `key` and `isPreset: false`.
 *
 * Public CRUD + assignment (Phase 3) lives alongside this seeding helper.
 */

// Seed the preset roles for an org when missing. Idempotent — only inserts the
// presets that don't already exist. Returns a key → role id map for the presets.
export async function ensureRolesSeeded(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
): Promise<Record<HrmsRole, Id<"roles">>> {
  const existing = await ctx.db
    .query("roles")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  const byKey = new Map<HrmsRole, Id<"roles">>();
  const presetDocByKey = new Map<HrmsRole, (typeof existing)[number]>();
  for (const r of existing) {
    if (r.isPreset && r.key) {
      byKey.set(r.key, r._id);
      presetDocByKey.set(r.key, r);
    }
  }
  const keys = Object.keys(ROLE_PRESETS) as HrmsRole[];
  let order = existing.length;
  for (const key of keys) {
    const preset = ROLE_PRESETS[key];
    const doc = presetDocByKey.get(key);
    if (doc) {
      // Presets are code-authoritative: keep the stored doc's permissions in
      // sync with ROLE_PRESETS so the roles UI reflects the current definition.
      const want = [...preset.permissions];
      const drift =
        doc.permissions.length !== want.length ||
        want.some((p) => !doc.permissions.includes(p));
      if (drift) await ctx.db.patch(doc._id, { permissions: want });
      continue;
    }
    const id = await ctx.db.insert("roles", {
      orgId,
      name: preset.label,
      description: preset.description,
      key,
      isPreset: true,
      permissions: [...preset.permissions],
      order: order++,
    });
    byKey.set(key, id);
  }
  return Object.fromEntries(
    keys.map((k) => [k, byKey.get(k)!]),
  ) as Record<HrmsRole, Id<"roles">>;
}

// The row shape returned to the roles UI: the stored role plus a live count of
// how many members currently hold it.
const roleRow = v.object({
  _id: v.id("roles"),
  name: v.string(),
  description: v.union(v.string(), v.null()),
  key: v.union(v.string(), v.null()),
  isPreset: v.boolean(),
  permissions: v.array(v.string()),
  order: v.number(),
  assignedCount: v.number(),
});

// Count members holding a role. A member holds `role` when their `roleId`
// points at it, or — for a preset role — when they have no `roleId` yet and
// their legacy `role` enum matches the preset's `key`.
function countHolders(
  members: { roleId?: Id<"roles">; role: HrmsRole; status: string }[],
  role: { _id: Id<"roles">; isPreset: boolean; key?: HrmsRole },
): number {
  return members.filter((m) => {
    if (m.status === "removed") return false;
    if (m.roleId) return m.roleId === role._id;
    return role.isPreset && role.key === m.role;
  }).length;
}

// ─── Queries ───────────────────────────────────────────────────────────────

// Ensure presets exist, then list every role with its live assignment count.
export const list = query({
  args: {},
  returns: v.array(roleRow),
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "roles:manage");
    const roles = await ctx.db
      .query("roles")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const members = await ctx.db
      .query("members")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    return roles
      .sort((a, b) => a.order - b.order)
      .map((r) => ({
        _id: r._id,
        name: r.name,
        description: r.description ?? null,
        key: r.key ?? null,
        isPreset: r.isPreset,
        permissions: r.permissions,
        order: r.order,
        assignedCount: countHolders(members, r),
      }));
  },
});

// Minimal role list for the member-assignment dropdown. Available to anyone who
// can manage members (a lighter gate than the full roles editor); seeds presets
// on read via a best-effort — callers that can't write simply see what exists.
export const assignable = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("roles"),
      name: v.string(),
      key: v.union(v.string(), v.null()),
      isPreset: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "members:manage");
    const roles = await ctx.db
      .query("roles")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    return roles
      .sort((a, b) => a.order - b.order)
      .map((r) => ({
        _id: r._id,
        name: r.name,
        key: r.key ?? null,
        isPreset: r.isPreset,
      }));
  },
});

// ─── Mutations ─────────────────────────────────────────────────────────────

// Seed the preset roles for the caller's org. Idempotent; safe to call on load.
export const ensureSeeded = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "roles:manage");
    await ensureRolesSeeded(ctx, orgId);
    return null;
  },
});

// Create a custom role with an explicit permission set.
export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    permissions: v.array(v.string()),
  },
  returns: v.id("roles"),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(ctx, "roles:manage");
    const name = args.name.trim();
    if (!name) throw new ConvexError("Role name is required.");
    const existing = await ctx.db
      .query("roles")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    if (existing.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
      throw new ConvexError("A role with that name already exists.");
    }
    const order = existing.reduce((m, r) => Math.max(m, r.order), -1) + 1;
    const id = await ctx.db.insert("roles", {
      orgId,
      name,
      description: args.description?.trim() || undefined,
      isPreset: false,
      permissions: sanitizePermissions(args.permissions),
      order,
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "role.create",
      entity: "roles",
      entityId: id,
      after: { name, permissions: sanitizePermissions(args.permissions) },
    });
    return id;
  },
});

// Update a custom role's name/description/permissions. Preset roles are locked
// to their built-in permission sets — customization happens via custom roles.
export const update = mutation({
  args: {
    roleId: v.id("roles"),
    name: v.string(),
    description: v.optional(v.string()),
    permissions: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(ctx, "roles:manage");
    const role = await ctx.db.get(args.roleId);
    if (!role || role.orgId !== orgId) throw new ConvexError("Role not found.");
    if (role.isPreset) {
      throw new ConvexError(
        "Preset roles can't be modified. Create a custom role instead.",
      );
    }
    const name = args.name.trim();
    if (!name) throw new ConvexError("Role name is required.");
    const others = await ctx.db
      .query("roles")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    if (
      others.some(
        (r) => r._id !== role._id && r.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      throw new ConvexError("A role with that name already exists.");
    }
    const before = { name: role.name, permissions: role.permissions };
    await ctx.db.patch(args.roleId, {
      name,
      description: args.description?.trim() || undefined,
      permissions: sanitizePermissions(args.permissions),
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "role.update",
      entity: "roles",
      entityId: args.roleId,
      before,
      after: { name, permissions: sanitizePermissions(args.permissions) },
    });
    return null;
  },
});

// Assign a preset role (by its key) to a member — used by the claim-assignee
// guardrail to promote someone to HR/Finance in one click. Seeds presets first
// so the target role always exists. Requires member management rights.
export const assignPreset = mutation({
  args: { memberId: v.id("members"), key: hrmsRole },
  returns: v.null(),
  handler: async (ctx, { memberId, key }) => {
    const { orgId, userId } = await requirePermission(ctx, "members:manage");
    const member = await ctx.db.get(memberId);
    if (!member || member.orgId !== orgId) {
      throw new ConvexError("Member not found in this organization.");
    }
    const presets = await ensureRolesSeeded(ctx, orgId);
    const roleId = presets[key];
    if (member.roleId === roleId) return null;
    await ctx.db.patch(memberId, { roleId, role: key });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "member.role.assign_preset",
      entity: "members",
      entityId: memberId,
      after: { roleId, key },
    });
    return null;
  },
});

// Delete a custom role. Presets can't be deleted, and a role can't be deleted
// while any member still holds it — the caller is told who to reassign first.
export const remove = mutation({
  args: { roleId: v.id("roles") },
  returns: v.null(),
  handler: async (ctx, { roleId }) => {
    const { orgId, userId } = await requirePermission(ctx, "roles:manage");
    const role = await ctx.db.get(roleId);
    if (!role || role.orgId !== orgId) throw new ConvexError("Role not found.");
    if (role.isPreset) {
      throw new ConvexError("Preset roles can't be deleted.");
    }
    const holders = await ctx.db
      .query("members")
      .withIndex("by_role", (q) => q.eq("roleId", roleId))
      .collect();
    const active = holders.filter((m) => m.status !== "removed");
    if (active.length > 0) {
      const names: string[] = [];
      for (const m of active.slice(0, 5)) {
        const u = await ctx.db.get(m.userId);
        names.push(u?.name?.trim() || u?.username || u?.email || "a member");
      }
      const more = active.length > names.length ? ` and ${active.length - names.length} more` : "";
      throw new ConvexError(
        `This role is still assigned to ${names.join(", ")}${more}. Reassign them before deleting it.`,
      );
    }
    await ctx.db.delete(roleId);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "role.delete",
      entity: "roles",
      entityId: roleId,
      before: { name: role.name },
    });
    return null;
  },
});
