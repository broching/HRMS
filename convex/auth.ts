import { ConvexError } from "convex/values";
import { QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { HrmsRole } from "./lib/enums";
import {
  Permission,
  ROLE_PERMISSIONS,
  ROLE_PRESETS,
  sanitizePermissions,
} from "./lib/permissions";

/**
 * Tenancy + RBAC core. Every domain query/mutation resolves the caller's
 * organization context here, then scopes all reads/writes by `ctx.orgId`.
 *
 * The active organization comes from the Clerk session token: when an org is
 * active, Clerk emits `org_id`/`org_role`/`org_slug`. These claims must be
 * added to the "convex" JWT template so they reach Convex via
 * `ctx.auth.getUserIdentity()`.
 */

export interface OrgContext {
  userId: Id<"users">;
  user: Doc<"users">;
  orgId: Id<"organizations">;
  org: Doc<"organizations">;
  member: Doc<"members">;
  role: HrmsRole;
  // Resolved effective permissions for the caller — from their assigned role
  // document when set, else the static matrix for their legacy role enum.
  permissions: Set<Permission>;
}

/**
 * Resolve a member's effective permission set. Prefers the assigned role
 * document (data-driven, supports custom roles); falls back to the static
 * matrix keyed by the legacy role enum when no role document is assigned or
 * found.
 */
export async function resolveMemberPermissions(
  ctx: QueryCtx,
  member: Doc<"members">,
): Promise<Set<Permission>> {
  if (member.roleId) {
    const roleDoc = await ctx.db.get(member.roleId);
    if (roleDoc) {
      // Preset roles are code-authoritative and locked, so resolve them from
      // ROLE_PRESETS by key — never the stored doc, which may predate a preset
      // permission change. Custom roles resolve from their stored permissions.
      if (roleDoc.isPreset && roleDoc.key) {
        return new Set(ROLE_PRESETS[roleDoc.key].permissions);
      }
      return new Set(sanitizePermissions(roleDoc.permissions));
    }
  }
  return new Set(ROLE_PERMISSIONS[member.role]);
}

/** Non-throwing permission check against a resolved OrgContext. */
export function ctxHasPermission(
  orgCtx: OrgContext,
  permission: Permission,
): boolean {
  return orgCtx.permissions.has(permission);
}

// Custom Clerk claims that ride along on the identity object.
interface ClerkIdentity {
  subject: string;
  org_id?: string;
  org_role?: string;
  org_slug?: string;
}

/**
 * Resolve the full org context for the current caller, or null when the user
 * is unauthenticated, has no active organization, or is not a member of it.
 * Use this in queries that must render gracefully during onboarding.
 */
export async function getOrgContext(ctx: QueryCtx): Promise<OrgContext | null> {
  const identity = (await ctx.auth.getUserIdentity()) as ClerkIdentity | null;
  if (!identity) return null;

  const clerkOrgId = identity.org_id;
  if (!clerkOrgId) return null;

  const user = await ctx.db
    .query("users")
    .withIndex("byExternalId", (q) => q.eq("externalId", identity.subject))
    .unique();
  if (!user) return null;

  const org = await ctx.db
    .query("organizations")
    .withIndex("by_clerkOrgId", (q) => q.eq("clerkOrgId", clerkOrgId))
    .unique();
  if (!org) return null;

  const member = await ctx.db
    .query("members")
    .withIndex("by_org_and_user", (q) =>
      q.eq("orgId", org._id).eq("userId", user._id),
    )
    .unique();
  if (!member || member.status === "removed") return null;

  return {
    userId: user._id,
    user,
    orgId: org._id,
    org,
    member,
    role: member.role,
    permissions: await resolveMemberPermissions(ctx, member),
  };
}

/** Like getOrgContext but throws an Unauthorized error when there is none. */
export async function requireOrg(ctx: QueryCtx): Promise<OrgContext> {
  const orgCtx = await getOrgContext(ctx);
  if (!orgCtx) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "No authenticated user with an active organization.",
    });
  }
  return orgCtx;
}

/** Require that the caller's role is one of `roles`. Returns the org context. */
export async function requireRole(
  ctx: QueryCtx,
  roles: HrmsRole[],
): Promise<OrgContext> {
  const orgCtx = await requireOrg(ctx);
  if (!roles.includes(orgCtx.role)) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: `Requires role: ${roles.join(", ")}.`,
    });
  }
  return orgCtx;
}

/** Require that the caller's role grants `permission`. Returns the org context. */
export async function requirePermission(
  ctx: QueryCtx,
  permission: Permission,
): Promise<OrgContext> {
  const orgCtx = await requireOrg(ctx);
  if (!orgCtx.permissions.has(permission)) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: `Missing permission: ${permission}.`,
    });
  }
  return orgCtx;
}
