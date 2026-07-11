import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requireOrg, requirePermission } from "./auth";
import { paymentRequestField, paymentRequestShow, payslipDensity } from "./lib/enums";
import { writeAuditLog } from "./lib/audit";

// The default "Request for Payment" template, modelled on the sample forms:
// core fields (purpose/amount/currency/payee/date) are always shown, so the
// template only adds the banking + requestor-position custom fields on top.
const DEFAULT_FIELDS = [
  { key: "requestorPosition", label: "Requestor's Position", type: "text" as const, required: false },
  { key: "accountNumber", label: "Account Number", type: "text" as const, required: true },
  { key: "bankName", label: "Bank Name", type: "text" as const, required: true },
  { key: "accountAddress", label: "Account Address", type: "textarea" as const, required: false },
  { key: "swiftCode", label: "Swift Code", type: "text" as const, required: false },
  { key: "invoiceDate", label: "Date of Invoice", type: "date" as const, required: false },
];

const templateRow = v.object({
  _id: v.id("paymentRequestTemplates"),
  _creationTime: v.number(),
  name: v.string(),
  headerText: v.union(v.string(), v.null()),
  isDefault: v.boolean(),
  active: v.boolean(),
  order: v.number(),
  fields: v.array(paymentRequestField),
  accentColor: v.union(v.string(), v.null()),
  fontFamily: v.union(v.string(), v.null()),
  textColor: v.union(v.string(), v.null()),
  fontScale: v.union(v.number(), v.null()),
  density: v.union(payslipDensity, v.null()),
  show: v.union(paymentRequestShow, v.null()),
});

function toRow(t: Doc<"paymentRequestTemplates">) {
  return {
    _id: t._id,
    _creationTime: t._creationTime,
    name: t.name,
    headerText: t.headerText ?? null,
    isDefault: t.isDefault,
    active: t.active,
    order: t.order,
    fields: t.fields,
    accentColor: t.accentColor ?? null,
    fontFamily: t.fontFamily ?? null,
    textColor: t.textColor ?? null,
    fontScale: t.fontScale ?? null,
    density: t.density ?? null,
    show: t.show ?? null,
  };
}

// Every template for the org, ordered. Readable by any member (the submit form
// needs it). Inactive templates are included so settings can toggle them.
export const list = query({
  args: {},
  returns: v.array(templateRow),
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    const rows = await ctx.db
      .query("paymentRequestTemplates")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    rows.sort((a, b) => a.order - b.order || a._creationTime - b._creationTime);
    return rows.map(toRow);
  },
});

export const get = query({
  args: { templateId: v.id("paymentRequestTemplates") },
  returns: v.union(templateRow, v.null()),
  handler: async (ctx, { templateId }) => {
    const { orgId } = await requireOrg(ctx);
    const t = await ctx.db.get(templateId);
    if (!t || t.orgId !== orgId) return null;
    return toRow(t);
  },
});

// Create/update a template. Fields must have non-empty labels; select fields
// need at least one option. Setting `isDefault` clears the flag on siblings.
export const save = mutation({
  args: {
    templateId: v.optional(v.id("paymentRequestTemplates")),
    name: v.string(),
    headerText: v.optional(v.string()),
    isDefault: v.boolean(),
    active: v.boolean(),
    fields: v.array(paymentRequestField),
    accentColor: v.optional(v.string()),
    fontFamily: v.optional(v.string()),
    textColor: v.optional(v.string()),
    fontScale: v.optional(v.number()),
    density: v.optional(payslipDensity),
    show: v.optional(paymentRequestShow),
  },
  returns: v.id("paymentRequestTemplates"),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(
      ctx,
      "payment_requests:read:all",
    );
    if (!args.name.trim()) throw new Error("Template needs a name.");
    const keys = new Set<string>();
    for (const f of args.fields) {
      if (!f.label.trim()) throw new Error("Every field needs a label.");
      if (!f.key.trim()) throw new Error("Every field needs a key.");
      if (keys.has(f.key)) throw new Error("Duplicate field key.");
      keys.add(f.key);
      if (f.type === "select" && (!f.options || f.options.length === 0)) {
        throw new Error(`Field "${f.label}" needs at least one option.`);
      }
    }

    const existing = await ctx.db
      .query("paymentRequestTemplates")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();

    // Ensure a single default across the org.
    if (args.isDefault) {
      for (const t of existing) {
        if (t._id !== args.templateId && t.isDefault) {
          await ctx.db.patch(t._id, { isDefault: false });
        }
      }
    }

    const style = {
      accentColor: args.accentColor,
      fontFamily: args.fontFamily,
      textColor: args.textColor,
      fontScale: args.fontScale,
      density: args.density,
      show: args.show,
    };

    let id: Id<"paymentRequestTemplates">;
    if (args.templateId) {
      const t = await ctx.db.get(args.templateId);
      if (!t || t.orgId !== orgId) throw new Error("Template not found.");
      await ctx.db.patch(args.templateId, {
        name: args.name.trim(),
        headerText: args.headerText?.trim() || undefined,
        isDefault: args.isDefault,
        active: args.active,
        fields: args.fields,
        ...style,
      });
      id = args.templateId;
    } else {
      const order =
        existing.reduce((m, t) => Math.max(m, t.order), 0) + 1;
      id = await ctx.db.insert("paymentRequestTemplates", {
        orgId,
        name: args.name.trim(),
        headerText: args.headerText?.trim() || undefined,
        // Force the very first template to be the default so a form always has one.
        isDefault: args.isDefault || existing.length === 0,
        active: args.active,
        order,
        fields: args.fields,
        ...style,
      });
    }
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "paymentRequestTemplate.save",
      entity: "paymentRequestTemplates",
      entityId: id,
    });
    return id;
  },
});

export const remove = mutation({
  args: { templateId: v.id("paymentRequestTemplates") },
  returns: v.null(),
  handler: async (ctx, { templateId }) => {
    const { orgId, userId } = await requirePermission(
      ctx,
      "payment_requests:read:all",
    );
    const t = await ctx.db.get(templateId);
    if (!t || t.orgId !== orgId) throw new Error("Template not found.");
    await ctx.db.delete(templateId);
    // If the default was deleted, promote the next remaining template.
    if (t.isDefault) {
      const rest = await ctx.db
        .query("paymentRequestTemplates")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .collect();
      rest.sort((a, b) => a.order - b.order);
      if (rest[0]) await ctx.db.patch(rest[0]._id, { isDefault: true });
    }
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "paymentRequestTemplate.remove",
      entity: "paymentRequestTemplates",
      entityId: templateId,
    });
    return null;
  },
});

// Seed the built-in "Request for Payment" template if the org has none. Called
// from settings when the org has no templates yet.
export const seedDefault = mutation({
  args: {},
  returns: v.id("paymentRequestTemplates"),
  handler: async (ctx) => {
    const { orgId, userId } = await requirePermission(
      ctx,
      "payment_requests:read:all",
    );
    const existing = await ctx.db
      .query("paymentRequestTemplates")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const already = existing.find((t) => t.name === "Request for Payment");
    if (already) return already._id;
    const id = await ctx.db.insert("paymentRequestTemplates", {
      orgId,
      name: "Request for Payment",
      headerText: "REQUEST FOR PAYMENT",
      isDefault: existing.length === 0,
      active: true,
      order: existing.reduce((m, t) => Math.max(m, t.order), 0) + 1,
      fields: DEFAULT_FIELDS,
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "paymentRequestTemplate.seedDefault",
      entity: "paymentRequestTemplates",
      entityId: id,
    });
    return id;
  },
});
