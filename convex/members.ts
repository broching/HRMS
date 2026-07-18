import {
  internalMutation,
  mutation,
  query,
  MutationCtx,
  QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { hrmsRole, HrmsRole } from "./lib/enums";
import { orgByClerkId } from "./organizations";
import { getOrgContext, requirePermission } from "./auth";
import { writeAuditLog } from "./lib/audit";

/**
 * Membership sync. Driven by Clerk `organizationMembership.*` webhooks.
 *
 * `members.role` is the authoritative HRMS role. It is seeded from the Clerk
 * org role on creation, but preserved across later webhooks so an in-app role
 * change (Settings → Members) is never clobbered. This keeps HR/Manager roles
 * available without depending on Clerk custom roles (a paid-plan feature).
 */

// Clerk default roles are "org:admin" / "org:member". Custom roles (paid) may
// also flow through; map the ones we recognize, default everything else to
// "employee".
export function mapClerkRole(clerkRole: string | undefined): HrmsRole {
  switch (clerkRole) {
    case "org:admin":
      return "admin";
    case "org:hr":
      return "hr";
    case "org:manager":
      return "manager";
    default:
      return "employee";
  }
}

// When a user joins the org, link them to the employee record HR pre-created
// for their invite. Matches on `employees.loginEmail` first, then on
// `employees.loginUsername` (people added by username rather than email).
// Returns the role the employee was invited with, so the membership can be
// seeded accordingly.
async function linkEmployeeOnJoin(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  userId: Id<"users">,
  userEmail: string | undefined,
): Promise<HrmsRole | undefined> {
  const user = await ctx.db.get(userId);
  const email = (userEmail ?? user?.email)?.toLowerCase();
  const username = user?.username?.toLowerCase();

  let employee = null;
  if (email) {
    employee = await ctx.db
      .query("employees")
      .withIndex("by_org_loginEmail", (q) =>
        q.eq("orgId", orgId).eq("loginEmail", email),
      )
      .first();
  }
  if (!employee && username) {
    employee = await ctx.db
      .query("employees")
      .withIndex("by_org_loginUsername", (q) =>
        q.eq("orgId", orgId).eq("loginUsername", username),
      )
      .first();
  }
  if (!employee) return undefined;
  if (!employee.userId) await ctx.db.patch(employee._id, { userId });
  return employee.invitedRole;
}

export async function memberByClerkId(ctx: QueryCtx, clerkMembershipId: string) {
  return await ctx.db
    .query("members")
    .withIndex("by_clerkMembershipId", (q) =>
      q.eq("clerkMembershipId", clerkMembershipId),
    )
    .unique();
}

export async function memberByOrgAndUser(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  userId: Id<"users">,
) {
  return await ctx.db
    .query("members")
    .withIndex("by_org_and_user", (q) =>
      q.eq("orgId", orgId).eq("userId", userId),
    )
    .unique();
}

// Ensure a user row exists for a Clerk user referenced by a membership.
// The dedicated user.* webhook fills in full details; this just avoids a
// missing-user race if the membership webhook arrives first.
async function ensureUser(
  ctx: MutationCtx,
  clerkUserId: string,
  name: string,
  email?: string,
  imageUrl?: string,
): Promise<Id<"users">> {
  const existing = await ctx.db
    .query("users")
    .withIndex("byExternalId", (q) => q.eq("externalId", clerkUserId))
    .unique();
  if (existing) return existing._id;
  return await ctx.db.insert("users", {
    externalId: clerkUserId,
    name,
    email,
    imageUrl,
  });
}

export const upsertFromClerk = internalMutation({
  args: {
    clerkMembershipId: v.string(),
    clerkOrgId: v.string(),
    clerkUserId: v.string(),
    userName: v.string(),
    userEmail: v.optional(v.string()),
    userImageUrl: v.optional(v.string()),
    clerkRole: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("invited")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const org = await orgByClerkId(ctx, args.clerkOrgId);
    if (org === null) {
      console.warn(
        `Can't sync membership; org not found for ${args.clerkOrgId}`,
      );
      return null;
    }

    const userId = await ensureUser(
      ctx,
      args.clerkUserId,
      args.userName,
      args.userEmail,
      args.userImageUrl,
    );

    const existing = await memberByClerkId(ctx, args.clerkMembershipId);
    if (existing) {
      // Preserve the in-app role; only sync membership lifecycle here.
      await ctx.db.patch(existing._id, { status: args.status });
      return null;
    }
    // Link any employee record pre-created for this invite email.
    const invitedRole = await linkEmployeeOnJoin(
      ctx,
      org._id,
      userId,
      args.userEmail,
    );

    // A membership may have been bootstrapped client-side (ensureSelf) with a
    // synthetic clerkMembershipId before this webhook arrived. Adopt the real
    // id onto that row rather than creating a duplicate.
    const byOrgUser = await memberByOrgAndUser(ctx, org._id, userId);
    if (byOrgUser) {
      await ctx.db.patch(byOrgUser._id, {
        clerkMembershipId: args.clerkMembershipId,
        status: args.status,
      });
      return null;
    }
    await ctx.db.insert("members", {
      orgId: org._id,
      userId,
      clerkMembershipId: args.clerkMembershipId,
      // Prefer the role HR assigned on the invite; otherwise map the Clerk role.
      role: invitedRole ?? mapClerkRole(args.clerkRole),
      status: args.status,
    });
    return null;
  },
});

export const deleteFromClerk = internalMutation({
  args: { clerkMembershipId: v.string() },
  returns: v.null(),
  handler: async (ctx, { clerkMembershipId }) => {
    const member = await memberByClerkId(ctx, clerkMembershipId);
    if (member === null) {
      console.warn(
        `Can't delete membership, none for Clerk ID: ${clerkMembershipId}`,
      );
      return null;
    }
    await ctx.db.delete(member._id);
    return null;
  },
});

// ─── Public API ────────────────────────────────────────────────────────────

// The client's primary "who am I" query: active org + HRMS role, or null
// during onboarding (signed in but no active org / membership yet).
export const current = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      memberId: v.id("members"),
      userId: v.id("users"),
      orgId: v.id("organizations"),
      orgName: v.string(),
      orgSlug: v.optional(v.string()),
      userName: v.string(),
      role: hrmsRole,
      // The assigned role document, when the member has been given one.
      roleId: v.union(v.id("roles"), v.null()),
      // Resolved effective permissions — the authoritative gate for client UI.
      permissions: v.array(v.string()),
      // Modules the org has enabled — gates self-service (non-permission) nav.
      enabledModules: v.array(v.string()),
    }),
  ),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return null;
    return {
      memberId: orgCtx.member._id,
      userId: orgCtx.userId,
      orgId: orgCtx.orgId,
      orgName: orgCtx.org.name,
      orgSlug: orgCtx.org.slug,
      userName: orgCtx.user.name,
      role: orgCtx.role,
      roleId: orgCtx.member.roleId ?? null,
      permissions: [...orgCtx.permissions],
      enabledModules: [...orgCtx.enabledModules],
    };
  },
});

