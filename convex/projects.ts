import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireOrg, requirePermission, type OrgContext } from "./auth";
import { taskPriority } from "./lib/enums";
import { writeAuditLog } from "./lib/audit";
import { employeeByUserId } from "./employees";
import {
  accessForEmployee,
  isProjectPrivileged,
  type EmployeeProjectAccess,
} from "./model/projectAccess";

function displayName(e: Doc<"employees">): string {
  return `${e.preferredName ?? e.firstName} ${e.lastName}`.trim();
}

/**
 * Projects, their tasks, and people assignment.
 *
 * Reading is assignment-scoped: a plain member only sees the projects/tasks they
 * are assigned to (see `model/projectAccess`), while managers (`tasks:manage`)
 * and HR (`projects:manage`) see everything. Creating/editing projects requires
 * `projects:manage`; creating/editing tasks + assigning people requires
 * `tasks:manage` OR `projects:manage`. All org-scoped.
 */

const MAX_TASK_ATTACHMENTS = 8;

const projectStatus = v.union(v.literal("active"), v.literal("archived"));
const taskStatus = v.union(v.literal("open"), v.literal("done"));

const projectDoc = v.object({
  _id: v.id("projects"),
  _creationTime: v.number(),
  orgId: v.id("organizations"),
  name: v.string(),
  code: v.optional(v.string()),
  description: v.optional(v.string()),
  clientName: v.optional(v.string()),
  color: v.optional(v.string()),
  leadEmployeeId: v.optional(v.id("employees")),
  status: projectStatus,
  createdBy: v.optional(v.id("users")),
  updatedAt: v.optional(v.number()),
});

// Lean task row for lists + the log-time picker, with enough detail to render a
// rich task card (priority/due/counts) without a second round-trip.
const taskView = v.object({
  _id: v.id("projectTasks"),
  _creationTime: v.number(),
  orgId: v.id("organizations"),
  projectId: v.id("projects"),
  name: v.string(),
  description: v.union(v.string(), v.null()),
  status: taskStatus,
  priority: v.union(taskPriority, v.null()),
  dueDate: v.union(v.string(), v.null()),
  attachmentCount: v.number(),
  assigneeCount: v.number(),
  completedAt: v.union(v.number(), v.null()),
  order: v.union(v.number(), v.null()),
});

const assigneeView = v.object({
  employeeId: v.id("employees"),
  name: v.string(),
});

// ── Access helpers ───────────────────────────────────────────────────────────

// Require the caller can manage tasks (create/edit/assign/complete-any). Both
// managers (tasks:manage) and HR (projects:manage) qualify.
async function requireTaskManage(ctx: QueryCtx): Promise<OrgContext> {
  const orgCtx = await requireOrg(ctx);
  if (!isProjectPrivileged(orgCtx)) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "You don't have permission to manage tasks.",
    });
  }
  return orgCtx;
}

// The caller's assignment access, or null when they're privileged (see all).
async function callerAccess(
  ctx: QueryCtx,
  orgCtx: OrgContext,
): Promise<EmployeeProjectAccess | null> {
  if (isProjectPrivileged(orgCtx)) return null;
  const me = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
  if (!me) {
    return { projectIds: new Set(), taskIds: new Set(), visibleProjectIds: new Set() };
  }
  return accessForEmployee(ctx, me._id);
}

// Count assignees per task within a project: task-level assignments plus the
// project-level assignees (who count toward every task).
async function assigneeCounts(ctx: QueryCtx, projectId: Id<"projects">) {
  const [taskRows, projRows] = await Promise.all([
    ctx.db
      .query("taskAssignments")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect(),
    ctx.db
      .query("projectAssignments")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect(),
  ]);
  const perTask = new Map<Id<"projectTasks">, number>();
  for (const r of taskRows)
    perTask.set(r.taskId, (perTask.get(r.taskId) ?? 0) + 1);
  return { perTask, projectLevel: projRows.length };
}

