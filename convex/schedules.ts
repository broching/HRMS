import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import {
  requireOrg,
  getOrgContext,
  requirePermission,
  OrgContext,
} from "./auth";
import { ctxHasPermission } from "./auth";
import { employeeByUserId } from "./employees";
import { shiftAssignmentRow, schedulableEmployee } from "./lib/validators";
import { writeAuditLog } from "./lib/audit";
import { shiftDurationMinutes, parseHHMM } from "./model/shiftTime";

// ─── Scope ───────────────────────────────────────────────────────────────────

// Which employees the caller may schedule: HR/admin (scheduling:manage) cover
// the whole org; a manager covers their direct reports.
type Scope = { all: boolean; ids: Set<Id<"employees">> };

async function schedulableScope(
  ctx: QueryCtx,
  orgCtx: OrgContext,
): Promise<Scope> {
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

async function assertCanScheduleEmployee(
  ctx: QueryCtx,
  orgCtx: OrgContext,
  employeeId: Id<"employees">,
) {
  if (ctxHasPermission(orgCtx, "scheduling:manage")) return;
  const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
  const target = await ctx.db.get(employeeId);
  if (own && target && target.managerId === own._id) return;
  throw new Error("Not authorized to schedule this employee.");
}

// ─── Hydration ───────────────────────────────────────────────────────────────

async function hydrateAssignment(ctx: QueryCtx, a: Doc<"shiftAssignments">) {
  const [emp, template, office] = await Promise.all([
    ctx.db.get(a.employeeId),
    a.shiftTemplateId ? ctx.db.get(a.shiftTemplateId) : Promise.resolve(null),
    a.officeId ? ctx.db.get(a.officeId) : Promise.resolve(null),
  ]);
  return {
    _id: a._id,
    _creationTime: a._creationTime,
    employeeId: a.employeeId,
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
    date: a.date,
    startTime: a.startTime,
    endTime: a.endTime,
    breakMinutes: a.breakMinutes,
    durationMinutes: shiftDurationMinutes(a.startTime, a.endTime, a.breakMinutes),
    color: a.color,
    shiftTemplateId: a.shiftTemplateId ?? null,
    templateName: template?.name ?? null,
    officeId: a.officeId ?? null,
    officeName: office?.name ?? null,
    status: a.status,
    note: a.note ?? null,
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

// ─── Queries ─────────────────────────────────────────────────────────────────

// Employees the caller can place on a roster.
export const schedulableEmployees = query({
  args: {},
  returns: v.array(schedulableEmployee),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    const scope = await schedulableScope(ctx, orgCtx);

    let employees: Doc<"employees">[];
    if (scope.all) {
      const all = await ctx.db
        .query("employees")
        .withIndex("by_org", (q) => q.eq("orgId", orgCtx.orgId))
        .collect();
      employees = all.filter((e) => e.status !== "terminated");
    } else {
      if (scope.ids.size === 0) return [];
      employees = (
        await Promise.all([...scope.ids].map((id) => ctx.db.get(id)))
      ).filter((e): e is Doc<"employees"> => e !== null);
    }

    const positions = await ctx.db
      .query("positions")
      .withIndex("by_org", (q) => q.eq("orgId", orgCtx.orgId))
      .collect();
    const posTitle = new Map(positions.map((p) => [p._id, p.title]));

    employees.sort((a, b) =>
      `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`),
    );
    return employees.map((e) => ({
      _id: e._id,
      name: `${e.preferredName ?? e.firstName} ${e.lastName}`,
      positionTitle: e.positionId ? (posTitle.get(e.positionId) ?? null) : null,
    }));
  },
});

// All assignments in a date range the caller can manage (roster builder).
export const roster = query({
  args: { start: v.string(), end: v.string() },
  returns: v.array(shiftAssignmentRow),
  handler: async (ctx, { start, end }) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    const scope = await schedulableScope(ctx, orgCtx);
    if (!scope.all && scope.ids.size === 0) return [];

    const rows = await ctx.db
      .query("shiftAssignments")
      .withIndex("by_org_date", (q) =>
        q.eq("orgId", orgCtx.orgId).gte("date", start).lte("date", end),
      )
      .take(2000);
    const visible = rows.filter(
      (a) =>
        a.status !== "cancelled" &&
        (scope.all || scope.ids.has(a.employeeId)),
    );
    return await Promise.all(visible.map((a) => hydrateAssignment(ctx, a)));
  },
});

// The caller's own published shifts in a date range (self-service).
export const myShifts = query({
  args: { start: v.string(), end: v.string() },
  returns: v.array(shiftAssignmentRow),
  handler: async (ctx, { start, end }) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    if (!own) return [];
    const rows = await ctx.db
      .query("shiftAssignments")
      .withIndex("by_employee_status_date", (q) =>
        q
          .eq("employeeId", own._id)
          .eq("status", "published")
          .gte("date", start)
          .lte("date", end),
      )
      .collect();
    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return await Promise.all(rows.map((a) => hydrateAssignment(ctx, a)));
  },
});

// ─── Mutations ───────────────────────────────────────────────────────────────

