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
import { isDirectManager, managerEmployeeIds, reportingSubtree } from "./model/org";
import {
  shiftAssignmentRow,
  schedulableEmployee,
  rosterDayResult,
  rosterWeekResult,
  myScheduleResult,
  rosterReportResult,
} from "./lib/validators";
import { writeAuditLog } from "./lib/audit";
import { shiftDurationMinutes, parseHHMM } from "./model/shiftTime";
import { effectiveCompensation } from "./compensation";
import { defaultPatternFor, resolvePatternFor } from "./workPatterns";
import { localMinuteOfDay } from "./model/datetime";
import {
  datesInRange,
  deriveVirtualShift,
  shiftWindowMinutes,
  computeVariance,
  otSuggestionFrom,
} from "./model/roster";

// ─── Scope ───────────────────────────────────────────────────────────────────

// Which employees the caller may schedule: HR/admin (scheduling:manage) cover
// the whole org; a manager covers their direct reports.
type Scope = { all: boolean; ids: Set<Id<"employees">> };

// Board scope. `org` (HR Lounge) is the whole org and requires scheduling:manage;
// `team` (Team workspace) is the caller's reporting subtree, regardless of any
// org-wide permission, so the Team view only ever shows who you manage.
export type RosterScope = "team" | "org";

async function rosterScopeFor(
  ctx: QueryCtx,
  orgCtx: OrgContext,
  scope: RosterScope,
): Promise<Scope> {
  if (scope === "org") {
    if (ctxHasPermission(orgCtx, "scheduling:manage")) {
      return { all: true, ids: new Set() };
    }
    return { all: false, ids: new Set() }; // not allowed org-wide
  }
  const me = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
  if (!me) return { all: false, ids: new Set() };
  const ids = await reportingSubtree(ctx, orgCtx.orgId, me._id);
  return { all: false, ids };
}

async function schedulableScope(
  ctx: QueryCtx,
  orgCtx: OrgContext,
): Promise<Scope> {
  if (ctxHasPermission(orgCtx, "scheduling:manage")) {
    return { all: true, ids: new Set() };
  }
  const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
  if (!own) return { all: false, ids: new Set() };
  // Direct reports via any manager link (primary or additional). Additional
  // managers can't be served by `by_org_manager`, so scan the org once and
  // filter on the combined manager set.
  const all = await ctx.db
    .query("employees")
    .withIndex("by_org", (q) => q.eq("orgId", orgCtx.orgId))
    .collect();
  const ids = new Set(
    all.filter((r) => managerEmployeeIds(r).includes(own._id)).map((r) => r._id),
  );
  return { all: false, ids };
}