function toTaskView(
  t: Doc<"projectTasks">,
  assigneeCount: number,
): typeof taskView.type {
  return {
    _id: t._id,
    _creationTime: t._creationTime,
    orgId: t.orgId,
    projectId: t.projectId,
    name: t.name,
    description: t.description ?? null,
    status: t.status,
    priority: t.priority ?? null,
    dueDate: t.dueDate ?? null,
    attachmentCount: t.attachmentStorageIds?.length ?? 0,
    assigneeCount,
    completedAt: t.completedAt ?? null,
    order: t.order ?? null,
  };
}

// ── Reads ────────────────────────────────────────────────────────────────────

export const list = query({
  args: {},
  returns: v.array(projectDoc),
  handler: async (ctx) => {
    const orgCtx = await requireOrg(ctx);
    const all = await ctx.db
      .query("projects")
      .withIndex("by_org", (q) => q.eq("orgId", orgCtx.orgId))
      .collect();
    const access = await callerAccess(ctx, orgCtx);
    if (!access) return all;
    // Non-privileged: only assigned/visible projects, and hide archived ones.
    return all.filter(
      (p) => p.status === "active" && access.visibleProjectIds.has(p._id),
    );
  },
});

export const listTasks = query({
  args: { projectId: v.id("projects") },
  returns: v.array(taskView),
  handler: async (ctx, { projectId }) => {
    const orgCtx = await requireOrg(ctx);
    const project = await ctx.db.get(projectId);
    if (!project || project.orgId !== orgCtx.orgId) return [];
    const access = await callerAccess(ctx, orgCtx);
    // A non-privileged caller must at least see the project.
    if (access && !access.visibleProjectIds.has(projectId)) return [];

    const tasks = (
      await ctx.db
        .query("projectTasks")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect()
    ).filter((t) => !t.archivedAt);

    const { perTask, projectLevel } = await assigneeCounts(ctx, projectId);

    // Task-level assignees only get their own tasks unless assigned to the whole
    // project.
    let visible = tasks;
    if (access && !access.projectIds.has(projectId)) {
      visible = tasks.filter((t) => access.taskIds.has(t._id));
    }
    visible.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return visible.map((t) =>
      toTaskView(t, (perTask.get(t._id) ?? 0) + projectLevel),
    );
  },
});

