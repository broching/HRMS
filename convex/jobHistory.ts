import { mutation, query, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { employmentType } from "./lib/enums";
import { requirePermission } from "./auth";
import { writeAuditLog } from "./lib/audit";
import { jobHistoryRow } from "./lib/validators";
import { requireEmployeeAccess } from "./employees";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function initialsOf(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

// The id of the timeline row in effect today (latest effectiveDate ≤ today),
// or null when every entry is future-dated / there are none.
function currentRowId(
  rows: { _id: Id<"jobHistory">; effectiveDate: string }[],
): Id<"jobHistory"> | null {
  const today = todayISO();
  const eligible = rows
    .filter((r) => r.effectiveDate <= today)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  return eligible[0]?._id ?? null;
}

// Mirror the current job timeline row onto the employee's current job fields so
// the profile header + Job "current" stay consistent with the latest change.
async function syncCurrentJob(
  ctx: MutationCtx,
  employeeId: Id<"employees">,
) {
  const rows = await ctx.db
    .query("jobHistory")
    .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
    .collect();
  const currentId = currentRowId(rows);
  if (!currentId) return;
  const current = rows.find((r) => r._id === currentId);
  if (!current) return;
  await ctx.db.patch(employeeId, {
    positionId: current.positionId,
    departmentId: current.departmentId,
    officeId: current.officeId,
    managerId: current.managerId,
    employmentType: current.employmentType ?? "full_time",
    updatedAt: Date.now(),
  });
}

// ─── Query ─────────────────────────────────────────────────────────────────

// In-company job timeline for an employee, newest first. Job info is
// operational (not part of the locked personal section), so any caller who may
// view the employee — self, manager, or HR/admin — may read it.
export const listForEmployee = query({
  args: { employeeId: v.id("employees") },
  returns: v.array(jobHistoryRow),
  handler: async (ctx, { employeeId }) => {
    await requireEmployeeAccess(ctx, employeeId);

    const rows = await ctx.db
      .query("jobHistory")
      .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
      .collect();
    rows.sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
    const currentId = currentRowId(rows);

    return await Promise.all(
      rows.map(async (r) => {
        const [position, department, office, manager] = await Promise.all([
          r.positionId ? ctx.db.get(r.positionId) : null,
          r.departmentId ? ctx.db.get(r.departmentId) : null,
          r.officeId ? ctx.db.get(r.officeId) : null,
          r.managerId ? ctx.db.get(r.managerId) : null,
        ]);
        return {
          _id: r._id,
          _creationTime: r._creationTime,
          employeeId: r.employeeId,
          effectiveDate: r.effectiveDate,
          title: position?.title ?? r.title ?? null,
          positionId: r.positionId ?? null,
          rawTitle: r.title ?? null,
          departmentId: r.departmentId ?? null,
          officeId: r.officeId ?? null,
          managerId: r.managerId ?? null,
          departmentName: department?.name ?? null,
          officeName: office?.name ?? null,
          managerName: manager
            ? `${manager.preferredName ?? manager.firstName} ${manager.lastName}`
            : null,
          managerInitials: manager
            ? initialsOf(manager.firstName, manager.lastName)
            : null,
          managerPhotoUrl: manager?.photoUrl ?? null,
          employmentType: r.employmentType ?? null,
          isCurrent: r._id === currentId,
          note: r.note ?? null,
        };
      }),
    );
  },
});

// ─── Mutations (HR-controlled) ───────────────────────────────────────────────

const jobFields = {
  effectiveDate: v.string(),
  positionId: v.optional(v.id("positions")),
  title: v.optional(v.string()),
  departmentId: v.optional(v.id("departments")),
  officeId: v.optional(v.id("offices")),
  managerId: v.optional(v.id("employees")),
  employmentType: v.optional(employmentType),
  note: v.optional(v.string()),
};

export const add = mutation({
  args: { employeeId: v.id("employees"), ...jobFields },
  returns: v.id("jobHistory"),
  handler: async (ctx, { employeeId, ...fields }) => {
    const { orgId, userId } = await requirePermission(ctx, "employees:manage");
    const employee = await ctx.db.get(employeeId);
    if (!employee || employee.orgId !== orgId) {
      throw new Error("Employee not found.");
    }
    const id = await ctx.db.insert("jobHistory", {
      orgId,
      employeeId,
      ...fields,
      createdBy: userId,
    });
    await syncCurrentJob(ctx, employeeId);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "jobHistory.add",
      entity: "jobHistory",
      entityId: id,
      after: { employeeId, effectiveDate: fields.effectiveDate },
    });
    return id;
  },
});

export const update = mutation({
  args: { jobHistoryId: v.id("jobHistory"), ...jobFields },
  returns: v.null(),
  handler: async (ctx, { jobHistoryId, ...fields }) => {
    const { orgId, userId } = await requirePermission(ctx, "employees:manage");
    const existing = await ctx.db.get(jobHistoryId);
    if (!existing || existing.orgId !== orgId) {
      throw new Error("Job record not found.");
    }
    // Replace the editable fields wholesale (a cleared picker should clear).
    await ctx.db.patch(jobHistoryId, {
      effectiveDate: fields.effectiveDate,
      positionId: fields.positionId,
      title: fields.title,
      departmentId: fields.departmentId,
      officeId: fields.officeId,
      managerId: fields.managerId,
      employmentType: fields.employmentType,
      note: fields.note,
    });
    await syncCurrentJob(ctx, existing.employeeId);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "jobHistory.update",
      entity: "jobHistory",
      entityId: jobHistoryId,
    });
    return null;
  },
});

export const remove = mutation({
  args: { jobHistoryId: v.id("jobHistory") },
  returns: v.null(),
  handler: async (ctx, { jobHistoryId }) => {
    const { orgId, userId } = await requirePermission(ctx, "employees:manage");
    const existing = await ctx.db.get(jobHistoryId);
    if (!existing || existing.orgId !== orgId) {
      throw new Error("Job record not found.");
    }
    const employeeId = existing.employeeId;
    await ctx.db.delete(jobHistoryId);
    await syncCurrentJob(ctx, employeeId);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "jobHistory.remove",
      entity: "jobHistory",
      entityId: jobHistoryId,
    });
    return null;
  },
});
