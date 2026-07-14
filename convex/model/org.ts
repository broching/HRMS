import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * All descendants of `rootEmployeeId` in the reporting tree (transitive reports),
 * excluding the root itself. BFS over the `employees.by_org_manager` index; a
 * `visited` set makes it safe against any pre-existing managerId cycle. Used to
 * enforce "a head sees their whole chain" access relationally in handlers.
 */
export async function reportingSubtree(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  rootEmployeeId: Id<"employees">,
): Promise<Set<Id<"employees">>> {
  const result = new Set<Id<"employees">>();
  let frontier: Id<"employees">[] = [rootEmployeeId];
  while (frontier.length > 0) {
    const next: Id<"employees">[] = [];
    for (const managerId of frontier) {
      const reports = await ctx.db
        .query("employees")
        .withIndex("by_org_manager", (q) =>
          q.eq("orgId", orgId).eq("managerId", managerId),
        )
        .collect();
      for (const r of reports) {
        if (result.has(r._id) || r._id === rootEmployeeId) continue;
        result.add(r._id);
        next.push(r._id);
      }
    }
    frontier = next;
  }
  return result;
}
