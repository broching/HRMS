import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requireOrg, requirePermission } from "./auth";
import { workPatternDoc } from "./lib/validators";
import { writeAuditLog } from "./lib/audit";
import { parseHHMM } from "./model/shiftTime";

// A weekly pattern always carries exactly 7 day entries, Monday-first.
const patternDayArg = v.object({
  off: v.boolean(),
  startTime: v.optional(v.string()),
  endTime: v.optional(v.string()),
  breakMinutes: v.optional(v.number()),
});

function assertValidDays(days: { off: boolean; startTime?: string; endTime?: string }[]) {
  if (days.length !== 7) {
    throw new Error("A work pattern needs exactly 7 days (Mon–Sun).");
  }
  for (const d of days) {
    if (d.off) continue;
    if (!d.startTime || !d.endTime) {
      throw new Error("Working days need a start and end time.");
    }
    if (parseHHMM(d.startTime) === null || parseHHMM(d.endTime) === null) {
      throw new Error("Times must be in HH:MM format.");
    }
  }
}

function hydrate(p: Doc<"workPatterns">) {
  return {
    _id: p._id,
    _creationTime: p._creationTime,
    orgId: p.orgId,
    name: p.name,
    days: p.days.map((d) => ({
      off: d.off,
      startTime: d.startTime ?? null,
      endTime: d.endTime ?? null,
      breakMinutes: d.breakMinutes ?? null,
    })),
    color: p.color ?? null,
    officeId: p.officeId ?? null,
    isDefault: p.isDefault,
  };
}

/**
 * The work pattern in effect for an employee: their explicit pattern, else — for
 * fixed pay only — the org default. Hourly staff without an explicit pattern get
 * none (they're rostered ad-hoc). `payType` is the resolved effective pay type.
 */
export async function resolvePatternFor(
  ctx: QueryCtx,
  employee: Doc<"employees">,
  payType: "fixed" | "hourly",
  defaultPattern: Doc<"workPatterns"> | null,
): Promise<Doc<"workPatterns"> | null> {
  if (employee.workPatternId) {
    const p = await ctx.db.get(employee.workPatternId);
    if (p && p.orgId === employee.orgId) return p;
  }
  if (payType === "fixed") return defaultPattern;
  return null;
}

/** The org's default work pattern (or null). */
export async function defaultPatternFor(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
): Promise<Doc<"workPatterns"> | null> {
  const patterns = await ctx.db
    .query("workPatterns")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  return patterns.find((p) => p.isDefault) ?? null;
}

// The standard work week every org starts with: Monday–Friday, 09:00–17:00 with
// a 60-minute break, weekends off. Mon-first, exactly 7 entries. Fully editable.
export function standardWorkWeekDays() {
  return Array.from({ length: 7 }, (_, i) => {
    const weekend = i >= 5; // 0=Mon … 4=Fri, 5=Sat, 6=Sun
    return {
      off: weekend,
      startTime: weekend ? undefined : "09:00",
      endTime: weekend ? undefined : "17:00",
      breakMinutes: weekend ? undefined : 60,
    };
  });
}

/**
 * Guarantee the org has a default work pattern. If one is already marked
 * default, returns it. If the org has no patterns at all, creates the standard
 * 9–5 Mon–Fri pattern as the default. If patterns exist but none is default
 * (unusual), leaves them alone and returns null. Idempotent.
 */
export async function ensureDefaultWorkPattern(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  userId?: Id<"users">,
): Promise<Id<"workPatterns"> | null> {
  const existing = await ctx.db
    .query("workPatterns")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  const current = existing.find((p) => p.isDefault);
  if (current) return current._id;
  if (existing.length > 0) return null;
  return await ctx.db.insert("workPatterns", {
    orgId,
    name: "Standard hours (Mon–Fri, 9–5)",
    days: standardWorkWeekDays(),
    color: "#6366f1",
    isDefault: true,
    updatedBy: userId,
  });
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export const list = query({
  args: {},
  returns: v.array(workPatternDoc),
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    const rows = await ctx.db
      .query("workPatterns")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows.map(hydrate);
  },
});