// Per-project roll-up (minutes + contributor count) for the projects grid.
// All-time; bounded by the org's time-entry volume. Gated projects:manage.
export const stats = query({
  args: {},
  returns: v.array(
    v.object({
      projectId: v.id("projects"),
      minutes: v.number(),
      entries: v.number(),
      contributors: v.number(),
      assignees: v.number(),
      openTasks: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "projects:manage");
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const out = [];
    for (const p of projects) {
      const rows = await ctx.db
        .query("timeEntries")
        .withIndex("by_project", (q) => q.eq("projectId", p._id))
        .collect();
      let minutes = 0;
      const people = new Set<Id<"employees">>();
      for (const r of rows) {
        minutes += r.minutes;
        people.add(r.employeeId);
      }
      const tasks = await ctx.db
        .query("projectTasks")
        .withIndex("by_project", (q) => q.eq("projectId", p._id))
        .collect();
      const projAssignees = await ctx.db
        .query("projectAssignments")
        .withIndex("by_project", (q) => q.eq("projectId", p._id))
        .collect();
      out.push({
        projectId: p._id,
        minutes,
        entries: rows.length,
        contributors: people.size,
        assignees: projAssignees.length,
        openTasks: tasks.filter((t) => !t.archivedAt && t.status === "open").length,
      });
    }
    return out;
  },
});

// One project's breakdown — who logged time and against which tasks.
export const detail = query({
  args: { projectId: v.id("projects") },
  returns: v.object({
    totalMinutes: v.number(),
    byEmployee: v.array(
      v.object({
        employeeId: v.id("employees"),
        name: v.string(),
        minutes: v.number(),
        entries: v.number(),
      }),
    ),
    byTask: v.array(
      v.object({
        taskId: v.union(v.id("projectTasks"), v.null()),
        name: v.string(),
        minutes: v.number(),
      }),
    ),
  }),
  handler: async (ctx, { projectId }) => {
    const { orgId } = await requirePermission(ctx, "projects:manage");
    const project = await ctx.db.get(projectId);
    if (!project || project.orgId !== orgId) {
      return { totalMinutes: 0, byEmployee: [], byTask: [] };
    }
    const rows = await ctx.db
      .query("timeEntries")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    const tasks = await ctx.db
      .query("projectTasks")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    const tName = new Map(tasks.map((t) => [t._id, t.name]));

    let totalMinutes = 0;
    const empAgg = new Map<Id<"employees">, { minutes: number; entries: number }>();
    const taskAgg = new Map<string, number>();
    for (const r of rows) {
      totalMinutes += r.minutes;
      const e = empAgg.get(r.employeeId) ?? { minutes: 0, entries: 0 };
      e.minutes += r.minutes;
      e.entries += 1;
      empAgg.set(r.employeeId, e);
      const key = r.taskId ?? "none";
      taskAgg.set(key, (taskAgg.get(key) ?? 0) + r.minutes);
    }

    const byEmployee = [];
    for (const [employeeId, agg] of empAgg) {
      const emp = await ctx.db.get(employeeId);
      byEmployee.push({
        employeeId,
        name: emp ? displayName(emp) : "—",
        minutes: agg.minutes,
        entries: agg.entries,
      });
    }
    byEmployee.sort((a, b) => b.minutes - a.minutes);

    const byTask = [...taskAgg.entries()]
      .map(([key, minutes]) => ({
        taskId: key === "none" ? null : (key as Id<"projectTasks">),
        name: key === "none" ? "No task" : (tName.get(key as Id<"projectTasks">) ?? "—"),
        minutes,
      }))
      .sort((a, b) => b.minutes - a.minutes);

    return { totalMinutes, byEmployee, byTask };
  },
});

// Assignees of a project + each of its tasks, for the manage dialog. Gated to
// task managers.
export const projectAssignees = query({
  args: { projectId: v.id("projects") },
  returns: v.object({
    project: v.array(assigneeView),
    byTask: v.array(
      v.object({
        taskId: v.id("projectTasks"),
        assignees: v.array(assigneeView),
      }),
    ),
  }),
  handler: async (ctx, { projectId }) => {
    const orgCtx = await requireTaskManage(ctx);
    const project = await ctx.db.get(projectId);
    if (!project || project.orgId !== orgCtx.orgId) {
      return { project: [], byTask: [] };
    }
    const [projRows, taskRows] = await Promise.all([
      ctx.db
        .query("projectAssignments")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect(),
      ctx.db
        .query("taskAssignments")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect(),
    ]);
    const nameFor = async (employeeId: Id<"employees">) => {
      const e = await ctx.db.get(employeeId);
      return e ? displayName(e) : "—";
    };
    const project_ = await Promise.all(
      projRows.map(async (r) => ({
        employeeId: r.employeeId,
        name: await nameFor(r.employeeId),
      })),
    );
    const byTaskMap = new Map<Id<"projectTasks">, { employeeId: Id<"employees">; name: string }[]>();
    for (const r of taskRows) {
      const arr = byTaskMap.get(r.taskId) ?? [];
      arr.push({ employeeId: r.employeeId, name: await nameFor(r.employeeId) });
      byTaskMap.set(r.taskId, arr);
    }
    return {
      project: project_,
      byTask: [...byTaskMap.entries()].map(([taskId, assignees]) => ({
        taskId,
        assignees,
      })),
    };
  },
});

// Full detail for one task: rich fields, assignees, attachment URLs, parent
// project, and the caller's capability flags. Visible to task managers and to
// anyone assigned (directly or via the project).
export const taskDetail = query({
  args: { taskId: v.id("projectTasks") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("projectTasks"),
      projectId: v.id("projects"),
      projectName: v.string(),
      projectColor: v.union(v.string(), v.null()),
      name: v.string(),
      description: v.union(v.string(), v.null()),
      status: taskStatus,
      priority: v.union(taskPriority, v.null()),
      dueDate: v.union(v.string(), v.null()),
      completedAt: v.union(v.number(), v.null()),
      completedByName: v.union(v.string(), v.null()),
      assignees: v.array(assigneeView),
      attachments: v.array(
        v.object({
          index: v.number(),
          name: v.string(),
          url: v.union(v.string(), v.null()),
        }),
      ),
      canManage: v.boolean(),
      canComplete: v.boolean(),
    }),
  ),
  handler: async (ctx, { taskId }) => {
    const orgCtx = await requireOrg(ctx);
    const task = await ctx.db.get(taskId);
    if (!task || task.orgId !== orgCtx.orgId) return null;

    const access = await callerAccess(ctx, orgCtx);
    const manage = isProjectPrivileged(orgCtx);
    const isAssignee =
      !!access &&
      (access.projectIds.has(task.projectId) || access.taskIds.has(taskId));
    if (!manage && !isAssignee) return null;

    const project = await ctx.db.get(task.projectId);

    // Assignees: task-level + project-level (project assignees cover every task).
    const [taskRows, projRows] = await Promise.all([
      ctx.db
        .query("taskAssignments")
        .withIndex("by_task", (q) => q.eq("taskId", taskId))
        .collect(),
      ctx.db
        .query("projectAssignments")
        .withIndex("by_project", (q) => q.eq("projectId", task.projectId))
        .collect(),
    ]);
    const seen = new Set<Id<"employees">>();
    const assignees: { employeeId: Id<"employees">; name: string }[] = [];
    for (const r of [...projRows, ...taskRows]) {
      if (seen.has(r.employeeId)) continue;
      seen.add(r.employeeId);
      const e = await ctx.db.get(r.employeeId);
      assignees.push({ employeeId: r.employeeId, name: e ? displayName(e) : "—" });
    }

    const ids = task.attachmentStorageIds ?? [];
    const names = task.attachmentNames ?? [];
    const attachments = await Promise.all(
      ids.map(async (id, i) => ({
        index: i,
        name: names[i] ?? "Attachment",
        url: await ctx.storage.getUrl(id),
      })),
    );

    let completedByName: string | null = null;
    if (task.completedBy) {
      const e = await ctx.db.get(task.completedBy);
      completedByName = e ? displayName(e) : null;
    }

    // Assignees may complete their own task; managers may complete any.
    const canComplete = manage || isAssignee;

    return {
      _id: task._id,
      projectId: task.projectId,
      projectName: project?.name ?? "—",
      projectColor: project?.color ?? null,
      name: task.name,
      description: task.description ?? null,
      status: task.status,
      priority: task.priority ?? null,
      dueDate: task.dueDate ?? null,
      completedAt: task.completedAt ?? null,
      completedByName,
      assignees,
      attachments,
      canManage: manage,
      canComplete,
    };
  },
});

