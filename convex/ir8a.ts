import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requirePermission } from "./auth";
import { getPayrollSettings } from "./payrollSettings";
import { ir8aCategory, type Ir8aCategory } from "./lib/enums";
import { PRESET_CATEGORY_BY_LABEL } from "./lib/ir8aPresets";
import { writeAuditLog } from "./lib/audit";
import { encryptId, decryptId } from "./lib/crypto";
import { maskId } from "./employees";

/**
 * IR8A (SG employer's annual employee income return) generation + review.
 *
 * The engine rolls up each employee's **finalized/paid payslips** for a calendar
 * year into IR8A income categories, using the org's `ir8aLabelMap`
 * ("classify once"). Base pay / overtime map to gross salary automatically;
 * unmapped earning labels fall back to `otherIncome` and raise a variance flag
 * for HR to reclassify. Employee compulsory CPF comes straight from the
 * payslip's `employeeCpfCents`. Encrypted full NRIC/FIN is decrypted only at AIS
 * export (Phase 5), never here.
 */

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

// Resolve an earning label to an IR8A category. Base pay + overtime are always
// gross salary; everything else consults the org map, else falls back (flagged).
function resolveCategory(
  label: string,
  map: Map<string, Ir8aCategory>,
): { category: Ir8aCategory; mapped: boolean } {
  const n = normalize(label);
  if (n.startsWith("base pay") || n.startsWith("overtime")) {
    return { category: "grossSalary", mapped: true };
  }
  const hit = map.get(n);
  if (hit) return { category: hit, mapped: true };
  // Fall back to the system-default classification for well-known items, so
  // presets are handled even if never explicitly saved to the org map.
  const preset = PRESET_CATEGORY_BY_LABEL.get(n);
  if (preset) return { category: preset, mapped: true };
  return { category: "otherIncome", mapped: false };
}

function formatAddress(a?: {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}): string | undefined {
  if (!a) return undefined;
  const parts = [a.line1, a.line2, a.city, a.state, a.postalCode, a.country]
    .map((p) => p?.trim())
    .filter((p): p is string => !!p);
  return parts.length ? parts.join(", ") : undefined;
}

// ─── Validators ────────────────────────────────────────────────────────────

const lineBreakdownItem = v.object({
  label: v.string(),
  cents: v.number(),
  category: ir8aCategory,
  mapped: v.boolean(),
});
const categoryAmount = v.object({ category: ir8aCategory, cents: v.number() });

const ir8aFormView = v.object({
  _id: v.id("ir8aForms"),
  employeeId: v.id("employees"),
  year: v.string(),
  fullName: v.string(),
  designation: v.optional(v.string()),
  dob: v.optional(v.string()),
  nationality: v.optional(v.string()),
  addressText: v.optional(v.string()),
  commenceDate: v.optional(v.string()),
  ceaseDate: v.optional(v.string()),
  idNumberMasked: v.optional(v.string()),
  hasFullId: v.boolean(),
  lineBreakdown: v.array(lineBreakdownItem),
  incomeByCategory: v.array(categoryAmount),
  grossIncomeCents: v.number(),
  employeeCpfCents: v.number(),
  overridden: v.boolean(),
  flags: v.array(v.string()),
});

const batchView = v.object({
  _id: v.id("ir8aBatches"),
  year: v.string(),
  status: v.union(v.literal("draft"), v.literal("finalized")),
  generatedAt: v.number(),
  finalizedAt: v.optional(v.number()),
});

// ─── Generation ──────────────────────────────────────────────────────────────

export const generate = mutation({
  args: { year: v.string() },
  returns: v.object({ batchId: v.id("ir8aBatches"), formCount: v.number() }),
  handler: async (ctx, { year }) => {
    const { orgId, userId } = await requirePermission(ctx, "payroll:ir8a");
    return await runGeneration(ctx, orgId, userId, year);
  },
});

