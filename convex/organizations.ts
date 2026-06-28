import {
  internalMutation,
  mutation,
  query,
  QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import {
  DEFAULT_ORG_COUNTRY,
  DEFAULT_ORG_SETTINGS,
  orgSettings,
} from "./lib/enums";
import { internal } from "./_generated/api";
import { getOrgContext, requirePermission } from "./auth";
import { writeAuditLog } from "./lib/audit";

/**
 * Organization sync. Source of truth is Clerk Organizations; these internal
 * mutations are driven by `organization.*` webhooks in http.ts.
 */

export async function orgByClerkId(ctx: QueryCtx, clerkOrgId: string) {
  return await ctx.db
    .query("organizations")
    .withIndex("by_clerkOrgId", (q) => q.eq("clerkOrgId", clerkOrgId))
    .unique();
}

// Upsert from a Clerk organization payload. We only set country/settings on
// first insert so in-app configuration is never clobbered by a later webhook.
export const upsertFromClerk = internalMutation({
  args: {
    clerkOrgId: v.string(),
    name: v.string(),
    slug: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  returns: v.id("organizations"),
  handler: async (ctx, args) => {
    const existing = await orgByClerkId(ctx, args.clerkOrgId);
    if (existing === null) {
      const orgId = await ctx.db.insert("organizations", {
        clerkOrgId: args.clerkOrgId,
        name: args.name,
        slug: args.slug,
        imageUrl: args.imageUrl,
        country: DEFAULT_ORG_COUNTRY,
        settings: { ...DEFAULT_ORG_SETTINGS },
      });
      // Seed default leave types / holidays etc. for the new organization.
      await ctx.runMutation(internal.seed.seedOrganization, { orgId });
      return orgId;
    }
    await ctx.db.patch(existing._id, {
      name: args.name,
      slug: args.slug,
      imageUrl: args.imageUrl,
    });
    return existing._id;
  },
});

export const deleteFromClerk = internalMutation({
  args: { clerkOrgId: v.string() },
  returns: v.null(),
  handler: async (ctx, { clerkOrgId }) => {
    const org = await orgByClerkId(ctx, clerkOrgId);
    if (org === null) {
      console.warn(`Can't delete org, none for Clerk org ID: ${clerkOrgId}`);
      return null;
    }
    // Remove memberships for the org; domain data is cleaned up per-module
    // as those modules are added.
    const members = await ctx.db
      .query("members")
      .withIndex("by_org", (q) => q.eq("orgId", org._id))
      .collect();
    for (const m of members) {
      await ctx.db.delete(m._id);
    }
    await ctx.db.delete(org._id);
    return null;
  },
});

// ─── Public API ──────────────────────────────────────────────────────────

// The active organization for the current caller, or null during onboarding.
export const current = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("organizations"),
      name: v.string(),
      slug: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
      country: v.string(),
      settings: orgSettings,
    }),
  ),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return null;
    const { org } = orgCtx;
    return {
      _id: org._id,
      name: org.name,
      slug: org.slug,
      imageUrl: org.imageUrl,
      country: org.country,
      settings: org.settings,
    };
  },
});

// Update org locale/settings (Settings → Organization). Requires org:manage.
export const updateSettings = mutation({
  args: { country: v.optional(v.string()), settings: orgSettings },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { orgId, org, userId } = await requirePermission(ctx, "org:manage");
    const before = { country: org.country, settings: org.settings };
    await ctx.db.patch(orgId, {
      country: args.country ?? org.country,
      settings: args.settings,
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "organization.settings.update",
      entity: "organizations",
      entityId: orgId,
      before,
      after: { country: args.country ?? org.country, settings: args.settings },
    });
    return null;
  },
});