// Employees + their currently-assigned pattern, for the assignment table.
export const assignments = query({
  args: {},
  returns: v.array(
    v.object({
      employeeId: v.id("employees"),
      name: v.string(),
      jobTitle: v.union(v.string(), v.null()),
      workPatternId: v.union(v.id("workPatterns"), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "scheduling:manage");
    const emps = await ctx.db
      .query("employees")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const active = emps.filter((e) => e.status !== "terminated" && !e.isVacant);
    const positions = await ctx.db
      .query("positions")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const posTitle = new Map(positions.map((p) => [p._id, p.title]));
    active.sort((a, b) =>
      `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`),
    );
    return active.map((e) => ({
      employeeId: e._id,
      name: `${e.preferredName ?? e.firstName} ${e.lastName}`,
      jobTitle: e.positionId ? (posTitle.get(e.positionId) ?? null) : null,
      workPatternId: e.workPatternId ?? null,
    }));
  },
});

export const get = query({
  args: { id: v.id("workPatterns") },
  returns: v.union(workPatternDoc, v.null()),
  handler: async (ctx, { id }) => {
    const { orgId } = await requireOrg(ctx);
    const p = await ctx.db.get(id);
    if (!p || p.orgId !== orgId) return null;
    return hydrate(p);
  },
});

// ─── Mutations ───────────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    name: v.string(),
    days: v.array(patternDayArg),
    color: v.optional(v.string()),
    officeId: v.optional(v.id("offices")),
    isDefault: v.optional(v.boolean()),
  },
  returns: v.id("workPatterns"),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(ctx, "scheduling:manage");
    assertValidDays(args.days);
    // Only one default per org — clear any existing default first.
    if (args.isDefault) await clearDefault(ctx, orgId);
    const id = await ctx.db.insert("workPatterns", {
      orgId,
      name: args.name.trim() || "Untitled pattern",
      days: args.days,
      color: args.color,
      officeId: args.officeId,
      isDefault: args.isDefault ?? false,
      updatedBy: userId,
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "workPattern.create",
      entity: "workPatterns",
      entityId: id,
      after: { name: args.name },
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("workPatterns"),
    name: v.optional(v.string()),
    days: v.optional(v.array(patternDayArg)),
    color: v.optional(v.string()),
    officeId: v.optional(v.union(v.id("offices"), v.null())),
    isDefault: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { id, ...patch }) => {
    const { orgId, userId } = await requirePermission(ctx, "scheduling:manage");
    const existing = await ctx.db.get(id);
    if (!existing || existing.orgId !== orgId) {
      throw new Error("Work pattern not found.");
    }
    if (patch.days) assertValidDays(patch.days);
    if (patch.isDefault) await clearDefault(ctx, orgId);
    await ctx.db.patch(id, {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.days !== undefined ? { days: patch.days } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
      ...(patch.officeId !== undefined
        ? { officeId: patch.officeId ?? undefined }
        : {}),
      ...(patch.isDefault !== undefined ? { isDefault: patch.isDefault } : {}),
      updatedBy: userId,
    });
    return null;
  },
});

export const setDefault = mutation({
  args: { id: v.id("workPatterns") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { orgId } = await requirePermission(ctx, "scheduling:manage");
    const p = await ctx.db.get(id);
    if (!p || p.orgId !== orgId) throw new Error("Work pattern not found.");
    await clearDefault(ctx, orgId);
    await ctx.db.patch(id, { isDefault: true });
    return null;
  },
});

// Ensure the org has its standard default work pattern — seeds the 9–5 Mon–Fri
// default for orgs that have none. Called on the settings surface so every org
// (including ones created before this default existed) always has one.
export const ensureDefault = mutation({
  args: {},
  returns: v.union(v.id("workPatterns"), v.null()),
  handler: async (ctx) => {
    const { orgId, userId } = await requirePermission(ctx, "scheduling:manage");
    return await ensureDefaultWorkPattern(ctx, orgId, userId);
  },
});

export const remove = mutation({
  args: { id: v.id("workPatterns") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { orgId, userId } = await requirePermission(ctx, "scheduling:manage");
    const existing = await ctx.db.get(id);
    if (!existing || existing.orgId !== orgId) {
      throw new Error("Work pattern not found.");
    }
    // Detach from any employees still pointing at it.
    const holders = await ctx.db
      .query("employees")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    for (const e of holders) {
      if (e.workPatternId === id) {
        await ctx.db.patch(e._id, { workPatternId: undefined });
      }
    }
    await ctx.db.delete(id);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "workPattern.delete",
      entity: "workPatterns",
      entityId: id,
      before: existing,
    });
    return null;
  },
});

export const assignToEmployee = mutation({
  args: {
    employeeId: v.id("employees"),
    patternId: v.union(v.id("workPatterns"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { employeeId, patternId }) => {
    const { orgId } = await requirePermission(ctx, "scheduling:manage");
    const emp = await ctx.db.get(employeeId);
    if (!emp || emp.orgId !== orgId) throw new Error("Employee not found.");
    if (patternId) {
      const p = await ctx.db.get(patternId);
      if (!p || p.orgId !== orgId) throw new Error("Work pattern not found.");
    }
    await ctx.db.patch(employeeId, { workPatternId: patternId ?? undefined });
    return null;
  },
});

// ─── Internal ──────────────────────────────────────────────────────────────

async function clearDefault(ctx: MutationCtx, orgId: Id<"organizations">) {
  const current = await ctx.db
    .query("workPatterns")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  for (const p of current) {
    if (p.isDefault) await ctx.db.patch(p._id, { isDefault: false });
  }
}
