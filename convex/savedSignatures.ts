import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrg } from "./auth";

// A user may keep a handful of reusable signatures. Cap to keep the picker
// tidy and storage bounded.
const MAX_SAVED = 8;

// The signatures the current user has saved in the active org, newest first,
// each with a resolved image URL for the picker.
export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("savedSignatures"),
      _creationTime: v.number(),
      label: v.string(),
      storageId: v.id("_storage"),
      url: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const orgCtx = await requireOrg(ctx);
    const rows = await ctx.db
      .query("savedSignatures")
      .withIndex("by_org_and_user", (q) =>
        q.eq("orgId", orgCtx.orgId).eq("userId", orgCtx.userId),
      )
      .order("desc")
      .take(MAX_SAVED);
    return Promise.all(
      rows.map(async (r) => ({
        _id: r._id,
        _creationTime: r._creationTime,
        label: r.label,
        storageId: r.storageId,
        url: await ctx.storage.getUrl(r.storageId),
      })),
    );
  },
});

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireOrg(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

// Save a signature (already uploaded to storage) for reuse. The same storageId
// may also be referenced by the document just signed — that's intentional and
// why `remove` never deletes the storage.
export const save = mutation({
  args: { storageId: v.id("_storage"), label: v.string() },
  returns: v.id("savedSignatures"),
  handler: async (ctx, { storageId, label }) => {
    const orgCtx = await requireOrg(ctx);
    const trimmed = label.trim().slice(0, 60) || "My signature";

    const existing = await ctx.db
      .query("savedSignatures")
      .withIndex("by_org_and_user", (q) =>
        q.eq("orgId", orgCtx.orgId).eq("userId", orgCtx.userId),
      )
      .order("desc")
      .take(MAX_SAVED + 1);
    if (existing.length >= MAX_SAVED) {
      // Drop the oldest to make room.
      const oldest = existing[existing.length - 1];
      await ctx.db.delete(oldest._id);
    }

    return await ctx.db.insert("savedSignatures", {
      orgId: orgCtx.orgId,
      userId: orgCtx.userId,
      storageId,
      label: trimmed,
    });
  },
});

// Remove a saved signature. Deletes only this row (never the storage blob) so
// any document that applied this signature keeps rendering it.
export const remove = mutation({
  args: { id: v.id("savedSignatures") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const orgCtx = await requireOrg(ctx);
    const row = await ctx.db.get(id);
    if (row && row.userId === orgCtx.userId && row.orgId === orgCtx.orgId) {
      await ctx.db.delete(id);
    }
    return null;
  },
});