// Core generation, shared by the public mutation (after auth). Rolls the year's
// finalized/paid payslips into one IR8A form per employee-with-income.
export async function runGeneration(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  userId: Id<"users">,
  year: string,
): Promise<{ batchId: Id<"ir8aBatches">; formCount: number }> {
  {
    const existingBatch = await ctx.db
      .query("ir8aBatches")
      .withIndex("by_org_year", (q) => q.eq("orgId", orgId).eq("year", year))
      .unique();
    if (existingBatch?.status === "finalized") {
      throw new Error(
        `IR8A for ${year} is finalized. Reopen it before regenerating.`,
      );
    }
    // Clear any prior draft batch + its forms so generate is idempotent.
    if (existingBatch) {
      const oldForms = await ctx.db
        .query("ir8aForms")
        .withIndex("by_batch", (q) => q.eq("batchId", existingBatch._id))
        .collect();
      for (const f of oldForms) await ctx.db.delete(f._id);
      await ctx.db.delete(existingBatch._id);
    }

    const settings = await getPayrollSettings(ctx, orgId);
    const map = new Map<string, Ir8aCategory>(
      settings.ir8aLabelMap.map((m) => [m.label, m.category]),
    );

    const batchId = await ctx.db.insert("ir8aBatches", {
      orgId,
      year,
      status: "draft",
      generatedAt: Date.now(),
      generatedBy: userId,
    });

    const employees = await ctx.db
      .query("employees")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();

    let formCount = 0;
    for (const emp of employees) {
      if (emp.isVacant) continue;
      const slips = await ctx.db
        .query("payslips")
        .withIndex("by_employee_period", (q) =>
          q
            .eq("employeeId", emp._id)
            .gte("periodMonth", `${year}-01`)
            .lte("periodMonth", `${year}-12`),
        )
        .collect();
      // Only actually-committed income counts for IR8A.
      const paid = slips.filter(
        (s) => s.status === "finalized" || s.status === "paid",
      );
      if (paid.length === 0) continue;

      const byLabel = new Map<string, number>();
      let employeeCpfCents = 0;
      for (const s of paid) {
        employeeCpfCents += s.employeeCpfCents;
        for (const l of s.lines) {
          if (l.type !== "earning") continue;
          byLabel.set(l.label, (byLabel.get(l.label) ?? 0) + l.amountCents);
        }
      }

      const lineBreakdown = [...byLabel.entries()].map(([label, cents]) => {
        const { category, mapped } = resolveCategory(label, map);
        return { label, cents, category, mapped };
      });
      const catTotals = new Map<Ir8aCategory, number>();
      for (const lb of lineBreakdown) {
        catTotals.set(lb.category, (catTotals.get(lb.category) ?? 0) + lb.cents);
      }
      const incomeByCategory = [...catTotals.entries()].map(
        ([category, cents]) => ({ category, cents }),
      );
      const grossIncomeCents = incomeByCategory.reduce(
        (s, c) => s + c.cents,
        0,
      );

      const commenceDate =
        emp.joinDate && emp.joinDate.slice(0, 4) === year
          ? emp.joinDate
          : undefined;
      const ceaseDate =
        emp.exitDate && emp.exitDate.slice(0, 4) === year
          ? emp.exitDate
          : undefined;

      const hasFullId = !!emp.idNumberEncrypted;
      const flags: string[] = [];
      if (!hasFullId) flags.push("missing_id");
      if (lineBreakdown.some((l) => !l.mapped)) flags.push("unmapped_income");
      if (grossIncomeCents < 0 || incomeByCategory.some((c) => c.cents < 0)) {
        flags.push("negative");
      }

      const position = emp.positionId ? await ctx.db.get(emp.positionId) : null;

      await ctx.db.insert("ir8aForms", {
        orgId,
        batchId,
        employeeId: emp._id,
        year,
        // Legal name (as per NRIC), not preferredName.
        fullName: `${emp.firstName} ${emp.lastName}`.trim(),
        designation: position?.title,
        dob: emp.dob,
        nationality: emp.nationality,
        addressText: formatAddress(emp.address),
        commenceDate,
        ceaseDate,
        idNumberMasked: emp.idNumberMasked,
        hasFullId,
        lineBreakdown,
        incomeByCategory,
        grossIncomeCents,
        employeeCpfCents,
        overridden: false,
        flags,
      });
      formCount++;
    }

    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "ir8a.generate",
      entity: "ir8aBatches",
      entityId: batchId,
      after: { year, formCount },
    });
    return { batchId, formCount };
  }
}

