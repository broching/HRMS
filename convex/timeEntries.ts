import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireOrg, ctxHasPermission, requirePermission } from "./auth";
import { employeeByUserId } from "./employees";
import { reportingSubtree } from "./model/org";

/**
 * Daily time entries. Employees CRUD their own; a manager/head can read the
 * entries of anyone in their reporting tree (relational check via
 * `reportingSubtree`); HR/admin see everything. Tracking only — no approval.
 */

const MAX_MINUTES = 24 * 60;

const entryView = v.object({
  _id: v.id("timeEntries"),
  _creationTime: v.number(),
  employeeId: v.id("employees"),
  date: v.string(),
  minutes: v.number(),
  startMinute: v.union(v.number(), v.null()),
  description: v.string(),
  billable: v.boolean(),
  projectId: v.id("projects"),
  projectName: v.string(),
  projectColor: v.union(v.string(), v.null()),
  taskId: v.union(v.id("projectTasks"), v.null()),
  taskName: v.union(v.string(), v.null()),
});

function displayName(e: Doc<"employees">): string {
  return `${e.preferredName ?? e.firstName} ${e.lastName}`.trim();
}

// Resolve project/task names for a batch of entries (org projects/tasks are
// bounded, so two collects is fine).
async function enrich(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  entries: Doc<"timeEntries">[],
) {
  const projects = await ctx.db
    .query("projects")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  const pMap = new Map(projects.map((p) => [p._id, p]));
  const tasks = await ctx.db
    .query("projectTasks")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  const tMap = new Map(tasks.map((t) => [t._id, t.name]));
  return entries.map((e) => ({
    _id: e._id,
    _creationTime: e._creationTime,
    employeeId: e.employeeId,
    date: e.date,
    minutes: e.minutes,
    startMinute: e.startMinute ?? null,
    description: e.description,
    billable: e.billable ?? false,
    projectId: e.projectId,
    projectName: pMap.get(e.projectId)?.name ?? "—",
    projectColor: pMap.get(e.projectId)?.color ?? null,
    taskId: e.taskId ?? null,
    taskName: e.taskId ? (tMap.get(e.taskId) ?? null) : null,
  }));
}

async function entriesFor(
  ctx: QueryCtx,
  employeeId: Id<"employees">,
  from: string,
  to: string,
) {
  return await ctx.db
    .query("timeEntries")
    .withIndex("by_employee_date", (q) =>
      q.eq("employeeId", employeeId).gte("date", from).lte("date", to),
    )
    .collect();
}

// Validate that a project (and optional task) exist in the org and match.
async function checkProjectTask(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  projectId: Id<"projects">,
  taskId: Id<"projectTasks"> | undefined,
) {
  const project = await ctx.db.get(projectId);
  if (!project || project.orgId !== orgId) {
    throw new ConvexError({ code: "INVALID", message: "Unknown project." });
  }
  if (taskId) {
    const task = await ctx.db.get(taskId);
    if (!task || task.orgId !== orgId || task.projectId !== projectId) {
      throw new ConvexError({ code: "INVALID", message: "Unknown task for project." });
    }
  }
}

function validMinutes(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > MAX_MINUTES) {
    throw new ConvexError({
      code: "INPUT",
      message: "Enter a duration between 1 minute and 24 hours.",
    });
  }
}

// Optional grid placement: minute-of-day 0..1439 (start), and the block must not
// spill past midnight given its duration.
function validStart(startMinute: number | null | undefined, minutes: number) {
  if (startMinute === null || startMinute === undefined) return;
  if (
    !Number.isFinite(startMinute) ||
    startMinute < 0 ||
    startMinute > 24 * 60 - 1 ||
    startMinute + minutes > 24 * 60
  ) {
    throw new ConvexError({
      code: "INPUT",
      message: "That start time doesn't fit within the day.",
    });
  }
}

// ── Self reads + writes ──────────────────────────────────────────────────────

export const mine = query({
  args: { from: v.string(), to: v.string() },
  returns: v.array(entryView),
  handler: async (ctx, { from, to }) => {
    const { orgId, userId } = await requireOrg(ctx);
    const me = await employeeByUserId(ctx, orgId, userId);
    if (!me) return [];
    const entries = await entriesFor(ctx, me._id, from, to);
    return enrich(ctx, orgId, entries);
  },
});

