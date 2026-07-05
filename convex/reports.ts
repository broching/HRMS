import { query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getOrgContext } from "./auth";
import { ctxHasPermission } from "./auth";

/**
 * HR Lounge → Reports → Statistics. Read-only org-wide analytics computed live
 * from employees, leave and payroll. All queries degrade to `null` without the
 * required permission / org context so the page never throws. Payroll figures
 * additionally require `payroll:manage` (they expose compensation totals).
 */

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

function yearsBetween(fromIso: string | undefined, now: number): number | null {
  if (!fromIso) return null;
  const t = new Date(`${fromIso}T00:00:00`).getTime();
  if (Number.isNaN(t)) return null;
  return (now - t) / YEAR_MS;
}

async function activeEmployees(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
): Promise<Doc<"employees">[]> {
  const rows = await ctx.db
    .query("employees")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .take(2000);
  return rows.filter((e) => !e.isVacant && e.status !== "terminated");
}

// ─── General ────────────────────────────────────────────────────────────────

export const general = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      totalEmployees: v.number(),
      avgAgeYears: v.number(),
      avgTenureYears: v.number(),
      gender: v.object({
        male: v.number(),
        female: v.number(),
        other: v.number(),
      }),
      byDepartment: v.array(
        v.object({
          name: v.string(),
          male: v.number(),
          female: v.number(),
          other: v.number(),
        }),
      ),
      byBranch: v.array(v.object({ name: v.string(), count: v.number() })),
      byAgeGroup: v.array(v.object({ group: v.string(), count: v.number() })),
      byTenure: v.array(v.object({ group: v.string(), count: v.number() })),
      byNationality: v.array(
        v.object({ name: v.string(), count: v.number() }),
      ),
    }),
  ),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx || !ctxHasPermission(orgCtx, "reports:view")) return null;
    const orgId = orgCtx.orgId;
    const now = Date.now();

    const employees = await activeEmployees(ctx, orgId);
    const [departments, offices] = await Promise.all([
      ctx.db.query("departments").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
      ctx.db.query("offices").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
    ]);
    const deptName = new Map(departments.map((d) => [d._id, d.name]));
    const officeName = new Map(offices.map((o) => [o._id, o.name]));

    let male = 0;
    let female = 0;
    let other = 0;
    let ageSum = 0;
    let ageN = 0;
    let tenureSum = 0;
    let tenureN = 0;

    const genderBucket = (g: Doc<"employees">["gender"]): "male" | "female" | "other" =>
      g === "male" ? "male" : g === "female" ? "female" : "other";

    const deptAgg = new Map<
      string,
      { name: string; male: number; female: number; other: number }
    >();
    const branchAgg = new Map<string, number>();
    const ageGroups = { "0-25": 0, "26-35": 0, "36-45": 0, "46+": 0 };
    const tenureGroups = { "0-5": 0, "6-10": 0, "11-20": 0, "21+": 0 };
    const nationalityAgg = new Map<string, number>();

    for (const e of employees) {
      const bucket = genderBucket(e.gender);
      if (bucket === "male") male += 1;
      else if (bucket === "female") female += 1;
      else other += 1;

      const age = yearsBetween(e.dob, now);
      if (age != null && age >= 0) {
        ageSum += age;
        ageN += 1;
        if (age < 26) ageGroups["0-25"] += 1;
        else if (age < 36) ageGroups["26-35"] += 1;
        else if (age < 46) ageGroups["36-45"] += 1;
        else ageGroups["46+"] += 1;
      }

      const tenure = yearsBetween(e.joinDate, now);
      if (tenure != null && tenure >= 0) {
        tenureSum += tenure;
        tenureN += 1;
        if (tenure < 6) tenureGroups["0-5"] += 1;
        else if (tenure < 11) tenureGroups["6-10"] += 1;
        else if (tenure < 21) tenureGroups["11-20"] += 1;
        else tenureGroups["21+"] += 1;
      }

      const dName = e.departmentId
        ? deptName.get(e.departmentId) ?? "—"
        : "Unassigned";
      const cur =
        deptAgg.get(dName) ?? { name: dName, male: 0, female: 0, other: 0 };
      cur[bucket] += 1;
      deptAgg.set(dName, cur);

      const bName = e.officeId ? officeName.get(e.officeId) ?? "—" : "Unassigned";
      branchAgg.set(bName, (branchAgg.get(bName) ?? 0) + 1);

      const nat = e.nationality?.trim() || "Unspecified";
      nationalityAgg.set(nat, (nationalityAgg.get(nat) ?? 0) + 1);
    }

    return {
      totalEmployees: employees.length,
      avgAgeYears: ageN === 0 ? 0 : Math.round((ageSum / ageN) * 10) / 10,
      avgTenureYears:
        tenureN === 0 ? 0 : Math.round((tenureSum / tenureN) * 10) / 10,
      gender: { male, female, other },
      byDepartment: Array.from(deptAgg.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
      byBranch: Array.from(branchAgg.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      byAgeGroup: Object.entries(ageGroups).map(([group, count]) => ({
        group,
        count,
      })),
      byTenure: Object.entries(tenureGroups).map(([group, count]) => ({
        group,
        count,
      })),
      byNationality: Array.from(nationalityAgg.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    };
  },
});

