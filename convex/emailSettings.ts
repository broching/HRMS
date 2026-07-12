import { mutation, query, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { requireOrg, requireRole } from "./auth";

// The modules that can send notification emails. Keep in sync with
// `featureForType` in ./lib/notificationRoutes.ts.
export const EMAIL_MODULES = [
  "claims",
  "paymentRequests",
  "payroll",
  "leave",
] as const;
export type EmailModule = (typeof EMAIL_MODULES)[number];

// One module's resolved config as returned to the client (nulls instead of
// undefined so the query validator is stable).
const moduleConfigOut = v.object({
  enabled: v.boolean(),
  accentColor: v.union(v.string(), v.null()),
  fontFamily: v.union(v.string(), v.null()),
  fromName: v.union(v.string(), v.null()),
  footerText: v.union(v.string(), v.null()),
});

// Input shape when saving a module's config.
const moduleConfigIn = v.object({
  enabled: v.boolean(),
  accentColor: v.optional(v.string()),
  fontFamily: v.optional(v.string()),
  fromName: v.optional(v.string()),
  footerText: v.optional(v.string()),
});

const modulesOut = v.object({
  claims: moduleConfigOut,
  paymentRequests: moduleConfigOut,
  payroll: moduleConfigOut,
  leave: moduleConfigOut,
});

type ModuleOut = {
  enabled: boolean;
  accentColor: string | null;
  fontFamily: string | null;
  fromName: string | null;
  footerText: string | null;
};

// Resolve one module's config from a settings row, falling back to the legacy
// flat fields (features/fromName/accentColor/footerText) for orgs that set
// email up before per-module config existed.
function resolveModule(
  row:
    | {
        modules?: Record<string, Partial<ModuleOut> & { enabled: boolean }>;
        features?: Record<string, boolean>;
        fromName?: string;
        accentColor?: string;
        footerText?: string;
      }
    | null,
  key: EmailModule,
): ModuleOut {
  const mod = row?.modules?.[key];
  return {
    enabled: mod?.enabled ?? row?.features?.[key] ?? false,
    accentColor: mod?.accentColor ?? row?.accentColor ?? null,
    fontFamily: mod?.fontFamily ?? null,
    fromName: mod?.fromName ?? row?.fromName ?? null,
    footerText: mod?.footerText ?? row?.footerText ?? null,
  };
}

// Resolve the org's email settings (falling back to all-off defaults), plus a
// resolved logo URL for the settings preview. Any org member may read this so
// the UI can render; only admins can save.
export const get = query({
  args: {},
  returns: v.object({
    modules: modulesOut,
    logoStorageId: v.union(v.id("_storage"), v.null()),
    logoUrl: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    const orgCtx = await requireOrg(ctx);
    const row = await ctx.db
      .query("emailSettings")
      .withIndex("by_org", (q) => q.eq("orgId", orgCtx.orgId))
      .unique();
    const logoStorageId = row?.logoStorageId ?? null;
    return {
      modules: {
        claims: resolveModule(row, "claims"),
        paymentRequests: resolveModule(row, "paymentRequests"),
        payroll: resolveModule(row, "payroll"),
        leave: resolveModule(row, "leave"),
      },
      logoStorageId,
      logoUrl: logoStorageId ? await ctx.storage.getUrl(logoStorageId) : null,
    };
  },
});

async function existingRow(ctx: MutationCtx, orgId: Id<"organizations">) {
  return await ctx.db
    .query("emailSettings")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .unique();
}

// Normalize an incoming module config, trimming blank strings to undefined so
// they don't override the render-time defaults.
function cleanModule(m: {
  enabled: boolean;
  accentColor?: string;
  fontFamily?: string;
  fromName?: string;
  footerText?: string;
}) {
  return {
    enabled: m.enabled,
    accentColor: m.accentColor?.trim() || undefined,
    fontFamily: m.fontFamily?.trim() || undefined,
    fromName: m.fromName?.trim() || undefined,
    footerText: m.footerText?.trim() || undefined,
  };
}

export const save = mutation({
  args: {
    modules: v.object({
      claims: moduleConfigIn,
      paymentRequests: moduleConfigIn,
      payroll: moduleConfigIn,
      leave: moduleConfigIn,
    }),
  },
  returns: v.null(),
  handler: async (ctx, { modules }) => {
    const orgCtx = await requireRole(ctx, ["admin"]);
    const existing = await existingRow(ctx, orgCtx.orgId);
    const patch = {
      modules: {
        claims: cleanModule(modules.claims),
        paymentRequests: cleanModule(modules.paymentRequests),
        payroll: cleanModule(modules.payroll),
        leave: cleanModule(modules.leave),
      },
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("emailSettings", { orgId: orgCtx.orgId, ...patch });
    }
    return null;
  },
});

export const generateLogoUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireRole(ctx, ["admin"]);
    return await ctx.storage.generateUploadUrl();
  },
});

export const setLogo = mutation({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { storageId }) => {
    const orgCtx = await requireRole(ctx, ["admin"]);
    const existing = await existingRow(ctx, orgCtx.orgId);
    if (existing) {
      await ctx.db.patch(existing._id, { logoStorageId: storageId });
    } else {
      await ctx.db.insert("emailSettings", {
        orgId: orgCtx.orgId,
        logoStorageId: storageId,
      });
    }
    return null;
  },
});

export const removeLogo = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const orgCtx = await requireRole(ctx, ["admin"]);
    const existing = await existingRow(ctx, orgCtx.orgId);
    if (existing?.logoStorageId) {
      await ctx.db.patch(existing._id, { logoStorageId: undefined });
    }
    return null;
  },
});
