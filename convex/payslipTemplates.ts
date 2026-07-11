import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requirePermission } from "./auth";
import { writeAuditLog } from "./lib/audit";
import {
  payslipTemplateShow,
  payslipLayoutBlock,
  payslipDensity,
} from "./lib/enums";
import { payslipTemplateRow, payslipTemplateConfig } from "./lib/validators";
import { DEFAULT_PAYSLIP_TEMPLATE } from "./lib/sgDefaults";

// Ensure the org has at least one payslip template; returns the default's id.
export async function ensureDefaultTemplate(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
): Promise<Id<"payslipTemplates">> {
  const existing = await ctx.db
    .query("payslipTemplates")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  const preferred =
    existing.find((t) => t.isDefault) ?? existing[0] ?? null;
  if (preferred) return preferred._id;
  return await ctx.db.insert("payslipTemplates", {
    orgId,
    name: DEFAULT_PAYSLIP_TEMPLATE.name,
    isDefault: true,
    accentColor: DEFAULT_PAYSLIP_TEMPLATE.accentColor,
    fontFamily: DEFAULT_PAYSLIP_TEMPLATE.fontFamily,
    show: DEFAULT_PAYSLIP_TEMPLATE.show,
  });
}

// Resolve a template's rendering config (logo → URL), falling back to the org
// default template, then to the built-in default appearance.
export async function resolveTemplateConfig(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  templateId: Id<"payslipTemplates"> | undefined,
): Promise<{
  accentColor: string;
  fontFamily: string;
  logoUrl: string | null;
  headerText: string | null;
  footerText: string | null;
  show: Doc<"payslipTemplates">["show"];
  layout: NonNullable<Doc<"payslipTemplates">["layout"]> | null;
  textColor: string | null;
  fontScale: number | null;
  density: NonNullable<Doc<"payslipTemplates">["density"]> | null;
}> {
  let tmpl: Doc<"payslipTemplates"> | null = templateId
    ? await ctx.db.get(templateId)
    : null;
  if (!tmpl || tmpl.orgId !== orgId) {
    const all = await ctx.db
      .query("payslipTemplates")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    tmpl = all.find((t) => t.isDefault) ?? all[0] ?? null;
  }
  if (!tmpl) {
    return {
      accentColor: DEFAULT_PAYSLIP_TEMPLATE.accentColor,
      fontFamily: DEFAULT_PAYSLIP_TEMPLATE.fontFamily,
      logoUrl: null,
      headerText: null,
      footerText: null,
      show: DEFAULT_PAYSLIP_TEMPLATE.show,
      layout: null,
      textColor: null,
      fontScale: null,
      density: null,
    };
  }
  return {
    accentColor: tmpl.accentColor,
    fontFamily: tmpl.fontFamily,
    logoUrl: tmpl.logoStorageId
      ? await ctx.storage.getUrl(tmpl.logoStorageId)
      : null,
    headerText: tmpl.headerText ?? null,
    footerText: tmpl.footerText ?? null,
    show: tmpl.show,
    layout: tmpl.layout ?? null,
    textColor: tmpl.textColor ?? null,
    fontScale: tmpl.fontScale ?? null,
    density: tmpl.density ?? null,
  };
}

export const list = query({
  args: {},
  returns: v.array(payslipTemplateRow),
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "payroll:manage");
    const rows = await ctx.db
      .query("payslipTemplates")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    return await Promise.all(
      rows.map(async (t) => ({
        _id: t._id,
        _creationTime: t._creationTime,
        name: t.name,
        isDefault: t.isDefault,
        accentColor: t.accentColor,
        fontFamily: t.fontFamily,
        logoStorageId: t.logoStorageId ?? null,
        logoUrl: t.logoStorageId
          ? await ctx.storage.getUrl(t.logoStorageId)
          : null,
        headerText: t.headerText ?? null,
        footerText: t.footerText ?? null,
        show: t.show,
        layout: t.layout ?? null,
        textColor: t.textColor ?? null,
        fontScale: t.fontScale ?? null,
        density: t.density ?? null,
      })),
    );
  },
});