// Self-provision the caller's membership from their Clerk JWT. Idempotent and
// safe to call on every app load — this makes membership resilient to webhook
// lag or missing organizationMembership.* event subscriptions. The real Clerk
// membership id is reconciled later by the webhook (see upsertFromClerk).
export const ensureSelf = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const identity = (await ctx.auth.getUserIdentity()) as
      | { subject: string; org_id?: string; org_role?: string }
      | null;
    if (!identity?.org_id) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("byExternalId", (q) => q.eq("externalId", identity.subject))
      .unique();
    if (!user) return null;

    const org = await orgByClerkId(ctx, identity.org_id);
    if (!org) return null;

    const existing = await memberByOrgAndUser(ctx, org._id, user._id);
    if (existing) {
      // Auto-activate a pending invite on first sign-in — but NEVER a member an
      // admin has deactivated (`removed`). Otherwise a deactivated person could
      // restore their own access just by reloading the app.
      if (existing.status === "invited") {
        await ctx.db.patch(existing._id, { status: "active" });
      }
      // Make sure a matching employee gets linked even if it was created
      // after the member row already existed.
      await linkEmployeeOnJoin(ctx, org._id, user._id, user.email);
      return null;
    }
    const invitedRole = await linkEmployeeOnJoin(
      ctx,
      org._id,
      user._id,
      user.email,
    );
    await ctx.db.insert("members", {
      orgId: org._id,
      userId: user._id,
      clerkMembershipId: `bootstrap:${org._id}:${user._id}`,
      role: invitedRole ?? mapClerkRole(identity.org_role),
      status: "active",
    });
    return null;
  },
});