// ─── Reads ───────────────────────────────────────────────────────────────────

// All IR8A batches for the org (year picker + status).
export const listBatches = query({
  args: {},
  returns: v.array(batchView),
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "payroll:ir8a");
    const batches = await ctx.db
      .query("ir8aBatches")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    batches.sort((a, b) => (a.year < b.year ? 1 : -1));
    return batches.map((b) => ({
      _id: b._id,
      year: b.year,
      status: b.status,
      generatedAt: b.generatedAt,
      finalizedAt: b.finalizedAt,
    }));
  },
});

// The batch + all employee forms for a given year (null if not generated).
export const getByYear = query({
  args: { year: v.string() },
  returns: v.union(
    v.null(),
    v.object({ batch: batchView, forms: v.array(ir8aFormView) }),
  ),
  handler: async (ctx, { year }) => {
    const { orgId } = await requirePermission(ctx, "payroll:ir8a");
    const batch = await ctx.db
      .query("ir8aBatches")
      .withIndex("by_org_year", (q) => q.eq("orgId", orgId).eq("year", year))
      .unique();
    if (!batch) return null;
    const forms = await ctx.db
      .query("ir8aForms")
      .withIndex("by_batch", (q) => q.eq("batchId", batch._id))
      .collect();
    forms.sort((a, b) => a.fullName.localeCompare(b.fullName));
    return {
      batch: {
        _id: batch._id,
        year: batch.year,
        status: batch.status,
        generatedAt: batch.generatedAt,
        finalizedAt: batch.finalizedAt,
      },
      forms: forms.map((f) => ({
        _id: f._id,
        employeeId: f.employeeId,
        year: f.year,
        fullName: f.fullName,
        designation: f.designation,
        dob: f.dob,
        nationality: f.nationality,
        addressText: f.addressText,
        commenceDate: f.commenceDate,
        ceaseDate: f.ceaseDate,
        idNumberMasked: f.idNumberMasked,
        hasFullId: f.hasFullId,
        lineBreakdown: f.lineBreakdown,
        incomeByCategory: f.incomeByCategory,
        grossIncomeCents: f.grossIncomeCents,
        employeeCpfCents: f.employeeCpfCents,
        overridden: f.overridden,
        flags: f.flags,
      })),
    };
  },
});

// ─── Review / edit ─────────────────────────────────────────────────────────

export const updateForm = mutation({
  args: {
    formId: v.id("ir8aForms"),
    // Replace the aggregated income (HR override).
    incomeByCategory: v.optional(v.array(categoryAmount)),
    // Particulars edits.
    designation: v.optional(v.string()),
    commenceDate: v.optional(v.union(v.string(), v.null())),
    ceaseDate: v.optional(v.union(v.string(), v.null())),
    // Enter a full NRIC/FIN when missing — encrypted onto the employee record.
    fullId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(ctx, "payroll:ir8a");
    const form = await ctx.db.get(args.formId);
    if (!form || form.orgId !== orgId) throw new Error("IR8A form not found.");
    const batch = await ctx.db.get(form.batchId);
    if (batch?.status === "finalized") {
      throw new Error("This IR8A batch is finalized. Reopen it to edit.");
    }

    const patch: Record<string, unknown> = {};
    const flags = new Set(form.flags);

    if (args.incomeByCategory) {
      patch.incomeByCategory = args.incomeByCategory;
      patch.grossIncomeCents = args.incomeByCategory.reduce(
        (s, c) => s + c.cents,
        0,
      );
      patch.overridden = true;
      // A manual override resolves the unmapped-income flag.
      flags.delete("unmapped_income");
      if (
        (patch.grossIncomeCents as number) < 0 ||
        args.incomeByCategory.some((c) => c.cents < 0)
      ) {
        flags.add("negative");
      } else {
        flags.delete("negative");
      }
    }
    if (args.designation !== undefined) patch.designation = args.designation;
    if (args.commenceDate !== undefined) {
      patch.commenceDate = args.commenceDate ?? undefined;
    }
    if (args.ceaseDate !== undefined) {
      patch.ceaseDate = args.ceaseDate ?? undefined;
    }

    if (args.fullId && args.fullId.trim()) {
      const emp = await ctx.db.get(form.employeeId);
      if (emp && emp.orgId === orgId) {
        const masked = maskId(args.fullId);
        await ctx.db.patch(emp._id, {
          idNumberMasked: masked.masked,
          idNumberLast4: masked.last4,
          idNumberEncrypted: await encryptId(args.fullId),
        });
        patch.idNumberMasked = masked.masked;
        patch.hasFullId = true;
        flags.delete("missing_id");
      }
    }

    patch.flags = [...flags];
    await ctx.db.patch(args.formId, patch);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "ir8a.update_form",
      entity: "ir8aForms",
      entityId: args.formId,
    });
    return null;
  },
});

