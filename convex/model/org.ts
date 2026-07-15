import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

/**
 * All employee-ids that manage `employee`: the primary `managerId` plus any
 * additional (dotted-line) managers. Deduped, primary first. This is the single
 * source of truth for "who are this person's managers" across access control
 * and approval routing.
 */
export function managerEmployeeIds(employee: {
  managerId?: Id<"employees">;
  additionalManagerIds?: Id<"employees">[];
}): Id<"employees">[] {
  const ids: Id<"employees">[] = [];
  const seen = new Set<Id<"employees">>();
  if (employee.managerId) {
    ids.push(employee.managerId);
    seen.add(employee.managerId);
  }
  for (const id of employee.additionalManagerIds ?? []) {
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Whether `managerEmployeeId` is a manager (primary or additional) of
 * `employee`. Use in place of `employee.managerId === managerEmployeeId` so
 * dotted-line managers get the same visibility/approval rights as the primary.
 */
export function isDirectManager(
  employee: {
    managerId?: Id<"employees">;
    additionalManagerIds?: Id<"employees">[];
  },
  managerEmployeeId: Id<"employees">,
): boolean {
  return managerEmployeeIds(employee).includes(managerEmployeeId);
}

/**
 * Resolve the user accounts of an employee's managers (primary + additional),
 * excluding the employee themselves. Deduped, primary first. Used to route
 * "manager" approval steps to every manager so any of them can approve.
 */
export async function managerUsers(
  ctx: QueryCtx,
  employee: Doc<"employees">,
): Promise<{ userId: Id<"users">; name: string }[]> {
  const out: { userId: Id<"users">; name: string }[] = [];
  const seen = new Set<Id<"users">>();
  for (const mid of managerEmployeeIds(employee)) {
    const mgr = await ctx.db.get(mid);
    if (!mgr?.userId) continue;
    if (mgr.userId === employee.userId) continue; // never route to self
    if (seen.has(mgr.userId)) continue;
    seen.add(mgr.userId);
    out.push({ userId: mgr.userId, name: `${mgr.firstName} ${mgr.lastName}` });
  }
  return out;
}

/**
 * All descendants of `rootEmployeeId` in the reporting tree (transitive
 * reports), excluding the root itself. Considers BOTH the primary `managerId`
 * and additional (dotted-line) managers, so any manager sees their full chain.
 *
 * Additional managers can't be served by the `by_org_manager` index (it only
 * covers `managerId`), so we load the org's employees once and BFS an in-memory
 * adjacency. A `visited` set makes it safe against any pre-existing cycle. Used
 * to enforce "a head sees their whole chain" access relationally in handlers.
 */
export async function reportingSubtree(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  rootEmployeeId: Id<"employees">,
): Promise<Set<Id<"employees">>> {
  const employees = await ctx.db
    .query("employees")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();

  // manager employeeId → the reports that name them (primary or additional).
  const childrenOf = new Map<Id<"employees">, Id<"employees">[]>();
  for (const e of employees) {
    for (const mgr of managerEmployeeIds(e)) {
      const arr = childrenOf.get(mgr) ?? [];
      arr.push(e._id);
      childrenOf.set(mgr, arr);
    }
  }

  const result = new Set<Id<"employees">>();
  let frontier: Id<"employees">[] = [rootEmployeeId];
  while (frontier.length > 0) {
    const next: Id<"employees">[] = [];
    for (const managerId of frontier) {
      for (const reportId of childrenOf.get(managerId) ?? []) {
        if (result.has(reportId) || reportId === rootEmployeeId) continue;
        result.add(reportId);
        next.push(reportId);
      }
    }
    frontier = next;
  }
  return result;
}
