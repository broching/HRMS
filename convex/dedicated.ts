import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { isDedicated, dedicatedOrgClerkId } from "./lib/deployment";

/**
 * Dedicated Enterprise deployment bootstrap.
 *
 * A fresh dedicated Convex deployment has an EMPTY database. Ordinarily the
 * `organizations` / `users` / `members` rows are created by Clerk webhooks
 * (`organization.created`, `user.created`, `organizationMembership.created`) —
 * but when an Enterprise org is provisioned in the Clerk dashboard *before* this
 * deployment's webhook endpoint exists, those one-time events never fire here.
 * `members.ensureSelf` can't help either: it bails when the org row is missing.
 *
 * This action self-provisions the pinned org (plus the calling user and their
 * admin membership) by pulling the current state from the Clerk Backend API and
 * feeding it through the SAME internal mutations the webhooks use. It is:
 *   - guarded: runs only on a dedicated deployment, and only for the pinned org
 *     (the org id comes from the verified JWT, not client input);
 *   - idempotent: every underlying mutation upserts, so repeated calls are safe;
 *   - webhook-compatible: it writes the real Clerk membership id + role, so a
 *     later webhook reconciles cleanly rather than duplicating.
 *
 * The client calls this on load in dedicated mode (see EnsureMembership).
 */

const CLERK_API = "https://api.clerk.com/v1";

type ClerkOrg = { id: string; name: string; slug?: string; image_url?: string };
type ClerkMembership = {
  id: string;
  role?: string;
  public_user_data?: { user_id?: string };
};

async function clerkGet<T>(path: string, secret: string): Promise<T> {
  const res = await fetch(`${CLERK_API}${path}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) {
    throw new Error(`Clerk API ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export const bootstrap = action({
  args: {},
  returns: v.object({
    ok: v.boolean(),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx): Promise<{ ok: boolean; reason?: string }> => {
    // Only meaningful on a dedicated deployment pinned to a specific org.
    if (!isDedicated()) return { ok: false, reason: "not_dedicated" };
    const pinned = dedicatedOrgClerkId();
    if (!pinned) return { ok: false, reason: "no_pinned_org" };

    const identity = (await ctx.auth.getUserIdentity()) as
      | { subject: string; org_id?: string }
      | null;
    if (!identity) return { ok: false, reason: "unauthenticated" };
    if (!identity.org_id) return { ok: false, reason: "no_active_org" };

    // The active org must be the one this deployment belongs to. This is the
    // same pin enforced in getOrgContext — never provision a foreign org here.
    if (identity.org_id !== pinned) return { ok: false, reason: "org_mismatch" };

    const secret = process.env.CLERK_SECRET_KEY;
    if (!secret) return { ok: false, reason: "no_clerk_secret" };

    // 1) Org → creates the organizations row (+ seeds defaults) if absent.
    const org = await clerkGet<ClerkOrg>(
      `/organizations/${identity.org_id}`,
      secret,
    );
    await ctx.runMutation(internal.organizations.upsertFromClerk, {
      clerkOrgId: org.id,
      name: org.name,
      slug: org.slug ?? undefined,
      imageUrl: org.image_url ?? undefined,
    });

    // 2) User → creates/updates the caller's users row from full Clerk data.
    const user = await clerkGet<Record<string, unknown>>(
      `/users/${identity.subject}`,
      secret,
    );
    await ctx.runMutation(internal.users.upsertFromClerk, {
      data: user as never,
    });

    // 3) Membership → the caller's member row, with their real Clerk membership
    // id + role, so they land as admin (whatever their org role is in Clerk).
    const memberships = await clerkGet<{ data: ClerkMembership[] }>(
      `/organizations/${identity.org_id}/memberships?limit=100`,
      secret,
    );
    const mine = memberships.data.find(
      (m) => m.public_user_data?.user_id === identity.subject,
    );
    if (!mine) return { ok: false, reason: "no_membership" };

    const name =
      `${(user.first_name as string) ?? ""} ${(user.last_name as string) ?? ""}`.trim();
    const emails = (user.email_addresses as { id: string; email_address: string }[]) ?? [];
    const primaryId = user.primary_email_address_id as string | undefined;
    const email =
      emails.find((e) => e.id === primaryId)?.email_address ??
      emails[0]?.email_address;

    await ctx.runMutation(internal.members.upsertFromClerk, {
      clerkMembershipId: mine.id,
      clerkOrgId: org.id,
      clerkUserId: identity.subject,
      userName: name || (user.username as string) || email || "Unknown",
      userEmail: email,
      userImageUrl: (user.image_url as string) ?? undefined,
      clerkRole: mine.role ?? undefined,
      status: "active",
    });

    return { ok: true };
  },
});
