import { mutation, query, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { requirePermission } from "./auth";
import { appraisalFormTemplateDoc } from "./lib/validators";
import { cycleForm } from "./lib/enums";
import { writeAuditLog } from "./lib/audit";
import { normalizeAndValidateForm } from "./lib/performanceForm";
import { DEFAULT_FORM_TEMPLATES } from "./lib/performanceDefaults";

// Seed the org's read-only starter templates if missing. Idempotent — matches
// on (isSystemDefault, name) so re-running never duplicates and never clobbers
// an org-edited copy. Safe to call from cycle creation and org seeding.
export async function ensureDefaultFormTemplates(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
): Promise<void> {
  const existing = await ctx.db
    .query("appraisalFormTemplates")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  const haveDefault = new Set(
    existing.filter((t) => t.isSystemDefault).map((t) => t.name),
  );
  for (const t of DEFAULT_FORM_TEMPLATES) {
    if (haveDefault.has(t.name)) continue;
    await ctx.db.insert("appraisalFormTemplates", {
      orgId,
      name: t.name,
      description: t.description,
      form: t.form,
      isSystemDefault: true,
      active: true,
    });
  }
}

export const list = query({
  args: {},
  returns: v.array(appraisalFormTemplateDoc),
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "performance:manage");
    const rows = await ctx.db
      .query("appraisalFormTemplates")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    // System defaults first, then org-saved, each alphabetical.
    rows.sort((a, b) => {
      if (a.isSystemDefault !== b.isSystemDefault) return a.isSystemDefault ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return rows;
  },
});

export const get = query({
  args: { templateId: v.id("appraisalFormTemplates") },
  returns: v.union(v.null(), appraisalFormTemplateDoc),
  handler: async (ctx, { templateId }) => {
    const { orgId } = await requirePermission(ctx, "performance:manage");
    const t = await ctx.db.get(templateId);
    return t && t.orgId === orgId ? t : null;
  },
});

// One-shot seeding trigger for orgs created before the template library existed
// (the settings editor calls this when the list is empty).
export const seedDefaults = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "performance:manage");
    await ensureDefaultFormTemplates(ctx, orgId);
    return null;
  },
});

// Create or update an org-saved template. System defaults are read-only —
// editing one saves a new org copy instead (the client omits `id` in that case).
export const save = mutation({
  args: {
    id: v.optional(v.id("appraisalFormTemplates")),
    name: v.string(),
    description: v.optional(v.string()),
    form: cycleForm,
  },
  returns: v.id("appraisalFormTemplates"),
  handler: async (ctx, { id, name, description, form }) => {
    const { orgId, userId } = await requirePermission(ctx, "performance:manage");
    const cleanName = name.trim();
    if (!cleanName) throw new Error("Template needs a name.");
    const cleanForm = normalizeAndValidateForm(form);

    if (id) {
      const existing = await ctx.db.get(id);
      if (!existing || existing.orgId !== orgId) {
        throw new Error("Template not found.");
      }
      if (existing.isSystemDefault) {
        throw new Error("Default templates are read-only — save a copy instead.");
      }
      await ctx.db.patch(id, {
        name: cleanName,
        description: description?.trim() || undefined,
        form: cleanForm,
      });
      await writeAuditLog(ctx, {
        orgId,
        actorUserId: userId,
        action: "appraisalFormTemplate.update",
        entity: "appraisalFormTemplates",
        entityId: id,
      });
      return id;
    }

    const newId = await ctx.db.insert("appraisalFormTemplates", {
      orgId,
      name: cleanName,
      description: description?.trim() || undefined,
      form: cleanForm,
      isSystemDefault: false,
      active: true,
      createdBy: userId,
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "appraisalFormTemplate.create",
      entity: "appraisalFormTemplates",
      entityId: newId,
    });
    return newId;
  },
});

export const remove = mutation({
  args: { templateId: v.id("appraisalFormTemplates") },
  returns: v.null(),
  handler: async (ctx, { templateId }) => {
    const { orgId, userId } = await requirePermission(ctx, "performance:manage");
    const t = await ctx.db.get(templateId);
    if (!t || t.orgId !== orgId) throw new Error("Template not found.");
    if (t.isSystemDefault) {
      throw new Error("Default templates can't be deleted.");
    }
    await ctx.db.delete(templateId);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "appraisalFormTemplate.delete",
      entity: "appraisalFormTemplates",
      entityId: templateId,
    });
    return null;
  },
});
