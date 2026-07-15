import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requireOrg, requirePermission } from "./auth";
import { writeAuditLog } from "./lib/audit";
import { pushNotification } from "./model/notify";
import { reviewCycleDoc } from "./lib/validators";
import { cycleForm, cycleAudienceMode } from "./lib/enums";
import { ensureDefaultCompetencies } from "./competencies";
import { ensureDefaultFormTemplates } from "./appraisalFormTemplates";
import { normalizeAndValidateForm } from "./lib/performanceForm";
import {
  DEFAULT_OBJECTIVES_WEIGHT_PCT,
  DEFAULT_COMPETENCIES_WEIGHT_PCT,
  DEFAULT_RATING_BANDS,
  DEFAULT_QUESTIONNAIRE,
  DEFAULT_360_QUESTIONS,
  DEFAULT_FORM_TEMPLATES,
} from "./lib/performanceDefaults";

// Any org member can see cycles (to find their active review); management is
// gated by performance:manage.
export const list = query({
  args: {},
  returns: v.array(reviewCycleDoc),
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    const cycles = await ctx.db
      .query("reviewCycles")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .order("desc")
      .collect();
    return cycles;
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    ratingScaleMax: v.optional(v.number()),
    // The appraisal form: copied from a template, supplied inline, or (absent)
    // seeded from the first default template.
    templateId: v.optional(v.id("appraisalFormTemplates")),
    form: v.optional(cycleForm),
  },
  returns: v.id("reviewCycles"),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(ctx, "performance:manage");
    if (!args.name.trim()) throw new Error("Cycle needs a name.");
    // Ensure the org has a competency library + starter templates to draw from.
    await ensureDefaultCompetencies(ctx, orgId);
    await ensureDefaultFormTemplates(ctx, orgId);

    // Resolve the form: explicit template → inline form → first default.
    let form = DEFAULT_FORM_TEMPLATES[0].form;
    if (args.templateId) {
      const tpl = await ctx.db.get(args.templateId);
      if (!tpl || tpl.orgId !== orgId) throw new Error("Template not found.");
      form = tpl.form;
    } else if (args.form) {
      form = normalizeAndValidateForm(args.form);
    }

    const id = await ctx.db.insert("reviewCycles", {
      orgId,
      name: args.name.trim(),
      startDate: args.startDate,
      endDate: args.endDate,
      status: "draft",
      ratingScaleMax: args.ratingScaleMax ?? 5,
      objectivesWeightPct: DEFAULT_OBJECTIVES_WEIGHT_PCT,
      competenciesWeightPct: DEFAULT_COMPETENCIES_WEIGHT_PCT,
      ratingBands: DEFAULT_RATING_BANDS.map((b) => ({ ...b })),
      questionnaire: [...DEFAULT_QUESTIONNAIRE],
      feedback360Questions: [...DEFAULT_360_QUESTIONS],
      form,
      templateId: args.templateId,
      createdBy: userId,
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "reviewCycle.create",
      entity: "reviewCycles",
      entityId: id,
      after: { name: args.name },
    });
    return id;
  },
});

// Resolve the active employees a cycle's form is released to, from its
// `audience`. Absent audience (legacy cycles) = every active employee.
async function resolveAudienceEmployees(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  audience: Doc<"reviewCycles">["audience"],
): Promise<Doc<"employees">[]> {
  const all = (
    await ctx.db
      .query("employees")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect()
  ).filter((e) => e.status !== "terminated");
  if (!audience || audience.mode === "all") return all;
  if (audience.mode === "departments") {
    const set = new Set(audience.departmentIds ?? []);
    return all.filter((e) => e.departmentId && set.has(e.departmentId));
  }
  if (audience.mode === "offices") {
    const set = new Set(audience.officeIds ?? []);
    return all.filter((e) => e.officeId && set.has(e.officeId));
  }
  const set = new Set(audience.employeeIds ?? []);
  return all.filter((e) => set.has(e._id));
}

// Preview who a cycle will be released to (release-confirm dialog). Returns a
// total count plus a capped sample of names.
export const audiencePreview = query({
  args: { cycleId: v.id("reviewCycles") },
  returns: v.object({
    count: v.number(),
    names: v.array(v.string()),
    overflow: v.number(),
  }),
  handler: async (ctx, { cycleId }) => {
    const { orgId } = await requirePermission(ctx, "performance:manage");
    const cycle = await ctx.db.get(cycleId);
    if (!cycle || cycle.orgId !== orgId) {
      return { count: 0, names: [], overflow: 0 };
    }
    const employees = await resolveAudienceEmployees(ctx, orgId, cycle.audience);
    const CAP = 10;
    return {
      count: employees.length,
      names: employees
        .slice(0, CAP)
        .map((e) => `${e.firstName} ${e.lastName}`),
      overflow: Math.max(0, employees.length - CAP),
    };
  },
});