// Tasks assigned to the current employee (directly or via their project), for
// the personal "My Tasks" page. Enriched with project + assignee count.
export const myTasks = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("projectTasks"),
      projectId: v.id("projects"),
      projectName: v.string(),
      projectColor: v.union(v.string(), v.null()),
      name: v.string(),
      description: v.union(v.string(), v.null()),
      status: taskStatus,
      priority: v.union(taskPriority, v.null()),
      dueDate: v.union(v.string(), v.null()),
      attachmentCount: v.number(),
      assigneeCount: v.number(),
      viaProject: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const orgCtx = await requireOrg(ctx);
    const me = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    if (!me) return [];
    const access = await accessForEmployee(ctx, me._id);

    // Gather candidate tasks: every task in a fully-assigned project + each
    // individually-assigned task.
    const taskMap = new Map<Id<"projectTasks">, { task: Doc<"projectTasks">; viaProject: boolean }>();
    for (const projectId of access.projectIds) {
      const tasks = await ctx.db
        .query("projectTasks")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect();
      for (const t of tasks) {
        if (t.archivedAt) continue;
        taskMap.set(t._id, { task: t, viaProject: true });
      }
    }
    for (const taskId of access.taskIds) {
      if (taskMap.has(taskId)) continue;
      const t = await ctx.db.get(taskId);
      if (t && !t.archivedAt) taskMap.set(taskId, { task: t, viaProject: false });
    }

    // Resolve project labels once.
    const projectIds = new Set([...taskMap.values()].map((x) => x.task.projectId));
    const projMap = new Map<Id<"projects">, Doc<"projects">>();
    for (const id of projectIds) {
      const p = await ctx.db.get(id);
      if (p) projMap.set(id, p);
    }
    // Assignee counts per project.
    const countCache = new Map<Id<"projects">, { perTask: Map<Id<"projectTasks">, number>; projectLevel: number }>();
    for (const id of projectIds) countCache.set(id, await assigneeCounts(ctx, id));

    const out = [...taskMap.values()].map(({ task, viaProject }) => {
      const p = projMap.get(task.projectId);
      const counts = countCache.get(task.projectId)!;
      return {
        _id: task._id,
        projectId: task.projectId,
        projectName: p?.name ?? "—",
        projectColor: p?.color ?? null,
        name: task.name,
        description: task.description ?? null,
        status: task.status,
        priority: task.priority ?? null,
        dueDate: task.dueDate ?? null,
        attachmentCount: task.attachmentStorageIds?.length ?? 0,
        assigneeCount: (counts.perTask.get(task._id) ?? 0) + counts.projectLevel,
        viaProject,
      };
    });
    // Open first, then by due date (soonest), then newest.
    out.sort((a, b) => {
      if (a.status !== b.status) return a.status === "open" ? -1 : 1;
      const ad = a.dueDate ?? "9999";
      const bd = b.dueDate ?? "9999";
      if (ad !== bd) return ad.localeCompare(bd);
      return 0;
    });
    return out;
  },
});

