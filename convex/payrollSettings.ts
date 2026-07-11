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
  type CpfConfigValue,
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
}

export function defaultPayrollSettings(): PayrollSettingsValue {
  return {
    shgFunds: SG_SHG_FUNDS,
    sdl: SG_SDL_DEFAULT,
    cpf: SG_CPF_DEFAULT,
    approval: { enabled: false, steps: [] },
    showSignaturesToEmployees: false,
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
  };
}

const settingsView = v.object({
  shgFunds: v.array(shgFundConfig),
  sdl: sdlConfig,
  cpf: cpfConfig,
  approval: payrollApprovalConfig,
  defaultTemplateId: v.union(v.id("payslipTemplates"), v.null()),
  showSignaturesToEmployees: v.boolean(),
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
    };
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
