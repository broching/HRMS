import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requirePermission } from "./auth";
import { writeAuditLog } from "./lib/audit";
import {
  shgFundConfig,
  sdlConfig,
  cpfConfig,
  payrollApprovalConfig,
  ir8aCategory,
  type CpfConfigValue,
  type Ir8aCategory,
} from "./lib/enums";
import { SG_SHG_FUNDS, SG_SDL_DEFAULT, SG_CPF_DEFAULT } from "./lib/sgDefaults";

// The normalized payroll settings shape (row or seeded defaults).
export interface PayrollSettingsValue {
  shgFunds: Doc<"payrollSettings">["shgFunds"];
  sdl: Doc<"payrollSettings">["sdl"];
  cpf: CpfConfigValue;
  approval: Doc<"payrollSettings">["approval"];
  defaultTemplateId?: Id<"payslipTemplates">;
  showSignaturesToEmployees: boolean;
  ir8aLabelMap: { label: string; category: Ir8aCategory }[];
  aisEmployer: boolean;
}

export function defaultPayrollSettings(): PayrollSettingsValue {
  return {
    shgFunds: SG_SHG_FUNDS,
    sdl: SG_SDL_DEFAULT,
    cpf: SG_CPF_DEFAULT,
    approval: { enabled: false, steps: [] },
    showSignaturesToEmployees: false,
    ir8aLabelMap: [],
    aisEmployer: false,
  };
}

// Shared resolver used by the payroll engine + settings UI: the org's row, or
// seeded defaults when it hasn't been configured yet.
export async function getPayrollSettings(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
): Promise<PayrollSettingsValue> {
  const row = await ctx.db
    .query("payrollSettings")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .unique();
  if (!row) return defaultPayrollSettings();
  return {
    shgFunds: row.shgFunds,
    sdl: row.sdl,
    cpf: row.cpf ?? SG_CPF_DEFAULT,
    approval: row.approval,
    defaultTemplateId: row.defaultTemplateId,
    showSignaturesToEmployees: row.showSignaturesToEmployees === true,
    ir8aLabelMap: row.ir8aLabelMap ?? [],
    aisEmployer: row.aisEmployer === true,
  };
}

// Upsert label→IR8A-category mappings into the org's map, keeping every other
// mapping intact (last write wins per label). Called when a payroll item is
// classified at creation time (compensation allowances, one-off additions), so
// the classification is remembered org-wide and drives IR8A generation.
export async function upsertIr8aLabels(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  items: { label: string; category: Ir8aCategory }[],
): Promise<void> {
  const clean = items.filter((i) => i.label.trim());
  if (clean.length === 0) return;
  const existing = await ctx.db
    .query("payrollSettings")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .unique();
  const map = new Map<string, Ir8aCategory>(
    (existing?.ir8aLabelMap ?? []).map((m) => [m.label, m.category]),
  );
  for (const i of clean) map.set(i.label.trim().toLowerCase(), i.category);
  const next = [...map.entries()].map(([label, category]) => ({
    label,
    category,
  }));
  if (existing) {
    await ctx.db.patch(existing._id, { ir8aLabelMap: next });
  } else {
    await ctx.db.insert("payrollSettings", {
      orgId,
      shgFunds: SG_SHG_FUNDS,
      sdl: SG_SDL_DEFAULT,
      approval: { enabled: false, steps: [] },
      ir8aLabelMap: next,
    });
  }
}

const settingsView = v.object({
  shgFunds: v.array(shgFundConfig),
  sdl: sdlConfig,
  cpf: cpfConfig,
  approval: payrollApprovalConfig,
  defaultTemplateId: v.union(v.id("payslipTemplates"), v.null()),
  showSignaturesToEmployees: v.boolean(),
  ir8aLabelMap: v.array(v.object({ label: v.string(), category: ir8aCategory })),
  aisEmployer: v.boolean(),
});

export const get = query({
  args: {},
  returns: settingsView,
  handler: async (ctx) => {
    const { orgId } = await requirePermission(ctx, "payroll:manage");
    const s = await getPayrollSettings(ctx, orgId);
    return {
      shgFunds: s.shgFunds,
      sdl: s.sdl,
      cpf: s.cpf,
      approval: s.approval,
      defaultTemplateId: s.defaultTemplateId ?? null,
      showSignaturesToEmployees: s.showSignaturesToEmployees,
      ir8aLabelMap: s.ir8aLabelMap,
      aisEmployer: s.aisEmployer,
    };
  },
});

