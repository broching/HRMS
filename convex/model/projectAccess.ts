import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { ctxHasPermission, type OrgContext } from "../auth";

/**
 * Project/task visibility model. Assignment restricts what a non-privileged
 * employee can see and log against:
 *
 *  - Assigned to a whole **project** → sees the project and every task in it,
 *    and may log time against any of them.
 *  - Assigned to a single **task** → sees only that task (and its parent project
 *    read-only), and may log time against that task or the bare project.
 *
 * Managers (`tasks:manage`) and HR (`projects:manage`) bypass all of this and
 * see everything. The helpers here are the single source of truth shared by the
 * project queries and the time-entry write guard.
 */

// True when the caller sees + manages the whole project space regardless of
// assignment (managers and HR oversight).
export function isProjectPrivileged(orgCtx: OrgContext): boolean {
  return (
    ctxHasPermission(orgCtx, "projects:manage") ||
    ctxHasPermission(orgCtx, "tasks:manage")
  );
}

export type EmployeeProjectAccess = {
  // Projects the employee is assigned to wholesale (all tasks visible/loggable).
  projectIds: Set<Id<"projects">>;
  // Individual tasks the employee is assigned to.
  taskIds: Set<Id<"projectTasks">>;
  // Projects the employee can at least see (wholesale + parents of assigned
  // tasks) — used to decide which projects to surface read-only.
  visibleProjectIds: Set<Id<"projects">>;
};

// Resolve one employee's assignment-derived access. Bounded by how many things
// that single employee is assigned to.
export async function accessForEmployee(
  ctx: QueryCtx,
  employeeId: Id<"employees">,
): Promise<EmployeeProjectAccess> {
  const projRows = await ctx.db
    .query("projectAssignments")
    .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
    .collect();
  const taskRows = await ctx.db
    .query("taskAssignments")
    .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
    .collect();

  const projectIds = new Set(projRows.map((r) => r.projectId));
  const taskIds = new Set(taskRows.map((r) => r.taskId));
  const visibleProjectIds = new Set(projectIds);
  for (const r of taskRows) visibleProjectIds.add(r.projectId);

  return { projectIds, taskIds, visibleProjectIds };
}

// Whether `employeeId` may log time to (projectId, taskId?) under the assignment
// rules. Project-level assignment covers every task; task-level assignment
// covers that task (or the bare project with no task).
export function canEmployeeLog(
  access: EmployeeProjectAccess,
  projectId: Id<"projects">,
  taskId: Id<"projectTasks"> | undefined,
): boolean {
  if (access.projectIds.has(projectId)) return true;
  if (taskId) return access.taskIds.has(taskId);
  // No task: allowed only if the employee has at least one task in this project
  // (they can log against the project umbrella of their assigned task).
  return access.visibleProjectIds.has(projectId);
}
