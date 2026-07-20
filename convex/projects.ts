import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireOrg, requirePermission, type OrgContext } from "./auth";
import { taskPriority, projectPhase } from "./lib/enums";
import { writeAuditLog } from "./lib/audit";
import { pushNotification } from "./model/notify";
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
  phase: v.optional(projectPhase),
  budgetMinutes: v.optional(v.number()),
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

const labelView = v.object({
  _id: v.id("taskLabels"),
  name: v.string(),
  color: v.string(),
});

const checklistItem = v.object({
  id: v.string(),
  text: v.string(),
  done: v.boolean(),
  order: v.number(),
});

const subtaskView = v.object({
  _id: v.id("projectTasks"),
  name: v.string(),
  status: v.union(v.literal("open"), v.literal("done")),
  priority: v.union(taskPriority, v.null()),
  dueDate: v.union(v.string(), v.null()),
  loggedMinutes: v.number(),
  assignees: v.array(assigneeView),
});

const taskLinkRef = v.object({
  linkId: v.id("taskLinks"),
  taskId: v.id("projectTasks"),
  name: v.string(),
  status: v.union(v.literal("open"), v.literal("done")),
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

// Resolve a task the caller may EDIT (managers, or an assignee of the task /
// its project). Returns the task, the caller's employee row, and whether they're
// a privileged manager. Throws when the caller can't touch the task. Used by the
// checklist + subtask + watcher actions that assignees are allowed to perform.
async function requireTaskEditor(
  ctx: QueryCtx,
  taskId: Id<"projectTasks">,
): Promise<{
  orgCtx: OrgContext;
  task: Doc<"projectTasks">;
  me: Doc<"employees"> | null;
  manage: boolean;
}> {
  const orgCtx = await requireOrg(ctx);
  const task = await ctx.db.get(taskId);
  if (!task || task.orgId !== orgCtx.orgId) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Task not found." });
  }
  const manage = isProjectPrivileged(orgCtx);
  const me = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
  let isAssignee = false;
  if (!manage && me) {
    const access = await accessForEmployee(ctx, me._id);
    isAssignee =
      access.projectIds.has(task.projectId) || access.taskIds.has(taskId);
  }
  if (!manage && !isAssignee) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "You can't edit this task.",
    });
  }
  return { orgCtx, task, me, manage };
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

// ── Stages (Kanban columns) ──────────────────────────────────────────────────

const stageView = v.object({
  _id: v.id("projectStages"),
  projectId: v.id("projects"),
  name: v.string(),
  color: v.union(v.string(), v.null()),
  order: v.number(),
  isDone: v.boolean(),
});

// Default columns seeded for every project. The last is terminal (isDone).
const DEFAULT_STAGES: { name: string; color: string; isDone: boolean }[] = [
  { name: "To Do", color: "#94a3b8", isDone: false },
  { name: "In Progress", color: "#3b82f6", isDone: false },
  { name: "In Review", color: "#a855f7", isDone: false },
  { name: "Done", color: "#22c55e", isDone: true },
];

async function seedStages(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  projectId: Id<"projects">,
): Promise<Doc<"projectStages">[]> {
  const ids: Id<"projectStages">[] = [];
  for (let i = 0; i < DEFAULT_STAGES.length; i++) {
    const s = DEFAULT_STAGES[i];
    ids.push(
      await ctx.db.insert("projectStages", {
        orgId,
        projectId,
        name: s.name,
        color: s.color,
        order: i,
        isDone: s.isDone,
      }),
    );
  }
  const fetched = await Promise.all(Array.from(ids, (id) => ctx.db.get(id)));
  const rows = fetched.filter((r): r is Doc<"projectStages"> => r !== null);
  return rows;
}

// Ordered stages for a project. Seeds the default set on first use so projects
// created before the board existed still get columns.
async function ensureStages(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  projectId: Id<"projects">,
): Promise<Doc<"projectStages">[]> {
  const rows = await ctx.db
    .query("projectStages")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  if (rows.length === 0) return seedStages(ctx, orgId, projectId);
  rows.sort((a, b) => a.order - b.order);
  return rows;
}

async function orderedStages(
  ctx: QueryCtx,
  projectId: Id<"projects">,
): Promise<Doc<"projectStages">[]> {
  const rows = await ctx.db
    .query("projectStages")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  rows.sort((a, b) => a.order - b.order);
  return rows;
}

