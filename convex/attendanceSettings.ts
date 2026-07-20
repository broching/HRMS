import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requirePermission } from "./auth";
import { writeAuditLog } from "./lib/audit";

// Org-wide attendance policy, with sensible defaults when no row exists yet.
export interface AttendanceSettingsValue {
  requiredByDefault: boolean;
  defaultOvertimeMultiplier: number;
}

const DEFAULTS: AttendanceSettingsValue = {
  requiredByDefault: false,
  defaultOvertimeMultiplier: 1.5,
};

// Shared resolver: the org's row normalized, or defaults when unconfigured.
export async function getAttendanceSettings(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
): Promise<AttendanceSettingsValue> {
  const row = await ctx.db
    .query("attendanceSettings")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .unique();
  if (!row) return DEFAULTS;
  return {
    requiredByDefault: row.requiredByDefault,
    defaultOvertimeMultiplier:
      row.defaultOvertimeMultiplier ?? DEFAULTS.defaultOvertimeMultiplier,
  };
}

// Whether a specific employee must clock attendance: their explicit override
// when set, otherwise the org default.
export function attendanceRequiredFor(
  employee: Doc<"employees">,
  settings: AttendanceSettingsValue,
): boolean {
  return employee.attendanceRequired ?? settings.requiredByDefault;
}

const settingsView = v.object({
  requiredByDefault: v.boolean(),
  defaultOvertimeMultiplier: v.number(),
});

export const get = query({
  args: {},
  returns: settingsView,
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "attendance:config");
    return await getAttendanceSettings(ctx, orgId);
  },
});

// Every active employee with their department/team + attendance requirement, so
// HR can review and change who must clock in. Filtering is done client-side.
export const roster = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("employees"),
      name: v.string(),
      employeeNumber: v.string(),
      photoUrl: v.union(v.string(), v.null()),
      departmentId: v.union(v.id("departments"), v.null()),
      departmentName: v.union(v.string(), v.null()),
      teamId: v.union(v.id("teams"), v.null()),
      teamName: v.union(v.string(), v.null()),
      positionTitle: v.union(v.string(), v.null()),
      // Explicit override (true/false) or null when inheriting the org default.
      attendanceRequired: v.union(v.boolean(), v.null()),
      // Resolved value actually in effect.
      effectiveRequired: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "attendance:config");
    const settings = await getAttendanceSettings(ctx, orgId);
    const employees = await ctx.db
      .query("employees")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const active = employees.filter(
      (e) => e.status !== "terminated" && !e.isVacant,
    );
    return await Promise.all(
      active.map(async (e) => {
        const [dept, team, position, photoUrl] = await Promise.all([
          e.departmentId ? ctx.db.get(e.departmentId) : Promise.resolve(null),
          e.teamId ? ctx.db.get(e.teamId) : Promise.resolve(null),
          e.positionId ? ctx.db.get(e.positionId) : Promise.resolve(null),
          Promise.resolve(e.photoUrl ?? null),
        ]);
        return {
          _id: e._id,
          name: `${e.firstName} ${e.lastName}`,
          employeeNumber: e.employeeNumber,
          photoUrl,
          departmentId: e.departmentId ?? null,
          departmentName: dept?.name ?? null,
          teamId: e.teamId ?? null,
          teamName: team?.name ?? null,
          positionTitle: position?.title ?? null,
          attendanceRequired: e.attendanceRequired ?? null,
          effectiveRequired: attendanceRequiredFor(e, settings),
        };
      }),
    );
  },
});

// Lightweight per-employee attendance override toggle. `value` true/false forces
// on/off; null clears the override so the org default applies.
export const setAttendanceRequired = mutation({
  args: {
    employeeId: v.id("employees"),
    value: v.union(v.boolean(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { employeeId, value }) => {
    const { orgId, userId } = await requirePermission(ctx, "attendance:config");
    const emp = await ctx.db.get(employeeId);
    if (!emp || emp.orgId !== orgId) throw new Error("Employee not found.");
    await ctx.db.patch(employeeId, {
      attendanceRequired: value === null ? undefined : value,
      updatedAt: Date.now(),
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "attendance.set_required",
      entity: "employees",
      entityId: employeeId,
      after: { attendanceRequired: value },
    });
    return null;
  },
});

export const save = mutation({
  args: {
    requiredByDefault: v.boolean(),
    defaultOvertimeMultiplier: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { requiredByDefault, defaultOvertimeMultiplier }) => {
    const { orgId, userId } = await requirePermission(ctx, "attendance:config");
    if (
      defaultOvertimeMultiplier !== undefined &&
      (!Number.isFinite(defaultOvertimeMultiplier) ||
        defaultOvertimeMultiplier <= 0)
    ) {
      throw new Error("Overtime multiplier must be a positive number.");
    }
    const existing = await ctx.db
      .query("attendanceSettings")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .unique();
    const patch = {
      requiredByDefault,
      defaultOvertimeMultiplier,
      updatedBy: userId,
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("attendanceSettings", { orgId, ...patch });
    }
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "attendance.settings_save",
      entity: "attendanceSettings",
      entityId: existing?._id,
    });
    return null;
  },
});
