import { query } from "./_generated/server";
import { v } from "convex/values";
import { employeeStatus, type EmployeeStatus } from "./lib/enums";
import { requirePermission } from "./auth";

/**
 * Aggregated org statistics for the admin/HR dashboard. Requires
 * employees:read:all. Scans the org's employees in memory — fine at current
 * scale; swap to the Convex aggregate component if headcount grows very large.
 */

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Days until the next occurrence of a birthday (month/day), 0..364.
function daysUntilBirthday(dob: string): number {
  const today = new Date();
  const todayUTC = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const [, mm, dd] = dob.split("-").map(Number);
  let year = today.getUTCFullYear();
  let next = Date.UTC(year, mm - 1, dd);
  if (next < todayUTC) next = Date.UTC(year + 1, mm - 1, dd);
  return Math.round((next - todayUTC) / 86_400_000);
}

export const stats = query({
  args: {},
  returns: v.object({
    headcount: v.number(),
    byStatus: v.array(
      v.object({ status: employeeStatus, count: v.number() }),
    ),
    newHires: v.array(
      v.object({
        employeeId: v.id("employees"),
        name: v.string(),
        joinDate: v.string(),
        positionTitle: v.union(v.string(), v.null()),
      }),
    ),
    upcomingBirthdays: v.array(
      v.object({
        employeeId: v.id("employees"),
        name: v.string(),
        date: v.string(), // MM-DD
        inDays: v.number(),
      }),
    ),
    byDepartment: v.array(
      v.object({ name: v.string(), count: v.number() }),
    ),
  }),
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "employees:read:all");
    const employees = await ctx.db
      .query("employees")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const [departments, positions] = await Promise.all([
      ctx.db.query("departments").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
      ctx.db.query("positions").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
    ]);
    const deptName = new Map(departments.map((d) => [d._id, d.name]));
    const posTitle = new Map(positions.map((p) => [p._id, p.title]));

    const active = employees.filter((e) => e.status !== "terminated");
    const fullName = (e: (typeof employees)[number]) =>
      `${e.preferredName ?? e.firstName} ${e.lastName}`;

    // Status breakdown
    const statusMap = new Map<string, number>();
    for (const e of employees) {
      statusMap.set(e.status, (statusMap.get(e.status) ?? 0) + 1);
    }
    const byStatus = Array.from(statusMap.entries()).map(([status, count]) => ({
      status: status as EmployeeStatus,
      count,
    }));

    // New hires in the last 30 days
    const cutoff = isoDaysFromNow(-30);
    const todayISO = isoDaysFromNow(0);
    const newHires = employees
      .filter((e) => e.joinDate >= cutoff && e.joinDate <= todayISO)
      .sort((a, b) => (a.joinDate < b.joinDate ? 1 : -1))
      .slice(0, 10)
      .map((e) => ({
        employeeId: e._id,
        name: fullName(e),
        joinDate: e.joinDate,
        positionTitle: e.positionId ? (posTitle.get(e.positionId) ?? null) : null,
      }));

    // Birthdays in the next 30 days
    const upcomingBirthdays = active
      .filter((e) => !!e.dob)
      .map((e) => ({
        employeeId: e._id,
        name: fullName(e),
        date: e.dob!.slice(5), // MM-DD
        inDays: daysUntilBirthday(e.dob!),
      }))
      .filter((b) => b.inDays <= 30)
      .sort((a, b) => a.inDays - b.inDays)
      .slice(0, 10);

    // Headcount by department (active only)
    const deptCount = new Map<string, number>();
    for (const e of active) {
      const name = e.departmentId
        ? (deptName.get(e.departmentId) ?? "Unknown")
        : "Unassigned";
      deptCount.set(name, (deptCount.get(name) ?? 0) + 1);
    }
    const byDepartment = Array.from(deptCount.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return {
      headcount: active.length,
      byStatus,
      newHires,
      upcomingBirthdays,
      byDepartment,
    };
  },
});
