import { query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { getOrgContext, ctxHasPermission } from "./auth";
import {
  employeeStatus,
  employmentType,
  gender,
  leaveStatus,
  claimStatus,
} from "./lib/enums";

/**
 * HR Lounge → Overview dashboard.
 *
 * Two read-only queries, split by data churn so a change to one part never
 * forces a re-read of the other:
 *
 *   `workforce` — everything derived from a single bounded `employees` scan
 *     (headcount, composition, hiring trend). The employees table is one row
 *     per person, so its size is the org's headcount — the smallest scan that
 *     can answer any org-structure question. Trends are computed in memory from
 *     join/exit dates at zero extra read cost.
 *
 *   `activity` — leave, claims and payment-request aggregates. Every read is
 *     index-scoped to the caller's selected date window (never a full-table
 *     scan) and hard-capped, so database I/O is bounded by the window, not by
 *     the org's entire history. Operational "needs attention" counts come from
 *     status/expiry indexes and are capped small.
 *
 * Both degrade to `null` without HR access so the page renders gracefully.
 *
 * At very large scale the capped window scans here would be the first thing to
 * move behind the @convex-dev/aggregate component (O(log n) counts/sums); the
 * shapes returned below are already pre-aggregated for that swap.
 */

// Hard caps: the ceiling on documents any single call will read per table.
const EMPLOYEE_SCAN_CAP = 5000;
const WINDOW_ROW_CAP = 4000; // leave / claims within the window
const PAYMENT_CAP = 3000;
const ATTENTION_CAP = 200; // pending/expiring operational lists

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const rangeArgs = { start: v.string(), end: v.string() } as const; // ISO YYYY-MM-DD

// ── date helpers (all string-lexical on ISO dates, no TZ surprises) ──────────

function isoMonth(date: string | undefined): string | null {
  if (!date || date.length < 7) return null;
  return date.slice(0, 7); // "YYYY-MM"
}

function monthLabel(key: string): string {
  // "YYYY-MM" → "Mon 'YY"
  const [y, m] = key.split("-");
  return `${MONTH_LABELS[Number(m) - 1]} '${y.slice(2)}`;
}

/** Ordered "YYYY-MM" keys ending at the current month, `count` long. */
function trailingMonths(count: number): string[] {
  const out: string[] = [];
  const now = new Date();
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth(); // 0-based
  for (let i = 0; i < count; i++) {
    out.unshift(`${y}-${String(m + 1).padStart(2, "0")}`);
    m--;
    if (m < 0) { m = 11; y--; }
  }
  return out;
}

/** Whole months a [start,end] window spans, inclusive. */
function monthsInRange(start: string, end: string): number {
  const s = start.slice(0, 7).split("-").map(Number);
  const e = end.slice(0, 7).split("-").map(Number);
  return (e[0] - s[0]) * 12 + (e[1] - s[1]) + 1;
}

function yearsBetween(fromIso: string | undefined, now: number): number | null {
  if (!fromIso) return null;
  const t = new Date(`${fromIso}T00:00:00Z`).getTime();
  if (Number.isNaN(t)) return null;
  return (now - t) / YEAR_MS;
}

/** The window immediately before [start,end] of equal length, for deltas. */
function previousWindow(start: string, end: string): { start: string; end: string } {
  const s = new Date(`${start}T00:00:00Z`).getTime();
  const e = new Date(`${end}T00:00:00Z`).getTime();
  const len = e - s + DAY_MS;
  const prevEnd = s - DAY_MS;
  const prevStart = prevEnd - len + DAY_MS;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { start: iso(prevStart), end: iso(prevEnd) };
}

// ── shared employee predicates ───────────────────────────────────────────────

const isReal = (e: Doc<"employees">) => !e.isVacant;
const inRange = (d: string | undefined, start: string, end: string) =>
  !!d && d >= start && d <= end;

/** Headcount as of a date: joined on/before, not exited on/before. */
function headcountAsOf(emps: Doc<"employees">[], onIso: string): number {
  let n = 0;
  for (const e of emps) {
    if (!isReal(e) || e.joinDate > onIso) continue;
    if (e.status === "terminated" && e.exitDate && e.exitDate <= onIso) continue;
    n++;
  }
  return n;
}

// ─── Workforce (one employees scan) ──────────────────────────────────────────

export const workforce = query({
  args: rangeArgs,
  returns: v.union(
    v.null(),
    v.object({
      headcount: v.number(),
      netChange: v.number(),
      hires: v.number(),
      hiresDelta: v.number(),
      exits: v.number(),
      exitsDelta: v.number(),
      turnoverPct: v.number(),
      statusBreakdown: v.array(
        v.object({ status: employeeStatus, count: v.number() }),
      ),
      byDepartment: v.array(v.object({ name: v.string(), count: v.number() })),
      byType: v.array(v.object({ type: employmentType, count: v.number() })),
      byGender: v.array(v.object({ gender: gender, count: v.number() })),
      byTenure: v.array(v.object({ group: v.string(), count: v.number() })),
      trend: v.array(
        v.object({
          key: v.string(),
          label: v.string(),
          headcount: v.number(),
          hires: v.number(),
          exits: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx, { start, end }) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx || !ctxHasPermission(orgCtx, "hr:access")) return null;
    const orgId = orgCtx.orgId;
    const now = Date.now();
    const todayIso = new Date(now).toISOString().slice(0, 10);

    const [rows, departments] = await Promise.all([
      ctx.db
        .query("employees")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .take(EMPLOYEE_SCAN_CAP),
      ctx.db
        .query("departments")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .collect(),
    ]);
    const emps = rows.filter(isReal);
    const deptName = new Map(departments.map((d) => [d._id, d.name]));

    // Headline counts + range hires/exits with a previous-window delta.
    const prev = previousWindow(start, end);
    let hires = 0, hiresPrev = 0, exits = 0, exitsPrev = 0;
    const statusCount = new Map<string, number>();
    const typeCount = new Map<string, number>();
    const genderCount = new Map<string, number>();
    const deptCount = new Map<string, number>();
    const tenure = { "<1y": 0, "1–2y": 0, "2–5y": 0, "5–10y": 0, "10y+": 0 };

    for (const e of emps) {
      if (inRange(e.joinDate, start, end)) hires++;
      if (inRange(e.joinDate, prev.start, prev.end)) hiresPrev++;
      if (e.status === "terminated") {
        if (inRange(e.exitDate, start, end)) exits++;
        if (inRange(e.exitDate, prev.start, prev.end)) exitsPrev++;
        continue; // terminated staff don't count toward current composition
      }
      statusCount.set(e.status, (statusCount.get(e.status) ?? 0) + 1);
      typeCount.set(e.employmentType, (typeCount.get(e.employmentType) ?? 0) + 1);
      const g = e.gender ?? "undisclosed";
      genderCount.set(g, (genderCount.get(g) ?? 0) + 1);
      const dn = e.departmentId ? (deptName.get(e.departmentId) ?? "Unknown") : "Unassigned";
      deptCount.set(dn, (deptCount.get(dn) ?? 0) + 1);
      const yrs = yearsBetween(e.joinDate, now);
      if (yrs !== null) {
        if (yrs < 1) tenure["<1y"]++;
        else if (yrs < 2) tenure["1–2y"]++;
        else if (yrs < 5) tenure["2–5y"]++;
        else if (yrs < 10) tenure["5–10y"]++;
        else tenure["10y+"]++;
      }
    }

    const headcount = headcountAsOf(emps, todayIso);
    const headStart = headcountAsOf(emps, start);
    const avgHead = (headStart + headcount) / 2;
    const turnoverPct = avgHead > 0 ? Math.round((exits / avgHead) * 1000) / 10 : 0;

    // Headcount + hiring trend: monthly buckets, sized to the range but always
    // enough months to read as a trend. Derived from the same scan — no reads.
    const monthCount = Math.min(12, Math.max(6, monthsInRange(start, end)));
    const months = trailingMonths(monthCount);
    const hiresByMonth = new Map<string, number>();
    const exitsByMonth = new Map<string, number>();
    for (const e of emps) {
      const jm = isoMonth(e.joinDate);
      if (jm) hiresByMonth.set(jm, (hiresByMonth.get(jm) ?? 0) + 1);
      if (e.status === "terminated") {
        const xm = isoMonth(e.exitDate);
        if (xm) exitsByMonth.set(xm, (exitsByMonth.get(xm) ?? 0) + 1);
      }
    }
    const trend = months.map((key) => ({
      key,
      label: monthLabel(key),
      headcount: headcountAsOf(emps, `${key}-31`),
      hires: hiresByMonth.get(key) ?? 0,
      exits: exitsByMonth.get(key) ?? 0,
    }));

    const sortDesc = (m: Map<string, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]);

    return {
      headcount,
      netChange: hires - exits,
      hires,
      hiresDelta: hires - hiresPrev,
      exits,
      exitsDelta: exits - exitsPrev,
      turnoverPct,
      statusBreakdown: [...statusCount.entries()].map(([status, count]) => ({
        status: status as Doc<"employees">["status"],
        count,
      })),
      byDepartment: sortDesc(deptCount).map(([name, count]) => ({ name, count })),
      byType: [...typeCount.entries()].map(([type, count]) => ({
        type: type as Doc<"employees">["employmentType"],
        count,
      })),
      byGender: [...genderCount.entries()].map(([g, count]) => ({
        gender: g as NonNullable<Doc<"employees">["gender"]>,
        count,
      })),
      byTenure: Object.entries(tenure).map(([group, count]) => ({ group, count })),
      trend,
    };
  },
});

// ─── Activity (window-scoped transactional aggregates) ───────────────────────

export const activity = query({
  args: rangeArgs,
  returns: v.union(
    v.null(),
    v.object({
      currency: v.string(),
      leave: v.object({
        total: v.number(),
        approvedDays: v.number(),
        byStatus: v.array(v.object({ status: leaveStatus, count: v.number() })),
        byType: v.array(
          v.object({ name: v.string(), color: v.string(), days: v.number() }),
        ),
        trend: v.array(v.object({ key: v.string(), label: v.string(), days: v.number() })),
        capped: v.boolean(),
      }),
      claims: v.object({
        count: v.number(),
        approvedCents: v.number(),
        pendingCents: v.number(),
        byStatus: v.array(
          v.object({ status: claimStatus, count: v.number(), cents: v.number() }),
        ),
        byCategory: v.array(v.object({ category: v.string(), cents: v.number() })),
        trend: v.array(v.object({ key: v.string(), label: v.string(), cents: v.number() })),
        capped: v.boolean(),
      }),
      payments: v.object({
        count: v.number(),
        approvedCents: v.number(),
        trend: v.array(v.object({ key: v.string(), label: v.string(), cents: v.number() })),
      }),
      attention: v.object({
        pendingLeave: v.number(),
        pendingClaims: v.number(),
        expiringDocs: v.number(),
        cappedAt: v.number(),
      }),
    }),
  ),
  handler: async (ctx, { start, end }) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx || !ctxHasPermission(orgCtx, "hr:access")) return null;
    const orgId = orgCtx.orgId;
    const currency = orgCtx.org.settings.currency;
    const startMonth = start.slice(0, 7);
    const endMonth = end.slice(0, 7);

    // Windowed reads — each ranges an index over the selected window only.
    const [leaveRows, claimRows, paymentRows, leaveTypes, claimTypes] =
      await Promise.all([
        ctx.db
          .query("leaveRequests")
          .withIndex("by_org_start", (q) =>
            q.eq("orgId", orgId).gte("startDate", start).lte("startDate", end),
          )
          .take(WINDOW_ROW_CAP),
        ctx.db
          .query("claims")
          .withIndex("by_org_incurredDate", (q) =>
            q.eq("orgId", orgId).gte("incurredDate", start).lte("incurredDate", end),
          )
          .take(WINDOW_ROW_CAP),
        ctx.db
          .query("paymentRequests")
          .withIndex("by_org_month", (q) =>
            q.eq("orgId", orgId).gte("incurredMonth", startMonth).lte("incurredMonth", endMonth),
          )
          .take(PAYMENT_CAP),
        ctx.db.query("leaveTypes").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
        ctx.db.query("claimTypes").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
      ]);

    // Operational "needs attention" — cheap, status/expiry-indexed, capped small.
    const todayIso = new Date().toISOString().slice(0, 10);
    const soonIso = new Date(Date.now() + 60 * DAY_MS).toISOString().slice(0, 10);
    const [pendingLeaveRows, pendingMgr, pendingFin, expiringRows] =
      await Promise.all([
        ctx.db
          .query("leaveRequests")
          .withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "pending"))
          .take(ATTENTION_CAP),
        ctx.db
          .query("claims")
          .withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "pending_manager"))
          .take(ATTENTION_CAP),
        ctx.db
          .query("claims")
          .withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "pending_finance"))
          .take(ATTENTION_CAP),
        ctx.db
          .query("employeeDocuments")
          .withIndex("by_org_expiry", (q) =>
            q.eq("orgId", orgId).gte("expiryDate", todayIso).lte("expiryDate", soonIso),
          )
          .take(ATTENTION_CAP),
      ]);

    const leaveTypeMap = new Map(leaveTypes.map((t) => [t._id, t]));
    const claimTypeMap = new Map(claimTypes.map((t) => [t._id, t]));

    // ── Leave aggregates ──
    const leaveStatusCount = new Map<string, number>();
    const leaveTypeDays = new Map<string, number>();
    const leaveTrend = new Map<string, number>();
    let approvedDays = 0;
    for (const r of leaveRows) {
      leaveStatusCount.set(r.status, (leaveStatusCount.get(r.status) ?? 0) + 1);
      if (r.status === "approved") {
        approvedDays += r.totalDays;
        const t = leaveTypeMap.get(r.leaveTypeId);
        const name = t?.name ?? "Other";
        leaveTypeDays.set(name, (leaveTypeDays.get(name) ?? 0) + r.totalDays);
        const mk = isoMonth(r.startDate);
        if (mk) leaveTrend.set(mk, (leaveTrend.get(mk) ?? 0) + r.totalDays);
      }
    }
    const leaveColor = new Map(leaveTypes.map((t) => [t.name, t.color]));

    // ── Claim aggregates (base/org currency `amountCents`) ──
    const claimStatusAgg = new Map<string, { count: number; cents: number }>();
    const claimCategory = new Map<string, number>();
    const claimTrend = new Map<string, number>();
    let approvedCents = 0, pendingCents = 0;
    const APPROVED = new Set(["approved", "reimbursed"]);
    const PENDING = new Set(["pending_manager", "pending_finance"]);
    for (const c of claimRows) {
      const agg = claimStatusAgg.get(c.status) ?? { count: 0, cents: 0 };
      agg.count++; agg.cents += c.amountCents;
      claimStatusAgg.set(c.status, agg);
      if (APPROVED.has(c.status)) {
        approvedCents += c.amountCents;
        const cat = claimTypeMap.get(c.claimTypeId)?.category ?? "other";
        claimCategory.set(cat, (claimCategory.get(cat) ?? 0) + c.amountCents);
        const mk = isoMonth(c.incurredDate);
        if (mk) claimTrend.set(mk, (claimTrend.get(mk) ?? 0) + c.amountCents);
      } else if (PENDING.has(c.status)) {
        pendingCents += c.amountCents;
      }
    }

    // ── Payment-request aggregates ──
    const paymentTrend = new Map<string, number>();
    let paymentApproved = 0;
    for (const p of paymentRows) {
      if (p.status === "approved" || p.status === "paid") {
        paymentApproved += p.amountCents;
        const mk = p.incurredMonth || startMonth;
        paymentTrend.set(mk, (paymentTrend.get(mk) ?? 0) + p.amountCents);
      }
    }

    const sortedTrend = (m: Map<string, number>) =>
      [...m.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([k, value]) => ({ key: k, label: monthLabel(k), value }));

    return {
      currency,
      leave: {
        total: leaveRows.length,
        approvedDays: Math.round(approvedDays * 10) / 10,
        byStatus: [...leaveStatusCount.entries()].map(([status, count]) => ({
          status: status as Doc<"leaveRequests">["status"],
          count,
        })),
        byType: [...leaveTypeDays.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([name, days]) => ({
            name,
            color: leaveColor.get(name) ?? "#94a3b8",
            days: Math.round(days * 10) / 10,
          })),
        trend: sortedTrend(leaveTrend).map(({ key, label, value }) => ({
          key,
          label,
          days: Math.round(value * 10) / 10,
        })),
        capped: leaveRows.length >= WINDOW_ROW_CAP,
      },
      claims: {
        count: claimRows.length,
        approvedCents,
        pendingCents,
        byStatus: [...claimStatusAgg.entries()].map(([status, a]) => ({
          status: status as Doc<"claims">["status"],
          count: a.count,
          cents: a.cents,
        })),
        byCategory: [...claimCategory.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([category, cents]) => ({ category, cents })),
        trend: sortedTrend(claimTrend).map(({ key, label, value }) => ({
          key,
          label,
          cents: value,
        })),
        capped: claimRows.length >= WINDOW_ROW_CAP,
      },
      payments: {
        count: paymentRows.length,
        approvedCents: paymentApproved,
        trend: sortedTrend(paymentTrend).map(({ key, label, value }) => ({
          key,
          label,
          cents: value,
        })),
      },
      attention: {
        pendingLeave: pendingLeaveRows.length,
        pendingClaims: pendingMgr.length + pendingFin.length,
        expiringDocs: expiringRows.length,
        cappedAt: ATTENTION_CAP,
      },
    };
  },
});