export const create = mutation({
  args: {
    date: v.string(),
    projectId: v.id("projects"),
    taskId: v.optional(v.id("projectTasks")),
    minutes: v.number(),
    startMinute: v.optional(v.number()),
    description: v.string(),
    billable: v.optional(v.boolean()),
  },
  returns: v.id("timeEntries"),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requireOrg(ctx);
    const me = await employeeByUserId(ctx, orgId, userId);
    if (!me) {
      throw new ConvexError({
        code: "NO_PROFILE",
        message: "You don't have an employee profile to log time against.",
      });
    }
    validMinutes(args.minutes);
    validStart(args.startMinute, Math.round(args.minutes));
    await checkProjectTask(ctx, orgId, args.projectId, args.taskId);
    return await ctx.db.insert("timeEntries", {
      orgId,
      employeeId: me._id,
      date: args.date,
      projectId: args.projectId,
      taskId: args.taskId,
      minutes: Math.round(args.minutes),
      startMinute: args.startMinute ?? undefined,
      description: args.description.trim(),
      billable: args.billable,
      createdBy: userId,
      updatedAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    entryId: v.id("timeEntries"),
    date: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    taskId: v.optional(v.union(v.id("projectTasks"), v.null())),
    minutes: v.optional(v.number()),
    startMinute: v.optional(v.union(v.number(), v.null())),
    description: v.optional(v.string()),
    billable: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { entryId, ...args }) => {
    const { orgId, userId } = await requireOrg(ctx);
    const me = await employeeByUserId(ctx, orgId, userId);
    const entry = await ctx.db.get(entryId);
    if (!entry || entry.orgId !== orgId || !me || entry.employeeId !== me._id) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Not your entry." });
    }
    const nextProject = args.projectId ?? entry.projectId;
    const nextTask =
      args.taskId === undefined ? entry.taskId : (args.taskId ?? undefined);
    if (args.projectId !== undefined || args.taskId !== undefined) {
      await checkProjectTask(ctx, orgId, nextProject, nextTask);
    }
    if (args.minutes !== undefined) validMinutes(args.minutes);

    const nextMinutes = Math.round(args.minutes ?? entry.minutes);
    const nextStart =
      args.startMinute === undefined ? entry.startMinute : args.startMinute;
    if (args.startMinute !== undefined || args.minutes !== undefined) {
      validStart(nextStart, nextMinutes);
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.date !== undefined) patch.date = args.date;
    if (args.projectId !== undefined) patch.projectId = args.projectId;
    if (args.taskId !== undefined) patch.taskId = args.taskId ?? undefined;
    if (args.minutes !== undefined) patch.minutes = Math.round(args.minutes);
    if (args.startMinute !== undefined)
      patch.startMinute = args.startMinute ?? undefined;
    if (args.description !== undefined) patch.description = args.description.trim();
    if (args.billable !== undefined) patch.billable = args.billable;
    await ctx.db.patch(entryId, patch);
    return null;
  },
});

export const remove = mutation({
  args: { entryId: v.id("timeEntries") },
  returns: v.null(),
  handler: async (ctx, { entryId }) => {
    const { orgId, userId } = await requireOrg(ctx);
    const me = await employeeByUserId(ctx, orgId, userId);
    const entry = await ctx.db.get(entryId);
    if (!entry || entry.orgId !== orgId || !me || entry.employeeId !== me._id) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Not your entry." });
    }
    await ctx.db.delete(entryId);
    return null;
  },
});

// ── Manager / head reads (chain flow) ────────────────────────────────────────

// One employee's entries. Allowed when it's you, when you have org-wide read, or
// when the target is anywhere in your reporting tree.
export const forEmployee = query({
  args: { employeeId: v.id("employees"), from: v.string(), to: v.string() },
  returns: v.array(entryView),
  handler: async (ctx, { employeeId, from, to }) => {
    const orgCtx = await requireOrg(ctx);
    const target = await ctx.db.get(employeeId);
    if (!target || target.orgId !== orgCtx.orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Employee not found." });
    }
    const me = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    const isSelf = !!me && me._id === employeeId;
    const orgWide = ctxHasPermission(orgCtx, "employees:read:all");
    let allowed = isSelf || orgWide;
    if (!allowed && me) {
      const subtree = await reportingSubtree(ctx, orgCtx.orgId, me._id);
      allowed = subtree.has(employeeId);
    }
    if (!allowed) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You can only view timesheets for your own team.",
      });
    }
    const entries = await entriesFor(ctx, employeeId, from, to);
    return enrich(ctx, orgCtx.orgId, entries);
  },
});