async function assertCanScheduleEmployee(
  ctx: QueryCtx,
  orgCtx: OrgContext,
  employeeId: Id<"employees">,
) {
  if (ctxHasPermission(orgCtx, "scheduling:manage")) return;
  const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
  if (!own) throw new Error("Not authorized to schedule this employee.");
  // A manager may schedule anyone in their reporting subtree (direct or indirect
  // reports), matching how Team Attendance/Timesheets scope management.
  const subtree = await reportingSubtree(ctx, orgCtx.orgId, own._id);
  if (subtree.has(employeeId)) return;
  const target = await ctx.db.get(employeeId);
  if (target && isDirectManager(target, own._id)) return;
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

// The caller's own upcoming schedule: published shifts (or pattern-derived days
// when nothing is published yet) plus scheduled/approved overtime. Powers the
// employee Home "My Schedule" / "Shifts" card.
export const mySchedule = query({
  args: { start: v.string(), end: v.string() },
  returns: myScheduleResult,
  handler: async (ctx, { start, end }) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return { payType: "fixed" as const, days: [] };
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    if (!own) return { payType: "fixed" as const, days: [] };

    const comp = await effectiveCompensation(ctx, own._id, end);
    const payType = comp?.payType ?? "fixed";
    const defaultPattern = await defaultPatternFor(ctx, orgCtx.orgId);
    const pattern = await resolvePatternFor(ctx, own, payType, defaultPattern);

    const published = await ctx.db
      .query("shiftAssignments")
      .withIndex("by_employee_status_date", (q) =>
        q
          .eq("employeeId", own._id)
          .eq("status", "published")
          .gte("date", start)
          .lte("date", end),
      )
      .collect();
    const shiftsByDate = new Map<string, Doc<"shiftAssignments">[]>();
    for (const s of published) {
      const arr = shiftsByDate.get(s.date) ?? [];
      arr.push(s);
      shiftsByDate.set(s.date, arr);
    }

    const otRows = await ctx.db
      .query("overtimeRecords")
      .withIndex("by_employee_date", (q) =>
        q.eq("employeeId", own._id).gte("date", start).lte("date", end),
      )
      .collect();
    const otByDate = new Map<string, Doc<"overtimeRecords">[]>();
    for (const o of otRows) {
      if (o.status !== "scheduled" && o.status !== "approved") continue;
      const arr = otByDate.get(o.date) ?? [];
      arr.push(o);
      otByDate.set(o.date, arr);
    }

    const days = datesInRange(start, end).map((date) => {
      const concrete = shiftsByDate.get(date) ?? [];
      let off = false;
      let shifts: {
        startTime: string;
        endTime: string;
        breakMinutes: number;
        color: string;
        derived: boolean;
        note: string | null;
      }[] = [];
      if (concrete.length > 0) {
        shifts = concrete.map((s) => ({
          startTime: s.startTime,
          endTime: s.endTime,
          breakMinutes: s.breakMinutes,
          color: s.color,
          derived: false,
          note: s.note ?? null,
        }));
      } else if (pattern) {
        const d = deriveVirtualShift(pattern, date);
        if (d) {
          shifts = [
            {
              startTime: d.startTime,
              endTime: d.endTime,
              breakMinutes: d.breakMinutes,
              color: pattern.color ?? "#6366f1",
              derived: true,
              note: null,
            },
          ];
        } else {
          off = true;
        }
      }
      const overtime = (otByDate.get(date) ?? []).map((o) => ({
        startTime: o.startTime ?? null,
        endTime: o.endTime ?? null,
        plannedHours: o.plannedHours,
        multiplier: o.multiplier,
        status: o.status,
      }));
      return { date, off, shifts, overtime };
    });

    return { payType, days };
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
  args: {
    start: v.string(),
    end: v.string(),
    scope: v.union(v.literal("team"), v.literal("org")),
  },
  returns: v.object({ published: v.number() }),
  handler: async (ctx, { start, end, scope: scopeArg }) => {
    const orgCtx = await requireOrg(ctx);
    const scope = await rosterScopeFor(ctx, orgCtx, scopeArg);
    if (!scope.all && scope.ids.size === 0) return { published: 0 };

    const rows = await ctx.db
      .query("shiftAssignments")
      .withIndex("by_org_date", (q) =>
        q.eq("orgId", orgCtx.orgId).gte("date", start).lte("date", end),
      )
      .take(2000);

    // Materialize pattern-derived (virtual) shifts for any in-scope day that has
    // no concrete row yet, so publishing turns the whole roster real + notified.
    const hasConcrete = new Set<string>();
    for (const a of rows) {
      if (a.status !== "cancelled") hasConcrete.add(`${a.employeeId}|${a.date}`);
    }
    const enriched = await loadRosterEmployees(
      ctx,
      orgCtx,
      scope,
      undefined,
      undefined,
      end,
    );
    const dates = datesInRange(start, end);
    const now = Date.now();
    const materialized: Doc<"shiftAssignments">[] = [];
    for (const { emp, pattern } of enriched) {
      if (!pattern) continue;
      for (const date of dates) {
        if (hasConcrete.has(`${emp._id}|${date}`)) continue;
        const d = deriveVirtualShift(pattern, date);
        if (!d) continue;
        const id = await ctx.db.insert("shiftAssignments", {
          orgId: orgCtx.orgId,
          employeeId: emp._id,
          date,
          startTime: d.startTime,
          endTime: d.endTime,
          breakMinutes: d.breakMinutes,
          color: pattern.color ?? "#6366f1",
          officeId: pattern.officeId,
          status: "draft",
          createdBy: orgCtx.userId,
        });
        const doc = await ctx.db.get(id);
        if (doc) materialized.push(doc);
      }
    }

    const drafts = [...rows, ...materialized].filter(
      (a) => a.status === "draft" && (scope.all || scope.ids.has(a.employeeId)),
    );

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

// ─── Unified roster board (roster + overtime + attendance overlay) ───────────

type RosterEmployee = {
  emp: Doc<"employees">;
  payType: "fixed" | "hourly";
  pattern: Doc<"workPatterns"> | null;
  jobTitle: string | null;
};

// Resolve the in-scope employees with their effective pay type + work pattern +
// job title. `onDate` picks the compensation version for pay-type resolution.
async function loadRosterEmployees(
  ctx: QueryCtx,
  orgCtx: OrgContext,
  scope: Scope,
  departmentId: Id<"departments"> | undefined,
  teamId: Id<"teams"> | undefined,
  onDate: string,
): Promise<RosterEmployee[]> {
  let employees: Doc<"employees">[];
  if (scope.all) {
    const all = await ctx.db
      .query("employees")
      .withIndex("by_org", (q) => q.eq("orgId", orgCtx.orgId))
      .collect();
    employees = all.filter((e) => e.status !== "terminated" && !e.isVacant);
  } else {
    if (scope.ids.size === 0) return [];
    employees = (
      await Promise.all([...scope.ids].map((id) => ctx.db.get(id)))
    ).filter(
      (e): e is Doc<"employees"> =>
        e !== null && e.status !== "terminated" && !e.isVacant,
    );
  }
  if (departmentId) employees = employees.filter((e) => e.departmentId === departmentId);
  if (teamId) employees = employees.filter((e) => e.teamId === teamId);
  employees.sort((a, b) =>
    `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`),
  );

  const positions = await ctx.db
    .query("positions")
    .withIndex("by_org", (q) => q.eq("orgId", orgCtx.orgId))
    .collect();
  const posTitle = new Map(positions.map((p) => [p._id, p.title]));
  const defaultPattern = await defaultPatternFor(ctx, orgCtx.orgId);

  return await Promise.all(
    employees.map(async (emp) => {
      const comp = await effectiveCompensation(ctx, emp._id, onDate);
      const payType = comp?.payType ?? "fixed";
      const pattern = await resolvePatternFor(ctx, emp, payType, defaultPattern);
      return {
        emp,
        payType,
        pattern,
        jobTitle: emp.positionId ? (posTitle.get(emp.positionId) ?? null) : null,
      };
    }),
  );
}

// Week view: employees × days chip grid. Concrete shifts win; otherwise the
// work pattern derives a virtual shift (or marks the day off).
export const rosterWeek = query({
  args: {
    start: v.string(),
    end: v.string(),
    scope: v.union(v.literal("team"), v.literal("org")),
    departmentId: v.optional(v.id("departments")),
    teamId: v.optional(v.id("teams")),
  },
  returns: rosterWeekResult,
  handler: async (ctx, { start, end, scope: scopeArg, departmentId, teamId }) => {
    const orgCtx = await getOrgContext(ctx);
    const empty = { start, end, rows: [], draftCount: 0 };
    if (!orgCtx) return empty;
    const scope = await rosterScopeFor(ctx, orgCtx, scopeArg);
    if (!scope.all && scope.ids.size === 0) return empty;

    const enriched = await loadRosterEmployees(
      ctx,
      orgCtx,
      scope,
      departmentId,
      teamId,
      end,
    );
    const inScope = new Set(enriched.map((x) => x.emp._id));

    const shiftRows = await ctx.db
      .query("shiftAssignments")
      .withIndex("by_org_date", (q) =>
        q.eq("orgId", orgCtx.orgId).gte("date", start).lte("date", end),
      )
      .take(3000);
    const shiftsByCell = new Map<string, Doc<"shiftAssignments">[]>();
    for (const s of shiftRows) {
      if (s.status === "cancelled" || !inScope.has(s.employeeId)) continue;
      const key = `${s.employeeId}|${s.date}`;
      const arr = shiftsByCell.get(key) ?? [];
      arr.push(s);
      shiftsByCell.set(key, arr);
    }

    const otRows = await ctx.db
      .query("overtimeRecords")
      .withIndex("by_org", (q) => q.eq("orgId", orgCtx.orgId))
      .take(3000);
    const otByCell = new Map<string, Doc<"overtimeRecords">[]>();
    for (const o of otRows) {
      if (o.date < start || o.date > end || !inScope.has(o.employeeId)) continue;
      if (o.status !== "scheduled" && o.status !== "approved") continue;
      const key = `${o.employeeId}|${o.date}`;
      const arr = otByCell.get(key) ?? [];
      arr.push(o);
      otByCell.set(key, arr);
    }

    const dates = datesInRange(start, end);
    const rows = enriched.map(({ emp, payType, pattern, jobTitle }) => ({
      employeeId: emp._id,
      name: `${emp.preferredName ?? emp.firstName} ${emp.lastName}`,
      jobTitle,
      payType,
      workPatternName: pattern?.name ?? null,
      days: dates.map((date) => {
        const concrete = shiftsByCell.get(`${emp._id}|${date}`) ?? [];
        let off = false;
        let shifts: {
          shiftId: Id<"shiftAssignments"> | null;
          startTime: string;
          endTime: string;
          breakMinutes: number;
          color: string;
          derived: boolean;
          status: Doc<"shiftAssignments">["status"] | null;
          note: string | null;
        }[] = [];
        if (concrete.length > 0) {
          shifts = concrete.map((s) => ({
            shiftId: s._id,
            startTime: s.startTime,
            endTime: s.endTime,
            breakMinutes: s.breakMinutes,
            color: s.color,
            derived: false,
            status: s.status,
            note: s.note ?? null,
          }));
        } else if (pattern) {
          const d = deriveVirtualShift(pattern, date);
          if (d) {
            shifts = [
              {
                shiftId: null,
                startTime: d.startTime,
                endTime: d.endTime,
                breakMinutes: d.breakMinutes,
                color: pattern.color ?? "#6366f1",
                derived: true,
                status: null,
                note: null,
              },
            ];
          } else {
            off = true;
          }
        }
        const overtime = (otByCell.get(`${emp._id}|${date}`) ?? []).map((o) => ({
          overtimeId: o._id,
          startTime: o.startTime ?? null,
          endTime: o.endTime ?? null,
          plannedHours: o.plannedHours,
          multiplier: o.multiplier,
          status: o.status,
        }));
        return { date, off, shifts, overtime };
      }),
    }));

    const draftCount = shiftRows.filter(
      (s) => inScope.has(s.employeeId) && s.status === "draft",
    ).length;
    return { start, end, rows, draftCount };
  },
});

// Day view: one column per person on the hour grid. Overlays scheduled shifts
// (concrete or pattern-derived), scheduled overtime, and actual attendance, with
// schedule-vs-actual variance and an OT suggestion when work ran past the end.
export const rosterDay = query({
  args: {
    date: v.string(),
    scope: v.union(v.literal("team"), v.literal("org")),
    departmentId: v.optional(v.id("departments")),
    teamId: v.optional(v.id("teams")),
  },
  returns: rosterDayResult,
  handler: async (ctx, { date, scope: scopeArg, departmentId, teamId }) => {
    const orgCtx = await getOrgContext(ctx);
    const empty = { date, people: [], peopleCount: 0 };
    if (!orgCtx) return empty;
    const scope = await rosterScopeFor(ctx, orgCtx, scopeArg);
    if (!scope.all && scope.ids.size === 0) return empty;

    const enriched = await loadRosterEmployees(
      ctx,
      orgCtx,
      scope,
      departmentId,
      teamId,
      date,
    );

    const shiftRows = await ctx.db
      .query("shiftAssignments")
      .withIndex("by_org_date", (q) =>
        q.eq("orgId", orgCtx.orgId).eq("date", date),
      )
      .take(3000);
    const shiftsByEmp = new Map<Id<"employees">, Doc<"shiftAssignments">[]>();
    for (const s of shiftRows) {
      if (s.status === "cancelled") continue;
      const arr = shiftsByEmp.get(s.employeeId) ?? [];
      arr.push(s);
      shiftsByEmp.set(s.employeeId, arr);
    }

    const otRows = await ctx.db
      .query("overtimeRecords")
      .withIndex("by_org", (q) => q.eq("orgId", orgCtx.orgId))
      .take(3000);
    const otByEmp = new Map<Id<"employees">, Doc<"overtimeRecords">[]>();
    for (const o of otRows) {
      if (o.date !== date) continue;
      if (o.status !== "scheduled" && o.status !== "approved") continue;
      const arr = otByEmp.get(o.employeeId) ?? [];
      arr.push(o);
      otByEmp.set(o.employeeId, arr);
    }

    const recs = await ctx.db
      .query("attendanceRecords")
      .withIndex("by_org_date", (q) =>
        q.eq("orgId", orgCtx.orgId).eq("date", date),
      )
      .take(3000);
    const recsByEmp = new Map<Id<"employees">, Doc<"attendanceRecords">[]>();
    for (const r of recs) {
      const arr = recsByEmp.get(r.employeeId) ?? [];
      arr.push(r);
      recsByEmp.set(r.employeeId, arr);
    }

    // Office timezone cache for converting clock timestamps to minute-of-day.
    const orgTz = orgCtx.org.settings.timezone;
    const officeTz = new Map<string, string>();
    async function tzOf(officeId?: Id<"offices">): Promise<string> {
      if (!officeId) return orgTz;
      const k = officeId as string;
      const cached = officeTz.get(k);
      if (cached) return cached;
      const o = await ctx.db.get(officeId);
      const tz = o?.timezone ?? orgTz;
      officeTz.set(k, tz);
      return tz;
    }
    const now = Date.now();
    const nowMinute = localMinuteOfDay(now, orgTz);

    const people = await Promise.all(
      enriched.map(async ({ emp, payType, pattern, jobTitle }) => {
        const photoUrl = emp.photoUrl ?? null;

        const blocks: {
          kind: "scheduled" | "overtime" | "actual";
          startMinute: number;
          endMinute: number | null;
          derived: boolean;
          color: string | null;
          label: string | null;
          shiftId: Id<"shiftAssignments"> | null;
          overtimeId: Id<"overtimeRecords"> | null;
          recordId: Id<"attendanceRecords"> | null;
          status: string | null;
          startTime: string | null;
          endTime: string | null;
          breakMinutes: number | null;
          multiplier: number | null;
          note: string | null;
        }[] = [];

        // Scheduled: concrete shifts win, else pattern-derived virtual shift.
        let scheduledMinutes = 0;
        let scheduledWindow: { startMinute: number; endMinute: number } | null =
          null;
        const concrete = shiftsByEmp.get(emp._id) ?? [];
        const scheduled = concrete.length
          ? concrete.map((s) => ({
              startTime: s.startTime,
              endTime: s.endTime,
              breakMinutes: s.breakMinutes,
              color: s.color,
              derived: false,
              shiftId: s._id as Id<"shiftAssignments"> | null,
              status: s.status as string | null,
              note: s.note ?? null,
            }))
          : pattern
            ? (() => {
                const d = deriveVirtualShift(pattern, date);
                return d
                  ? [
                      {
                        startTime: d.startTime,
                        endTime: d.endTime,
                        breakMinutes: d.breakMinutes,
                        color: pattern.color ?? "#6366f1",
                        derived: true,
                        shiftId: null as Id<"shiftAssignments"> | null,
                        status: null as string | null,
                        note: null as string | null,
                      },
                    ]
                  : [];
              })()
            : [];
        for (const s of scheduled) {
          const win = shiftWindowMinutes(s.startTime, s.endTime);
          if (!scheduledWindow) scheduledWindow = win;
          scheduledMinutes += Math.max(0, win.endMinute - win.startMinute - s.breakMinutes);
          blocks.push({
            kind: "scheduled",
            startMinute: win.startMinute,
            endMinute: win.endMinute,
            derived: s.derived,
            color: s.color,
            label: `${s.startTime}–${s.endTime}`,
            shiftId: s.shiftId,
            overtimeId: null,
            recordId: null,
            status: s.status,
            startTime: s.startTime,
            endTime: s.endTime,
            breakMinutes: s.breakMinutes,
            multiplier: null,
            note: s.note,
          });
        }

        // Scheduled overtime with a wall-clock window sits on the grid.
        let overtimeMinutes = 0;
        const ot = otByEmp.get(emp._id) ?? [];
        for (const o of ot) {
          overtimeMinutes += Math.round((o.plannedHours ?? 0) * 60);
          if (o.startTime && o.endTime) {
            const win = shiftWindowMinutes(o.startTime, o.endTime);
            blocks.push({
              kind: "overtime",
              startMinute: win.startMinute,
              endMinute: win.endMinute,
              derived: false,
              color: "#f59e0b",
              label: `OT ${o.startTime}–${o.endTime}`,
              shiftId: null,
              overtimeId: o._id,
              recordId: null,
              status: o.status,
              startTime: o.startTime,
              endTime: o.endTime,
              breakMinutes: null,
              multiplier: o.multiplier,
              note: o.note ?? null,
            });
          }
        }

        // Actual attendance sessions overlaid.
        let actualMinutes = 0;
        let open = false;
        const actualSessions: { startMinute: number; endMinute: number | null }[] =
          [];
        const empRecs = (recsByEmp.get(emp._id) ?? []).sort(
          (a, b) => a.clockInAt - b.clockInAt,
        );
        for (const r of empRecs) {
          const tz = await tzOf(r.officeId);
          const inMin = localMinuteOfDay(r.clockInAt, tz);
          const outMin =
            r.clockOutAt != null ? localMinuteOfDay(r.clockOutAt, tz) : null;
          if (r.status === "open") open = true;
          const worked =
            r.workedMinutes ??
            (r.clockOutAt != null
              ? Math.max(0, Math.round((r.clockOutAt - r.clockInAt) / 60000))
              : Math.max(0, Math.round((now - r.clockInAt) / 60000)));
          actualMinutes += worked;
          actualSessions.push({ startMinute: inMin, endMinute: outMin });
          blocks.push({
            kind: "actual",
            startMinute: inMin,
            endMinute: outMin,
            derived: false,
            color: null,
            label: null,
            shiftId: null,
            overtimeId: null,
            recordId: r._id,
            status: r.status,
            startTime: null,
            endTime: null,
            breakMinutes: null,
            multiplier: null,
            note: null,
          });
        }

        const variance = computeVariance(
          scheduledWindow,
          actualSessions,
          nowMinute,
        );
        // Suggest OT only when nothing is already scheduled beyond the shift.
        let otSuggestion: { startTime: string; endTime: string; hours: number } | null =
          null;
        if (scheduledWindow && actualSessions.length > 0 && ot.length === 0) {
          const actualEnd = Math.max(
            ...actualSessions.map((a) => a.endMinute ?? nowMinute),
          );
          otSuggestion = otSuggestionFrom(scheduledWindow.endMinute, actualEnd);
        }

        return {
          employeeId: emp._id,
          name: `${emp.preferredName ?? emp.firstName} ${emp.lastName}`,
          jobTitle,
          photoUrl,
          payType,
          blocks,
          scheduledMinutes,
          overtimeMinutes,
          actualMinutes,
          open,
          variance,
          otSuggestion,
        };
      }),
    );

    return { date, people, peopleCount: people.length };
  },
});

// Bulk-apply a shift template across people and dates (hourly "saved configs").
export const assignFromTemplate = mutation({
  args: {
    employeeIds: v.array(v.id("employees")),
    dates: v.array(v.string()),
    shiftTemplateId: v.id("shiftTemplates"),
  },
  returns: v.object({ created: v.number() }),
  handler: async (ctx, { employeeIds, dates, shiftTemplateId }) => {
    const orgCtx = await requireOrg(ctx);
    const tpl = await ctx.db.get(shiftTemplateId);
    if (!tpl || tpl.orgId !== orgCtx.orgId) {
      throw new Error("Shift template not found.");
    }
    let created = 0;
    for (const employeeId of employeeIds) {
      await assertCanScheduleEmployee(ctx, orgCtx, employeeId);
      const employee = await ctx.db.get(employeeId);
      if (!employee || employee.orgId !== orgCtx.orgId) continue;
      for (const date of dates) {
        await ctx.db.insert("shiftAssignments", {
          orgId: orgCtx.orgId,
          employeeId,
          date,
          shiftTemplateId,
          startTime: tpl.startTime,
          endTime: tpl.endTime,
          breakMinutes: tpl.breakMinutes,
          color: tpl.color,
          officeId: tpl.officeId,
          status: "draft",
          createdBy: orgCtx.userId,
        });
        created++;
      }
    }
    return { created };
  },
});

// ─── Reports (attendance × roster × timesheets) ─────────────────────────────

// Safety caps so a report never scans/returns unbounded data. Aggregates are
// computed server-side; only compact summaries cross the wire.
const REPORT_MAX_DAYS = 92;
const REPORT_SCAN_CAP = 5000;
const LATE_GRACE_MIN = 5;

export const rosterReport = query({
  args: {
    scope: v.union(v.literal("team"), v.literal("org")),
    start: v.string(),
    end: v.string(),
    departmentId: v.optional(v.id("departments")),
    teamId: v.optional(v.id("teams")),
    projectId: v.optional(v.id("projects")),
  },
  returns: rosterReportResult,
  handler: async (ctx, { scope: scopeArg, start, end, departmentId, teamId, projectId }) => {
    const emptyTotals = {
      scheduledMinutes: 0,
      actualMinutes: 0,
      loggedMinutes: 0,
      billableMinutes: 0,
      overtimeMinutes: 0,
      expectedDays: 0,
      presentDays: 0,
      lateCount: 0,
      absentCount: 0,
    };
    const empty = {
      truncated: false,
      peopleCount: 0,
      totals: emptyTotals,
      byDay: [],
      byEmployee: [],
      byProject: [],
    };
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return empty;
    const scope = await rosterScopeFor(ctx, orgCtx, scopeArg);
    if (!scope.all && scope.ids.size === 0) return empty;

    // Clamp the window so scans stay bounded.
    let truncated = false;
    let dates = datesInRange(start, end);
    if (dates.length > REPORT_MAX_DAYS) {
      dates = dates.slice(0, REPORT_MAX_DAYS);
      truncated = true;
    }
    const effEnd = dates[dates.length - 1];
    const dateSet = new Set(dates);

    const enriched = await loadRosterEmployees(
      ctx,
      orgCtx,
      scope,
      departmentId,
      teamId,
      effEnd,
    );
    if (enriched.length === 0) return { ...empty, truncated };
    const allowed = new Set(enriched.map((e) => e.emp._id));

    // Per-employee + per-day accumulators.
    type EmpAgg = {
      name: string;
      scheduledMinutes: number;
      actualMinutes: number;
      loggedMinutes: number;
      billableMinutes: number;
      overtimeMinutes: number;
      expectedDays: number;
      presentDays: number;
      lateCount: number;
      absentCount: number;
    };
    const empAgg = new Map<Id<"employees">, EmpAgg>();
    for (const { emp } of enriched) {
      empAgg.set(emp._id, {
        name: `${emp.preferredName ?? emp.firstName} ${emp.lastName}`,
        scheduledMinutes: 0,
        actualMinutes: 0,
        loggedMinutes: 0,
        billableMinutes: 0,
        overtimeMinutes: 0,
        expectedDays: 0,
        presentDays: 0,
        lateCount: 0,
        absentCount: 0,
      });
    }
    const byDay = new Map<string, { scheduledMinutes: number; actualMinutes: number; loggedMinutes: number }>();
    for (const d of dates) byDay.set(d, { scheduledMinutes: 0, actualMinutes: 0, loggedMinutes: 0 });

    // ── Scheduled (concrete rows, else pattern-derived) ──
    const shiftRows = await ctx.db
      .query("shiftAssignments")
      .withIndex("by_org_date", (q) =>
        q.eq("orgId", orgCtx.orgId).gte("date", start).lte("date", effEnd),
      )
      .take(REPORT_SCAN_CAP);
    if (shiftRows.length === REPORT_SCAN_CAP) truncated = true;
    const concreteByCell = new Map<string, Doc<"shiftAssignments">[]>();
    for (const s of shiftRows) {
      if (s.status === "cancelled" || !allowed.has(s.employeeId)) continue;
      const key = `${s.employeeId}|${s.date}`;
      const arr = concreteByCell.get(key) ?? [];
      arr.push(s);
      concreteByCell.set(key, arr);
    }
    // schedStart minute per expected emp|date, for late detection.
    const expectedStart = new Map<string, number>();
    for (const { emp, pattern } of enriched) {
      const agg = empAgg.get(emp._id)!;
      for (const date of dates) {
        const concrete = concreteByCell.get(`${emp._id}|${date}`);
        let minutes = 0;
        let startMin: number | null = null;
        if (concrete && concrete.length > 0) {
          for (const s of concrete) {
            const win = shiftWindowMinutes(s.startTime, s.endTime);
            minutes += Math.max(0, win.endMinute - win.startMinute - s.breakMinutes);
            if (startMin === null || win.startMinute < startMin) startMin = win.startMinute;
          }
        } else if (pattern) {
          const d = deriveVirtualShift(pattern, date);
          if (d) {
            minutes = d.durationMinutes;
            startMin = shiftWindowMinutes(d.startTime, d.endTime).startMinute;
          }
        }
        if (minutes > 0) {
          agg.scheduledMinutes += minutes;
          agg.expectedDays += 1;
          byDay.get(date)!.scheduledMinutes += minutes;
          expectedStart.set(`${emp._id}|${date}`, startMin ?? 0);
        }
      }
    }

    // ── Actual attendance ──
    const orgTz = orgCtx.org.settings.timezone;
    const now = Date.now();
    const attRows = await ctx.db
      .query("attendanceRecords")
      .withIndex("by_org_date", (q) =>
        q.eq("orgId", orgCtx.orgId).gte("date", start).lte("date", effEnd),
      )
      .take(REPORT_SCAN_CAP);
    if (attRows.length === REPORT_SCAN_CAP) truncated = true;
    const presentByEmp = new Map<Id<"employees">, Set<string>>();
    const earliestIn = new Map<string, number>(); // emp|date → earliest clock-in minute
    for (const r of attRows) {
      if (!allowed.has(r.employeeId) || !dateSet.has(r.date)) continue;
      const agg = empAgg.get(r.employeeId);
      if (!agg) continue;
      const worked =
        r.workedMinutes ??
        (r.clockOutAt != null
          ? Math.max(0, Math.round((r.clockOutAt - r.clockInAt) / 60000))
          : Math.max(0, Math.round((now - r.clockInAt) / 60000)));
      agg.actualMinutes += worked;
      byDay.get(r.date)!.actualMinutes += worked;
      const present = presentByEmp.get(r.employeeId) ?? new Set<string>();
      present.add(r.date);
      presentByEmp.set(r.employeeId, present);
      const inMin = localMinuteOfDay(r.clockInAt, orgTz);
      const key = `${r.employeeId}|${r.date}`;
      const cur = earliestIn.get(key);
      if (cur === undefined || inMin < cur) earliestIn.set(key, inMin);
    }
    for (const [empId, present] of presentByEmp) {
      empAgg.get(empId)!.presentDays += present.size;
    }
    // Late / absent against expected days.
    for (const [key, schedStart] of expectedStart) {
      const [empIdStr, date] = key.split("|");
      const empId = empIdStr as Id<"employees">;
      const agg = empAgg.get(empId);
      if (!agg) continue;
      const present = presentByEmp.get(empId)?.has(date) ?? false;
      if (!present) {
        agg.absentCount += 1;
      } else {
        const inMin = earliestIn.get(key);
        if (inMin !== undefined && inMin > schedStart + LATE_GRACE_MIN) {
          agg.lateCount += 1;
        }
      }
    }

    // ── Timesheets ──
    const teRows = await ctx.db
      .query("timeEntries")
      .withIndex("by_org_date", (q) =>
        q.eq("orgId", orgCtx.orgId).gte("date", start).lte("date", effEnd),
      )
      .take(REPORT_SCAN_CAP);
    if (teRows.length === REPORT_SCAN_CAP) truncated = true;
    const projAgg = new Map<Id<"projects">, { loggedMinutes: number; billableMinutes: number }>();
    for (const t of teRows) {
      if (!allowed.has(t.employeeId) || !dateSet.has(t.date)) continue;
      if (projectId && t.projectId !== projectId) continue;
      const agg = empAgg.get(t.employeeId);
      if (!agg) continue;
      agg.loggedMinutes += t.minutes;
      if (t.billable) agg.billableMinutes += t.minutes;
      byDay.get(t.date)!.loggedMinutes += t.minutes;
      const p = projAgg.get(t.projectId) ?? { loggedMinutes: 0, billableMinutes: 0 };
      p.loggedMinutes += t.minutes;
      if (t.billable) p.billableMinutes += t.minutes;
      projAgg.set(t.projectId, p);
    }

    // ── Overtime (no by_org_date index → scan by_org + filter) ──
    const otRows = await ctx.db
      .query("overtimeRecords")
      .withIndex("by_org", (q) => q.eq("orgId", orgCtx.orgId))
      .take(REPORT_SCAN_CAP);
    if (otRows.length === REPORT_SCAN_CAP) truncated = true;
    for (const o of otRows) {
      if (!allowed.has(o.employeeId) || !dateSet.has(o.date)) continue;
      if (o.status !== "scheduled" && o.status !== "approved") continue;
      const agg = empAgg.get(o.employeeId);
      if (!agg) continue;
      agg.overtimeMinutes += Math.round((o.plannedHours ?? 0) * 60);
    }

    // ── Project names ──
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_org", (q) => q.eq("orgId", orgCtx.orgId))
      .take(REPORT_SCAN_CAP);
    const projMeta = new Map(projects.map((p) => [p._id, { name: p.name, color: p.color ?? null }]));

    // ── Compose ──
    const totals = { ...emptyTotals };
    const byEmployee = [];
    for (const [employeeId, agg] of empAgg) {
      totals.scheduledMinutes += agg.scheduledMinutes;
      totals.actualMinutes += agg.actualMinutes;
      totals.loggedMinutes += agg.loggedMinutes;
      totals.billableMinutes += agg.billableMinutes;
      totals.overtimeMinutes += agg.overtimeMinutes;
      totals.expectedDays += agg.expectedDays;
      totals.presentDays += agg.presentDays;
      totals.lateCount += agg.lateCount;
      totals.absentCount += agg.absentCount;
      byEmployee.push({ employeeId, ...agg });
    }
    byEmployee.sort((a, b) => a.name.localeCompare(b.name));

    const byProject = [...projAgg.entries()]
      .map(([pid, agg]) => ({
        projectId: pid,
        name: projMeta.get(pid)?.name ?? "Unknown",
        color: projMeta.get(pid)?.color ?? null,
        loggedMinutes: agg.loggedMinutes,
        billableMinutes: agg.billableMinutes,
      }))
      .sort((a, b) => b.loggedMinutes - a.loggedMinutes);

    const byDayArr = dates.map((date) => ({ date, ...byDay.get(date)! }));

    return {
      truncated,
      peopleCount: enriched.length,
      totals,
      byDay: byDayArr,
      byEmployee,
      byProject,
    };
  },
});
