import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * One-off data migrations, run manually with `npx convex run migrations:<name>`.
 */

const DEFAULT_STAGES: { name: string; color: string; isDone: boolean }[] = [
  { name: "To Do", color: "#94a3b8", isDone: false },
  { name: "In Progress", color: "#3b82f6", isDone: false },
  { name: "In Review", color: "#a855f7", isDone: false },
  { name: "Done", color: "#22c55e", isDone: true },
];

// Backfill for the Kanban board: give every existing project the default set of
// stages (if it has none) and file each existing task into a column — the
// terminal "Done" column when the task is already done, otherwise the first
// column. Idempotent: tasks that already have a stage are left untouched.
export const seedProjectStages = internalMutation({
  args: {},
  returns: v.object({
    projects: v.number(),
    stagesCreated: v.number(),
    tasksUpdated: v.number(),
  }),
  handler: async (ctx) => {
    const projects = await ctx.db.query("projects").collect();
    let stagesCreated = 0;
    let tasksUpdated = 0;

    for (const p of projects) {
      let stages = await ctx.db
        .query("projectStages")
        .withIndex("by_project", (q) => q.eq("projectId", p._id))
        .collect();

      if (stages.length === 0) {
        for (let i = 0; i < DEFAULT_STAGES.length; i++) {
          const s = DEFAULT_STAGES[i];
          await ctx.db.insert("projectStages", {
            orgId: p.orgId,
            projectId: p._id,
            name: s.name,
            color: s.color,
            order: i,
            isDone: s.isDone,
          });
          stagesCreated++;
        }
        stages = await ctx.db
          .query("projectStages")
          .withIndex("by_project", (q) => q.eq("projectId", p._id))
          .collect();
      }
      stages.sort((a, b) => a.order - b.order);
      const firstStage = stages[0];
      const doneStage = stages.find((s) => s.isDone) ?? stages[stages.length - 1];

      const tasks = await ctx.db
        .query("projectTasks")
        .withIndex("by_project", (q) => q.eq("projectId", p._id))
        .collect();
      for (const t of tasks) {
        if (t.stageId) continue;
        const target = t.status === "done" ? doneStage : firstStage;
        await ctx.db.patch(t._id, { stageId: target._id });
        tasksUpdated++;
      }
    }

    return { projects: projects.length, stagesCreated, tasksUpdated };
  },
});

// Backfill the denormalized `photoUrl` on employees from their `photoStorageId`.
// Convex serving URLs are stable, so we resolve once and store the result;
// list/tree reads then use the field instead of an N-per-row getUrl call.
// Idempotent: only touches rows that have a storageId but no cached url.
export const backfillEmployeePhotoUrls = internalMutation({
  args: {},
  returns: v.object({ scanned: v.number(), updated: v.number() }),
  handler: async (ctx) => {
    const employees = await ctx.db.query("employees").collect();
    let updated = 0;
    for (const e of employees) {
      if (!e.photoStorageId || e.photoUrl) continue;
      const url = await ctx.storage.getUrl(e.photoStorageId);
      await ctx.db.patch(e._id, { photoUrl: url ?? undefined });
      updated++;
    }
    return { scanned: employees.length, updated };
  },
});