// ─── Attrition ────────────────────────────────────────────────────────────

export const attrition = query({
  args: { year: v.optional(v.number()) },
  returns: v.union(
    v.null(),
    v.object({
      year: v.number(),
      months: v.array(v.string()),
      offices: v.array(
        v.object({ name: v.string(), values: v.array(v.number()) }),
      ),
      total: v.array(v.number()),
    }),
  ),
  handler: async (ctx, { year }) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx || !ctxHasPermission(orgCtx, "reports:view")) return null;
    const orgId = orgCtx.orgId;
    const targetYear = year ?? new Date().getFullYear();

    const employees = await ctx.db
      .query("employees")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .take(2000);
    const offices = await ctx.db
      .query("offices")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const officeName = new Map(offices.map((o) => [o._id, o.name]));

    // Per office → 12 monthly buckets of terminations.
    const perOffice = new Map<string, number[]>();
    const total = new Array(12).fill(0) as number[];
    const ensure = (name: string) => {
      let arr = perOffice.get(name);
      if (!arr) {
        arr = new Array(12).fill(0);
        perOffice.set(name, arr);
      }
      return arr;
    };

    for (const e of employees) {
      if (!e.exitDate) continue;
      const [y, m] = e.exitDate.split("-").map(Number);
      if (y !== targetYear || !m || m < 1 || m > 12) continue;
      const name = e.officeId ? officeName.get(e.officeId) ?? "—" : "Unassigned";
      ensure(name)[m - 1] += 1;
      total[m - 1] += 1;
    }

    return {
      year: targetYear,
      months: MONTH_LABELS,
      offices: Array.from(perOffice.entries())
        .map(([name, values]) => ({ name, values }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      total,
    };
  },
});

// ─── Leave ────────────────────────────────────────────────────────────────

export const leave = query({
  args: { year: v.optional(v.number()) },
  returns: v.union(
    v.null(),
    v.object({
      year: v.number(),
      summary: v.object({
        allCombinedDays: v.number(),
        comparedToLastYearDays: v.number(),
        avgPerMonthDays: v.number(),
      }),
      utilization: v.array(
        v.object({ name: v.string(), days: v.number(), color: v.string() }),
      ),
      monthly: v.array(v.object({ month: v.string(), days: v.number() })),
    }),
  ),
  handler: async (ctx, { year }) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx || !ctxHasPermission(orgCtx, "reports:view")) return null;
    const orgId = orgCtx.orgId;
    const targetYear = year ?? new Date().getFullYear();

    const requests = await ctx.db
      .query("leaveRequests")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .take(5000);
    const leaveTypes = await ctx.db
      .query("leaveTypes")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const typeName = new Map(leaveTypes.map((t) => [t._id, t.name]));
    const typeColor = new Map(leaveTypes.map((t) => [t._id, t.color]));

    const approved = requests.filter((r) => r.status === "approved");
    const yearOf = (r: Doc<"leaveRequests">) =>
      Number(r.startDate.slice(0, 4));

    let thisYearDays = 0;
    let lastYearDays = 0;
    const utilAgg = new Map<string, { name: string; days: number; color: string }>();
    const monthly = new Array(12).fill(0) as number[];

    for (const r of approved) {
      const y = yearOf(r);
      if (y === targetYear) {
        thisYearDays += r.totalDays;
        const key = String(r.leaveTypeId);
        const cur =
          utilAgg.get(key) ??
          {
            name: typeName.get(r.leaveTypeId) ?? "—",
            days: 0,
            color: typeColor.get(r.leaveTypeId) ?? "#6b7280",
          };
        cur.days += r.totalDays;
        utilAgg.set(key, cur);
        const m = Number(r.startDate.slice(5, 7)) - 1;
        if (m >= 0 && m < 12) monthly[m] += r.totalDays;
      } else if (y === targetYear - 1) {
        lastYearDays += r.totalDays;
      }
    }

    return {
      year: targetYear,
      summary: {
        allCombinedDays: Math.round(thisYearDays * 10) / 10,
        comparedToLastYearDays:
          Math.round((thisYearDays - lastYearDays) * 10) / 10,
        avgPerMonthDays: Math.round((thisYearDays / 12) * 100) / 100,
      },
      utilization: Array.from(utilAgg.values())
        .map((u) => ({ ...u, days: Math.round(u.days * 10) / 10 }))
        .sort((a, b) => b.days - a.days),
      monthly: monthly.map((days, i) => ({
        month: MONTH_LABELS[i],
        days: Math.round(days * 10) / 10,
      })),
    };
  },
});

// ─── Payroll ────────────────────────────────────────────────────────────────