// List members of the active org (Settings → Members). Requires members:manage.
export const list = query({
  args: {},
  returns: v.array(
    v.object({
      memberId: v.id("members"),
      userId: v.id("users"),
      name: v.string(),
      email: v.optional(v.string()),
      username: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
      role: hrmsRole,
      roleId: v.union(v.id("roles"), v.null()),
      status: v.union(
        v.literal("active"),
        v.literal("invited"),
        v.literal("removed"),
      ),
      employeeId: v.union(v.id("employees"), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "members:manage");
    const members = await ctx.db
      .query("members")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    return await Promise.all(
      members.map(async (m) => {
        const user = await ctx.db.get(m.userId);
        // Link to this member's employee profile, if one exists in the org.
        const employees = await ctx.db
          .query("employees")
          .withIndex("by_userId", (q) => q.eq("userId", m.userId))
          .collect();
        const employee = employees.find((e) => e.orgId === orgId) ?? null;
        return {
          memberId: m._id,
          userId: m.userId,
          // Username-only accounts have no first/last name — fall back so the
          // row isn't blank.
          name: user?.name?.trim() || user?.username || user?.email || "Unknown",
          email: user?.email,
          username: user?.username,
          imageUrl: user?.imageUrl,
          role: m.role,
          roleId: m.roleId ?? null,
          status: m.status,
          employeeId: employee?._id ?? null,
        };
      }),
    );
  },
});

// The membership + current role behind an employee profile, so HR/admin can
// change the person's role from their profile. Returns null when the employee
// isn't a linked org member yet (e.g. invite not accepted, or a vacant role).
export const roleForEmployee = query({
  args: { employeeId: v.id("employees") },
  returns: v.union(
    v.null(),
    v.object({ memberId: v.id("members"), role: hrmsRole }),
  ),
  handler: async (ctx, { employeeId }) => {
    const { orgId } = await requirePermission(ctx, "members:manage");
    const employee = await ctx.db.get(employeeId);
    if (!employee || employee.orgId !== orgId || !employee.userId) return null;
    const member = await memberByOrgAndUser(ctx, orgId, employee.userId);
    if (!member || member.status === "removed") return null;
    return { memberId: member._id, role: member.role };
  },
});

// Change a member's in-app HRMS role. Authoritative in Convex (does not touch
// Clerk), so HR/Manager roles work without Clerk custom-role support.
export const setRole = mutation({
  args: { memberId: v.id("members"), role: hrmsRole },
  returns: v.null(),
  handler: async (ctx, { memberId, role }) => {
    const { orgId, userId } = await requirePermission(ctx, "members:manage");
    const member = await ctx.db.get(memberId);
    if (!member || member.orgId !== orgId) {
      throw new Error("Member not found in this organization.");
    }
    const before = member.role;
    if (before === role) return null;
    await ctx.db.patch(memberId, { role });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "member.role.update",
      entity: "members",
      entityId: memberId,
      before: { role: before },
      after: { role },
    });
    return null;
  },
});

// Assign a data-driven role (from the `roles` table) to a member. This is the
// authoritative role assignment: the role's permissions become the member's
// effective permissions. When the role is a preset, the legacy `role` enum is
// kept in sync so fallbacks and Clerk mapping stay coherent.
export const setRoleId = mutation({
  args: { memberId: v.id("members"), roleId: v.id("roles") },
  returns: v.null(),
  handler: async (ctx, { memberId, roleId }) => {
    const { orgId, userId } = await requirePermission(ctx, "members:manage");
    const member = await ctx.db.get(memberId);
    if (!member || member.orgId !== orgId) {
      throw new Error("Member not found in this organization.");
    }
    const role = await ctx.db.get(roleId);
    if (!role || role.orgId !== orgId) {
      throw new Error("Role not found in this organization.");
    }
    if (member.roleId === roleId) return null;
    const before = { roleId: member.roleId ?? null, role: member.role };
    await ctx.db.patch(memberId, {
      roleId,
      // Keep the legacy enum aligned with preset roles; leave it untouched for
      // custom roles (which have no enum equivalent — roleId drives access).
      ...(role.isPreset && role.key ? { role: role.key } : {}),
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "member.role.assign",
      entity: "members",
      entityId: memberId,
      before,
      after: { roleId, roleName: role.name },
    });
    return null;
  },
});
