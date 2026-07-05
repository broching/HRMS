import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { documentType } from "./lib/enums";
import { requireOrg } from "./auth";
import { ctxHasPermission } from "./auth";
import { employeeByUserId } from "./employees";
import { writeAuditLog } from "./lib/audit";
import { documentGroupRow } from "./lib/validators";

const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|svg|heic)$/i;

// Documents (incl. identity) are part of the locked personal section: viewable
// by the employee themselves or HR/admin (employees:read:all) — not managers.
async function requireDocViewAccess(
  ctx: QueryCtx,
  employeeId: Id<"employees">,
) {
  const orgCtx = await requireOrg(ctx);
  const employee = await ctx.db.get(employeeId);
  if (!employee || employee.orgId !== orgCtx.orgId) {
    throw new Error("Employee not found.");
  }
  const isSelf = !!employee.userId && employee.userId === orgCtx.userId;
  if (isSelf || ctxHasPermission(orgCtx, "employees:read:all")) {
    return { orgCtx, employee, isSelf };
  }
  throw new Error("Not authorized to view these documents.");
}

// Upload/delete: the employee themselves or HR/admin (employees:manage).
async function requireDocManageAccess(
  ctx: MutationCtx,
  employeeId: Id<"employees">,
) {
  const orgCtx = await requireOrg(ctx);
  const employee = await ctx.db.get(employeeId);
  if (!employee || employee.orgId !== orgCtx.orgId) {
    throw new Error("Employee not found.");
  }
  const isSelf = !!employee.userId && employee.userId === orgCtx.userId;
  if (isSelf || ctxHasPermission(orgCtx, "employees:manage")) {
    return { orgCtx, employee, isSelf };
  }
  throw new Error("Not authorized to manage these documents.");
}

export const list = query({
  args: { employeeId: v.id("employees") },
  returns: v.array(documentGroupRow),
  handler: async (ctx, { employeeId }) => {
    await requireDocViewAccess(ctx, employeeId);
    const docs = await ctx.db
      .query("employeeDocuments")
      .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
      .collect();

    return await Promise.all(
      docs.map(async (d) => {
        // New docs carry storageIds + fileNames; legacy docs a single storageId.
        const ids = d.storageIds ?? (d.storageId ? [d.storageId] : []);
        const names = d.fileNames ?? [];
        const files = await Promise.all(
          ids.map(async (storageId, i) => {
            const name = names[i] ?? d.name;
            return {
              storageId,
              url: await ctx.storage.getUrl(storageId),
              name,
              isImage: IMAGE_RE.test(name),
            };
          }),
        );
        return {
          _id: d._id,
          _creationTime: d._creationTime,
          type: d.type,
          name: d.name,
          note: d.note ?? null,
          expiryDate: d.expiryDate ?? null,
          files,
        };
      }),
    );
  },
});

export const add = mutation({
  args: {
    employeeId: v.id("employees"),
    type: documentType,
    name: v.string(),
    note: v.optional(v.string()),
    storageIds: v.array(v.id("_storage")),
    fileNames: v.optional(v.array(v.string())),
    expiryDate: v.optional(v.string()),
  },
  returns: v.id("employeeDocuments"),
  handler: async (ctx, args) => {
    const { orgCtx } = await requireDocManageAccess(ctx, args.employeeId);
    if (args.storageIds.length === 0) {
      throw new Error("Attach at least one file.");
    }
    if (args.storageIds.length > 3) {
      throw new Error("A document can have at most 3 files.");
    }
    const id = await ctx.db.insert("employeeDocuments", {
      orgId: orgCtx.orgId,
      employeeId: args.employeeId,
      type: args.type,
      name: args.name,
      note: args.note,
      storageIds: args.storageIds,
      fileNames: args.fileNames,
      expiryDate: args.expiryDate,
      uploadedBy: orgCtx.userId,
    });
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "employee.document.add",
      entity: "employeeDocuments",
      entityId: id,
      after: { employeeId: args.employeeId, type: args.type, name: args.name },
    });
    return id;
  },
});

// Edit an existing document: rename, change the note, and/or remove individual
// files. At least one file must remain (delete the whole document otherwise).
export const update = mutation({
  args: {
    documentId: v.id("employeeDocuments"),
    name: v.optional(v.string()),
    note: v.optional(v.string()),
    removeStorageIds: v.optional(v.array(v.id("_storage"))),
  },
  returns: v.null(),
  handler: async (ctx, { documentId, name, note, removeStorageIds }) => {
    const doc = await ctx.db.get(documentId);
    if (!doc) throw new Error("Document not found.");
    const { orgCtx } = await requireDocManageAccess(ctx, doc.employeeId);

    const ids = doc.storageIds ?? (doc.storageId ? [doc.storageId] : []);
    const names = doc.fileNames ?? ids.map(() => doc.name);
    const toRemove = new Set(removeStorageIds ?? []);

    const keptIds: typeof ids = [];
    const keptNames: string[] = [];
    ids.forEach((sid, i) => {
      if (toRemove.has(sid)) return;
      keptIds.push(sid);
      keptNames.push(names[i] ?? doc.name);
    });
    if (keptIds.length === 0) {
      throw new Error(
        "A document must keep at least one file — delete the document instead.",
      );
    }
    for (const sid of toRemove) await ctx.storage.delete(sid);

    await ctx.db.patch(documentId, {
      name: name?.trim() || doc.name,
      note: note === undefined ? doc.note : note.trim() || undefined,
      storageIds: keptIds,
      fileNames: keptNames,
      storageId: undefined, // migrate off the legacy single-file field
    });
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "employee.document.update",
      entity: "employeeDocuments",
      entityId: documentId,
    });
    return null;
  },
});

export const remove = mutation({
  args: { documentId: v.id("employeeDocuments") },
  returns: v.null(),
  handler: async (ctx, { documentId }) => {
    const doc = await ctx.db.get(documentId);
    if (!doc) throw new Error("Document not found.");
    const { orgCtx } = await requireDocManageAccess(ctx, doc.employeeId);
    const ids = doc.storageIds ?? (doc.storageId ? [doc.storageId] : []);
    for (const sid of ids) await ctx.storage.delete(sid);
    await ctx.db.delete(documentId);
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "employee.document.remove",
      entity: "employeeDocuments",
      entityId: documentId,
      before: { name: doc.name },
    });
    return null;
  },
});