// ── Project writes (projects:manage) ─────────────────────────────────────────

export const create = mutation({
  args: {
    name: v.string(),
    code: v.optional(v.string()),
    description: v.optional(v.string()),
    clientName: v.optional(v.string()),
    color: v.optional(v.string()),
    leadEmployeeId: v.optional(v.id("employees")),
  },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(ctx, "projects:manage");
    const name = args.name.trim();
    if (!name) throw new ConvexError({ code: "INPUT", message: "Name is required." });
    const id = await ctx.db.insert("projects", {
      orgId,
      name,
      code: args.code?.trim() || undefined,
      description: args.description?.trim() || undefined,
      clientName: args.clientName?.trim() || undefined,
      color: args.color,
      leadEmployeeId: args.leadEmployeeId,
      status: "active",
      createdBy: userId,
      updatedAt: Date.now(),
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "project.create",
      entity: "projects",
      entityId: id,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    code: v.optional(v.string()),
    description: v.optional(v.string()),
    clientName: v.optional(v.string()),
    color: v.optional(v.string()),
    leadEmployeeId: v.optional(v.union(v.id("employees"), v.null())),
    status: v.optional(projectStatus),
  },
  returns: v.null(),
  handler: async (ctx, { projectId, ...args }) => {
    const { orgId, userId } = await requirePermission(ctx, "projects:manage");
    const project = await ctx.db.get(projectId);
    if (!project || project.orgId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Project not found." });
    }
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name.trim() || project.name;
    if (args.code !== undefined) patch.code = args.code.trim() || undefined;
    if (args.description !== undefined)
      patch.description = args.description.trim() || undefined;
    if (args.clientName !== undefined)
      patch.clientName = args.clientName.trim() || undefined;
    if (args.color !== undefined) patch.color = args.color;
    if (args.leadEmployeeId !== undefined)
      patch.leadEmployeeId = args.leadEmployeeId ?? undefined;
    if (args.status !== undefined) patch.status = args.status;
    await ctx.db.patch(projectId, patch);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "project.update",
      entity: "projects",
      entityId: projectId,
    });
    return null;
  },
});

// ── Task writes (tasks:manage / projects:manage) ─────────────────────────────

