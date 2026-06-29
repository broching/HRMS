import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requireOrg, getOrgContext } from "./auth";
import { employeeByUserId } from "./employees";
import { feedAudience } from "./lib/enums";
import { feedPostRow } from "./lib/validators";
import { writeAuditLog } from "./lib/audit";

// ─── Helpers ─────────────────────────────────────────────────────────────

const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)$/i;

// Minimal defense-in-depth sanitisation of rich-text HTML before storing.
// Tiptap only emits a limited tag set, but we strip script/style blocks,
// inline event handlers, and javascript: URLs in case the API is hit directly.
function sanitizeHtml(html: string): string {
  return html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "")
    .slice(0, 20000);
}

// Keep only a recognisable YouTube watch/share/embed URL; store as-is (the
// client extracts the video id for the embed). Returns undefined for blanks or
// non-YouTube links so we don't render a broken player.
function normalizeYoutube(url: string | undefined): string | undefined {
  const u = url?.trim();
  if (!u) return undefined;
  if (!/(?:youtube\.com|youtu\.be)/i.test(u)) {
    throw new Error("Enter a valid YouTube link.");
  }
  return u;
}

interface PostInput {
  title: string;
  audience: "all" | "specific" | "department" | "office";
  audienceDepartmentId?: Id<"departments">;
  audienceOfficeId?: Id<"offices">;
  audienceEmployeeIds?: Id<"employees">[];
  pinned: boolean;
  isEvent: boolean;
  eventDate?: string;
  eventEndDate?: string;
}

// Shared validation for create + update.
function validatePostInput(args: PostInput, isAdminHr: boolean): void {
  if (!args.title.trim()) throw new Error("Give the post a title.");
  if (
    (args.audience === "department" ||
      args.audience === "office" ||
      args.pinned) &&
    !isAdminHr
  ) {
    throw new Error(
      "Only HR or admins can pin posts or target a department/office.",
    );
  }
  if (args.audience === "department" && !args.audienceDepartmentId) {
    throw new Error("Choose a department to share with.");
  }
  if (args.audience === "office" && !args.audienceOfficeId) {
    throw new Error("Choose an office to share with.");
  }
  if (
    args.audience === "specific" &&
    (!args.audienceEmployeeIds || args.audienceEmployeeIds.length === 0)
  ) {
    throw new Error("Choose at least one employee to share with.");
  }
  if (args.isEvent && !args.eventDate) {
    throw new Error("An event needs a date.");
  }
  if (args.isEvent && args.eventEndDate && args.eventDate &&
      args.eventEndDate < args.eventDate) {
    throw new Error("Event end date is before the start date.");
  }
}

async function hydratePost(
  ctx: QueryCtx,
  post: Doc<"feedPosts">,
  viewer: { userId: Id<"users">; isAdminHr: boolean },
) {
  const author = await ctx.db.get(post.authorUserId);

  let audienceLabel = "All employees";
  if (post.audience === "specific") {
    const n = post.audienceEmployeeIds?.length ?? 0;
    audienceLabel = `${n} employee${n === 1 ? "" : "s"}`;
  } else if (post.audience === "department") {
    const dept = post.audienceDepartmentId
      ? await ctx.db.get(post.audienceDepartmentId)
      : null;
    audienceLabel = dept?.name ?? "Department";
  } else if (post.audience === "office") {
    const office = post.audienceOfficeId
      ? await ctx.db.get(post.audienceOfficeId)
      : null;
    audienceLabel = office?.name ?? "Office";
  }

  const storageIds = post.mediaStorageIds ?? [];
  const names = post.mediaNames ?? [];
  const media = await Promise.all(
    storageIds.map(async (sid, i) => {
      const name = names[i] ?? "attachment";
      return {
        storageId: sid,
        url: await ctx.storage.getUrl(sid),
        name,
        isImage: IMAGE_RE.test(name),
      };
    }),
  );

  const isOwnerOrManager = viewer.isAdminHr || post.authorUserId === viewer.userId;

  return {
    _id: post._id,
    _creationTime: post._creationTime,
    authorName: author?.name ?? "Unknown",
    authorPhotoUrl: author?.imageUrl ?? null,
    title: post.title,
    body: post.body,
    audience: post.audience,
    audienceLabel,
    audienceDepartmentId: post.audienceDepartmentId ?? null,
    audienceOfficeId: post.audienceOfficeId ?? null,
    audienceEmployeeIds: post.audienceEmployeeIds ?? [],
    pinned: post.pinned,
    isEvent: post.isEvent,
    eventDate: post.eventDate ?? null,
    eventEndDate: post.eventEndDate ?? null,
    eventLocation: post.eventLocation ?? null,
    youtubeUrl: post.youtubeUrl ?? null,
    media,
    canDelete: isOwnerOrManager,
    canEdit: isOwnerOrManager,
    canPin: viewer.isAdminHr,
  };
}

