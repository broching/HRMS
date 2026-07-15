import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import {
  requireOrg,
  getOrgContext,
  OrgContext,
  ctxHasPermission,
} from "./auth";
import { employeeByUserId } from "./employees";
import { isDirectManager } from "./model/org";
import { getAttendanceSettings } from "./attendanceSettings";
import { overtimeRow } from "./lib/validators";
import { writeAuditLog } from "./lib/audit";

// ─── Scope / auth ────────────────────────────────────────────────────────────
// Overtime is scheduled by the same people who build rosters: HR/admin
// (scheduling:manage) org-wide, or a manager over their direct reports.

async function assertCanScheduleEmployee(
  ctx: QueryCtx,
  orgCtx: OrgContext,
  employeeId: Id<"employees">,
) {
  if (ctxHasPermission(orgCtx, "scheduling:manage")) return;
  const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
  const target = await ctx.db.get(employeeId);
  if (own && target && isDirectManager(target, own._id)) return;
  throw new Error("Not authorized to schedule overtime for this employee.");
}

async function reviewableEmployeeIds(
  ctx: QueryCtx,
  orgCtx: OrgContext,
): Promise<{ all: boolean; ids: Set<Id<"employees">> }> {
  if (ctxHasPermission(orgCtx, "scheduling:manage")) {
    return { all: true, ids: new Set() };
  }
  const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
  if (!own) return { all: false, ids: new Set() };
  const reports = await ctx.db
    .query("employees")
    .withIndex("by_org_manager", (q) =>
      q.eq("orgId", orgCtx.orgId).eq("managerId", own._id),
    )
    .collect();
  return { all: false, ids: new Set(reports.map((r) => r._id)) };
}

async function hydrate(ctx: QueryCtx, r: Doc<"overtimeRecords">) {
  const emp = await ctx.db.get(r.employeeId);
  return {
    _id: r._id,
    _creationTime: r._creationTime,
    employeeId: r.employeeId,
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
    date: r.date,
    plannedHours: r.plannedHours,
    actualHours: r.actualHours ?? null,
    multiplier: r.multiplier,
    status: r.status,
    note: r.note ?? null,
    paid: r.pulledRunId != null,
  };
}

async function notify(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  recipientUserId: Id<"users"> | undefined,
  type: string,
  title: string,
  body: string,
) {
  if (!recipientUserId) return;
  await ctx.db.insert("notifications", {
    orgId,
    recipientUserId,
    type,
    title,
    body,
    read: false,
  });
}

function validHours(h: number): boolean {
  return Number.isFinite(h) && h > 0 && h <= 24;
}

// ─── Mutations ───────────────────────────────────────────────────────────────

// Schedule an employee for overtime on a date. Employees can only be paid OT
// that originates here.
export const schedule = mutation({
  args: {
    employeeId: v.id("employees"),
    date: v.string(),
    plannedHours: v.number(),
    multiplier: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  returns: v.id("overtimeRecords"),
  handler: async (ctx, { employeeId, date, plannedHours, multiplier, note }) => {
    const orgCtx = await requireOrg(ctx);
    await assertCanScheduleEmployee(ctx, orgCtx, employeeId);
    if (!validHours(plannedHours)) {
      throw new Error("Enter valid overtime hours (0–24).");
    }
    const target = await ctx.db.get(employeeId);
    if (!target || target.orgId !== orgCtx.orgId) {
      throw new Error("Employee not found.");
    }
    const settings = await getAttendanceSettings(ctx, orgCtx.orgId);
    const mult = multiplier ?? settings.defaultOvertimeMultiplier;
    if (!Number.isFinite(mult) || mult <= 0) {
      throw new Error("Overtime multiplier must be a positive number.");
    }

    const id = await ctx.db.insert("overtimeRecords", {
      orgId: orgCtx.orgId,
      employeeId,
      date,
      plannedHours,
      multiplier: mult,
      status: "scheduled",
      note: note?.trim() || undefined,
      scheduledBy: orgCtx.userId,
    });
    await notify(
      ctx,
      orgCtx.orgId,
      target.userId,
      "overtime.scheduled",
      "Overtime scheduled",
      `You've been scheduled for ${plannedHours}h overtime on ${date}.`,
    );
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "overtime.schedule",
      entity: "overtimeRecords",
      entityId: id,
    });
    return id;
  },
});

