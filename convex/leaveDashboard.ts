import { query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getOrgContext } from "./auth";
import { hasPermission } from "./lib/permissions";
import {
  leaveDashboardRow,
  leaveDashboardEmployeeRow,
} from "./lib/validators";

/**
 * HR Lounge → Leave dashboard reads. All require `leave:approve:all` (admin/HR)
 * and degrade to empty arrays without org context so the page never throws.
 */

async function hydrateRow(ctx: QueryCtx, req: Doc<"leaveRequests">) {
  const [emp, lt] = await Promise.all([
    ctx.db.get(req.employeeId),
    ctx.db.get(req.leaveTypeId),
  ]);
  const dept = emp?.departmentId ? await ctx.db.get(emp.departmentId) : null;
  const office = emp?.officeId ? await ctx.db.get(emp.officeId) : null;
  return {
    _id: req._id,
    _creationTime: req._creationTime,
    employeeId: req.employeeId,
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
    employeePhotoUrl: emp?.photoStorageId
      ? await ctx.storage.getUrl(emp.photoStorageId)
      : null,
    leaveTypeId: req.leaveTypeId,
    leaveTypeName: lt?.name ?? "—",
    leaveTypeColor: lt?.color ?? "#6b7280",
    startDate: req.startDate,
    endDate: req.endDate,
    startHalf: req.startHalf,
    endHalf: req.endHalf,
    totalDays: req.totalDays,
    reason: req.reason,
    status: req.status,
    attachmentUrl: req.attachmentStorageId
      ? await ctx.storage.getUrl(req.attachmentStorageId)
      : null,
    decisionNote: req.decisionNote,
    departmentId: emp?.departmentId ?? null,
    departmentName: dept?.name ?? null,
    officeId: emp?.officeId ?? null,
    officeName: office?.name ?? null,
  };
}

// Org-wide leave overlapping a date range, for the calendar overview.
export const adminCalendar = query({
  args: {
    start: v.string(),
    end: v.string(),
    departmentId: v.optional(v.id("departments")),
    officeId: v.optional(v.id("offices")),
    leaveTypeId: v.optional(v.id("leaveTypes")),
    includeInactive: v.optional(v.boolean()),
  },
  returns: v.array(leaveDashboardRow),
  handler: async (ctx, args) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx || !hasPermission(orgCtx.role, "leave:approve:all")) return [];
    const all = await ctx.db
      .query("leaveRequests")
      .withIndex("by_org", (q) => q.eq("orgId", orgCtx.orgId))
      .collect();
    const overlapping = all.filter(
      (r) =>
        r.status !== "cancelled" &&
        r.status !== "rejected" &&
        r.startDate <= args.end &&
        r.endDate >= args.start &&
        (!args.leaveTypeId || r.leaveTypeId === args.leaveTypeId),
    );
    const rows = await Promise.all(overlapping.map((r) => hydrateRow(ctx, r)));
    return rows.filter(
      (r) =>
        (!args.departmentId || r.departmentId === args.departmentId) &&
        (!args.officeId || r.officeId === args.officeId),
    );
  },
});

// Pending + info-requested leave for the right-rail Pending(N) tab.
export const pending = query({
  args: {},
  returns: v.array(leaveDashboardRow),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx || !hasPermission(orgCtx.role, "leave:approve:all")) return [];
    const [pendingReqs, infoReqs] = await Promise.all([
      ctx.db
        .query("leaveRequests")
        .withIndex("by_org_status", (q) =>
          q.eq("orgId", orgCtx.orgId).eq("status", "pending"),
        )
        .collect(),
      ctx.db
        .query("leaveRequests")
        .withIndex("by_org_status", (q) =>
          q.eq("orgId", orgCtx.orgId).eq("status", "info_requested"),
        )
        .collect(),
    ]);
    const rows = await Promise.all(
      [...pendingReqs, ...infoReqs].map((r) => hydrateRow(ctx, r)),
    );
    return rows.sort((a, b) => b._creationTime - a._creationTime);
  },
});

// Right-rail Employees(N) list with department + position labels.
export const employees = query({
  args: {
    search: v.optional(v.string()),
    departmentId: v.optional(v.id("departments")),
    officeId: v.optional(v.id("offices")),
    includeInactive: v.optional(v.boolean()),
  },
  returns: v.array(leaveDashboardEmployeeRow),
  handler: async (ctx, args) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx || !hasPermission(orgCtx.role, "leave:approve:all")) return [];
    const employees = await ctx.db
      .query("employees")
      .withIndex("by_org", (q) => q.eq("orgId", orgCtx.orgId))
      .take(500);
    const term = args.search?.trim().toLowerCase();
    const deptCache = new Map<Id<"departments">, string>();
    const posCache = new Map<Id<"positions">, string>();
    const out: Array<{
      _id: Id<"employees">;
      name: string;
      positionTitle: string | null;
      departmentName: string | null;
      photoUrl: string | null;
      status: Doc<"employees">["status"];
      _sort: string;
    }> = [];
    for (const e of employees) {
      if (e.isVacant) continue;
      if (!args.includeInactive && e.status === "terminated") continue;
      if (args.departmentId && e.departmentId !== args.departmentId) continue;
      if (args.officeId && e.officeId !== args.officeId) continue;
      const name = `${e.firstName} ${e.lastName}`;
      if (
        term &&
        !name.toLowerCase().includes(term) &&
        !e.employeeNumber.toLowerCase().includes(term)
      ) {
        continue;
      }
      let departmentName: string | null = null;
      if (e.departmentId) {
        if (!deptCache.has(e.departmentId)) {
          const d = await ctx.db.get(e.departmentId);
          deptCache.set(e.departmentId, d?.name ?? "");
        }
        departmentName = deptCache.get(e.departmentId) || null;
      }
      let positionTitle: string | null = null;
      if (e.positionId) {
        if (!posCache.has(e.positionId)) {
          const p = await ctx.db.get(e.positionId);
          posCache.set(e.positionId, p?.title ?? "");
        }
        positionTitle = posCache.get(e.positionId) || null;
      }
      out.push({
        _id: e._id,
        name,
        positionTitle,
        departmentName,
        photoUrl: e.photoStorageId
          ? await ctx.storage.getUrl(e.photoStorageId)
          : null,
        status: e.status,
        _sort: name.toLowerCase(),
      });
    }
    out.sort((a, b) => (a._sort < b._sort ? -1 : 1));
    return out.map(({ _sort, ...row }) => row);
  },
});
