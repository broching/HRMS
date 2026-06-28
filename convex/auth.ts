import { ConvexError } from "convex/values";
import { QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { HrmsRole } from "./lib/enums";
import { Permission, hasPermission } from "./lib/permissions";

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
  if (!hasPermission(orgCtx.role, permission)) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: `Missing permission: ${permission}.`,
    });
  }
  return orgCtx;
}