export const finalize = mutation({
  args: { batchId: v.id("ir8aBatches") },
  returns: v.null(),
  handler: async (ctx, { batchId }) => {
    const { orgId, userId } = await requirePermission(ctx, "payroll:ir8a");
    const batch = await ctx.db.get(batchId);
    if (!batch || batch.orgId !== orgId) throw new Error("IR8A batch not found.");
    if (batch.status === "finalized") return null;
    await ctx.db.patch(batchId, {
      status: "finalized",
      finalizedAt: Date.now(),
      finalizedBy: userId,
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "ir8a.finalize",
      entity: "ir8aBatches",
      entityId: batchId,
    });
    return null;
  },
});

export const reopen = mutation({
  args: { batchId: v.id("ir8aBatches") },
  returns: v.null(),
  handler: async (ctx, { batchId }) => {
    const { orgId, userId } = await requirePermission(ctx, "payroll:ir8a");
    const batch = await ctx.db.get(batchId);
    if (!batch || batch.orgId !== orgId) throw new Error("IR8A batch not found.");
    if (batch.status === "draft") return null;
    await ctx.db.patch(batchId, {
      status: "draft",
      finalizedAt: undefined,
      finalizedBy: undefined,
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "ir8a.reopen",
      entity: "ir8aBatches",
      entityId: batchId,
    });
    return null;
  },
});

// ─── AIS export ──────────────────────────────────────────────────────────────

const aisRow = v.object({
  fullName: v.string(),
  nric: v.string(), // decrypted full NRIC/FIN (empty if none on file)
  designation: v.string(),
  dob: v.string(),
  nationality: v.string(),
  address: v.string(),
  commenceDate: v.string(),
  ceaseDate: v.string(),
  // Whole-dollar amounts (income rounded down per IRAS).
  grossSalary: v.number(),
  bonus: v.number(),
  directorsFee: v.number(),
  allowancesTaxable: v.number(),
  commission: v.number(),
  gratuityExGratia: v.number(),
  otherIncome: v.number(),
  grossRemuneration: v.number(),
  employeeCpf: v.number(), // rounded up per IRAS
});