// Release a draft cycle to its audience: generate a review row for each targeted
// employee and notify them. Both self + appraiser sides open immediately
// (parallel flow). Re-runnable on an active cycle to sync newly-eligible people.
export const activate = mutation({
  args: { cycleId: v.id("reviewCycles") },
  returns: v.object({ created: v.number() }),
  handler: async (ctx, { cycleId }) => {
    const { orgId, userId } = await requirePermission(ctx, "performance:manage");
    const cycle = await ctx.db.get(cycleId);
    if (!cycle || cycle.orgId !== orgId) throw new Error("Cycle not found.");
    if (cycle.status === "closed") throw new Error("Cycle is closed.");

    const employees = await resolveAudienceEmployees(ctx, orgId, cycle.audience);

    let created = 0;
    for (const e of employees) {
      const existing = await ctx.db
        .query("reviews")
        .withIndex("by_employee_cycle", (q) =>
          q.eq("employeeId", e._id).eq("cycleId", cycleId),
        )
        .first();
      if (existing) continue;
      const reviewId = await ctx.db.insert("reviews", {
        orgId,
        cycleId,
        employeeId: e._id,
        managerId: e.managerId,
        status: "self_review",
      });
      created += 1;
      if (e.userId) {
        await pushNotification(ctx, {
          orgId,
          recipientUserId: e.userId,
          type: "review.opened",
          title: "Appraisal open",
          body: `Your appraisal for ${cycle.name} is ready to complete.`,
          // Deep-link to the employee's own appraisal form, not the cycle.
          entityRef: { table: "reviews", id: reviewId },
        });
      }
    }

    if (cycle.status !== "active") {
      await ctx.db.patch(cycleId, { status: "active" });
    }
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "reviewCycle.activate",
      entity: "reviewCycles",
      entityId: cycleId,
      after: { created },
    });
    return { created };
  },
});

// Set who a cycle is released to. Editable until the cycle is closed (editing an
// active cycle then re-running Sync adds newly-eligible people).
export const setAudience = mutation({
  args: {
    cycleId: v.id("reviewCycles"),
    audience: v.object({
      mode: cycleAudienceMode,
      departmentIds: v.optional(v.array(v.id("departments"))),
      officeIds: v.optional(v.array(v.id("offices"))),
      employeeIds: v.optional(v.array(v.id("employees"))),
    }),
  },
  returns: v.null(),
  handler: async (ctx, { cycleId, audience }) => {
    const { orgId } = await requirePermission(ctx, "performance:manage");
    const cycle = await ctx.db.get(cycleId);
    if (!cycle || cycle.orgId !== orgId) throw new Error("Cycle not found.");
    if (cycle.status === "closed") throw new Error("Cycle is closed.");
    if (audience.mode === "departments" && !(audience.departmentIds ?? []).length) {
      throw new Error("Pick at least one department.");
    }
    if (audience.mode === "offices" && !(audience.officeIds ?? []).length) {
      throw new Error("Pick at least one office.");
    }
    if (audience.mode === "individuals" && !(audience.employeeIds ?? []).length) {
      throw new Error("Pick at least one employee.");
    }
    // Normalize: only keep the selection relevant to the chosen mode.
    await ctx.db.patch(cycleId, {
      audience: {
        mode: audience.mode,
        departmentIds:
          audience.mode === "departments" ? audience.departmentIds : undefined,
        officeIds: audience.mode === "offices" ? audience.officeIds : undefined,
        employeeIds:
          audience.mode === "individuals" ? audience.employeeIds : undefined,
      },
    });
    return null;
  },
});

