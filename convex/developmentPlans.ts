import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requireOrg, getOrgContext, OrgContext } from "./auth";
import { ctxHasPermission } from "./auth";
import { employeeByUserId } from "./employees";
import { isDirectManager } from "./model/org";
import { writeAuditLog } from "./lib/audit";

const actionItem = v.object({ label: v.string(), done: v.boolean() });

// The editable content of a development plan (all lists).
const planContentValidator = {
  shortTerm: v.array(v.string()),
  midTerm: v.array(v.string()),
  longTerm: v.array(v.string()),
  currentCompetencies: v.array(v.string()),
  developmentNeeds: v.array(v.string()),
  actionPlan: v.array(actionItem),
};

const planResult = v.object({
  employeeId: v.id("employees"),
  employeeName: v.string(),
  canEdit: v.boolean(),
  updatedAt: v.union(v.number(), v.null()),
  ...planContentValidator,
});

const EMPTY = {
  shortTerm: [] as string[],
  midTerm: [] as string[],
  longTerm: [] as string[],
  currentCompetencies: [] as string[],
  developmentNeeds: [] as string[],
  actionPlan: [] as { label: string; done: boolean }[],
};

// Who may view / edit an employee's development plan. The plan is a personal,
// self-service artefact: the employee and HR (performance:manage) can edit; the
// employee's manager can view.
async function access(
  ctx: QueryCtx,
  orgCtx: OrgContext,
  employeeId: Id<"employees">,
): Promise<{ canView: boolean; canEdit: boolean }> {
  if (ctxHasPermission(orgCtx, "performance:manage"))
    return { canView: true, canEdit: true };
  const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
  if (own && own._id === employeeId) return { canView: true, canEdit: true };
  const target = await ctx.db.get(employeeId);
  if (own && target && isDirectManager(target, own._id))
    return { canView: true, canEdit: false };
  return { canView: false, canEdit: false };
}

async function planFor(ctx: QueryCtx, employeeId: Id<"employees">) {
  return await ctx.db
    .query("developmentPlans")
    .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
    .unique();
}

function shape(
  emp: Doc<"employees"> | null,
  employeeId: Id<"employees">,
  plan: Doc<"developmentPlans"> | null,
  canEdit: boolean,
) {
  const base = plan ?? EMPTY;
  return {
    employeeId,
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
    canEdit,
    updatedAt: plan?.updatedAt ?? null,
    shortTerm: base.shortTerm,
    midTerm: base.midTerm,
    longTerm: base.longTerm,
    currentCompetencies: base.currentCompetencies,
    developmentNeeds: base.developmentNeeds,
    actionPlan: base.actionPlan,
  };
}

// The signed-in employee's own development plan.
export const mine = query({
  args: {},
  returns: v.union(v.null(), planResult),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return null;
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    if (!own) return null;
    const plan = await planFor(ctx, own._id);
    return shape(own, own._id, plan, true);
  },
});

// A specific employee's development plan (for managers / HR).
export const forEmployee = query({
  args: { employeeId: v.id("employees") },
  returns: v.union(v.null(), planResult),
  handler: async (ctx, { employeeId }) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return null;
    const { canView, canEdit } = await access(ctx, orgCtx, employeeId);
    if (!canView) return null;
    const emp = await ctx.db.get(employeeId);
    if (!emp || emp.orgId !== orgCtx.orgId) return null;
    const plan = await planFor(ctx, employeeId);
    return shape(emp, employeeId, plan, canEdit);
  },
});

// Upsert the whole plan. Defaults to the caller's own employee record.
export const save = mutation({
  args: {
    employeeId: v.optional(v.id("employees")),
    ...planContentValidator,
  },
  returns: v.null(),
  handler: async (ctx, { employeeId, ...content }) => {
    const orgCtx = await requireOrg(ctx);

    let targetId = employeeId;
    if (!targetId) {
      const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
      if (!own) throw new Error("You don't have an employee profile yet.");
      targetId = own._id;
    }

    const { canEdit } = await access(ctx, orgCtx, targetId);
    if (!canEdit) throw new Error("Not authorized to edit this plan.");

    const emp = await ctx.db.get(targetId);
    if (!emp || emp.orgId !== orgCtx.orgId) throw new Error("Employee not found.");

    // Trim empty strings out of the text lists; keep action items as-is.
    const clean = {
      shortTerm: content.shortTerm.map((s) => s.trim()).filter(Boolean),
      midTerm: content.midTerm.map((s) => s.trim()).filter(Boolean),
      longTerm: content.longTerm.map((s) => s.trim()).filter(Boolean),
      currentCompetencies: content.currentCompetencies
        .map((s) => s.trim())
        .filter(Boolean),
      developmentNeeds: content.developmentNeeds
        .map((s) => s.trim())
        .filter(Boolean),
      actionPlan: content.actionPlan
        .map((a) => ({ label: a.label.trim(), done: a.done }))
        .filter((a) => a.label),
    };

    const existing = await planFor(ctx, targetId);
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...clean,
        updatedAt: Date.now(),
        updatedBy: orgCtx.userId,
      });
    } else {
      await ctx.db.insert("developmentPlans", {
        orgId: orgCtx.orgId,
        employeeId: targetId,
        ...clean,
        updatedAt: Date.now(),
        updatedBy: orgCtx.userId,
      });
    }

    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "developmentPlan.save",
      entity: "developmentPlans",
      entityId: targetId,
    });
    return null;
  },
});