// Export the finalized year's IR8A records for AIS submission. This is the one
// place the encrypted NRIC/FIN is decrypted — gated by payroll:manage and only
// for a finalized batch. Amounts are whole dollars (income floored, deductions
// ceiled) per IRAS rules. The client formats these rows into the submission
// file. NOTE: the exact AIS fixed-format field layout must be validated against
// IRAS' current technical spec before live submission.
export const exportAisRows = query({
  args: { year: v.string() },
  returns: v.array(aisRow),
  handler: async (ctx, { year }) => {
    const { orgId } = await requirePermission(ctx, "payroll:ais");
    const batch = await ctx.db
      .query("ir8aBatches")
      .withIndex("by_org_year", (q) => q.eq("orgId", orgId).eq("year", year))
      .unique();
    if (!batch) return [];
    if (batch.status !== "finalized") {
      throw new Error("Finalize the IR8A batch before exporting the AIS file.");
    }
    const forms = await ctx.db
      .query("ir8aForms")
      .withIndex("by_batch", (q) => q.eq("batchId", batch._id))
      .collect();
    forms.sort((a, b) => a.fullName.localeCompare(b.fullName));

    const rows = [];
    for (const f of forms) {
      const emp = await ctx.db.get(f.employeeId);
      let nric = "";
      if (emp?.idNumberEncrypted) {
        try {
          nric = await decryptId(emp.idNumberEncrypted);
        } catch {
          nric = "";
        }
      }
      const cat = (c: Ir8aCategory) =>
        Math.floor(
          (f.incomeByCategory.find((x) => x.category === c)?.cents ?? 0) / 100,
        );
      rows.push({
        fullName: f.fullName,
        nric,
        designation: f.designation ?? "",
        dob: f.dob ?? "",
        nationality: f.nationality ?? "",
        address: f.addressText ?? "",
        commenceDate: f.commenceDate ?? "",
        ceaseDate: f.ceaseDate ?? "",
        grossSalary: cat("grossSalary"),
        bonus: cat("bonus"),
        directorsFee: cat("directorsFee"),
        allowancesTaxable: cat("allowancesTaxable"),
        commission: cat("commission"),
        gratuityExGratia: cat("gratuityExGratia"),
        otherIncome: cat("otherIncome"),
        grossRemuneration: Math.floor(f.grossIncomeCents / 100),
        employeeCpf: Math.ceil(f.employeeCpfCents / 100),
      });
    }
    return rows;
  },
});

// ─── Classification settings ─────────────────────────────────────────────────

// Distinct earning labels seen across the org's payslips, merged with the
// current label→category map — powers the IR8A classification settings tab.
// Base pay / overtime are auto-classified as gross salary and excluded here.
export const earningLabelOptions = query({
  args: {},
  returns: v.array(
    v.object({
      label: v.string(),
      normalized: v.string(),
      count: v.number(),
      category: v.union(ir8aCategory, v.null()),
    }),
  ),
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "payroll:classify");
    const settings = await getPayrollSettings(ctx, orgId);
    const map = new Map<string, Ir8aCategory>(
      settings.ir8aLabelMap.map((m) => [m.label, m.category]),
    );

    const employees = await ctx.db
      .query("employees")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    // normalized → { display label, occurrence count }
    const seen = new Map<string, { label: string; count: number }>();
    for (const e of employees) {
      const slips = await ctx.db
        .query("payslips")
        .withIndex("by_employee", (q) => q.eq("employeeId", e._id))
        .collect();
      for (const s of slips) {
        for (const l of s.lines) {
          if (l.type !== "earning") continue;
          const norm = l.label.trim().toLowerCase();
          if (norm.startsWith("base pay") || norm.startsWith("overtime")) continue;
          const cur = seen.get(norm);
          if (cur) cur.count += 1;
          else seen.set(norm, { label: l.label.trim(), count: 1 });
        }
      }
    }
    // Also surface configured compensation allowances, so a newly-added
    // allowance is classifiable immediately — before it has hit any payslip.
    const comps = await ctx.db
      .query("compensation")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    for (const c of comps) {
      for (const a of c.allowances) {
        const norm = a.name.trim().toLowerCase();
        if (!norm || norm.startsWith("base pay") || norm.startsWith("overtime")) {
          continue;
        }
        if (!seen.has(norm)) seen.set(norm, { label: a.name.trim(), count: 0 });
      }
    }
    // Keep any mapped labels that no longer appear anywhere (still editable).
    for (const norm of map.keys()) {
      if (!seen.has(norm)) seen.set(norm, { label: norm, count: 0 });
    }

    return [...seen.entries()]
      .map(([normalized, info]) => ({
        label: info.label,
        normalized,
        count: info.count,
        // Explicit org mapping wins; otherwise a system-default classification
        // for well-known items, so common earnings arrive pre-classified.
        category: map.get(normalized) ?? PRESET_CATEGORY_BY_LABEL.get(normalized) ?? null,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  },
});
