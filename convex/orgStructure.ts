import { query } from "./_generated/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { requireOrg } from "./auth";

// How many avatars to preview per group (departments / teams / positions). The
// full total is always returned as `count`; avatars are just a visual sample.
const AVATAR_CAP = 5;

const groupStat = v.object({
  id: v.string(),
  count: v.number(),
  avatars: v.array(
    v.object({
      employeeId: v.id("employees"),
      name: v.string(),
      photoUrl: v.union(v.string(), v.null()),
    }),
  ),
});

function empName(e: Doc<"employees">): string {
  return `${e.preferredName ?? e.firstName} ${e.lastName}`.trim();
}

// Real, current people only — exclude terminated staff and vacant org-chart
// placeholders (they aren't "people to move" and shouldn't inflate counts).
function isActivePerson(e: Doc<"employees">): boolean {
  return e.status !== "terminated" && !e.isVacant;
}

type Bucket = { count: number; sample: Doc<"employees">[] };

/**
 * Headcounts + a small avatar sample for every department, team and position in
 * one pass. Deliberately IO-frugal: a single `by_org` scan of employees is
 * bucketed in memory (rather than one indexed scan per group), and storage URLs
 * are resolved only for the capped avatar sample — each shown employee once,
 * even if they appear under a department, team and position at the same time.
 */
export const headcounts = query({
  args: {},
  returns: v.object({
    departments: v.array(groupStat),
    teams: v.array(groupStat),
    positions: v.array(groupStat),
  }),
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    const employees = await ctx.db
      .query("employees")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    // Name order once, so every group's avatar sample is stable + alphabetical.
    const active = employees
      .filter(isActivePerson)
      .sort((a, b) => empName(a).localeCompare(empName(b)));

    const byDept = new Map<string, Bucket>();
    const byTeam = new Map<string, Bucket>();
    const byPos = new Map<string, Bucket>();

    function add(map: Map<string, Bucket>, key: string | undefined, e: Doc<"employees">) {
      if (!key) return;
      const b = map.get(key) ?? { count: 0, sample: [] };
      b.count += 1;
      if (b.sample.length < AVATAR_CAP) b.sample.push(e);
      map.set(key, b);
    }

    for (const e of active) {
      add(byDept, e.departmentId, e);
      add(byTeam, e.teamId, e);
      add(byPos, e.positionId, e);
    }

    // Resolve each sampled employee's photo URL exactly once.
    const sampled = new Map<string, Doc<"employees">>();
    for (const map of [byDept, byTeam, byPos]) {
      for (const b of map.values()) {
        for (const e of b.sample) sampled.set(e._id, e);
      }
    }
    const urlById = new Map<string, string | null>();
    for (const e of sampled.values()) {
      urlById.set(e._id, e.photoUrl ?? null);
    }

    function toStats(map: Map<string, Bucket>) {
      return [...map.entries()].map(([id, b]) => ({
        id,
        count: b.count,
        avatars: b.sample.map((e) => ({
          employeeId: e._id,
          name: empName(e),
          photoUrl: urlById.get(e._id) ?? null,
        })),
      }));
    }

    return {
      departments: toStats(byDept),
      teams: toStats(byTeam),
      positions: toStats(byPos),
    };
  },
});

const groupKind = v.union(
  v.literal("department"),
  v.literal("team"),
  v.literal("position"),
);

/**
 * Members of one group (department / team / position) plus the candidates that
 * could be added to it (active people not already in it). Powers the "manage
 * members" popup where you reassign people between groups. One `by_org` scan;
 * photo URLs are resolved only for the (smaller) member list, not every
 * candidate.
 */
export const groupPanel = query({
  args: { kind: groupKind, id: v.string() },
  returns: v.object({
    members: v.array(
      v.object({
        employeeId: v.id("employees"),
        name: v.string(),
        jobTitle: v.union(v.string(), v.null()),
        photoUrl: v.union(v.string(), v.null()),
      }),
    ),
    candidates: v.array(
      v.object({
        employeeId: v.id("employees"),
        name: v.string(),
        jobTitle: v.union(v.string(), v.null()),
      }),
    ),
  }),
  handler: async (ctx, { kind, id }) => {
    const { orgId } = await requireOrg(ctx);
    const employees = await ctx.db
      .query("employees")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const active = employees
      .filter(isActivePerson)
      .sort((a, b) => empName(a).localeCompare(empName(b)));

    const positions = await ctx.db
      .query("positions")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const posTitle = new Map(positions.map((p) => [p._id, p.title]));

    const keyOf = (e: Doc<"employees">) =>
      kind === "department"
        ? e.departmentId
        : kind === "team"
          ? e.teamId
          : e.positionId;

    const membersRaw: { e: Doc<"employees">; jobTitle: string | null }[] = [];
    const candidates: {
      employeeId: Doc<"employees">["_id"];
      name: string;
      jobTitle: string | null;
    }[] = [];
    for (const e of active) {
      const jobTitle = e.positionId ? (posTitle.get(e.positionId) ?? null) : null;
      if (keyOf(e) === id) {
        membersRaw.push({ e, jobTitle });
      } else {
        candidates.push({ employeeId: e._id, name: empName(e), jobTitle });
      }
    }

    const members = await Promise.all(
      membersRaw.map(async ({ e, jobTitle }) => ({
        employeeId: e._id,
        name: empName(e),
        jobTitle,
        photoUrl: e.photoUrl ?? null,
      })),
    );

    return { members, candidates };
  },
});
