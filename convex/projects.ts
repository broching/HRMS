import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireOrg, requirePermission } from "./auth";
import { writeAuditLog } from "./lib/audit";

function displayName(e: Doc<"employees">): string {
  return `${e.preferredName ?? e.firstName} ${e.lastName}`.trim();
}

/**
 * Projects + their tasks. Reading is open to any org member (so everyone can pick
 * a project/task when logging time); creating/editing/archiving requires
 * `projects:manage` (HR/admin, or a custom role). All org-scoped.
 */

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

const taskDoc = v.object({
  _id: v.id("projectTasks"),
  _creationTime: v.number(),
  orgId: v.id("organizations"),
  projectId: v.id("projects"),
  name: v.string(),
  status: taskStatus,
  order: v.optional(v.number()),
  archivedAt: v.optional(v.number()),
});

// ── Reads ────────────────────────────────────────────────────────────────────

export const list = query({
  args: {},
  returns: v.array(projectDoc),
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    return await ctx.db
      .query("projects")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
  },
});

export const listTasks = query({
  args: { projectId: v.id("projects") },
  returns: v.array(taskDoc),
  handler: async (ctx, { projectId }) => {
    const { orgId } = await requireOrg(ctx);
    const project = await ctx.db.get(projectId);
    if (!project || project.orgId !== orgId) return [];
    const tasks = await ctx.db
      .query("projectTasks")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    return tasks.filter((t) => !t.archivedAt);
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
      out.push({
        projectId: p._id,
        minutes,
        entries: rows.length,
        contributors: people.size,
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

// ── Task writes (projects:manage) ────────────────────────────────────────────

export const createTask = mutation({
  args: { projectId: v.id("projects"), name: v.string() },
  returns: v.id("projectTasks"),
  handler: async (ctx, { projectId, name }) => {
    const { orgId, userId } = await requirePermission(ctx, "projects:manage");
    const project = await ctx.db.get(projectId);
    if (!project || project.orgId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Project not found." });
    }
    const trimmed = name.trim();
    if (!trimmed) throw new ConvexError({ code: "INPUT", message: "Name is required." });
    const existing = await ctx.db
      .query("projectTasks")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    const id = await ctx.db.insert("projectTasks", {
      orgId,
      projectId,
      name: trimmed,
      status: "open",
      order: existing.length,
    });
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
    status: v.optional(taskStatus),
    archived: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { taskId, ...args }) => {
    const { orgId } = await requirePermission(ctx, "projects:manage");
    const task = await ctx.db.get(taskId);
    if (!task || task.orgId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Task not found." });
    }
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name.trim() || task.name;
    if (args.status !== undefined) patch.status = args.status;
    if (args.archived !== undefined)
      patch.archivedAt = args.archived ? Date.now() : undefined;
    await ctx.db.patch(taskId, patch);
    return null;
  },
});