// Roll-up across the caller's whole reporting tree for a date range.
export const teamSummary = query({
  args: {
    from: v.string(),
    to: v.string(),
    departmentId: v.optional(v.id("departments")),
    teamId: v.optional(v.id("teams")),
  },
  returns: v.object({
    totalMinutes: v.number(),
    billableMinutes: v.number(),
    peopleLogged: v.number(),
    byEmployee: v.array(
      v.object({
        employeeId: v.id("employees"),
        name: v.string(),
        jobTitle: v.union(v.string(), v.null()),
        departmentId: v.union(v.id("departments"), v.null()),
        teamId: v.union(v.id("teams"), v.null()),
        minutes: v.number(),
        billableMinutes: v.number(),
        entries: v.number(),
        byDate: v.array(v.object({ date: v.string(), minutes: v.number() })),
        topProjectColor: v.union(v.string(), v.null()),
      }),
    ),
    byProject: v.array(
      v.object({
        projectId: v.id("projects"),
        name: v.string(),
        color: v.union(v.string(), v.null()),
        minutes: v.number(),
      }),
    ),
  }),
  handler: async (ctx, { from, to, departmentId, teamId }) => {
    const { orgId, userId } = await requireOrg(ctx);
    const me = await employeeByUserId(ctx, orgId, userId);
    const empty = {
      totalMinutes: 0,
      billableMinutes: 0,
      peopleLogged: 0,
      byEmployee: [],
      byProject: [],
    };
    if (!me) return empty;
    const subtree = await reportingSubtree(ctx, orgId, me._id);
    if (subtree.size === 0) return empty;

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const pName = new Map(projects.map((p) => [p._id, p.name]));
    const pColor = new Map(projects.map((p) => [p._id, p.color ?? null]));

    const positions = await ctx.db
      .query("positions")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const posTitle = new Map(positions.map((p) => [p._id, p.title]));

    let totalMinutes = 0;
    let billableMinutes = 0;
    let peopleLogged = 0;
    const byEmployee: {
      employeeId: Id<"employees">;
      name: string;
      jobTitle: string | null;
      departmentId: Id<"departments"> | null;
      teamId: Id<"teams"> | null;
      minutes: number;
      billableMinutes: number;
      entries: number;
      byDate: { date: string; minutes: number }[];
      topProjectColor: string | null;
    }[] = [];
    const projMinutes = new Map<Id<"projects">, number>();

    for (const employeeId of subtree) {
      const emp = await ctx.db.get(employeeId);
      if (!emp) continue;
      if (departmentId && emp.departmentId !== departmentId) continue;
      if (teamId && emp.teamId !== teamId) continue;
      const entries = await entriesFor(ctx, employeeId, from, to);
      let minutes = 0;
      let empBillable = 0;
      const dayMap = new Map<string, number>();
      const empProj = new Map<Id<"projects">, number>();
      for (const e of entries) {
        minutes += e.minutes;
        if (e.billable) {
          billableMinutes += e.minutes;
          empBillable += e.minutes;
        }
        dayMap.set(e.date, (dayMap.get(e.date) ?? 0) + e.minutes);
        empProj.set(e.projectId, (empProj.get(e.projectId) ?? 0) + e.minutes);
        projMinutes.set(e.projectId, (projMinutes.get(e.projectId) ?? 0) + e.minutes);
      }
      totalMinutes += minutes;
      if (minutes > 0) peopleLogged += 1;
      const topProject = [...empProj.entries()].sort((a, b) => b[1] - a[1])[0];
      byEmployee.push({
        employeeId,
        name: displayName(emp),
        jobTitle: emp.positionId ? (posTitle.get(emp.positionId) ?? null) : null,
        departmentId: emp.departmentId ?? null,
        teamId: emp.teamId ?? null,
        minutes,
        billableMinutes: empBillable,
        entries: entries.length,
        byDate: [...dayMap.entries()]
          .map(([date, m]) => ({ date, minutes: m }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        topProjectColor: topProject ? (pColor.get(topProject[0]) ?? null) : null,
      });
    }

    byEmployee.sort((a, b) => b.minutes - a.minutes);
    const byProject = [...projMinutes.entries()]
      .map(([projectId, minutes]) => ({
        projectId,
        name: pName.get(projectId) ?? "—",
        color: pColor.get(projectId) ?? null,
        minutes,
      }))
      .sort((a, b) => b.minutes - a.minutes);

    return { totalMinutes, billableMinutes, peopleLogged, byEmployee, byProject };
  },
});

// ── Org-wide report (projects:manage) ────────────────────────────────────────

// Load org entries in a date range, filtered by project/department/team. Shared
// by the org report + calendar so both apply identical filters. Also returns a
// per-employee meta map (name + dept/team) so callers don't re-fetch.
async function orgEntriesFiltered(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  opts: {
    from: string;
    to: string;
    projectId?: Id<"projects">;
    departmentId?: Id<"departments">;
    teamId?: Id<"teams">;
  },
) {
  const rows = await ctx.db
    .query("timeEntries")
    .withIndex("by_org_date", (q) =>
      q.eq("orgId", orgId).gte("date", opts.from).lte("date", opts.to),
    )
    .collect();

  const employees = await ctx.db
    .query("employees")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  const meta = new Map(
    employees.map((e) => [
      e._id,
      {
        name: displayName(e),
        departmentId: e.departmentId ?? null,
        teamId: e.teamId ?? null,
      },
    ]),
  );

  const filtered = rows.filter((r) => {
    if (opts.projectId && r.projectId !== opts.projectId) return false;
    const m = meta.get(r.employeeId);
    if (opts.departmentId && m?.departmentId !== opts.departmentId) return false;
    if (opts.teamId && m?.teamId !== opts.teamId) return false;
    return true;
  });
  return { filtered, meta };
}

export const orgReport = query({
  args: {
    from: v.string(),
    to: v.string(),
    projectId: v.optional(v.id("projects")),
    departmentId: v.optional(v.id("departments")),
    teamId: v.optional(v.id("teams")),
  },
  returns: v.array(
    v.object({
      employeeId: v.id("employees"),
      employeeName: v.string(),
      departmentId: v.union(v.id("departments"), v.null()),
      teamId: v.union(v.id("teams"), v.null()),
      projectId: v.id("projects"),
      projectName: v.string(),
      minutes: v.number(),
      entries: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const { orgId } = await requirePermission(ctx, "projects:manage");
    const { filtered, meta } = await orgEntriesFiltered(ctx, orgId, args);

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const pName = new Map(projects.map((p) => [p._id, p.name]));

    // Aggregate by (employee, project).
    const agg = new Map<
      string,
      { employeeId: Id<"employees">; projectId: Id<"projects">; minutes: number; entries: number }
    >();
    for (const r of filtered) {
      const key = `${r.employeeId}:${r.projectId}`;
      const cur =
        agg.get(key) ??
        { employeeId: r.employeeId, projectId: r.projectId, minutes: 0, entries: 0 };
      cur.minutes += r.minutes;
      cur.entries += 1;
      agg.set(key, cur);
    }

    const out = [];
    for (const a of agg.values()) {
      const m = meta.get(a.employeeId);
      out.push({
        employeeId: a.employeeId,
        employeeName: m?.name ?? "—",
        departmentId: m?.departmentId ?? null,
        teamId: m?.teamId ?? null,
        projectId: a.projectId,
        projectName: pName.get(a.projectId) ?? "—",
        minutes: a.minutes,
        entries: a.entries,
      });
    }
    out.sort((a, b) => b.minutes - a.minutes);
    return out;
  },
});

// Per-day org roll-up backing the calendar view — total minutes, entries, and
// distinct people who logged on each day. Same filters as orgReport.
export const orgCalendar = query({
  args: {
    from: v.string(),
    to: v.string(),
    projectId: v.optional(v.id("projects")),
    departmentId: v.optional(v.id("departments")),
    teamId: v.optional(v.id("teams")),
  },
  returns: v.object({
    totalMinutes: v.number(),
    days: v.array(
      v.object({
        date: v.string(),
        minutes: v.number(),
        entries: v.number(),
        people: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const { orgId } = await requirePermission(ctx, "projects:manage");
    const { filtered } = await orgEntriesFiltered(ctx, orgId, args);

    let totalMinutes = 0;
    const byDate = new Map<
      string,
      { minutes: number; entries: number; people: Set<Id<"employees">> }
    >();
    for (const r of filtered) {
      totalMinutes += r.minutes;
      const cur =
        byDate.get(r.date) ?? { minutes: 0, entries: 0, people: new Set() };
      cur.minutes += r.minutes;
      cur.entries += 1;
      cur.people.add(r.employeeId);
      byDate.set(r.date, cur);
    }
    const days = [...byDate.entries()]
      .map(([date, d]) => ({
        date,
        minutes: d.minutes,
        entries: d.entries,
        people: d.people.size,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return { totalMinutes, days };
  },
});