export const payroll = query({
  args: {
    year: v.optional(v.number()),
    departmentId: v.optional(v.id("departments")),
  },
  returns: v.union(
    v.null(),
    v.object({
      year: v.number(),
      currency: v.string(),
      years: v.array(v.number()),
      ytd: v.object({
        totalPayoutCents: v.number(),
        totalPaidCents: v.number(),
        employeeCpfCents: v.number(),
        employerCpfCents: v.number(),
      }),
      comparison: v.object({
        pct: v.union(v.number(), v.null()),
        deltaCents: v.number(),
        currentLabel: v.union(v.string(), v.null()),
        currentCents: v.number(),
        prevLabel: v.union(v.string(), v.null()),
        prevCents: v.number(),
      }),
      monthly: v.array(
        v.object({
          month: v.string(),
          basicCents: v.number(),
          allowancesCents: v.number(),
          employerCpfCents: v.number(),
        }),
      ),
      departments: v.array(
        v.object({ _id: v.id("departments"), name: v.string() }),
      ),
    }),
  ),
  handler: async (ctx, { year, departmentId }) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx || !ctxHasPermission(orgCtx, "payroll:manage")) return null;
    const orgId = orgCtx.orgId;

    const [departments, employees, runs] = await Promise.all([
      ctx.db.query("departments").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
      ctx.db.query("employees").withIndex("by_org", (q) => q.eq("orgId", orgId)).take(2000),
      ctx.db.query("payrollRuns").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
    ]);
    const currency = orgCtx.org.settings.currency;
    const allYears = Array.from(
      new Set(runs.map((r) => Number(r.periodMonth.slice(0, 4)))),
    ).sort((a, b) => b - a);
    const targetYear = year ?? allYears[0] ?? new Date().getFullYear();

    const empDept = new Map(employees.map((e) => [e._id, e.departmentId]));

    // Collect payslips across the year's runs.
    const yearRuns = runs.filter(
      (r) => Number(r.periodMonth.slice(0, 4)) === targetYear,
    );
    const slipsByMonth = new Map<
      string,
      { basic: number; allowances: number; gross: number; net: number; empCpf: number; erCpf: number }
    >();
    let ytdPayout = 0;
    let ytdPaid = 0;
    let ytdEmpCpf = 0;
    let ytdErCpf = 0;

    for (const run of yearRuns) {
      const slips = await ctx.db
        .query("payslips")
        .withIndex("by_run", (q) => q.eq("runId", run._id))
        .collect();
      for (const s of slips) {
        if (departmentId && empDept.get(s.employeeId) !== departmentId) continue;
        const m = run.periodMonth.slice(5, 7);
        const cur =
          slipsByMonth.get(m) ??
          { basic: 0, allowances: 0, gross: 0, net: 0, empCpf: 0, erCpf: 0 };
        cur.basic += s.baseCents;
        cur.allowances += s.allowancesCents;
        cur.gross += s.grossCents;
        cur.net += s.netCents;
        cur.empCpf += s.employeeCpfCents;
        cur.erCpf += s.employerCpfCents;
        slipsByMonth.set(m, cur);
        ytdPayout += s.grossCents + s.employerCpfCents;
        ytdPaid += s.netCents;
        ytdEmpCpf += s.employeeCpfCents;
        ytdErCpf += s.employerCpfCents;
      }
    }

    const monthly = MONTH_LABELS.map((label, i) => {
      const key = String(i + 1).padStart(2, "0");
      const b = slipsByMonth.get(key);
      return {
        month: label,
        basicCents: b?.basic ?? 0,
        allowancesCents: b?.allowances ?? 0,
        employerCpfCents: b?.erCpf ?? 0,
      };
    });

    // Month-over-month comparison on total payout (gross + employer CPF).
    const monthsWithData = Array.from(slipsByMonth.entries())
      .map(([m, v]) => ({ m, total: v.gross + v.erCpf }))
      .sort((a, b) => a.m.localeCompare(b.m));
    const current = monthsWithData[monthsWithData.length - 1] ?? null;
    const prev = monthsWithData[monthsWithData.length - 2] ?? null;
    const deltaCents = (current?.total ?? 0) - (prev?.total ?? 0);
    const pct =
      prev && prev.total > 0
        ? Math.round((deltaCents / prev.total) * 10000) / 100
        : null;
    const labelFor = (m: string | undefined) =>
      m ? `${MONTH_LABELS[Number(m) - 1]} ${targetYear}` : null;

    return {
      year: targetYear,
      currency,
      years: allYears.length > 0 ? allYears : [targetYear],
      ytd: {
        totalPayoutCents: ytdPayout,
        totalPaidCents: ytdPaid,
        employeeCpfCents: ytdEmpCpf,
        employerCpfCents: ytdErCpf,
      },
      comparison: {
        pct,
        deltaCents,
        currentLabel: labelFor(current?.m),
        currentCents: current?.total ?? 0,
        prevLabel: labelFor(prev?.m),
        prevCents: prev?.total ?? 0,
      },
      monthly,
      departments: departments
        .map((d) => ({ _id: d._id, name: d.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
});
