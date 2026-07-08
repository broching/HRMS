import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireOrg, requirePermission } from "./auth";
import { writeAuditLog } from "./lib/audit";
import { officeDoc } from "./lib/validators";
import { officeMileageSettings } from "./lib/enums";

const geo = v.object({ lat: v.number(), lng: v.number() });

export const list = query({
  args: {},
  returns: v.array(officeDoc),
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    return await ctx.db
      .query("offices")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
  },
});

export const get = query({
  args: { id: v.id("offices") },
  returns: v.union(officeDoc, v.null()),
  handler: async (ctx, { id }) => {
    const { orgId } = await requireOrg(ctx);
    const office = await ctx.db.get(id);
    if (!office || office.orgId !== orgId) return null;
    return office;
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    address: v.optional(v.string()),
    timezone: v.string(),
    defaultCurrency: v.optional(v.string()),
    geo: v.optional(geo),
    radiusMeters: v.optional(v.number()),
    mileageSettings: v.optional(officeMileageSettings),
  },
  returns: v.id("offices"),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(ctx, "attendance:config");
    const id = await ctx.db.insert("offices", {
      orgId,
      qrEnabled: false,
      ...args,
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "office.create",
      entity: "offices",
      entityId: id,
      after: args,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("offices"),
    name: v.optional(v.string()),
    address: v.optional(v.string()),
    timezone: v.optional(v.string()),
    defaultCurrency: v.optional(v.string()),
    geo: v.optional(geo),
    radiusMeters: v.optional(v.number()),
    mileageSettings: v.optional(officeMileageSettings),
    qrEnabled: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { id, ...patch }) => {
    const { orgId } = await requirePermission(ctx, "attendance:config");
    const existing = await ctx.db.get(id);
    if (!existing || existing.orgId !== orgId)
      throw new Error("Office not found.");
    await ctx.db.patch(id, patch);
    return null;
  },
});

// Ensure the org has its protected default office (seeded as "Singapore").
// Idempotent — a no-op once a default office exists. Called from the offices
// manager so orgs created before default offices existed get backfilled.
export const ensureDefault = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "attendance:config");
    const offices = await ctx.db
      .query("offices")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    if (offices.some((o) => o.isDefault)) return null;
    await ctx.db.insert("offices", {
      orgId,
      name: "Singapore",
      timezone: "Asia/Singapore",
      defaultCurrency: "SGD",
      isDefault: true,
      qrEnabled: false,
    });
    return null;
  },
});

// Employees currently assigned to an office — used by the delete-office flow
// to block deletion (and let the admin reassign them) while any remain.
export const membersOf = query({
  args: { id: v.id("offices") },
  returns: v.array(
    v.object({
      _id: v.id("employees"),
      name: v.string(),
      employeeNumber: v.string(),
    }),
  ),
  handler: async (ctx, { id }) => {
    const { orgId } = await requirePermission(ctx, "attendance:config");
    const office = await ctx.db.get(id);
    if (!office || office.orgId !== orgId)
      throw new Error("Office not found.");
    const employees = await ctx.db
      .query("employees")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    return employees
      .filter((e) => e.officeId === id)
      .map((e) => ({
        _id: e._id,
        name: `${e.firstName} ${e.lastName}`,
        employeeNumber: e.employeeNumber,
      }));
  },
});

// Bulk-move employees to another office — used by the delete-office dialog to
// clear out an office's members before deleting it.
export const reassignMembers = mutation({
  args: {
    employeeIds: v.array(v.id("employees")),
    toOfficeId: v.id("offices"),
  },
  returns: v.null(),
  handler: async (ctx, { employeeIds, toOfficeId }) => {
    const { orgId, userId } = await requirePermission(ctx, "attendance:config");
    const toOffice = await ctx.db.get(toOfficeId);
    if (!toOffice || toOffice.orgId !== orgId) {
      throw new ConvexError("Office not found.");
    }
    for (const employeeId of employeeIds) {
      const employee = await ctx.db.get(employeeId);
      if (!employee || employee.orgId !== orgId) continue;
      await ctx.db.patch(employeeId, { officeId: toOfficeId });
    }
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "office.reassignMembers",
      entity: "offices",
      entityId: toOfficeId,
      after: { employeeIds, toOfficeId },
    });
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("offices") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { orgId, userId } = await requirePermission(ctx, "attendance:config");
    const existing = await ctx.db.get(id);
    if (!existing || existing.orgId !== orgId)
      throw new Error("Office not found.");
    if (existing.isDefault) {
      throw new Error("The default office can't be deleted.");
    }
    const remainingMembers = await ctx.db
      .query("employees")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    if (remainingMembers.some((e) => e.officeId === id)) {
      throw new ConvexError(
        "This office still has members assigned. Reassign them to another office first.",
      );
    }
    await ctx.db.delete(id);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "office.delete",
      entity: "offices",
      entityId: id,
      before: existing,
    });
    return null;
  },
});
