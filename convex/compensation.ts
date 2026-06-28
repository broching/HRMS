import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requireOrg, requirePermission } from "./auth";
import { writeAuditLog } from "./lib/audit";
import { allowanceItem, cpfStatus } from "./lib/enums";
import { compensationDoc, compensationRow } from "./lib/validators";

// The compensation in effect for an employee on `onDate` = the row with the
// latest effectiveDate on or before it. Shared with the payroll engine.
export async function effectiveCompensation(
  ctx: QueryCtx,
  employeeId: Id<"employees">,
  onDate: string,
): Promise<Doc<"compensation"> | null> {
  const rows = await ctx.db
    .query("compensation")
    .withIndex("by_employee_effective", (q) => q.eq("employeeId", employeeId))
    .collect();
  const eligible = rows.filter((c) => c.effectiveDate <= onDate);
  if (eligible.length === 0) return null;
  return eligible.reduce((a, b) => (a.effectiveDate >= b.effectiveDate ? a : b));
}

// Full salary history for one employee (most recent first).
export const listForEmployee = query({
  args: { employeeId: v.id("employees") },
  returns: v.array(compensationDoc),
  handler: async (ctx, { employeeId }) => {
    const { orgId } = await requirePermission(ctx, "payroll:manage");
    const employee = await ctx.db.get(employeeId);
    if (!employee || employee.orgId !== orgId) {
      throw new Error("Employee not found.");
    }
    const rows = await ctx.db
      .query("compensation")
      .withIndex("by_employee_effective", (q) =>
        q.eq("employeeId", employeeId),
      )
      .collect();
    rows.sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1));
    return rows;
  },
});

// Active employees with their current base pay (compensation management view).
export const overview = query({
  args: {},
  returns: v.array(compensationRow),
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "payroll:manage");
    const today = new Date().toISOString().slice(0, 10);
    const employees = (
      await ctx.db
        .query("employees")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .collect()
    ).filter((e) => e.status !== "terminated");

    const positions = await ctx.db
      .query("positions")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const posTitle = new Map(positions.map((p) => [p._id, p.title]));

    const rows = await Promise.all(
      employees.map(async (e) => {
        const comp = await effectiveCompensation(ctx, e._id, today);
        return {
          employeeId: e._id,
          name: `${e.preferredName ?? e.firstName} ${e.lastName}`,
          positionTitle: e.positionId
            ? (posTitle.get(e.positionId) ?? null)
            : null,
          currency: comp?.currency ?? null,
          baseMonthlyCents: comp?.baseMonthlyCents ?? null,
          cpfStatus: comp?.cpfStatus ?? null,
          effectiveDate: comp?.effectiveDate ?? null,
        };
      }),
    );
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  },
});

export const setCompensation = mutation({
  args: {
    employeeId: v.id("employees"),
    effectiveDate: v.string(),
    baseMonthlyCents: v.number(),
    allowances: v.optional(v.array(allowanceItem)),
    cpfStatus: cpfStatus,
    currency: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  returns: v.id("compensation"),
  handler: async (ctx, args) => {
    const { orgId, userId, org } = await requirePermission(ctx, "payroll:manage");
    const employee = await ctx.db.get(args.employeeId);
    if (!employee || employee.orgId !== orgId) {
      throw new Error("Employee not found.");
    }
    if (args.baseMonthlyCents < 0) throw new Error("Base pay can't be negative.");

    const id = await ctx.db.insert("compensation", {
      orgId,
      employeeId: args.employeeId,
      effectiveDate: args.effectiveDate,
      currency: args.currency ?? org.settings.currency,
      baseMonthlyCents: args.baseMonthlyCents,
      allowances: args.allowances ?? [],
      cpfStatus: args.cpfStatus,
      note: args.note,
      createdBy: userId,
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "compensation.set",
      entity: "compensation",
      entityId: id,
      after: {
        employeeId: args.employeeId,
        baseMonthlyCents: args.baseMonthlyCents,
        effectiveDate: args.effectiveDate,
      },
    });
    return id;
  },
});

export const removeCompensation = mutation({
  args: { id: v.id("compensation") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { orgId, userId } = await requirePermission(ctx, "payroll:manage");
    const existing = await ctx.db.get(id);
    if (!existing || existing.orgId !== orgId) {
      throw new Error("Compensation record not found.");
    }
    await ctx.db.delete(id);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "compensation.remove",
      entity: "compensation",
      entityId: id,
      before: existing,
    });
    return null;
  },
});