// ─── Queries ─────────────────────────────────────────────────────────────

export const list = query({
  args: {},
  returns: v.array(feedPostRow),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    const isAdminHr = orgCtx.role === "admin" || orgCtx.role === "hr";
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);

    const posts = await ctx.db
      .query("feedPosts")
      .withIndex("by_org", (q) => q.eq("orgId", orgCtx.orgId))
      .order("desc")
      .take(100);

    const visible = posts.filter((p) => {
      if (p.audience === "all") return true;
      if (p.authorUserId === orgCtx.userId) return true;
      if (isAdminHr) return true;
      if (!own) return false;
      if (p.audience === "department")
        return !!own.departmentId && own.departmentId === p.audienceDepartmentId;
      if (p.audience === "office")
        return !!own.officeId && own.officeId === p.audienceOfficeId;
      if (p.audience === "specific")
        return (p.audienceEmployeeIds ?? []).includes(own._id);
      return false;
    });

    // Pinned first, then newest (the query is already newest-first).
    visible.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b._creationTime - a._creationTime;
    });

    return await Promise.all(
      visible.map((p) =>
        hydratePost(ctx, p, { userId: orgCtx.userId, isAdminHr }),
      ),
    );
  },
});

// ─── Mutations ─────────────────────────────────────────────────────────────

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireOrg(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    body: v.string(),
    audience: feedAudience,
    audienceDepartmentId: v.optional(v.id("departments")),
    audienceOfficeId: v.optional(v.id("offices")),
    audienceEmployeeIds: v.optional(v.array(v.id("employees"))),
    pinned: v.boolean(),
    isEvent: v.boolean(),
    eventDate: v.optional(v.string()),
    eventEndDate: v.optional(v.string()),
    eventLocation: v.optional(v.string()),
    youtubeUrl: v.optional(v.string()),
    mediaStorageIds: v.optional(v.array(v.id("_storage"))),
    mediaNames: v.optional(v.array(v.string())),
    notifyByEmail: v.optional(v.boolean()),
  },
  returns: v.id("feedPosts"),
  handler: async (ctx, args) => {
    const { orgId, userId, role } = await requireOrg(ctx);
    const isAdminHr = role === "admin" || role === "hr";
    validatePostInput(args, isAdminHr);

    const postId = await ctx.db.insert("feedPosts", {
      orgId,
      authorUserId: userId,
      title: args.title.trim(),
      body: sanitizeHtml(args.body),
      audience: args.audience,
      audienceDepartmentId:
        args.audience === "department" ? args.audienceDepartmentId : undefined,
      audienceOfficeId:
        args.audience === "office" ? args.audienceOfficeId : undefined,
      audienceEmployeeIds:
        args.audience === "specific" ? args.audienceEmployeeIds : undefined,
      pinned: args.pinned,
      isEvent: args.isEvent,
      eventDate: args.isEvent ? args.eventDate : undefined,
      eventEndDate: args.isEvent ? args.eventEndDate : undefined,
      eventLocation: args.isEvent ? args.eventLocation?.trim() : undefined,
      youtubeUrl: normalizeYoutube(args.youtubeUrl),
      mediaStorageIds: args.mediaStorageIds,
      mediaNames: args.mediaNames,
      notifyByEmail: args.notifyByEmail,
    });

    if (args.notifyByEmail) {
      // Real email isn't wired yet — fan out in-app notifications instead.
      const recipients = await resolveRecipients(ctx, orgId, args);
      let sent = 0;
      for (const rid of recipients) {
        if (rid === userId || sent >= 200) continue;
        await ctx.db.insert("notifications", {
          orgId,
          recipientUserId: rid,
          type: "feed.post",
          title: "New announcement",
          body: args.title.trim(),
          entityRef: { table: "feedPosts", id: postId },
          read: false,
        });
        sent += 1;
      }
    }

    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "feed.create",
      entity: "feedPosts",
      entityId: postId,
      after: { audience: args.audience, pinned: args.pinned },
    });
    return postId;
  },
});