// Toggle whether the org is an AIS-registered employer (drives the AIS statement
// on IR8A PDFs).
export const setAisEmployer = mutation({
  args: { enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { enabled }) => {
    const { orgId } = await requirePermission(ctx, "payroll:ais");
    const existing = await ctx.db
      .query("payrollSettings")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { aisEmployer: enabled });
    } else {
      await ctx.db.insert("payrollSettings", {
        orgId,
        shgFunds: SG_SHG_FUNDS,
        sdl: SG_SDL_DEFAULT,
        approval: { enabled: false, steps: [] },
        aisEmployer: enabled,
      });
    }
    return null;
  },
});

// Save just the IR8A income-classification map (label → IR8A category). Kept
// separate so the IR8A settings tab doesn't have to round-trip the whole
// payroll config.
export const saveIr8aMap = mutation({
  args: {
    ir8aLabelMap: v.array(
      v.object({ label: v.string(), category: ir8aCategory }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { ir8aLabelMap }) => {
    const { orgId, userId } = await requirePermission(ctx, "payroll:classify");
    // Normalize labels (lowercased/trimmed) and drop empties/dupes (last wins).
    const byLabel = new Map<string, Ir8aCategory>();
    for (const m of ir8aLabelMap) {
      const label = m.label.trim().toLowerCase();
      if (label) byLabel.set(label, m.category);
    }
    const normalized = [...byLabel.entries()].map(([label, category]) => ({
      label,
      category,
    }));
    const existing = await ctx.db
      .query("payrollSettings")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ir8aLabelMap: normalized });
    } else {
      await ctx.db.insert("payrollSettings", {
        orgId,
        shgFunds: SG_SHG_FUNDS,
        sdl: SG_SDL_DEFAULT,
        approval: { enabled: false, steps: [] },
        ir8aLabelMap: normalized,
      });
    }
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "payroll.ir8a_map_save",
      entity: "payrollSettings",
    });
    return null;
  },
});

export const save = mutation({
  args: {
    shgFunds: v.array(shgFundConfig),
    sdl: sdlConfig,
    cpf: v.optional(cpfConfig),
    approval: payrollApprovalConfig,
    showSignaturesToEmployees: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(ctx, "payroll:manage");
    const existing = await ctx.db
      .query("payrollSettings")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        shgFunds: args.shgFunds,
        sdl: args.sdl,
        cpf: args.cpf ?? existing.cpf,
        approval: args.approval,
        showSignaturesToEmployees: args.showSignaturesToEmployees ?? false,
      });
    } else {
      await ctx.db.insert("payrollSettings", {
        orgId,
        shgFunds: args.shgFunds,
        sdl: args.sdl,
        cpf: args.cpf,
        approval: args.approval,
        showSignaturesToEmployees: args.showSignaturesToEmployees ?? false,
      });
    }
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "payroll.settings_save",
      entity: "payrollSettings",
    });
    return null;
  },
});

// Save just the CPF rate tables (age bands, OW ceiling, PR graduated rates).
export const saveCpf = mutation({
  args: { cpf: cpfConfig },
  returns: v.null(),
  handler: async (ctx, { cpf }) => {
    const { orgId, userId } = await requirePermission(ctx, "payroll:manage");
    const existing = await ctx.db
      .query("payrollSettings")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { cpf });
    } else {
      await ctx.db.insert("payrollSettings", {
        orgId,
        shgFunds: SG_SHG_FUNDS,
        sdl: SG_SDL_DEFAULT,
        cpf,
        approval: { enabled: false, steps: [] },
      });
    }
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "payroll.cpf_save",
      entity: "payrollSettings",
    });
    return null;
  },
});

// Reset CPF tables to seeded SG defaults.
export const seedCpfDefaults = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx: MutationCtx) => {
    const { orgId } = await requirePermission(ctx, "payroll:manage");
    const existing = await ctx.db
      .query("payrollSettings")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { cpf: SG_CPF_DEFAULT });
    } else {
      await ctx.db.insert("payrollSettings", {
        orgId,
        shgFunds: SG_SHG_FUNDS,
        sdl: SG_SDL_DEFAULT,
        cpf: SG_CPF_DEFAULT,
        approval: { enabled: false, steps: [] },
      });
    }
    return null;
  },
});

// Reset the fund tables + SDL to seeded SG defaults (leaves approval untouched).
export const seedFundDefaults = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx: MutationCtx) => {
    const { orgId } = await requirePermission(ctx, "payroll:manage");
    const existing = await ctx.db
      .query("payrollSettings")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        shgFunds: SG_SHG_FUNDS,
        sdl: SG_SDL_DEFAULT,
      });
    } else {
      await ctx.db.insert("payrollSettings", {
        orgId,
        shgFunds: SG_SHG_FUNDS,
        sdl: SG_SDL_DEFAULT,
        approval: { enabled: false, steps: [] },
      });
    }
    return null;
  },
});