// Validate + normalize a set of employee ids belong to the org.
async function validEmployeeIds(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  ids: Id<"employees">[],
): Promise<Id<"employees">[]> {
  const out: Id<"employees">[] = [];
  const seen = new Set<Id<"employees">>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const e = await ctx.db.get(id);
    if (e && e.orgId === orgId) out.push(id);
  }
  return out;
}

export const createTask = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    description: v.optional(v.string()),
    priority: v.optional(taskPriority),
    dueDate: v.optional(v.string()),
    assigneeIds: v.optional(v.array(v.id("employees"))),
  },
  returns: v.id("projectTasks"),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requireTaskManage(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.orgId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Project not found." });
    }
    const trimmed = args.name.trim();
    if (!trimmed) throw new ConvexError({ code: "INPUT", message: "Name is required." });
    const existing = await ctx.db
      .query("projectTasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const id = await ctx.db.insert("projectTasks", {
      orgId,
      projectId: args.projectId,
      name: trimmed,
      description: args.description?.trim() || undefined,
      status: "open",
      priority: args.priority,
      dueDate: args.dueDate || undefined,
      order: existing.length,
      createdBy: userId,
      updatedAt: Date.now(),
    });
    if (args.assigneeIds?.length) {
      const valid = await validEmployeeIds(ctx, orgId, args.assigneeIds);
      for (const employeeId of valid) {
        await ctx.db.insert("taskAssignments", {
          orgId,
          taskId: id,
          projectId: args.projectId,
          employeeId,
          assignedBy: userId,
          assignedAt: Date.now(),
        });
      }
    }
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "projectTask.create",
      entity: "projectTasks",
      entityId: id,
    });
    return id;
  },
});

export const updateTask = mutation({
  args: {
    taskId: v.id("projectTasks"),
    name: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    priority: v.optional(v.union(taskPriority, v.null())),
    dueDate: v.optional(v.union(v.string(), v.null())),
    status: v.optional(taskStatus),
    archived: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { taskId, ...args }) => {
    const { orgId, userId } = await requireTaskManage(ctx);
    const task = await ctx.db.get(taskId);
    if (!task || task.orgId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Task not found." });
    }
    const me = await employeeByUserId(ctx, orgId, userId);
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name.trim() || task.name;
    if (args.description !== undefined)
      patch.description = args.description?.trim() || undefined;
    if (args.priority !== undefined) patch.priority = args.priority ?? undefined;
    if (args.dueDate !== undefined) patch.dueDate = args.dueDate || undefined;
    if (args.status !== undefined) {
      patch.status = args.status;
      if (args.status === "done") {
        patch.completedAt = Date.now();
        patch.completedBy = me?._id;
      } else {
        patch.completedAt = undefined;
        patch.completedBy = undefined;
      }
    }
    if (args.archived !== undefined)
      patch.archivedAt = args.archived ? Date.now() : undefined;
    await ctx.db.patch(taskId, patch);
    return null;
  },
});