// Collect recipient user ids for an audience (used only for notifications).
async function resolveRecipients(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  args: {
    audience: Doc<"feedPosts">["audience"];
    audienceDepartmentId?: Id<"departments">;
    audienceOfficeId?: Id<"offices">;
    audienceEmployeeIds?: Id<"employees">[];
  },
): Promise<Id<"users">[]> {
  if (args.audience === "all") {
    const members = await ctx.db
      .query("members")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    return members.filter((m) => m.status === "active").map((m) => m.userId);
  }

  let employees: Doc<"employees">[] = [];
  if (args.audience === "specific") {
    const ids = args.audienceEmployeeIds ?? [];
    employees = (await Promise.all(ids.map((id) => ctx.db.get(id)))).filter(
      (e): e is Doc<"employees"> => e !== null && e.orgId === orgId,
    );
  } else {
    const all = await ctx.db
      .query("employees")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    employees = all.filter((e) =>
      args.audience === "department"
        ? e.departmentId === args.audienceDepartmentId
        : e.officeId === args.audienceOfficeId,
    );
  }
  return employees
    .map((e) => e.userId)
    .filter((id): id is Id<"users"> => !!id);
}

export const update = mutation({
  args: {
    postId: v.id("feedPosts"),
    title: v.string(),
    body: v.string(),
    audience: feedAudience,
    audienceDepartmentId: v.optional(v.id("departments")),
    audienceOfficeId: v.optional(v.id("offices")),
    audienceEmployeeIds: v.optional(v.array(v.id("employees"))),
    pinned: v.boolean(),
    isEvent: v.boolean(),
    eventDate: v.optional(v.string()),
    eventEndDate: v.optional(v.string()),
    eventLocation: v.optional(v.string()),
    youtubeUrl: v.optional(v.string()),
    mediaStorageIds: v.optional(v.array(v.id("_storage"))),
    mediaNames: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { orgId, userId, role } = await requireOrg(ctx);
    const isAdminHr = role === "admin" || role === "hr";
    const post = await ctx.db.get(args.postId);
    if (!post || post.orgId !== orgId) throw new Error("Post not found.");
    if (!isAdminHr && post.authorUserId !== userId) {
      throw new Error("Not authorized to edit this post.");
    }
    validatePostInput(args, isAdminHr);

    // Delete media blobs that were removed during the edit.
    const oldIds = post.mediaStorageIds ?? [];
    const newIds = new Set(args.mediaStorageIds ?? []);
    for (const sid of oldIds) {
      if (!newIds.has(sid)) await ctx.storage.delete(sid);
    }

    await ctx.db.patch(args.postId, {
      title: args.title.trim(),
      body: sanitizeHtml(args.body),
      audience: args.audience,
      audienceDepartmentId:
        args.audience === "department" ? args.audienceDepartmentId : undefined,
      audienceOfficeId:
        args.audience === "office" ? args.audienceOfficeId : undefined,
      audienceEmployeeIds:
        args.audience === "specific" ? args.audienceEmployeeIds : undefined,
      pinned: args.pinned,
      isEvent: args.isEvent,
      eventDate: args.isEvent ? args.eventDate : undefined,
      eventEndDate: args.isEvent ? args.eventEndDate : undefined,
      eventLocation: args.isEvent ? args.eventLocation?.trim() : undefined,
      youtubeUrl: normalizeYoutube(args.youtubeUrl),
      mediaStorageIds: args.mediaStorageIds,
      mediaNames: args.mediaNames,
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "feed.update",
      entity: "feedPosts",
      entityId: args.postId,
    });
    return null;
  },
});

export const remove = mutation({
  args: { postId: v.id("feedPosts") },
  returns: v.null(),
  handler: async (ctx, { postId }) => {
    const { orgId, userId, role } = await requireOrg(ctx);
    const post = await ctx.db.get(postId);
    if (!post || post.orgId !== orgId) throw new Error("Post not found.");
    const isAdminHr = role === "admin" || role === "hr";
    if (!isAdminHr && post.authorUserId !== userId) {
      throw new Error("Not authorized to delete this post.");
    }
    for (const sid of post.mediaStorageIds ?? []) {
      await ctx.storage.delete(sid);
    }
    await ctx.db.delete(postId);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "feed.remove",
      entity: "feedPosts",
      entityId: postId,
    });
    return null;
  },
});

export const togglePin = mutation({
  args: { postId: v.id("feedPosts"), pinned: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { postId, pinned }) => {
    const { orgId, role } = await requireOrg(ctx);
    if (role !== "admin" && role !== "hr") {
      throw new Error("Only HR or admins can pin posts.");
    }
    const post = await ctx.db.get(postId);
    if (!post || post.orgId !== orgId) throw new Error("Post not found.");
    await ctx.db.patch(postId, { pinned });
    return null;
  },
});