// Set the participant due dates (record keyed by stage; `self` / `appraiser`
// drive the form). Replaces the whole record.
export const setDueDates = mutation({
  args: {
    cycleId: v.id("reviewCycles"),
    dueDates: v.record(v.string(), v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { cycleId, dueDates }) => {
    const { orgId } = await requirePermission(ctx, "performance:manage");
    const cycle = await ctx.db.get(cycleId);
    if (!cycle || cycle.orgId !== orgId) throw new Error("Cycle not found.");
    // Drop blank values so a cleared date removes the key.
    const clean: Record<string, string> = {};
    for (const [k, val] of Object.entries(dueDates)) {
      if (val && val.trim()) clean[k] = val.trim();
    }
    await ctx.db.patch(cycleId, { dueDates: clean });
    return null;
  },
});

// Configure due-date reminders for the reminder cron.
export const setReminders = mutation({
  args: {
    cycleId: v.id("reviewCycles"),
    reminders: v.object({
      enabled: v.boolean(),
      daysBefore: v.array(v.number()),
    }),
  },
  returns: v.null(),
  handler: async (ctx, { cycleId, reminders }) => {
    const { orgId } = await requirePermission(ctx, "performance:manage");
    const cycle = await ctx.db.get(cycleId);
    if (!cycle || cycle.orgId !== orgId) throw new Error("Cycle not found.");
    // Keep only whole, non-negative day offsets, unique + sorted desc.
    const daysBefore = Array.from(
      new Set(
        reminders.daysBefore
          .filter((d) => Number.isFinite(d) && d >= 0)
          .map((d) => Math.floor(d)),
      ),
    ).sort((a, b) => b - a);
    await ctx.db.patch(cycleId, {
      reminders: { enabled: reminders.enabled, daysBefore },
    });
    return null;
  },
});

// Edit a cycle's appraisal configuration (weights, questionnaire, 360 questions,
// rating scale). Weights, if both supplied, must sum to 100.
export const updateConfig = mutation({
  args: {
    cycleId: v.id("reviewCycles"),
    ratingScaleMax: v.optional(v.number()),
    objectivesWeightPct: v.optional(v.number()),
    competenciesWeightPct: v.optional(v.number()),
    questionnaire: v.optional(v.array(v.string())),
    feedback360Questions: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, { cycleId, ...patch }) => {
    const { orgId, userId } = await requirePermission(ctx, "performance:manage");
    const cycle = await ctx.db.get(cycleId);
    if (!cycle || cycle.orgId !== orgId) throw new Error("Cycle not found.");
    if (
      patch.objectivesWeightPct !== undefined &&
      patch.competenciesWeightPct !== undefined &&
      patch.objectivesWeightPct + patch.competenciesWeightPct !== 100
    ) {
      throw new Error("Objectives and competencies weights must sum to 100%.");
    }
    await ctx.db.patch(cycleId, {
      ...(patch.ratingScaleMax !== undefined && {
        ratingScaleMax: patch.ratingScaleMax,
      }),
      ...(patch.objectivesWeightPct !== undefined && {
        objectivesWeightPct: patch.objectivesWeightPct,
      }),
      ...(patch.competenciesWeightPct !== undefined && {
        competenciesWeightPct: patch.competenciesWeightPct,
      }),
      ...(patch.questionnaire !== undefined && {
        questionnaire: patch.questionnaire.map((q) => q.trim()).filter(Boolean),
      }),
      ...(patch.feedback360Questions !== undefined && {
        feedback360Questions: patch.feedback360Questions
          .map((q) => q.trim())
          .filter(Boolean),
      }),
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "reviewCycle.update_config",
      entity: "reviewCycles",
      entityId: cycleId,
    });
    return null;
  },
});

// Save the structured appraisal form (builder). Only draft cycles can change
// their form — once released, the form is frozen so answers stay coherent.
export const updateForm = mutation({
  args: { cycleId: v.id("reviewCycles"), form: cycleForm },
  returns: v.null(),
  handler: async (ctx, { cycleId, form }) => {
    const { orgId, userId } = await requirePermission(ctx, "performance:manage");
    const cycle = await ctx.db.get(cycleId);
    if (!cycle || cycle.orgId !== orgId) throw new Error("Cycle not found.");
    if (cycle.status !== "draft") {
      throw new Error("The form can only be edited while the cycle is a draft.");
    }
    await ctx.db.patch(cycleId, { form: normalizeAndValidateForm(form) });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "reviewCycle.update_form",
      entity: "reviewCycles",
      entityId: cycleId,
    });
    return null;
  },
});

// Save a cycle's current form as a reusable org template.
export const saveAsTemplate = mutation({
  args: {
    cycleId: v.id("reviewCycles"),
    name: v.string(),
    description: v.optional(v.string()),
  },
  returns: v.id("appraisalFormTemplates"),
  handler: async (ctx, { cycleId, name, description }) => {
    const { orgId, userId } = await requirePermission(ctx, "performance:manage");
    const cycle = await ctx.db.get(cycleId);
    if (!cycle || cycle.orgId !== orgId) throw new Error("Cycle not found.");
    const cleanName = name.trim();
    if (!cleanName) throw new Error("Template needs a name.");
    if (!cycle.form) throw new Error("This cycle has no form to save.");
    const id = await ctx.db.insert("appraisalFormTemplates", {
      orgId,
      name: cleanName,
      description: description?.trim() || undefined,
      form: normalizeAndValidateForm(cycle.form),
      isSystemDefault: false,
      active: true,
      createdBy: userId,
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "reviewCycle.save_as_template",
      entity: "appraisalFormTemplates",
      entityId: id,
    });
    return id;
  },
});

export const close = mutation({
  args: { cycleId: v.id("reviewCycles") },
  returns: v.null(),
  handler: async (ctx, { cycleId }) => {
    const { orgId, userId } = await requirePermission(ctx, "performance:manage");
    const cycle = await ctx.db.get(cycleId);
    if (!cycle || cycle.orgId !== orgId) throw new Error("Cycle not found.");
    await ctx.db.patch(cycleId, { status: "closed" });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "reviewCycle.close",
      entity: "reviewCycles",
      entityId: cycleId,
    });
    return null;
  },
});

export const remove = mutation({
  args: { cycleId: v.id("reviewCycles") },
  returns: v.null(),
  handler: async (ctx, { cycleId }) => {
    const { orgId, userId } = await requirePermission(ctx, "performance:manage");
    const cycle = await ctx.db.get(cycleId);
    if (!cycle || cycle.orgId !== orgId) throw new Error("Cycle not found.");
    if (cycle.status !== "draft") {
      throw new Error("Only draft cycles can be deleted.");
    }
    await ctx.db.delete(cycleId);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "reviewCycle.delete",
      entity: "reviewCycles",
      entityId: cycleId,
    });
    return null;
  },
});
