import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { equipmentStatus } from "./lib/enums";
import { requireOrg, requirePermission } from "./auth";
import { ctxHasPermission } from "./auth";
import { writeAuditLog } from "./lib/audit";
import { equipmentRow } from "./lib/validators";

// Assets lent to an employee. Viewable by the employee themselves or HR/admin
// (employees:read:all) — not managers. Managed by HR (employees:manage).
export const listForEmployee = query({
  args: { employeeId: v.id("employees") },
  returns: v.array(equipmentRow),
  handler: async (ctx, { employeeId }) => {
    const orgCtx = await requireOrg(ctx);
    const employee = await ctx.db.get(employeeId);
    if (!employee || employee.orgId !== orgCtx.orgId) {
      throw new Error("Employee not found.");
    }
    const isSelf = !!employee.userId && employee.userId === orgCtx.userId;
    if (!isSelf && !ctxHasPermission(orgCtx, "employees:read:all")) {
      throw new Error("Not authorized to view this equipment.");
    }
    const rows = await ctx.db
      .query("equipment")
      .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
      .collect();
    rows.sort((a, b) => b._creationTime - a._creationTime);
    return rows.map((e) => ({
      _id: e._id,
      _creationTime: e._creationTime,
      employeeId: e.employeeId,
      name: e.name,
      category: e.category ?? null,
      serialNumber: e.serialNumber ?? null,
      assignedDate: e.assignedDate ?? null,
      returnedDate: e.returnedDate ?? null,
      status: e.status,
      note: e.note ?? null,
    }));
  },
});

const fields = {
  name: v.string(),
  category: v.optional(v.string()),
  serialNumber: v.optional(v.string()),
  assignedDate: v.optional(v.string()),
  returnedDate: v.optional(v.string()),
  status: equipmentStatus,
  note: v.optional(v.string()),
};

export const add = mutation({
  args: { employeeId: v.id("employees"), ...fields },
  returns: v.id("equipment"),
  handler: async (ctx, { employeeId, ...rest }) => {
    const { orgId, userId } = await requirePermission(ctx, "employees:manage");
    const employee = await ctx.db.get(employeeId);
    if (!employee || employee.orgId !== orgId) {
      throw new Error("Employee not found.");
    }
    const id = await ctx.db.insert("equipment", {
      orgId,
      employeeId,
      ...rest,
      createdBy: userId,
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "equipment.add",
      entity: "equipment",
      entityId: id,
      after: { employeeId, name: rest.name },
    });
    return id;
  },
});

export const update = mutation({
  args: { equipmentId: v.id("equipment"), ...fields },
  returns: v.null(),
  handler: async (ctx, { equipmentId, ...rest }) => {
    const { orgId, userId } = await requirePermission(ctx, "employees:manage");
    const existing = await ctx.db.get(equipmentId);
    if (!existing || existing.orgId !== orgId) {
      throw new Error("Equipment not found.");
    }
    await ctx.db.patch(equipmentId, {
      name: rest.name,
      category: rest.category,
      serialNumber: rest.serialNumber,
      assignedDate: rest.assignedDate,
      returnedDate: rest.returnedDate,
      status: rest.status,
      note: rest.note,
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "equipment.update",
      entity: "equipment",
      entityId: equipmentId,
    });
    return null;
  },
});

export const remove = mutation({
  args: { equipmentId: v.id("equipment") },
  returns: v.null(),
  handler: async (ctx, { equipmentId }) => {
    const { orgId, userId } = await requirePermission(ctx, "employees:manage");
    const existing = await ctx.db.get(equipmentId);
    if (!existing || existing.orgId !== orgId) {
      throw new Error("Equipment not found.");
    }
    await ctx.db.delete(equipmentId);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "equipment.remove",
      entity: "equipment",
      entityId: equipmentId,
    });
    return null;
  },
});