// Toggle completion. Assignees may complete tasks assigned to them; task
// managers may complete any task.
export const setTaskStatus = mutation({
  args: { taskId: v.id("projectTasks"), status: taskStatus },
  returns: v.null(),
  handler: async (ctx, { taskId, status }) => {
    const orgCtx = await requireOrg(ctx);
    const task = await ctx.db.get(taskId);
    if (!task || task.orgId !== orgCtx.orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Task not found." });
    }
    const me = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    let allowed = isProjectPrivileged(orgCtx);
    if (!allowed && me) {
      const access = await accessForEmployee(ctx, me._id);
      allowed =
        access.projectIds.has(task.projectId) || access.taskIds.has(taskId);
    }
    if (!allowed) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You can only complete tasks assigned to you.",
      });
    }
    await ctx.db.patch(taskId, {
      status,
      completedAt: status === "done" ? Date.now() : undefined,
      completedBy: status === "done" ? me?._id : undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

// ── Assignment writes (tasks:manage / projects:manage) ───────────────────────

// Replace a project's whole-project assignee set.
export const assignProject = mutation({
  args: { projectId: v.id("projects"), employeeIds: v.array(v.id("employees")) },
  returns: v.null(),
  handler: async (ctx, { projectId, employeeIds }) => {
    const { orgId, userId } = await requireTaskManage(ctx);
    const project = await ctx.db.get(projectId);
    if (!project || project.orgId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Project not found." });
    }
    const valid = new Set(await validEmployeeIds(ctx, orgId, employeeIds));
    const existing = await ctx.db
      .query("projectAssignments")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    const have = new Set(existing.map((r) => r.employeeId));
    // Remove those no longer assigned.
    for (const r of existing) {
      if (!valid.has(r.employeeId)) await ctx.db.delete(r._id);
    }
    // Add the new ones.
    for (const employeeId of valid) {
      if (have.has(employeeId)) continue;
      await ctx.db.insert("projectAssignments", {
        orgId,
        projectId,
        employeeId,
        assignedBy: userId,
        assignedAt: Date.now(),
      });
    }
    return null;
  },
});

// Replace a single task's assignee set.
export const assignTask = mutation({
  args: { taskId: v.id("projectTasks"), employeeIds: v.array(v.id("employees")) },
  returns: v.null(),
  handler: async (ctx, { taskId, employeeIds }) => {
    const { orgId, userId } = await requireTaskManage(ctx);
    const task = await ctx.db.get(taskId);
    if (!task || task.orgId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Task not found." });
    }
    const valid = new Set(await validEmployeeIds(ctx, orgId, employeeIds));
    const existing = await ctx.db
      .query("taskAssignments")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();
    const have = new Set(existing.map((r) => r.employeeId));
    for (const r of existing) {
      if (!valid.has(r.employeeId)) await ctx.db.delete(r._id);
    }
    for (const employeeId of valid) {
      if (have.has(employeeId)) continue;
      await ctx.db.insert("taskAssignments", {
        orgId,
        taskId,
        projectId: task.projectId,
        employeeId,
        assignedBy: userId,
        assignedAt: Date.now(),
      });
    }
    return null;
  },
});

// ── Attachments (tasks:manage / projects:manage) ─────────────────────────────

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireTaskManage(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const addTaskAttachments = mutation({
  args: {
    taskId: v.id("projectTasks"),
    files: v.array(v.object({ storageId: v.id("_storage"), name: v.string() })),
  },
  returns: v.null(),
  handler: async (ctx, { taskId, files }) => {
    const { orgId } = await requireTaskManage(ctx);
    const task = await ctx.db.get(taskId);
    if (!task || task.orgId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Task not found." });
    }
    const ids = [...(task.attachmentStorageIds ?? [])];
    const names = [...(task.attachmentNames ?? [])];
    if (ids.length + files.length > MAX_TASK_ATTACHMENTS) {
      throw new ConvexError({
        code: "INPUT",
        message: `A task can have at most ${MAX_TASK_ATTACHMENTS} attachments.`,
      });
    }
    for (const f of files) {
      ids.push(f.storageId);
      names.push(f.name.trim() || "Attachment");
    }
    await ctx.db.patch(taskId, {
      attachmentStorageIds: ids,
      attachmentNames: names,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const removeTaskAttachment = mutation({
  args: { taskId: v.id("projectTasks"), index: v.number() },
  returns: v.null(),
  handler: async (ctx, { taskId, index }) => {
    const { orgId } = await requireTaskManage(ctx);
    const task = await ctx.db.get(taskId);
    if (!task || task.orgId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Task not found." });
    }
    const ids = [...(task.attachmentStorageIds ?? [])];
    const names = [...(task.attachmentNames ?? [])];
    if (index < 0 || index >= ids.length) return null;
    const [removed] = ids.splice(index, 1);
    names.splice(index, 1);
    // The storage blob is owned by this task alone, so delete it too.
    if (removed) await ctx.storage.delete(removed);
    await ctx.db.patch(taskId, {
      attachmentStorageIds: ids,
      attachmentNames: names,
      updatedAt: Date.now(),
    });
    return null;
  },
});
