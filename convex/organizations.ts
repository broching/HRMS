import {
  action,
  internalQuery,
  internalMutation,
  mutation,
  query,
  QueryCtx,
} from "./_generated/server";
import { v, ConvexError } from "convex/values";
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
    // Prefer our own uploaded logo over Clerk's imageUrl.
    const uploaded = org.logoStorageId
      ? await ctx.storage.getUrl(org.logoStorageId)
      : null;
    return {
      _id: org._id,
      name: org.name,
      slug: org.slug,
      imageUrl: uploaded ?? org.imageUrl,
      country: org.country,
      settings: org.settings,
    };
  },
});

// ─── Onboarding (custom create flow) ───────────────────────────────────────

// Create the Convex organization row for the caller's ACTIVE Clerk org, right
// after the onboarding wizard calls Clerk's createOrganization + setActive —
// without waiting on the `organization.created` webhook (which is asynchronous
// and may lag). Trusts the active org from the JWT (like members.ensureSelf),
// is idempotent, and seeds the org's defaults on first insert. The webhook's
// upsertFromClerk later reconciles name/slug/image harmlessly.
export const provisionCurrent = mutation({
  args: { name: v.string(), expectClerkOrgId: v.optional(v.string()) },
  returns: v.union(v.id("organizations"), v.null()),
  handler: async (ctx, { name, expectClerkOrgId }) => {
    const identity = (await ctx.auth.getUserIdentity()) as
      | { org_id?: string; org_slug?: string }
      | null;
    const clerkOrgId = identity?.org_id;
    if (!clerkOrgId) return null; // active org not on the token yet — caller retries
    // Guard the "create new company" race: the token may still carry the
    // previous active org for a moment after setActive. Wait until it flips.
    if (expectClerkOrgId && clerkOrgId !== expectClerkOrgId) return null;

    const existing = await orgByClerkId(ctx, clerkOrgId);
    if (existing) return existing._id;

    const orgId = await ctx.db.insert("organizations", {
      clerkOrgId,
      name: name.trim() || "My company",
      slug: identity.org_slug,
      country: DEFAULT_ORG_COUNTRY,
      settings: { ...DEFAULT_ORG_SETTINGS },
    });
    await ctx.runMutation(internal.seed.seedOrganization, { orgId });
    return orgId;
  },
});

// Persist the details collected by the onboarding wizard onto the org: locale
// (country/timezone), the company profile (industry/size), and the primary
// office (renaming the seeded default rather than adding a duplicate). Requires
// org:manage — the creator/admin, resolved once members.ensureSelf has run.
export const completeOnboarding = mutation({
  args: {
    industry: v.optional(v.string()),
    companySize: v.optional(v.string()),
    country: v.string(),
    timezone: v.string(),
    currency: v.optional(v.string()),
    officeName: v.optional(v.string()),
    officeAddress: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { orgId, org, userId } = await requirePermission(ctx, "org:manage");
    const currency = args.currency?.trim() || org.settings.currency;
    const settings = {
      ...org.settings,
      timezone: args.timezone,
      currency,
      industry: args.industry?.trim() || undefined,
      companySize: args.companySize?.trim() || undefined,
    };
    await ctx.db.patch(orgId, { country: args.country, settings });

    // Fold the primary-office details into the seeded default office.
    const offices = await ctx.db
      .query("offices")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const primary = offices.find((o) => o.isDefault) ?? offices[0];
    if (primary) {
      await ctx.db.patch(primary._id, {
        name: args.officeName?.trim() || primary.name,
        address: args.officeAddress?.trim() || primary.address,
        timezone: args.timezone,
        defaultCurrency: currency,
      });
    }

    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "organization.onboarding.complete",
      entity: "organizations",
      entityId: orgId,
      after: { country: args.country, settings },
    });
    return null;
  },
});

// ─── Organization logo (our own UI over Convex storage) ────────────────────

// Short-lived upload URL for a new org logo. Requires org:manage.
export const generateLogoUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requirePermission(ctx, "org:manage");
    return await ctx.storage.generateUploadUrl();
  },
});

// Point the org at a freshly uploaded logo (deleting any previous one).
export const setLogo = mutation({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { storageId }) => {
    const { orgId, org, userId } = await requirePermission(ctx, "org:manage");
    const previous = org.logoStorageId;
    await ctx.db.patch(orgId, { logoStorageId: storageId });
    if (previous && previous !== storageId) {
      await ctx.storage.delete(previous);
    }
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "organization.logo.update",
      entity: "organizations",
      entityId: orgId,
    });
    return null;
  },
});

// Remove the uploaded logo (falls back to Clerk's imageUrl, if any).
export const removeLogo = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { orgId, org, userId } = await requirePermission(ctx, "org:manage");
    if (!org.logoStorageId) return null;
    const storageId = org.logoStorageId;
    await ctx.db.patch(orgId, { logoStorageId: undefined });
    await ctx.storage.delete(storageId);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "organization.logo.remove",
      entity: "organizations",
      entityId: orgId,
    });
    return null;
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

// ─── Organization profile (name) — our own UI over Clerk's org API ─────────

// Authorize the caller for org profile edits and hand back the Clerk org id.
export const authorizeManageOrg = internalQuery({
  args: {},
  returns: v.object({ clerkOrgId: v.string() }),
  handler: async (ctx) => {
    const { org } = await requirePermission(ctx, "org:manage");
    return { clerkOrgId: org.clerkOrgId };
  },
});

// Rename the organization. Clerk Organizations is the source of truth, so we
// PATCH it there; the `organization.updated` webhook syncs the name back into
// our `organizations` table (see http.ts → upsertFromClerk).
export const rename = action({
  args: { name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) {
      throw new ConvexError({ code: "INPUT", message: "Name is required." });
    }
    const { clerkOrgId } = await ctx.runQuery(
      internal.organizations.authorizeManageOrg,
      {},
    );
    const secret = process.env.CLERK_SECRET_KEY;
    if (!secret) {
      throw new ConvexError({
        code: "CONFIG",
        message:
          "CLERK_SECRET_KEY is not set in the Convex environment. Add it in the Convex dashboard to enable organization edits.",
      });
    }
    const res = await fetch(
      `https://api.clerk.com/v1/organizations/${clerkOrgId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      },
    );
    if (!res.ok) {
      throw new ConvexError({
        code: "CLERK",
        message: `Could not rename organization (${res.status}).`,
      });
    }
    return null;
  },
});
