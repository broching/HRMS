import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getOrgContext, requireOrg } from "./auth";

const notificationRow = v.object({
  _id: v.id("notifications"),
  _creationTime: v.number(),
  type: v.string(),
  title: v.string(),
  body: v.optional(v.string()),
  entityRef: v.optional(v.object({ table: v.string(), id: v.string() })),
  read: v.boolean(),
});

// Recent notifications for the signed-in user in the active org (newest first).
export const list = query({
  args: {},
  returns: v.array(notificationRow),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_read", (q) =>
        q.eq("recipientUserId", orgCtx.userId),
      )
      .order("desc")
      .take(80);
    return rows
      .filter((n) => n.orgId === orgCtx.orgId)
      .slice(0, 60)
      .map((n) => ({
        _id: n._id,
        _creationTime: n._creationTime,
        type: n.type,
        title: n.title,
        body: n.body,
        entityRef: n.entityRef,
        read: n.read,
      }));
  },
});

// Count of unread notifications (bounded by the unread set).
export const unreadCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return 0;
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_read", (q) =>
        q.eq("recipientUserId", orgCtx.userId).eq("read", false),
      )
      .collect();
    return unread.filter((n) => n.orgId === orgCtx.orgId).length;
  },
});

export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, { notificationId }) => {
    const orgCtx = await requireOrg(ctx);
    const n = await ctx.db.get(notificationId);
    if (!n || n.recipientUserId !== orgCtx.userId) return null;
    if (!n.read) await ctx.db.patch(notificationId, { read: true });
    return null;
  },
});

export const markAllRead = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const orgCtx = await requireOrg(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_read", (q) =>
        q.eq("recipientUserId", orgCtx.userId).eq("read", false),
      )
      .collect();
    for (const n of unread) {
      if (n.orgId === orgCtx.orgId) await ctx.db.patch(n._id, { read: true });
    }
    return null;
  },
});