export const assign = mutation({
  args: {
    employeeId: v.id("employees"),
    date: v.string(),
    shiftTemplateId: v.optional(v.id("shiftTemplates")),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
    breakMinutes: v.optional(v.number()),
    color: v.optional(v.string()),
    officeId: v.optional(v.id("offices")),
    note: v.optional(v.string()),
  },
  returns: v.id("shiftAssignments"),
  handler: async (ctx, args) => {
    const orgCtx = await requireOrg(ctx);
    await assertCanScheduleEmployee(ctx, orgCtx, args.employeeId);
    const employee = await ctx.db.get(args.employeeId);
    if (!employee || employee.orgId !== orgCtx.orgId) {
      throw new Error("Employee not found.");
    }

    let startTime = args.startTime;
    let endTime = args.endTime;
    let breakMinutes = args.breakMinutes;
    let color = args.color;
    let officeId = args.officeId;
    if (args.shiftTemplateId) {
      const tpl = await ctx.db.get(args.shiftTemplateId);
      if (!tpl || tpl.orgId !== orgCtx.orgId) {
        throw new Error("Shift template not found.");
      }
      startTime = startTime ?? tpl.startTime;
      endTime = endTime ?? tpl.endTime;
      breakMinutes = breakMinutes ?? tpl.breakMinutes;
      color = color ?? tpl.color;
      officeId = officeId ?? tpl.officeId;
    }
    if (!startTime || !endTime) {
      throw new Error("A shift needs a start and end time.");
    }
    if (parseHHMM(startTime) === null || parseHHMM(endTime) === null) {
      throw new Error("Times must be in HH:MM format.");
    }

    const id = await ctx.db.insert("shiftAssignments", {
      orgId: orgCtx.orgId,
      employeeId: args.employeeId,
      date: args.date,
      shiftTemplateId: args.shiftTemplateId,
      startTime,
      endTime,
      breakMinutes: breakMinutes ?? 0,
      color: color ?? "#6366f1",
      officeId,
      status: "draft",
      note: args.note,
      createdBy: orgCtx.userId,
    });
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "shift.assign",
      entity: "shiftAssignments",
      entityId: id,
      after: { employeeId: args.employeeId, date: args.date },
    });
    return id;
  },
});

export const updateAssignment = mutation({
  args: {
    id: v.id("shiftAssignments"),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
    breakMinutes: v.optional(v.number()),
    color: v.optional(v.string()),
    officeId: v.optional(v.id("offices")),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { id, ...patch }) => {
    const orgCtx = await requireOrg(ctx);
    const existing = await ctx.db.get(id);
    if (!existing || existing.orgId !== orgCtx.orgId) {
      throw new Error("Shift not found.");
    }
    await assertCanScheduleEmployee(ctx, orgCtx, existing.employeeId);
    if (patch.startTime || patch.endTime) {
      const s = patch.startTime ?? existing.startTime;
      const e = patch.endTime ?? existing.endTime;
      if (parseHHMM(s) === null || parseHHMM(e) === null) {
        throw new Error("Times must be in HH:MM format.");
      }
    }
    await ctx.db.patch(id, patch);

    // Let the employee know if a published shift changed under them.
    if (existing.status === "published") {
      const emp = await ctx.db.get(existing.employeeId);
      await notify(
        ctx,
        orgCtx.orgId,
        emp?.userId,
        "shift.updated",
        "Shift updated",
        `Your shift on ${existing.date} was updated.`,
      );
    }
    return null;
  },
});

// Remove a draft outright; cancel (and notify) an already-published shift.
export const removeAssignment = mutation({
  args: { id: v.id("shiftAssignments") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const orgCtx = await requireOrg(ctx);
    const existing = await ctx.db.get(id);
    if (!existing || existing.orgId !== orgCtx.orgId) {
      throw new Error("Shift not found.");
    }
    await assertCanScheduleEmployee(ctx, orgCtx, existing.employeeId);

    if (existing.status === "published") {
      await ctx.db.patch(id, { status: "cancelled" });
      const emp = await ctx.db.get(existing.employeeId);
      await notify(
        ctx,
        orgCtx.orgId,
        emp?.userId,
        "shift.cancelled",
        "Shift cancelled",
        `Your shift on ${existing.date} was cancelled.`,
      );
    } else {
      await ctx.db.delete(id);
    }
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "shift.remove",
      entity: "shiftAssignments",
      entityId: id,
    });
    return null;
  },
});

// Publish every draft shift in a date range (within the caller's scope) and
// notify each affected employee once.
export const publishWeek = mutation({
  args: { start: v.string(), end: v.string() },
  returns: v.object({ published: v.number() }),
  handler: async (ctx, { start, end }) => {
    const orgCtx = await requireOrg(ctx);
    const scope = await schedulableScope(ctx, orgCtx);
    if (!scope.all && scope.ids.size === 0) return { published: 0 };

    const rows = await ctx.db
      .query("shiftAssignments")
      .withIndex("by_org_date", (q) =>
        q.eq("orgId", orgCtx.orgId).gte("date", start).lte("date", end),
      )
      .take(2000);
    const drafts = rows.filter(
      (a) => a.status === "draft" && (scope.all || scope.ids.has(a.employeeId)),
    );

    const now = Date.now();
    const affected = new Set<Id<"employees">>();
    for (const a of drafts) {
      await ctx.db.patch(a._id, { status: "published", publishedAt: now });
      affected.add(a.employeeId);
    }
    // One notification per employee.
    for (const empId of affected) {
      const emp = await ctx.db.get(empId);
      await notify(
        ctx,
        orgCtx.orgId,
        emp?.userId,
        "shift.published",
        "Schedule published",
        `Your shifts for ${start} – ${end} are now available.`,
      );
    }
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "shift.publish_week",
      entity: "shiftAssignments",
      after: { start, end, published: drafts.length },
    });
    return { published: drafts.length };
  },
});
