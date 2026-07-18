import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireOrg } from "./auth";
import { isProjectPrivileged } from "./model/projectAccess";
import type { OrgContext } from "./auth";
import type { QueryCtx } from "./_generated/server";

/**
 * Org-defined custom field schema for tasks. Mirrors the payment-request field
 * pattern: a def list here, a `customFields` record on each task (validated
 * against these defs at write time in projects.ts). Anyone can read the defs (to
 * render inputs); only task managers can edit them.
 */

const fieldType = v.union(
  v.literal("text"),
  v.literal("number"),
  v.literal("date"),
  v.literal("select"),
  v.literal("checkbox"),
);

const fieldDoc = v.object({
  _id: v.id("taskFieldDefs"),
  _creationTime: v.number(),
  orgId: v.id("organizations"),
  key: v.string(),
  label: v.string(),
  type: fieldType,
  options: v.optional(v.array(v.string())),
  order: v.number(),
  active: v.boolean(),
});

async function requireFieldManage(ctx: QueryCtx): Promise<OrgContext> {
  const orgCtx = await requireOrg(ctx);
  if (!isProjectPrivileged(orgCtx)) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "You don't have permission to manage custom fields.",
    });
  }
  return orgCtx;
}

// Slugify a label into a stable storage key.
function toKey(label: string): string {
  return (
    label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "field"
  );
}

export const list = query({
  args: {},
  returns: v.array(fieldDoc),
  handler: async (ctx) => {
    const orgCtx = await requireOrg(ctx);
    const rows = await ctx.db
      .query("taskFieldDefs")
      .withIndex("by_org", (q) => q.eq("orgId", orgCtx.orgId))
      .collect();
    rows.sort((a, b) => a.order - b.order);
    return rows;
  },
});

export const save = mutation({
  args: {
    fieldId: v.optional(v.id("taskFieldDefs")),
    label: v.string(),
    type: fieldType,
    options: v.optional(v.array(v.string())),
    active: v.optional(v.boolean()),
  },
  returns: v.id("taskFieldDefs"),
  handler: async (ctx, args) => {
    const { orgId } = await requireFieldManage(ctx);
    const label = args.label.trim();
    if (!label) throw new ConvexError({ code: "INPUT", message: "Label is required." });
    const options =
      args.type === "select"
        ? (args.options ?? [])
            .map((o) => o.trim())
            .filter(Boolean)
            .slice(0, 30)
        : undefined;
    if (args.type === "select" && (!options || options.length === 0)) {
      throw new ConvexError({
        code: "INPUT",
        message: "Add at least one option for a select field.",
      });
    }

    if (args.fieldId) {
      const def = await ctx.db.get(args.fieldId);
      if (!def || def.orgId !== orgId) {
        throw new ConvexError({ code: "NOT_FOUND", message: "Field not found." });
      }
      // The key is immutable once created so existing values stay linked.
      await ctx.db.patch(args.fieldId, {
        label: label.slice(0, 60),
        type: args.type,
        options,
        active: args.active ?? def.active,
      });
      return args.fieldId;
    }

    const existing = await ctx.db
      .query("taskFieldDefs")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    // Ensure a unique key.
    let key = toKey(label);
    const used = new Set(existing.map((d) => d.key));
    if (used.has(key)) {
      let i = 2;
      while (used.has(`${key}_${i}`)) i++;
      key = `${key}_${i}`;
    }
    const order = existing.length ? Math.max(...existing.map((d) => d.order)) + 1 : 0;
    return await ctx.db.insert("taskFieldDefs", {
      orgId,
      key,
      label: label.slice(0, 60),
      type: args.type,
      options,
      order,
      active: args.active ?? true,
    });
  },
});

export const remove = mutation({
  args: { fieldId: v.id("taskFieldDefs") },
  returns: v.null(),
  handler: async (ctx, { fieldId }) => {
    const { orgId } = await requireFieldManage(ctx);
    const def = await ctx.db.get(fieldId);
    if (!def || def.orgId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Field not found." });
    }
    // Values keyed by def.key are left on tasks harmlessly (ignored without a
    // def), so no task rewrite is needed on delete.
    await ctx.db.delete(fieldId);
    return null;
  },
});