// Preview a template config by id (for the templates editor live preview).
export const preview = query({
  args: { templateId: v.optional(v.id("payslipTemplates")) },
  returns: payslipTemplateConfig,
  handler: async (ctx, { templateId }) => {
    const { orgId } = await requirePermission(ctx, "payroll:manage");
    return await resolveTemplateConfig(ctx, orgId, templateId);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    accentColor: v.string(),
    fontFamily: v.string(),
    logoStorageId: v.optional(v.id("_storage")),
    headerText: v.optional(v.string()),
    footerText: v.optional(v.string()),
    show: payslipTemplateShow,
    layout: v.optional(v.array(payslipLayoutBlock)),
    textColor: v.optional(v.string()),
    fontScale: v.optional(v.number()),
    density: v.optional(payslipDensity),
    makeDefault: v.optional(v.boolean()),
  },
  returns: v.id("payslipTemplates"),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(ctx, "payroll:manage");
    const existing = await ctx.db
      .query("payslipTemplates")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const isDefault = args.makeDefault === true || existing.length === 0;
    if (isDefault) {
      for (const t of existing)
        if (t.isDefault) await ctx.db.patch(t._id, { isDefault: false });
    }
    const id = await ctx.db.insert("payslipTemplates", {
      orgId,
      name: args.name.trim() || "Untitled",
      isDefault,
      accentColor: args.accentColor,
      fontFamily: args.fontFamily,
      logoStorageId: args.logoStorageId,
      headerText: args.headerText?.trim() || undefined,
      footerText: args.footerText?.trim() || undefined,
      show: args.show,
      layout: args.layout,
      textColor: args.textColor,
      fontScale: args.fontScale,
      density: args.density,
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "payroll.template_create",
      entity: "payslipTemplates",
      entityId: id,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    templateId: v.id("payslipTemplates"),
    name: v.optional(v.string()),
    accentColor: v.optional(v.string()),
    fontFamily: v.optional(v.string()),
    logoStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    headerText: v.optional(v.union(v.string(), v.null())),
    footerText: v.optional(v.union(v.string(), v.null())),
    show: v.optional(payslipTemplateShow),
    layout: v.optional(v.union(v.array(payslipLayoutBlock), v.null())),
    textColor: v.optional(v.union(v.string(), v.null())),
    fontScale: v.optional(v.union(v.number(), v.null())),
    density: v.optional(v.union(payslipDensity, v.null())),
    makeDefault: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { orgId } = await requirePermission(ctx, "payroll:manage");
    const tmpl = await ctx.db.get(args.templateId);
    if (!tmpl || tmpl.orgId !== orgId) throw new Error("Template not found.");
    const patch: Partial<Doc<"payslipTemplates">> = {};
    if (args.name !== undefined) patch.name = args.name.trim() || "Untitled";
    if (args.accentColor !== undefined) patch.accentColor = args.accentColor;
    if (args.fontFamily !== undefined) patch.fontFamily = args.fontFamily;
    if (args.logoStorageId !== undefined)
      patch.logoStorageId = args.logoStorageId ?? undefined;
    if (args.headerText !== undefined)
      patch.headerText = args.headerText?.trim() || undefined;
    if (args.footerText !== undefined)
      patch.footerText = args.footerText?.trim() || undefined;
    if (args.show !== undefined) patch.show = args.show;
    if (args.layout !== undefined) patch.layout = args.layout ?? undefined;
    if (args.textColor !== undefined)
      patch.textColor = args.textColor ?? undefined;
    if (args.fontScale !== undefined)
      patch.fontScale = args.fontScale ?? undefined;
    if (args.density !== undefined) patch.density = args.density ?? undefined;
    await ctx.db.patch(args.templateId, patch);
    if (args.makeDefault === true && !tmpl.isDefault) {
      const all = await ctx.db
        .query("payslipTemplates")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .collect();
      for (const t of all)
        if (t.isDefault) await ctx.db.patch(t._id, { isDefault: false });
      await ctx.db.patch(args.templateId, { isDefault: true });
    }
    return null;
  },
});

export const remove = mutation({
  args: { templateId: v.id("payslipTemplates") },
  returns: v.null(),
  handler: async (ctx, { templateId }) => {
    const { orgId } = await requirePermission(ctx, "payroll:manage");
    const tmpl = await ctx.db.get(templateId);
    if (!tmpl || tmpl.orgId !== orgId) throw new Error("Template not found.");
    const all = await ctx.db
      .query("payslipTemplates")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    if (all.length <= 1) throw new Error("Keep at least one template.");
    await ctx.db.delete(templateId);
    // Promote another to default if we removed the default.
    if (tmpl.isDefault) {
      const next = all.find((t) => t._id !== templateId);
      if (next) await ctx.db.patch(next._id, { isDefault: true });
    }
    return null;
  },
});

// Upload URL for a template logo (payroll managers only).
export const generateLogoUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requirePermission(ctx, "payroll:manage");
    return await ctx.storage.generateUploadUrl();
  },
});