// Roll up logged minutes per task (and untasked) for a whole project.
async function loggedByTask(
  ctx: QueryCtx,
  projectId: Id<"projects">,
): Promise<Map<Id<"projectTasks"> | "none", number>> {
  const rows = await ctx.db
    .query("timeEntries")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  const map = new Map<Id<"projectTasks"> | "none", number>();
  for (const r of rows) {
    const key = r.taskId ?? "none";
    map.set(key, (map.get(key) ?? 0) + r.minutes);
  }
  return map;
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

// A single project the caller may see (privileged, or assigned/visible).
export const get = query({
  args: { projectId: v.id("projects") },
  returns: v.union(projectDoc, v.null()),
  handler: async (ctx, { projectId }) => {
    const orgCtx = await requireOrg(ctx);
    const project = await ctx.db.get(projectId);
    if (!project || project.orgId !== orgCtx.orgId) return null;
    const access = await callerAccess(ctx, orgCtx);
    if (access && !access.visibleProjectIds.has(projectId)) return null;
    return project;
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

// Enriched cards for the portfolio dashboard + project-level Kanban: per-project
// progress, logged-vs-budget health, involved people (for avatars), and phase.
// Visibility mirrors `list` (privileged see all; others their assigned set).
export const dashboard = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("projects"),
      name: v.string(),
      code: v.union(v.string(), v.null()),
      description: v.union(v.string(), v.null()),
      clientName: v.union(v.string(), v.null()),
      color: v.union(v.string(), v.null()),
      status: projectStatus,
      phase: projectPhase,
      leadEmployeeId: v.union(v.id("employees"), v.null()),
      leadName: v.union(v.string(), v.null()),
      minutes: v.number(),
      openTasks: v.number(),
      doneTasks: v.number(),
      totalTasks: v.number(),
      budgetMinutes: v.number(),
      estimateTotal: v.number(),
      overBudget: v.boolean(),
      contributors: v.number(),
      people: v.array(assigneeView),
      updatedAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const orgCtx = await requireOrg(ctx);
    let projects = await ctx.db
      .query("projects")
      .withIndex("by_org", (q) => q.eq("orgId", orgCtx.orgId))
      .collect();
    const access = await callerAccess(ctx, orgCtx);
    if (access) {
      projects = projects.filter(
        (p) => p.status === "active" && access.visibleProjectIds.has(p._id),
      );
    }

    const nameCache = new Map<Id<"employees">, string>();
    const nameFor = async (id: Id<"employees">) => {
      const cached = nameCache.get(id);
      if (cached) return cached;
      const e = await ctx.db.get(id);
      const n = e ? displayName(e) : "—";
      nameCache.set(id, n);
      return n;
    };

    const out = [];
    for (const p of projects) {
      const [entries, tasks, projAssign, taskAssign] = await Promise.all([
        ctx.db
          .query("timeEntries")
          .withIndex("by_project", (q) => q.eq("projectId", p._id))
          .collect(),
        ctx.db
          .query("projectTasks")
          .withIndex("by_project", (q) => q.eq("projectId", p._id))
          .collect(),
        ctx.db
          .query("projectAssignments")
          .withIndex("by_project", (q) => q.eq("projectId", p._id))
          .collect(),
        ctx.db
          .query("taskAssignments")
          .withIndex("by_project", (q) => q.eq("projectId", p._id))
          .collect(),
      ]);

      let minutes = 0;
      const contributors = new Set<Id<"employees">>();
      for (const r of entries) {
        minutes += r.minutes;
        contributors.add(r.employeeId);
      }

      const live = tasks.filter((t) => !t.archivedAt);
      let doneTasks = 0;
      let estimateTotal = 0;
      for (const t of live) {
        if (t.status === "done") doneTasks += 1;
        estimateTotal += t.estimateMinutes ?? 0;
      }
      const budgetMinutes = p.budgetMinutes ?? estimateTotal;

      // Involved people = project-level + task-level assignees (deduped).
      const peopleIds = new Set<Id<"employees">>();
      for (const r of projAssign) peopleIds.add(r.employeeId);
      for (const r of taskAssign) peopleIds.add(r.employeeId);
      const people = [];
      for (const id of peopleIds) {
        people.push({ employeeId: id, name: await nameFor(id) });
      }
      people.sort((a, b) => a.name.localeCompare(b.name));

      out.push({
        _id: p._id,
        name: p.name,
        code: p.code ?? null,
        description: p.description ?? null,
        clientName: p.clientName ?? null,
        color: p.color ?? null,
        status: p.status,
        phase: p.phase ?? "active",
        leadEmployeeId: p.leadEmployeeId ?? null,
        leadName: p.leadEmployeeId ? await nameFor(p.leadEmployeeId) : null,
        minutes,
        openTasks: live.filter((t) => t.status === "open").length,
        doneTasks,
        totalTasks: live.length,
        budgetMinutes,
        estimateTotal,
        overBudget: budgetMinutes > 0 && minutes > budgetMinutes,
        contributors: contributors.size,
        people,
        updatedAt: p.updatedAt ?? null,
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
      stageId: v.union(v.id("projectStages"), v.null()),
      parentTaskId: v.union(v.id("projectTasks"), v.null()),
      parentName: v.union(v.string(), v.null()),
      name: v.string(),
      description: v.union(v.string(), v.null()),
      status: taskStatus,
      priority: v.union(taskPriority, v.null()),
      dueDate: v.union(v.string(), v.null()),
      startDate: v.union(v.string(), v.null()),
      estimateMinutes: v.union(v.number(), v.null()),
      loggedMinutes: v.number(),
      completedAt: v.union(v.number(), v.null()),
      completedByName: v.union(v.string(), v.null()),
      commentCount: v.number(),
      assignees: v.array(assigneeView),
      labels: v.array(labelView),
      labelIds: v.array(v.id("taskLabels")),
      customFields: v.record(v.string(), v.any()),
      checklist: v.array(checklistItem),
      subtasks: v.array(subtaskView),
      blocks: v.array(taskLinkRef),
      blockedBy: v.array(taskLinkRef),
      blocked: v.boolean(),
      milestoneId: v.union(v.id("projectMilestones"), v.null()),
      milestoneName: v.union(v.string(), v.null()),
      watching: v.boolean(),
      watcherCount: v.number(),
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
    const me = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);

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

    // Logged time against this specific task (from the timesheet).
    const logged = await loggedByTask(ctx, task.projectId);
    const loggedMinutes = logged.get(task._id) ?? 0;

    const comments = await ctx.db
      .query("taskComments")
      .withIndex("by_task", (q) => q.eq("taskId", task._id))
      .collect();

    // Parent (when this task is a subtask).
    let parentName: string | null = null;
    if (task.parentTaskId) {
      const parent = await ctx.db.get(task.parentTaskId);
      parentName = parent?.name ?? null;
    }

    // Labels resolved to chips.
    const labels: { _id: Id<"taskLabels">; name: string; color: string }[] = [];
    for (const id of task.labelIds ?? []) {
      const l = await ctx.db.get(id);
      if (l) labels.push({ _id: l._id, name: l.name, color: l.color });
    }

    // Subtasks with their own assignees + logged time.
    const subRows = (
      await ctx.db
        .query("projectTasks")
        .withIndex("by_parent", (q) => q.eq("parentTaskId", task._id))
        .collect()
    ).filter((s) => !s.archivedAt);
    subRows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const subtasks = [];
    for (const s of subRows) {
      const sa = await ctx.db
        .query("taskAssignments")
        .withIndex("by_task", (q) => q.eq("taskId", s._id))
        .collect();
      const sAssignees = await Promise.all(
        sa.map(async (r) => {
          const e = await ctx.db.get(r.employeeId);
          return { employeeId: r.employeeId, name: e ? displayName(e) : "—" };
        }),
      );
      subtasks.push({
        _id: s._id,
        name: s.name,
        status: s.status,
        priority: s.priority ?? null,
        dueDate: s.dueDate ?? null,
        loggedMinutes: logged.get(s._id) ?? 0,
        assignees: sAssignees,
      });
    }

    // Dependency edges (this task blocks …, and is blocked by …).
    const [fromLinks, toLinks] = await Promise.all([
      ctx.db
        .query("taskLinks")
        .withIndex("by_from", (q) => q.eq("fromTaskId", task._id))
        .collect(),
      ctx.db
        .query("taskLinks")
        .withIndex("by_to", (q) => q.eq("toTaskId", task._id))
        .collect(),
    ]);
    const linkRef = async (
      link: Doc<"taskLinks">,
      otherId: Id<"projectTasks">,
    ) => {
      const other = await ctx.db.get(otherId);
      return {
        linkId: link._id,
        taskId: otherId,
        name: other?.name ?? "—",
        status: (other?.status ?? "open") as "open" | "done",
      };
    };
    const blocks = await Promise.all(fromLinks.map((l) => linkRef(l, l.toTaskId)));
    const blockedBy = await Promise.all(toLinks.map((l) => linkRef(l, l.fromTaskId)));
    const blocked = blockedBy.some((b) => b.status === "open");

    // Milestone label.
    let milestoneName: string | null = null;
    if (task.milestoneId) {
      const m = await ctx.db.get(task.milestoneId);
      milestoneName = m?.name ?? null;
    }

    const watchers = task.watcherEmployeeIds ?? [];
    const watching = !!me && watchers.includes(me._id);

    // Assignees may complete their own task; managers may complete any.
    const canComplete = manage || isAssignee;

    return {
      _id: task._id,
      projectId: task.projectId,
      projectName: project?.name ?? "—",
      projectColor: project?.color ?? null,
      stageId: task.stageId ?? null,
      parentTaskId: task.parentTaskId ?? null,
      parentName,
      name: task.name,
      description: task.description ?? null,
      status: task.status,
      priority: task.priority ?? null,
      dueDate: task.dueDate ?? null,
      startDate: task.startDate ?? null,
      estimateMinutes: task.estimateMinutes ?? null,
      loggedMinutes,
      completedAt: task.completedAt ?? null,
      completedByName,
      commentCount: comments.length,
      assignees,
      labels,
      labelIds: task.labelIds ?? [],
      customFields: task.customFields ?? {},
      checklist: [...(task.checklist ?? [])].sort((a, b) => a.order - b.order),
      subtasks,
      blocks,
      blockedBy,
      blocked,
      milestoneId: task.milestoneId ?? null,
      milestoneName,
      watching,
      watcherCount: watchers.length,
      attachments,
      canManage: manage,
      canComplete,
    };
  },
});

// The live subtasks of a task, for the List view's collapsible nesting. Visible
// to anyone who can see the parent task.
export const subtasks = query({
  args: { taskId: v.id("projectTasks") },
  returns: v.array(subtaskView),
  handler: async (ctx, { taskId }) => {
    const orgCtx = await requireOrg(ctx);
    const parent = await ctx.db.get(taskId);
    if (!parent || parent.orgId !== orgCtx.orgId) return [];
    const access = await callerAccess(ctx, orgCtx);
    const manage = isProjectPrivileged(orgCtx);
    if (
      access &&
      !manage &&
      !access.projectIds.has(parent.projectId) &&
      !access.taskIds.has(taskId)
    ) {
      return [];
    }
    const rows = (
      await ctx.db
        .query("projectTasks")
        .withIndex("by_parent", (q) => q.eq("parentTaskId", taskId))
        .collect()
    ).filter((s) => !s.archivedAt);
    rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const logged = await loggedByTask(ctx, parent.projectId);
    const out = [];
    for (const s of rows) {
      const sa = await ctx.db
        .query("taskAssignments")
        .withIndex("by_task", (q) => q.eq("taskId", s._id))
        .collect();
      const assignees = await Promise.all(
        sa.map(async (r) => {
          const e = await ctx.db.get(r.employeeId);
          return { employeeId: r.employeeId, name: e ? displayName(e) : "—" };
        }),
      );
      out.push({
        _id: s._id,
        name: s.name,
        status: s.status,
        priority: s.priority ?? null,
        dueDate: s.dueDate ?? null,
        loggedMinutes: logged.get(s._id) ?? 0,
        assignees,
      });
    }
    return out;
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
      labels: v.array(labelView),
      viaProject: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const orgCtx = await requireOrg(ctx);
    const me = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    if (!me) return [];
    const access = await accessForEmployee(ctx, me._id);
    const orgLabels = await ctx.db
      .query("taskLabels")
      .withIndex("by_org", (q) => q.eq("orgId", orgCtx.orgId))
      .collect();
    const labelMap = new Map(orgLabels.map((l) => [l._id, l]));

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
    const fetchedProjects = await Promise.all(
      Array.from(projectIds, (id) => ctx.db.get(id)),
    );
    for (const p of fetchedProjects) {
      if (p) projMap.set(p._id, p);
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
        labels: (task.labelIds ?? [])
          .map((id) => labelMap.get(id))
          .filter((l): l is Doc<"taskLabels"> => !!l)
          .map((l) => ({ _id: l._id, name: l.name, color: l.color })),
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
    phase: v.optional(projectPhase),
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
      phase: args.phase ?? "planning",
      createdBy: userId,
      updatedAt: Date.now(),
    });
    // Seed the default Kanban columns so the board is usable immediately.
    await seedStages(ctx, orgId, id);
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
    phase: v.optional(projectPhase),
    budgetMinutes: v.optional(v.union(v.number(), v.null())),
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
    if (args.phase !== undefined) patch.phase = args.phase;
    if (args.budgetMinutes !== undefined)
      patch.budgetMinutes =
        args.budgetMinutes && args.budgetMinutes > 0
          ? Math.round(args.budgetMinutes)
          : undefined;
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

// Move a project between portfolio phases (project-level Kanban).
export const setProjectPhase = mutation({
  args: { projectId: v.id("projects"), phase: projectPhase },
  returns: v.null(),
  handler: async (ctx, { projectId, phase }) => {
    const { orgId } = await requirePermission(ctx, "projects:manage");
    const project = await ctx.db.get(projectId);
    if (!project || project.orgId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Project not found." });
    }
    await ctx.db.patch(projectId, { phase, updatedAt: Date.now() });
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

// Keep only label ids that exist in this org, de-duplicated.
async function validLabelIds(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  ids: Id<"taskLabels">[],
): Promise<Id<"taskLabels">[]> {
  const out: Id<"taskLabels">[] = [];
  const seen = new Set<Id<"taskLabels">>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const l = await ctx.db.get(id);
    if (l && l.orgId === orgId) out.push(id);
  }
  return out;
}

// Sanitize a custom-fields record against the org's active field defs, coercing
// each value to its def's type and dropping unknown/empty keys. Mirrors the
// claim/payment-request field approach.
async function sanitizeCustomFields(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  values: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const defs = await ctx.db
    .query("taskFieldDefs")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  const out: Record<string, unknown> = {};
  for (const def of defs) {
    if (!def.active) continue;
    const raw = values[def.key];
    if (raw === undefined || raw === null || raw === "") continue;
    switch (def.type) {
      case "number": {
        const n = Number(raw);
        if (!Number.isNaN(n)) out[def.key] = n;
        break;
      }
      case "checkbox":
        out[def.key] = Boolean(raw);
        break;
      case "select": {
        const s = String(raw);
        if ((def.options ?? []).includes(s)) out[def.key] = s;
        break;
      }
      case "date":
      case "text":
      default:
        out[def.key] = String(raw).slice(0, 2000);
        break;
    }
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
    startDate: v.optional(v.string()),
    estimateMinutes: v.optional(v.number()),
    stageId: v.optional(v.id("projectStages")),
    assigneeIds: v.optional(v.array(v.id("employees"))),
    // When set, the new task is a subtask of this parent (same project/stage).
    parentTaskId: v.optional(v.id("projectTasks")),
    labelIds: v.optional(v.array(v.id("taskLabels"))),
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

    // A subtask must reference a top-level parent in the same project (no nesting
    // deeper than one level, to keep boards/rollups simple).
    if (args.parentTaskId) {
      const parent = await ctx.db.get(args.parentTaskId);
      if (!parent || parent.orgId !== orgId || parent.projectId !== args.projectId) {
        throw new ConvexError({ code: "INPUT", message: "Invalid parent task." });
      }
      if (parent.parentTaskId) {
        throw new ConvexError({
          code: "INPUT",
          message: "Subtasks can't have their own subtasks.",
        });
      }
    }

    // Resolve the target column: an explicit valid stage, else the first one
    // (seeding the default set for legacy projects that have none yet).
    const stages = await ensureStages(ctx, orgId, args.projectId);
    let stage = stages[0];
    if (args.stageId) {
      const chosen = stages.find((s) => s._id === args.stageId);
      if (chosen) stage = chosen;
    }

    const existing = await ctx.db
      .query("projectTasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const inStage = existing.filter(
      (t) => !t.archivedAt && t.stageId === stage._id,
    ).length;
    const labelIds = args.labelIds?.length
      ? await validLabelIds(ctx, orgId, args.labelIds)
      : undefined;
    const id = await ctx.db.insert("projectTasks", {
      orgId,
      projectId: args.projectId,
      parentTaskId: args.parentTaskId,
      stageId: stage._id,
      name: trimmed,
      description: args.description?.trim() || undefined,
      status: stage.isDone ? "done" : "open",
      priority: args.priority,
      dueDate: args.dueDate || undefined,
      startDate: args.startDate || undefined,
      estimateMinutes:
        args.estimateMinutes && args.estimateMinutes > 0
          ? Math.round(args.estimateMinutes)
          : undefined,
      labelIds: labelIds?.length ? labelIds : undefined,
      completedAt: stage.isDone ? Date.now() : undefined,
      order: inStage,
      createdBy: userId,
      updatedAt: Date.now(),
    });
    let assigneeIds: Id<"employees">[] = [];
    if (args.assigneeIds?.length) {
      assigneeIds = await validEmployeeIds(ctx, orgId, args.assigneeIds);
      for (const employeeId of assigneeIds) {
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
    // Auto-watch: the creator + any initial assignees.
    const creator = await employeeByUserId(ctx, orgId, userId);
    const watchers = [...new Set([creator?._id, ...assigneeIds].filter(Boolean))];
    if (watchers.length) {
      await ctx.db.patch(id, { watcherEmployeeIds: watchers as Id<"employees">[] });
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
    startDate: v.optional(v.union(v.string(), v.null())),
    estimateMinutes: v.optional(v.union(v.number(), v.null())),
    status: v.optional(taskStatus),
    archived: v.optional(v.boolean()),
    labelIds: v.optional(v.array(v.id("taskLabels"))),
    customFields: v.optional(v.record(v.string(), v.any())),
    milestoneId: v.optional(v.union(v.id("projectMilestones"), v.null())),
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
    if (args.startDate !== undefined) patch.startDate = args.startDate || undefined;
    if (args.estimateMinutes !== undefined)
      patch.estimateMinutes =
        args.estimateMinutes && args.estimateMinutes > 0
          ? Math.round(args.estimateMinutes)
          : undefined;
    if (args.labelIds !== undefined) {
      const valid = await validLabelIds(ctx, orgId, args.labelIds);
      patch.labelIds = valid.length ? valid : undefined;
    }
    if (args.customFields !== undefined)
      patch.customFields = await sanitizeCustomFields(ctx, orgId, args.customFields);
    if (args.milestoneId !== undefined) {
      if (args.milestoneId) {
        const m = await ctx.db.get(args.milestoneId);
        patch.milestoneId =
          m && m.orgId === orgId && m.projectId === task.projectId
            ? args.milestoneId
            : undefined;
      } else {
        patch.milestoneId = undefined;
      }
    }
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
    if (args.archived) {
      // Block archiving a parent that still has live subtasks.
      const subs = await ctx.db
        .query("projectTasks")
        .withIndex("by_parent", (q) => q.eq("parentTaskId", taskId))
        .collect();
      if (subs.some((s) => !s.archivedAt)) {
        throw new ConvexError({
          code: "INPUT",
          message: "Archive or move its subtasks first.",
        });
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
    if (status !== task.status) {
      await notifyTaskWatchers(ctx, task, {
        type: status === "done" ? "task.completed" : "task.reopened",
        title:
          status === "done"
            ? `Task completed: ${task.name}`
            : `Task reopened: ${task.name}`,
        exceptEmployeeId: me?._id ?? null,
      });
    }
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
    const newlyAssigned: Id<"employees">[] = [];
    for (const employeeId of valid) {
      if (have.has(employeeId)) continue;
      newlyAssigned.push(employeeId);
      await ctx.db.insert("taskAssignments", {
        orgId,
        taskId,
        projectId: task.projectId,
        employeeId,
        assignedBy: userId,
        assignedAt: Date.now(),
      });
    }
    if (newlyAssigned.length) {
      // Auto-watch the newly assigned, then notify them (except the actor).
      const withWatchers = await addWatchers(ctx, task, newlyAssigned);
      const actor = await employeeByUserId(ctx, orgId, userId);
      await notifyTaskWatchers(
        ctx,
        { ...task, watcherEmployeeIds: newlyAssigned },
        {
          type: "task.assigned",
          title: `You were assigned: ${task.name}`,
          exceptEmployeeId: actor?._id ?? null,
        },
      );
      void withWatchers;
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

// ── Stages (Kanban columns) ──────────────────────────────────────────────────

export const listStages = query({
  args: { projectId: v.id("projects") },
  returns: v.array(stageView),
  handler: async (ctx, { projectId }) => {
    const orgCtx = await requireOrg(ctx);
    const project = await ctx.db.get(projectId);
    if (!project || project.orgId !== orgCtx.orgId) return [];
    const access = await callerAccess(ctx, orgCtx);
    if (access && !access.visibleProjectIds.has(projectId)) return [];
    const stages = await orderedStages(ctx, projectId);
    return stages.map((s) => ({
      _id: s._id,
      projectId: s.projectId,
      name: s.name,
      color: s.color ?? null,
      order: s.order,
      isDone: s.isDone,
    }));
  },
});

export const createStage = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    color: v.optional(v.string()),
    isDone: v.optional(v.boolean()),
  },
  returns: v.id("projectStages"),
  handler: async (ctx, args) => {
    const { orgId } = await requireTaskManage(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.orgId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Project not found." });
    }
    const name = args.name.trim();
    if (!name) throw new ConvexError({ code: "INPUT", message: "Name is required." });
    const stages = await orderedStages(ctx, args.projectId);
    const order = stages.length ? stages[stages.length - 1].order + 1 : 0;
    return await ctx.db.insert("projectStages", {
      orgId,
      projectId: args.projectId,
      name,
      color: args.color,
      order,
      isDone: args.isDone ?? false,
    });
  },
});

export const updateStage = mutation({
  args: {
    stageId: v.id("projectStages"),
    name: v.optional(v.string()),
    color: v.optional(v.union(v.string(), v.null())),
    isDone: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { stageId, ...args }) => {
    const { orgId } = await requireTaskManage(ctx);
    const stage = await ctx.db.get(stageId);
    if (!stage || stage.orgId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Stage not found." });
    }
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name.trim() || stage.name;
    if (args.color !== undefined) patch.color = args.color ?? undefined;
    if (args.isDone !== undefined) patch.isDone = args.isDone;
    await ctx.db.patch(stageId, patch);
    // When a column's terminal flag changes, resync the binary status of every
    // task in it so completion / roll-ups stay correct.
    if (args.isDone !== undefined && args.isDone !== stage.isDone) {
      const tasks = await ctx.db
        .query("projectTasks")
        .withIndex("by_stage", (q) => q.eq("stageId", stageId))
        .collect();
      for (const t of tasks) {
        if (t.archivedAt) continue;
        await ctx.db.patch(t._id, {
          status: args.isDone ? "done" : "open",
          completedAt: args.isDone ? t.completedAt ?? Date.now() : undefined,
          completedBy: args.isDone ? t.completedBy : undefined,
        });
      }
    }
    return null;
  },
});

export const reorderStages = mutation({
  args: {
    projectId: v.id("projects"),
    orderedStageIds: v.array(v.id("projectStages")),
  },
  returns: v.null(),
  handler: async (ctx, { projectId, orderedStageIds }) => {
    const { orgId } = await requireTaskManage(ctx);
    const project = await ctx.db.get(projectId);
    if (!project || project.orgId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Project not found." });
    }
    for (let i = 0; i < orderedStageIds.length; i++) {
      const s = await ctx.db.get(orderedStageIds[i]);
      if (s && s.projectId === projectId) await ctx.db.patch(s._id, { order: i });
    }
    return null;
  },
});

export const deleteStage = mutation({
  args: {
    stageId: v.id("projectStages"),
    reassignToStageId: v.id("projectStages"),
  },
  returns: v.null(),
  handler: async (ctx, { stageId, reassignToStageId }) => {
    const { orgId } = await requireTaskManage(ctx);
    const stage = await ctx.db.get(stageId);
    if (!stage || stage.orgId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Stage not found." });
    }
    if (stageId === reassignToStageId) {
      throw new ConvexError({ code: "INPUT", message: "Pick a different column to move tasks to." });
    }
    const target = await ctx.db.get(reassignToStageId);
    if (!target || target.projectId !== stage.projectId) {
      throw new ConvexError({ code: "INPUT", message: "Target column is invalid." });
    }
    const all = await orderedStages(ctx, stage.projectId);
    if (all.length <= 1) {
      throw new ConvexError({ code: "INPUT", message: "A project needs at least one column." });
    }
    // Move every task off the doomed column onto the target, appended in order.
    const moving = await ctx.db
      .query("projectTasks")
      .withIndex("by_stage", (q) => q.eq("stageId", stageId))
      .collect();
    const existingTarget = await ctx.db
      .query("projectTasks")
      .withIndex("by_stage", (q) => q.eq("stageId", reassignToStageId))
      .collect();
    let order = existingTarget.filter((t) => !t.archivedAt).length;
    for (const t of moving) {
      await ctx.db.patch(t._id, {
        stageId: reassignToStageId,
        status: target.isDone ? "done" : "open",
        completedAt: target.isDone ? t.completedAt ?? Date.now() : undefined,
        completedBy: target.isDone ? t.completedBy : undefined,
        order: t.archivedAt ? t.order : order++,
      });
    }
    await ctx.db.delete(stageId);
    return null;
  },
});

// ── Board + move ─────────────────────────────────────────────────────────────

const taskCardView = v.object({
  _id: v.id("projectTasks"),
  projectId: v.id("projects"),
  stageId: v.union(v.id("projectStages"), v.null()),
  name: v.string(),
  status: taskStatus,
  priority: v.union(taskPriority, v.null()),
  dueDate: v.union(v.string(), v.null()),
  startDate: v.union(v.string(), v.null()),
  estimateMinutes: v.union(v.number(), v.null()),
  loggedMinutes: v.number(),
  attachmentCount: v.number(),
  assigneeCount: v.number(),
  assignees: v.array(assigneeView),
  labels: v.array(labelView),
  customFields: v.record(v.string(), v.any()),
  checklistDone: v.number(),
  checklistTotal: v.number(),
  subtaskDone: v.number(),
  subtaskTotal: v.number(),
  blocked: v.boolean(),
  order: v.union(v.number(), v.null()),
  completedAt: v.union(v.number(), v.null()),
});

// The whole board in one round-trip: ordered stages + enriched task cards
// (assignees, logged-vs-estimate, counts). Reused by the List tab too.
export const board = query({
  args: { projectId: v.id("projects") },
  returns: v.object({
    stages: v.array(stageView),
    tasks: v.array(taskCardView),
  }),
  handler: async (ctx, { projectId }) => {
    const orgCtx = await requireOrg(ctx);
    const project = await ctx.db.get(projectId);
    if (!project || project.orgId !== orgCtx.orgId) {
      return { stages: [], tasks: [] };
    }
    const access = await callerAccess(ctx, orgCtx);
    if (access && !access.visibleProjectIds.has(projectId)) {
      return { stages: [], tasks: [] };
    }

    const stages = await orderedStages(ctx, projectId);

    const allLive = (
      await ctx.db
        .query("projectTasks")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect()
    ).filter((t) => !t.archivedAt);

    // Subtask roll-up per parent (computed from every live task, before we drop
    // subtasks from the board).
    const subCounts = new Map<Id<"projectTasks">, { done: number; total: number }>();
    for (const t of allLive) {
      if (!t.parentTaskId) continue;
      const c = subCounts.get(t.parentTaskId) ?? { done: 0, total: 0 };
      c.total += 1;
      if (t.status === "done") c.done += 1;
      subCounts.set(t.parentTaskId, c);
    }

    // The board shows top-level tasks only; subtasks live inside the detail panel.
    let tasks = allLive.filter((t) => !t.parentTaskId);
    if (access && !access.projectIds.has(projectId)) {
      tasks = tasks.filter((t) => access.taskIds.has(t._id));
    }

    // Dependency edges: a task is "blocked" while any task that blocks it is open.
    const links = await ctx.db
      .query("taskLinks")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    const statusById = new Map(allLive.map((t) => [t._id, t.status]));
    const blockedIds = new Set<Id<"projectTasks">>();
    for (const l of links) {
      if (statusById.get(l.fromTaskId) === "open") blockedIds.add(l.toTaskId);
    }

    // Org labels, for resolving each task's label chips.
    const orgLabels = await ctx.db
      .query("taskLabels")
      .withIndex("by_org", (q) => q.eq("orgId", orgCtx.orgId))
      .collect();
    const labelMap = new Map(orgLabels.map((l) => [l._id, l]));

    const logged = await loggedByTask(ctx, projectId);

    // Assignees: project-level (apply to every task) + task-level.
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
    const empIds = new Set<Id<"employees">>();
    for (const r of projRows) empIds.add(r.employeeId);
    for (const r of taskRows) empIds.add(r.employeeId);
    const nameMap = new Map<Id<"employees">, string>();
    const empIdList = Array.from(empIds);
    const empDocs = await Promise.all(empIdList.map((id) => ctx.db.get(id)));
    empIdList.forEach((id, i) => {
      const e = empDocs[i];
      nameMap.set(id, e ? displayName(e) : "—");
    });
    const projectLevel = projRows.map((r) => ({
      employeeId: r.employeeId,
      name: nameMap.get(r.employeeId) ?? "—",
    }));
    const perTask = new Map<Id<"projectTasks">, { employeeId: Id<"employees">; name: string }[]>();
    for (const r of taskRows) {
      const arr = perTask.get(r.taskId) ?? [];
      arr.push({ employeeId: r.employeeId, name: nameMap.get(r.employeeId) ?? "—" });
      perTask.set(r.taskId, arr);
    }

    tasks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const cards = tasks.map((t) => {
      const seen = new Set<Id<"employees">>();
      const assignees: { employeeId: Id<"employees">; name: string }[] = [];
      for (const a of [...projectLevel, ...(perTask.get(t._id) ?? [])]) {
        if (seen.has(a.employeeId)) continue;
        seen.add(a.employeeId);
        assignees.push(a);
      }
      const checklist = t.checklist ?? [];
      const sub = subCounts.get(t._id) ?? { done: 0, total: 0 };
      const labels = (t.labelIds ?? [])
        .map((id) => labelMap.get(id))
        .filter((l): l is Doc<"taskLabels"> => !!l)
        .map((l) => ({ _id: l._id, name: l.name, color: l.color }));
      return {
        _id: t._id,
        projectId: t.projectId,
        stageId: t.stageId ?? null,
        name: t.name,
        status: t.status,
        priority: t.priority ?? null,
        dueDate: t.dueDate ?? null,
        startDate: t.startDate ?? null,
        estimateMinutes: t.estimateMinutes ?? null,
        loggedMinutes: logged.get(t._id) ?? 0,
        attachmentCount: t.attachmentStorageIds?.length ?? 0,
        assigneeCount: assignees.length,
        assignees,
        labels,
        customFields: t.customFields ?? {},
        checklistDone: checklist.filter((c) => c.done).length,
        checklistTotal: checklist.length,
        subtaskDone: sub.done,
        subtaskTotal: sub.total,
        blocked: blockedIds.has(t._id),
        order: t.order ?? null,
        completedAt: t.completedAt ?? null,
      };
    });

    return {
      stages: stages.map((s) => ({
        _id: s._id,
        projectId: s.projectId,
        name: s.name,
        color: s.color ?? null,
        order: s.order,
        isDone: s.isDone,
      })),
      tasks: cards,
    };
  },
});

// Drag-drop target. Moves a task to `stageId` and writes the destination
// column's full order in one shot (handles cross-column + reorder). Syncs the
// binary status from the destination column's terminal flag.
export const moveTask = mutation({
  args: {
    taskId: v.id("projectTasks"),
    stageId: v.id("projectStages"),
    orderedTaskIds: v.array(v.id("projectTasks")),
  },
  returns: v.null(),
  handler: async (ctx, { taskId, stageId, orderedTaskIds }) => {
    const { orgId, userId } = await requireTaskManage(ctx);
    const task = await ctx.db.get(taskId);
    if (!task || task.orgId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Task not found." });
    }
    const stage = await ctx.db.get(stageId);
    if (!stage || stage.projectId !== task.projectId) {
      throw new ConvexError({ code: "INPUT", message: "Invalid column." });
    }
    const me = await employeeByUserId(ctx, orgId, userId);
    await ctx.db.patch(taskId, {
      stageId,
      status: stage.isDone ? "done" : "open",
      completedAt: stage.isDone ? task.completedAt ?? Date.now() : undefined,
      completedBy: stage.isDone ? task.completedBy ?? me?._id : undefined,
      updatedAt: Date.now(),
    });
    // Normalize order for the destination column.
    for (let i = 0; i < orderedTaskIds.length; i++) {
      const t = await ctx.db.get(orderedTaskIds[i]);
      if (t && t.projectId === task.projectId) await ctx.db.patch(t._id, { order: i });
    }
    return null;
  },
});

// ── Overview (projects:manage) ───────────────────────────────────────────────

export const overview = query({
  args: { projectId: v.id("projects") },
  returns: v.object({
    totalMinutes: v.number(),
    budgetMinutes: v.number(),
    estimateTotal: v.number(),
    completion: v.object({ total: v.number(), done: v.number() }),
    byStage: v.array(
      v.object({
        stageId: v.id("projectStages"),
        name: v.string(),
        color: v.union(v.string(), v.null()),
        count: v.number(),
        isDone: v.boolean(),
      }),
    ),
    byEmployee: v.array(
      v.object({
        employeeId: v.id("employees"),
        name: v.string(),
        minutes: v.number(),
        entries: v.number(),
        assigned: v.number(),
        estimateMinutes: v.number(),
      }),
    ),
    byTask: v.array(
      v.object({
        taskId: v.union(v.id("projectTasks"), v.null()),
        name: v.string(),
        minutes: v.number(),
      }),
    ),
    burndown: v.array(v.object({ date: v.string(), logged: v.number() })),
  }),
  handler: async (ctx, { projectId }) => {
    const { orgId } = await requirePermission(ctx, "projects:manage");
    const project = await ctx.db.get(projectId);
    const empty = {
      totalMinutes: 0,
      budgetMinutes: 0,
      estimateTotal: 0,
      completion: { total: 0, done: 0 },
      byStage: [],
      byEmployee: [],
      byTask: [],
      burndown: [],
    };
    if (!project || project.orgId !== orgId) return empty;

    const entries = await ctx.db
      .query("timeEntries")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    const tasks = (
      await ctx.db
        .query("projectTasks")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect()
    ).filter((t) => !t.archivedAt);
    const stages = await orderedStages(ctx, projectId);
    const doneStageIds = new Set(stages.filter((s) => s.isDone).map((s) => s._id));
    const tName = new Map(tasks.map((t) => [t._id, t.name]));

    // Estimates + completion.
    let estimateTotal = 0;
    let done = 0;
    for (const t of tasks) {
      estimateTotal += t.estimateMinutes ?? 0;
      const isDone = t.stageId ? doneStageIds.has(t.stageId) : t.status === "done";
      if (isDone) done += 1;
    }
    const budgetMinutes = project.budgetMinutes ?? estimateTotal;

    // Tasks per stage.
    const stageCount = new Map<Id<"projectStages">, number>();
    for (const t of tasks) {
      if (t.stageId) stageCount.set(t.stageId, (stageCount.get(t.stageId) ?? 0) + 1);
    }

    // Time by employee + by task, plus cumulative burn-down by date.
    let totalMinutes = 0;
    const empAgg = new Map<Id<"employees">, { minutes: number; entries: number }>();
    const taskAgg = new Map<string, number>();
    const byDate = new Map<string, number>();
    for (const r of entries) {
      totalMinutes += r.minutes;
      const e = empAgg.get(r.employeeId) ?? { minutes: 0, entries: 0 };
      e.minutes += r.minutes;
      e.entries += 1;
      empAgg.set(r.employeeId, e);
      const key = r.taskId ?? "none";
      taskAgg.set(key, (taskAgg.get(key) ?? 0) + r.minutes);
      byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.minutes);
    }

    // Assignment-derived workload per employee.
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
    const projAssignees = new Set(projRows.map((r) => r.employeeId));
    const perEmpTasks = new Map<Id<"employees">, Set<Id<"projectTasks">>>();
    for (const r of taskRows) {
      const s = perEmpTasks.get(r.employeeId) ?? new Set();
      s.add(r.taskId);
      perEmpTasks.set(r.employeeId, s);
    }
    const allTaskIds = new Set(tasks.map((t) => t._id));
    const estimateFor = new Map<Id<"projectTasks">, number>(
      tasks.map((t) => [t._id, t.estimateMinutes ?? 0]),
    );

    const workforce = new Set<Id<"employees">>([
      ...empAgg.keys(),
      ...projAssignees,
      ...perEmpTasks.keys(),
    ]);
    const workforceList = Array.from(workforce);
    const workforceDocs = await Promise.all(
      workforceList.map((id) => ctx.db.get(id)),
    );
    const empByIdWf = new Map(
      workforceDocs.flatMap((e) => (e ? [[e._id, e] as const] : [])),
    );
    const byEmployee = [];
    for (const employeeId of workforce) {
      const emp = empByIdWf.get(employeeId) ?? null;
      const agg = empAgg.get(employeeId) ?? { minutes: 0, entries: 0 };
      const assignedIds = projAssignees.has(employeeId)
        ? allTaskIds
        : perEmpTasks.get(employeeId) ?? new Set<Id<"projectTasks">>();
      let est = 0;
      for (const tid of assignedIds) est += estimateFor.get(tid) ?? 0;
      byEmployee.push({
        employeeId,
        name: emp ? displayName(emp) : "—",
        minutes: agg.minutes,
        entries: agg.entries,
        assigned: assignedIds.size,
        estimateMinutes: est,
      });
    }
    byEmployee.sort((a, b) => b.minutes - a.minutes || b.assigned - a.assigned);

    const byTask = [...taskAgg.entries()]
      .map(([key, minutes]) => ({
        taskId: key === "none" ? null : (key as Id<"projectTasks">),
        name: key === "none" ? "No task" : (tName.get(key as Id<"projectTasks">) ?? "—"),
        minutes,
      }))
      .sort((a, b) => b.minutes - a.minutes);

    const burndown: { date: string; logged: number }[] = [];
    let cumulative = 0;
    for (const date of [...byDate.keys()].sort()) {
      cumulative += byDate.get(date) ?? 0;
      burndown.push({ date, logged: cumulative });
    }

    return {
      totalMinutes,
      budgetMinutes,
      estimateTotal,
      completion: { total: tasks.length, done },
      byStage: stages.map((s) => ({
        stageId: s._id,
        name: s.name,
        color: s.color ?? null,
        count: stageCount.get(s._id) ?? 0,
        isDone: s.isDone,
      })),
      byEmployee,
      byTask,
      burndown,
    };
  },
});

// ── Comments ─────────────────────────────────────────────────────────────────

// Resolve a task the caller may view (manager or assignee) plus their identity.
async function taskViewer(ctx: QueryCtx, taskId: Id<"projectTasks">) {
  const orgCtx = await requireOrg(ctx);
  const task = await ctx.db.get(taskId);
  if (!task || task.orgId !== orgCtx.orgId) return null;
  const manage = isProjectPrivileged(orgCtx);
  const me = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
  let isAssignee = false;
  if (!manage && me) {
    const access = await accessForEmployee(ctx, me._id);
    isAssignee = access.projectIds.has(task.projectId) || access.taskIds.has(taskId);
  }
  if (!manage && !isAssignee) return null;
  return { orgCtx, task, manage, me };
}

export const listComments = query({
  args: { taskId: v.id("projectTasks") },
  returns: v.array(
    v.object({
      _id: v.id("taskComments"),
      authorEmployeeId: v.id("employees"),
      authorName: v.string(),
      body: v.string(),
      createdAt: v.number(),
      editedAt: v.union(v.number(), v.null()),
      canEdit: v.boolean(),
    }),
  ),
  handler: async (ctx, { taskId }) => {
    const viewer = await taskViewer(ctx, taskId);
    if (!viewer) return [];
    const rows = await ctx.db
      .query("taskComments")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();
    rows.sort((a, b) => a._creationTime - b._creationTime);
    const out = [];
    for (const r of rows) {
      const e = await ctx.db.get(r.authorEmployeeId);
      out.push({
        _id: r._id,
        authorEmployeeId: r.authorEmployeeId,
        authorName: e ? displayName(e) : "—",
        body: r.body,
        createdAt: r._creationTime,
        editedAt: r.editedAt ?? null,
        canEdit:
          viewer.manage || (!!viewer.me && viewer.me._id === r.authorEmployeeId),
      });
    }
    return out;
  },
});

export const addComment = mutation({
  args: { taskId: v.id("projectTasks"), body: v.string() },
  returns: v.id("taskComments"),
  handler: async (ctx, { taskId, body }) => {
    const viewer = await taskViewer(ctx, taskId);
    if (!viewer || !viewer.me) {
      throw new ConvexError({ code: "FORBIDDEN", message: "You can't comment on this task." });
    }
    const trimmed = body.trim();
    if (!trimmed || trimmed === "<p></p>") {
      throw new ConvexError({ code: "INPUT", message: "Comment is empty." });
    }
    const commentId = await ctx.db.insert("taskComments", {
      orgId: viewer.orgCtx.orgId,
      projectId: viewer.task.projectId,
      taskId,
      authorEmployeeId: viewer.me._id,
      body: trimmed,
    });
    // Auto-watch the commenter, then notify the other watchers.
    await addWatchers(ctx, viewer.task, [viewer.me._id]);
    await notifyTaskWatchers(ctx, viewer.task, {
      type: "task.commented",
      title: `New comment on: ${viewer.task.name}`,
      exceptEmployeeId: viewer.me._id,
    });
    return commentId;
  },
});

export const updateComment = mutation({
  args: { commentId: v.id("taskComments"), body: v.string() },
  returns: v.null(),
  handler: async (ctx, { commentId, body }) => {
    const orgCtx = await requireOrg(ctx);
    const comment = await ctx.db.get(commentId);
    if (!comment || comment.orgId !== orgCtx.orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Comment not found." });
    }
    const me = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    const canEdit =
      isProjectPrivileged(orgCtx) || (!!me && me._id === comment.authorEmployeeId);
    if (!canEdit) {
      throw new ConvexError({ code: "FORBIDDEN", message: "You can't edit this comment." });
    }
    const trimmed = body.trim();
    if (!trimmed || trimmed === "<p></p>") {
      throw new ConvexError({ code: "INPUT", message: "Comment is empty." });
    }
    await ctx.db.patch(commentId, { body: trimmed, editedAt: Date.now() });
    return null;
  },
});

export const deleteComment = mutation({
  args: { commentId: v.id("taskComments") },
  returns: v.null(),
  handler: async (ctx, { commentId }) => {
    const orgCtx = await requireOrg(ctx);
    const comment = await ctx.db.get(commentId);
    if (!comment || comment.orgId !== orgCtx.orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Comment not found." });
    }
    const me = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    const canDelete =
      isProjectPrivileged(orgCtx) || (!!me && me._id === comment.authorEmployeeId);
    if (!canDelete) {
      throw new ConvexError({ code: "FORBIDDEN", message: "You can't delete this comment." });
    }
    await ctx.db.delete(commentId);
    return null;
  },
});

// ── Checklists (Phase 1) ─────────────────────────────────────────────────────
// Lightweight steps on a task (no assignee/time). Anyone who can edit the task
// (managers or assignees) may manage them.

export const addChecklistItem = mutation({
  args: { taskId: v.id("projectTasks"), text: v.string() },
  returns: v.string(),
  handler: async (ctx, { taskId, text }) => {
    const { task } = await requireTaskEditor(ctx, taskId);
    const trimmed = text.trim();
    if (!trimmed) throw new ConvexError({ code: "INPUT", message: "Item is empty." });
    const items = [...(task.checklist ?? [])];
    const id = crypto.randomUUID();
    const order = items.length ? Math.max(...items.map((i) => i.order)) + 1 : 0;
    items.push({ id, text: trimmed.slice(0, 500), done: false, order });
    await ctx.db.patch(taskId, { checklist: items, updatedAt: Date.now() });
    return id;
  },
});

export const toggleChecklistItem = mutation({
  args: { taskId: v.id("projectTasks"), itemId: v.string(), done: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { taskId, itemId, done }) => {
    const { task } = await requireTaskEditor(ctx, taskId);
    const items = (task.checklist ?? []).map((i) =>
      i.id === itemId ? { ...i, done } : i,
    );
    await ctx.db.patch(taskId, { checklist: items, updatedAt: Date.now() });
    return null;
  },
});

export const renameChecklistItem = mutation({
  args: { taskId: v.id("projectTasks"), itemId: v.string(), text: v.string() },
  returns: v.null(),
  handler: async (ctx, { taskId, itemId, text }) => {
    const { task } = await requireTaskEditor(ctx, taskId);
    const trimmed = text.trim();
    if (!trimmed) throw new ConvexError({ code: "INPUT", message: "Item is empty." });
    const items = (task.checklist ?? []).map((i) =>
      i.id === itemId ? { ...i, text: trimmed.slice(0, 500) } : i,
    );
    await ctx.db.patch(taskId, { checklist: items, updatedAt: Date.now() });
    return null;
  },
});

export const removeChecklistItem = mutation({
  args: { taskId: v.id("projectTasks"), itemId: v.string() },
  returns: v.null(),
  handler: async (ctx, { taskId, itemId }) => {
    const { task } = await requireTaskEditor(ctx, taskId);
    const items = (task.checklist ?? []).filter((i) => i.id !== itemId);
    await ctx.db.patch(taskId, { checklist: items, updatedAt: Date.now() });
    return null;
  },
});

export const reorderChecklist = mutation({
  args: { taskId: v.id("projectTasks"), orderedItemIds: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { taskId, orderedItemIds }) => {
    const { task } = await requireTaskEditor(ctx, taskId);
    const byId = new Map((task.checklist ?? []).map((i) => [i.id, i]));
    const items = orderedItemIds
      .map((id, order) => {
        const it = byId.get(id);
        return it ? { ...it, order } : null;
      })
      .filter((i): i is NonNullable<typeof i> => !!i);
    await ctx.db.patch(taskId, { checklist: items, updatedAt: Date.now() });
    return null;
  },
});

// ── Watchers & notifications (Phase 4) ───────────────────────────────────────

// Add employees to a task's watcher set (idempotent). Returns the merged set.
async function addWatchers(
  ctx: MutationCtx,
  task: Doc<"projectTasks">,
  employeeIds: (Id<"employees"> | null | undefined)[],
): Promise<Id<"employees">[]> {
  const set = new Set(task.watcherEmployeeIds ?? []);
  let changed = false;
  for (const id of employeeIds) {
    if (id && !set.has(id)) {
      set.add(id);
      changed = true;
    }
  }
  const merged = [...set];
  if (changed) await ctx.db.patch(task._id, { watcherEmployeeIds: merged });
  return merged;
}

// Notify every watcher of a task (except the actor) via pushNotification. The
// entityRef carries "projectId:taskId" so the client can deep-link and open the
// task's detail panel.
async function notifyTaskWatchers(
  ctx: MutationCtx,
  task: Doc<"projectTasks">,
  args: { type: string; title: string; body?: string; exceptEmployeeId?: Id<"employees"> | null },
): Promise<void> {
  const watchers = task.watcherEmployeeIds ?? [];
  for (const employeeId of watchers) {
    if (args.exceptEmployeeId && employeeId === args.exceptEmployeeId) continue;
    const emp = await ctx.db.get(employeeId);
    if (!emp?.userId) continue;
    await pushNotification(ctx, {
      orgId: task.orgId,
      recipientUserId: emp.userId,
      type: args.type,
      title: args.title,
      body: args.body,
      entityRef: { table: "projectTasks", id: `${task.projectId}:${task._id}` },
    });
  }
}

export const watch = mutation({
  args: { taskId: v.id("projectTasks"), watching: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { taskId, watching }) => {
    const { task, me } = await requireTaskEditor(ctx, taskId);
    if (!me) return null;
    const set = new Set(task.watcherEmployeeIds ?? []);
    if (watching) set.add(me._id);
    else set.delete(me._id);
    await ctx.db.patch(taskId, { watcherEmployeeIds: [...set] });
    return null;
  },
});

// ── Dependencies (Phase 3) ───────────────────────────────────────────────────

// Would adding `from → to` create a cycle in the "blocks" graph? Walks the
// existing edges from `to` to see if it can reach `from`.
async function wouldCycle(
  ctx: MutationCtx,
  fromTaskId: Id<"projectTasks">,
  toTaskId: Id<"projectTasks">,
): Promise<boolean> {
  if (fromTaskId === toTaskId) return true;
  const seen = new Set<Id<"projectTasks">>();
  const stack: Id<"projectTasks">[] = [toTaskId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === fromTaskId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const out = await ctx.db
      .query("taskLinks")
      .withIndex("by_from", (q) => q.eq("fromTaskId", cur))
      .collect();
    for (const l of out) stack.push(l.toTaskId);
  }
  return false;
}

export const linkTasks = mutation({
  args: {
    fromTaskId: v.id("projectTasks"),
    toTaskId: v.id("projectTasks"),
  },
  returns: v.id("taskLinks"),
  handler: async (ctx, { fromTaskId, toTaskId }) => {
    const { orgId } = await requireTaskManage(ctx);
    if (fromTaskId === toTaskId) {
      throw new ConvexError({ code: "INPUT", message: "A task can't block itself." });
    }
    const from = await ctx.db.get(fromTaskId);
    const to = await ctx.db.get(toTaskId);
    if (!from || !to || from.orgId !== orgId || to.orgId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Task not found." });
    }
    if (from.projectId !== to.projectId) {
      throw new ConvexError({
        code: "INPUT",
        message: "Dependencies must be within the same project.",
      });
    }
    // Skip duplicates.
    const existing = await ctx.db
      .query("taskLinks")
      .withIndex("by_from", (q) => q.eq("fromTaskId", fromTaskId))
      .collect();
    const dup = existing.find((l) => l.toTaskId === toTaskId);
    if (dup) return dup._id;
    if (await wouldCycle(ctx, fromTaskId, toTaskId)) {
      throw new ConvexError({
        code: "INPUT",
        message: "That would create a circular dependency.",
      });
    }
    return await ctx.db.insert("taskLinks", {
      orgId,
      projectId: from.projectId,
      fromTaskId,
      toTaskId,
      type: "blocks",
    });
  },
});

export const unlinkTasks = mutation({
  args: { linkId: v.id("taskLinks") },
  returns: v.null(),
  handler: async (ctx, { linkId }) => {
    const { orgId } = await requireTaskManage(ctx);
    const link = await ctx.db.get(linkId);
    if (!link || link.orgId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Link not found." });
    }
    await ctx.db.delete(linkId);
    return null;
  },
});

// ── Milestones (Phase 3) ─────────────────────────────────────────────────────

const milestoneView = v.object({
  _id: v.id("projectMilestones"),
  projectId: v.id("projects"),
  name: v.string(),
  dueDate: v.string(),
  description: v.union(v.string(), v.null()),
  order: v.number(),
});

export const listMilestones = query({
  args: { projectId: v.id("projects") },
  returns: v.array(milestoneView),
  handler: async (ctx, { projectId }) => {
    const orgCtx = await requireOrg(ctx);
    const project = await ctx.db.get(projectId);
    if (!project || project.orgId !== orgCtx.orgId) return [];
    const access = await callerAccess(ctx, orgCtx);
    if (access && !access.visibleProjectIds.has(projectId)) return [];
    const rows = await ctx.db
      .query("projectMilestones")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    rows.sort((a, b) => a.order - b.order || a.dueDate.localeCompare(b.dueDate));
    return rows.map((m) => ({
      _id: m._id,
      projectId: m.projectId,
      name: m.name,
      dueDate: m.dueDate,
      description: m.description ?? null,
      order: m.order,
    }));
  },
});

export const createMilestone = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    dueDate: v.string(),
    description: v.optional(v.string()),
  },
  returns: v.id("projectMilestones"),
  handler: async (ctx, args) => {
    const { orgId } = await requireTaskManage(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.orgId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Project not found." });
    }
    const name = args.name.trim();
    if (!name) throw new ConvexError({ code: "INPUT", message: "Name is required." });
    if (!args.dueDate) throw new ConvexError({ code: "INPUT", message: "Date is required." });
    const existing = await ctx.db
      .query("projectMilestones")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const order = existing.length ? Math.max(...existing.map((m) => m.order)) + 1 : 0;
    return await ctx.db.insert("projectMilestones", {
      orgId,
      projectId: args.projectId,
      name,
      dueDate: args.dueDate,
      description: args.description?.trim() || undefined,
      order,
    });
  },
});

export const updateMilestone = mutation({
  args: {
    milestoneId: v.id("projectMilestones"),
    name: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, { milestoneId, ...args }) => {
    const { orgId } = await requireTaskManage(ctx);
    const m = await ctx.db.get(milestoneId);
    if (!m || m.orgId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Milestone not found." });
    }
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name.trim() || m.name;
    if (args.dueDate !== undefined) patch.dueDate = args.dueDate || m.dueDate;
    if (args.description !== undefined)
      patch.description = args.description?.trim() || undefined;
    await ctx.db.patch(milestoneId, patch);
    return null;
  },
});

export const removeMilestone = mutation({
  args: { milestoneId: v.id("projectMilestones") },
  returns: v.null(),
  handler: async (ctx, { milestoneId }) => {
    const { orgId } = await requireTaskManage(ctx);
    const m = await ctx.db.get(milestoneId);
    if (!m || m.orgId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Milestone not found." });
    }
    // Detach any tasks pointing at it.
    const tasks = await ctx.db
      .query("projectTasks")
      .withIndex("by_project", (q) => q.eq("projectId", m.projectId))
      .collect();
    for (const t of tasks) {
      if (t.milestoneId === milestoneId) {
        await ctx.db.patch(t._id, { milestoneId: undefined });
      }
    }
    await ctx.db.delete(milestoneId);
    return null;
  },
});

// ── Timeline / roadmap (Phase 3) ─────────────────────────────────────────────

export const timeline = query({
  args: { projectId: v.id("projects") },
  returns: v.object({
    tasks: v.array(
      v.object({
        _id: v.id("projectTasks"),
        parentTaskId: v.union(v.id("projectTasks"), v.null()),
        name: v.string(),
        status: taskStatus,
        priority: v.union(taskPriority, v.null()),
        startDate: v.union(v.string(), v.null()),
        dueDate: v.union(v.string(), v.null()),
        stageId: v.union(v.id("projectStages"), v.null()),
        milestoneId: v.union(v.id("projectMilestones"), v.null()),
        assignees: v.array(assigneeView),
      }),
    ),
    links: v.array(
      v.object({
        _id: v.id("taskLinks"),
        fromTaskId: v.id("projectTasks"),
        toTaskId: v.id("projectTasks"),
      }),
    ),
    milestones: v.array(milestoneView),
  }),
  handler: async (ctx, { projectId }) => {
    const orgCtx = await requireOrg(ctx);
    const project = await ctx.db.get(projectId);
    const empty = { tasks: [], links: [], milestones: [] };
    if (!project || project.orgId !== orgCtx.orgId) return empty;
    const access = await callerAccess(ctx, orgCtx);
    if (access && !access.visibleProjectIds.has(projectId)) return empty;

    let live = (
      await ctx.db
        .query("projectTasks")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect()
    ).filter((t) => !t.archivedAt);
    if (access && !access.projectIds.has(projectId)) {
      live = live.filter((t) => access.taskIds.has(t._id));
    }

    // Task-level + project-level assignees.
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
    const empIds = new Set<Id<"employees">>();
    for (const r of [...projRows, ...taskRows]) empIds.add(r.employeeId);
    const nameMap = new Map<Id<"employees">, string>();
    const empIdList = Array.from(empIds);
    const empDocs = await Promise.all(empIdList.map((id) => ctx.db.get(id)));
    empIdList.forEach((id, i) => {
      const e = empDocs[i];
      nameMap.set(id, e ? displayName(e) : "—");
    });
    const projLevel = projRows.map((r) => ({
      employeeId: r.employeeId,
      name: nameMap.get(r.employeeId) ?? "—",
    }));
    const perTask = new Map<Id<"projectTasks">, { employeeId: Id<"employees">; name: string }[]>();
    for (const r of taskRows) {
      const arr = perTask.get(r.taskId) ?? [];
      arr.push({ employeeId: r.employeeId, name: nameMap.get(r.employeeId) ?? "—" });
      perTask.set(r.taskId, arr);
    }

    live.sort((a, b) => {
      const ad = a.startDate ?? a.dueDate ?? "9999";
      const bd = b.startDate ?? b.dueDate ?? "9999";
      return ad.localeCompare(bd);
    });

    const tasks = live.map((t) => {
      const seen = new Set<Id<"employees">>();
      const assignees: { employeeId: Id<"employees">; name: string }[] = [];
      for (const a of [...projLevel, ...(perTask.get(t._id) ?? [])]) {
        if (seen.has(a.employeeId)) continue;
        seen.add(a.employeeId);
        assignees.push(a);
      }
      return {
        _id: t._id,
        parentTaskId: t.parentTaskId ?? null,
        name: t.name,
        status: t.status,
        priority: t.priority ?? null,
        startDate: t.startDate ?? null,
        dueDate: t.dueDate ?? null,
        stageId: t.stageId ?? null,
        milestoneId: t.milestoneId ?? null,
        assignees,
      };
    });

    const linkRows = await ctx.db
      .query("taskLinks")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    const links = linkRows.map((l) => ({
      _id: l._id,
      fromTaskId: l.fromTaskId,
      toTaskId: l.toTaskId,
    }));

    const msRows = await ctx.db
      .query("projectMilestones")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    msRows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const milestones = msRows.map((m) => ({
      _id: m._id,
      projectId: m.projectId,
      name: m.name,
      dueDate: m.dueDate,
      description: m.description ?? null,
      order: m.order,
    }));

    return { tasks, links, milestones };
  },
});