// Approve a scheduled OT record as worked, making it eligible for payroll pull.
export const approve = mutation({
  args: {
    overtimeId: v.id("overtimeRecords"),
    actualHours: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { overtimeId, actualHours }) => {
    const orgCtx = await requireOrg(ctx);
    const rec = await ctx.db.get(overtimeId);
    if (!rec || rec.orgId !== orgCtx.orgId) throw new Error("Not found.");
    if (rec.status !== "scheduled") {
      throw new Error("Only scheduled overtime can be approved.");
    }
    await assertCanScheduleEmployee(ctx, orgCtx, rec.employeeId);
    const hours = actualHours ?? rec.plannedHours;
    if (!validHours(hours)) throw new Error("Enter valid worked hours (0–24).");

    await ctx.db.patch(overtimeId, {
      status: "approved",
      actualHours: hours,
      reviewedBy: orgCtx.userId,
      decidedAt: Date.now(),
    });
    const emp = await ctx.db.get(rec.employeeId);
    await notify(
      ctx,
      orgCtx.orgId,
      emp?.userId,
      "overtime.approved",
      "Overtime approved",
      `Your ${hours}h overtime on ${rec.date} was approved.`,
    );
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "overtime.approve",
      entity: "overtimeRecords",
      entityId: overtimeId,
    });
    return null;
  },
});

// Reject a scheduled OT record (won't be paid).
export const reject = mutation({
  args: { overtimeId: v.id("overtimeRecords"), note: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { overtimeId, note }) => {
    const orgCtx = await requireOrg(ctx);
    const rec = await ctx.db.get(overtimeId);
    if (!rec || rec.orgId !== orgCtx.orgId) throw new Error("Not found.");
    if (rec.status !== "scheduled") {
      throw new Error("Only scheduled overtime can be rejected.");
    }
    await assertCanScheduleEmployee(ctx, orgCtx, rec.employeeId);
    await ctx.db.patch(overtimeId, {
      status: "rejected",
      note: note?.trim() || rec.note,
      reviewedBy: orgCtx.userId,
      decidedAt: Date.now(),
    });
    const emp = await ctx.db.get(rec.employeeId);
    await notify(
      ctx,
      orgCtx.orgId,
      emp?.userId,
      "overtime.rejected",
      "Overtime rejected",
      `Your scheduled overtime on ${rec.date} was rejected.`,
    );
    return null;
  },
});

// Cancel an OT record. Blocked once it's been pulled into payroll.
export const cancel = mutation({
  args: { overtimeId: v.id("overtimeRecords") },
  returns: v.null(),
  handler: async (ctx, { overtimeId }) => {
    const orgCtx = await requireOrg(ctx);
    const rec = await ctx.db.get(overtimeId);
    if (!rec || rec.orgId !== orgCtx.orgId) throw new Error("Not found.");
    await assertCanScheduleEmployee(ctx, orgCtx, rec.employeeId);
    if (rec.pulledRunId) {
      throw new Error("This overtime has already been paid and can't be cancelled.");
    }
    await ctx.db.patch(overtimeId, { status: "cancelled" });
    return null;
  },
});

// ─── Queries ─────────────────────────────────────────────────────────────────

// The caller's own overtime records.
export const myOvertime = query({
  args: {},
  returns: v.array(overtimeRow),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    if (!own) return [];
    const rows = await ctx.db
      .query("overtimeRecords")
      .withIndex("by_employee", (q) => q.eq("employeeId", own._id))
      .order("desc")
      .take(100);
    return await Promise.all(rows.map((r) => hydrate(ctx, r)));
  },
});

// Overtime records the caller can review/manage (manager-scoped or HR/admin).
export const reviewList = query({
  args: {},
  returns: v.array(overtimeRow),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    const scope = await reviewableEmployeeIds(ctx, orgCtx);
    if (!scope.all && scope.ids.size === 0) return [];

    const all = await ctx.db
      .query("overtimeRecords")
      .withIndex("by_org", (q) => q.eq("orgId", orgCtx.orgId))
      .order("desc")
      .take(300);
    const visible = scope.all
      ? all
      : all.filter((r) => scope.ids.has(r.employeeId));
    return await Promise.all(visible.map((r) => hydrate(ctx, r)));
  },
});
