import { v, ConvexError } from "convex/values";
import {
  action,
  internalAction,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requirePermission } from "./auth";
import { hrmsRole, HrmsRole } from "./lib/enums";

/**
 * Clerk Backend API bridge for adding people to a Clerk organization by
 * username. Email invitations stay client-side (`organization.inviteMember`);
 * usernames can't be emailed an invite, so we resolve the username to an
 * existing Clerk account and add them to the org directly.
 *
 * Requires `CLERK_SECRET_KEY` in the Convex deployment environment
 * (Convex dashboard → Settings → Environment Variables).
 */

const CLERK_API = "https://api.clerk.com/v1";

// Clerk org roles available on every plan. The richer HRMS role is stored in
// Convex and applied to the membership when it is created (see members.ts).
function clerkRoleFor(role: HrmsRole | undefined): "org:admin" | "org:member" {
  return role === "admin" ? "org:admin" : "org:member";
}

function clerkSecret(): string {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) {
    throw new ConvexError({
      code: "CONFIG",
      message:
        "CLERK_SECRET_KEY is not set in the Convex environment. Add it in the Convex dashboard to enable username invites.",
    });
  }
  return key;
}

async function clerkFetch(path: string, init?: RequestInit): Promise<Response> {
  return await fetch(`${CLERK_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${clerkSecret()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

// Look up a Clerk user id by exact username. Returns null when no such account
// exists yet (the caller then leaves the employee pending until they sign up).
async function findClerkUserIdByUsername(
  username: string,
): Promise<string | null> {
  const res = await clerkFetch(
    `/users?username=${encodeURIComponent(username)}&limit=1`,
  );
  if (!res.ok) {
    throw new ConvexError({
      code: "CLERK",
      message: `Clerk user lookup failed (${res.status}).`,
    });
  }
  const users = (await res.json()) as Array<{ id: string }>;
  return users[0]?.id ?? null;
}

// Add a user to an org. Treats an existing membership as success.
// Returns "added" | "already_member".
async function addMembership(
  clerkOrgId: string,
  clerkUserId: string,
  role: "org:admin" | "org:member",
): Promise<"added" | "already_member"> {
  const res = await clerkFetch(`/organizations/${clerkOrgId}/memberships`, {
    method: "POST",
    body: JSON.stringify({ user_id: clerkUserId, role }),
  });
  if (res.ok) return "added";
  const body = (await res.json().catch(() => null)) as
    | { errors?: Array<{ code?: string }> }
    | null;
  const alreadyMember = body?.errors?.some(
    (e) => e.code === "already_a_member_in_organization",
  );
  if (res.status === 422 && alreadyMember) return "already_member";
  throw new ConvexError({
    code: "CLERK",
    message: `Could not add member to organization (${res.status}).`,
  });
}

// ─── Authorization ─────────────────────────────────────────────────────────

// Confirm the caller may manage employees and return the active org's Clerk id.
export const authorizeAddByUsername = internalQuery({
  args: {},
  returns: v.object({ clerkOrgId: v.string() }),
  handler: async (ctx) => {
    const { org } = await requirePermission(ctx, "employees:manage");
    return { clerkOrgId: org.clerkOrgId };
  },
});

// ─── Public API ──────────────────────────────────────────────────────────

// Add an existing Clerk account (by username) to the caller's active org.
// When no account exists yet, returns "not_found" — the caller still creates
// the employee with `loginUsername`, and resolvePendingForUser adds them
// automatically once they sign up.
export const addByUsername = action({
  args: { username: v.string(), role: v.optional(hrmsRole) },
  returns: v.union(
    v.object({ status: v.literal("added") }),
    v.object({ status: v.literal("already_member") }),
    v.object({ status: v.literal("not_found") }),
  ),
  handler: async (ctx, args) => {
    const { clerkOrgId } = await ctx.runQuery(
      internal.orgMembers.authorizeAddByUsername,
      {},
    );
    const username = args.username.trim().toLowerCase();
    if (!username) {
      throw new ConvexError({ code: "INPUT", message: "Username is required." });
    }
    const clerkUserId = await findClerkUserIdByUsername(username);
    if (!clerkUserId) return { status: "not_found" as const };
    const result = await addMembership(
      clerkOrgId,
      clerkUserId,
      clerkRoleFor(args.role),
    );
    return { status: result };
  },
});

// Remove a user from a Clerk organization. Best-effort: called (scheduled) when
// an employee is deactivated so their session token can no longer carry the org.
// A missing key or a 404 (already gone) is treated as a no-op — in-app access is
// already revoked by the member's `removed` status regardless.
export const removeFromClerkOrg = internalAction({
  args: { clerkOrgId: v.string(), clerkUserId: v.string() },
  returns: v.null(),
  handler: async (_ctx, { clerkOrgId, clerkUserId }) => {
    if (!process.env.CLERK_SECRET_KEY) {
      console.warn("CLERK_SECRET_KEY unset; skipping Clerk org removal.");
      return null;
    }
    try {
      const res = await clerkFetch(
        `/organizations/${clerkOrgId}/memberships/${clerkUserId}`,
        { method: "DELETE" },
      );
      if (!res.ok && res.status !== 404) {
        console.error(
          `Clerk org removal failed (${res.status}) for user ${clerkUserId}.`,
        );
      }
    } catch (err) {
      console.error(`Clerk org removal error for user ${clerkUserId}:`, err);
    }
    return null;
  },
});

// Re-add a previously-removed user to a Clerk organization. Best-effort inverse
// of removeFromClerkOrg, called (scheduled) when an employee is reactivated.
// Idempotent — an existing membership counts as success.
export const addToClerkOrg = internalAction({
  args: {
    clerkOrgId: v.string(),
    clerkUserId: v.string(),
    role: v.optional(hrmsRole),
  },
  returns: v.null(),
  handler: async (_ctx, { clerkOrgId, clerkUserId, role }) => {
    if (!process.env.CLERK_SECRET_KEY) {
      console.warn("CLERK_SECRET_KEY unset; skipping Clerk org re-add.");
      return null;
    }
    try {
      await addMembership(clerkOrgId, clerkUserId, clerkRoleFor(role));
    } catch (err) {
      console.error(`Clerk org re-add error for user ${clerkUserId}:`, err);
    }
    return null;
  },
});

// ─── Pending resolution (auto-add on signup) ───────────────────────────────

// Distinct orgs still waiting for this username, with the role to grant.
export const pendingOrgsForUsername = internalQuery({
  args: { username: v.string() },
  returns: v.array(
    v.object({
      clerkOrgId: v.string(),
      role: v.union(v.literal("org:admin"), v.literal("org:member")),
    }),
  ),
  handler: async (ctx, { username }) => {
    const employees = await ctx.db
      .query("employees")
      .withIndex("by_loginUsername", (q) => q.eq("loginUsername", username))
      .collect();
    const byOrg = new Map<string, "org:admin" | "org:member">();
    for (const e of employees) {
      if (e.userId) continue; // already linked
      const org = await ctx.db.get(e.orgId);
      if (!org) continue;
      // First unlinked employee for an org wins the role.
      if (!byOrg.has(org.clerkOrgId)) {
        byOrg.set(org.clerkOrgId, clerkRoleFor(e.invitedRole));
      }
    }
    return [...byOrg.entries()].map(([clerkOrgId, role]) => ({
      clerkOrgId,
      role,
    }));
  },
});

// The stored (lowercased) username for a Clerk user id, if any.
export const usernameForExternalId = internalQuery({
  args: { externalId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { externalId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("byExternalId", (q) => q.eq("externalId", externalId))
      .unique();
    return user?.username ?? null;
  },
});

// Fired after a Clerk user is created/updated: add them to every org that
// pre-created an employee for their username. The membership webhook then
// links the employee (members.linkEmployeeOnJoin, by username).
export const resolvePendingForUser = internalAction({
  args: { clerkUserId: v.string() },
  returns: v.null(),
  handler: async (ctx, { clerkUserId }) => {
    const username = await ctx.runQuery(
      internal.orgMembers.usernameForExternalId,
      { externalId: clerkUserId },
    );
    if (!username) return null;
    const targets = await ctx.runQuery(
      internal.orgMembers.pendingOrgsForUsername,
      { username },
    );
    for (const t of targets) {
      try {
        await addMembership(t.clerkOrgId, clerkUserId, t.role);
      } catch (err) {
        // Best-effort per org — a failure for one org shouldn't block others.
        console.error(
          `Failed to auto-add ${clerkUserId} to org ${t.clerkOrgId}:`,
          err,
        );
      }
    }
    return null;
  },
});
