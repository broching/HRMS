import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { documentType } from "./lib/enums";
import { requirePermission } from "./auth";
import { requireEmployeeAccess } from "./employees";
import { writeAuditLog } from "./lib/audit";

export const list = query({
  args: { employeeId: v.id("employees") },
  returns: v.array(
    v.object({
      _id: v.id("employeeDocuments"),
      _creationTime: v.number(),
      type: documentType,
      name: v.string(),
      expiryDate: v.optional(v.string()),
      url: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, { employeeId }) => {
    // Same access rules as viewing the employee profile.
    await requireEmployeeAccess(ctx, employeeId);
    const docs = await ctx.db
      .query("employeeDocuments")
      .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
      .collect();
    return await Promise.all(
      docs.map(async (d) => ({
        _id: d._id,
        _creationTime: d._creationTime,
        type: d.type,
        name: d.name,
        expiryDate: d.expiryDate,
        url: await ctx.storage.getUrl(d.storageId),
      })),
    );
  },
});

export const add = mutation({
  args: {
    employeeId: v.id("employees"),
    type: documentType,
    name: v.string(),
    storageId: v.id("_storage"),
    expiryDate: v.optional(v.string()),
  },
  returns: v.id("employeeDocuments"),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(ctx, "employees:manage");
    const employee = await ctx.db.get(args.employeeId);
    if (!employee || employee.orgId !== orgId) {
      throw new Error("Employee not found.");
    }
    const id = await ctx.db.insert("employeeDocuments", {
      orgId,
      employeeId: args.employeeId,
      type: args.type,
      name: args.name,
      storageId: args.storageId,
      expiryDate: args.expiryDate,
      uploadedBy: userId,
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "employee.document.add",
      entity: "employeeDocuments",
      entityId: id,
      after: { employeeId: args.employeeId, type: args.type, name: args.name },
    });
    return id;
  },
});

export const remove = mutation({
  args: { documentId: v.id("employeeDocuments") },
  returns: v.null(),
  handler: async (ctx, { documentId }) => {
    const { orgId, userId } = await requirePermission(ctx, "employees:manage");
    const doc = await ctx.db.get(documentId);
    if (!doc || doc.orgId !== orgId) throw new Error("Document not found.");
    await ctx.storage.delete(doc.storageId);
    await ctx.db.delete(documentId);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "employee.document.remove",
      entity: "employeeDocuments",
      entityId: documentId,
      before: { name: doc.name },
    });
    return null;
  },
});
