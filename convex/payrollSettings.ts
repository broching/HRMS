import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requirePermission } from "./auth";
import { writeAuditLog } from "./lib/audit";
import {
  shgFundConfig,
  sdlConfig,
  payrollApprovalConfig,
} from "./lib/enums";
import { SG_SHG_FUNDS, SG_SDL_DEFAULT } from "./lib/sgDefaults";

// The normalized payroll settings shape (row or seeded defaults).
export interface PayrollSettingsValue {
  shgFunds: Doc<"payrollSettings">["shgFunds"];
  sdl: Doc<"payrollSettings">["sdl"];
  approval: Doc<"payrollSettings">["approval"];
  defaultTemplateId?: Id<"payslipTemplates">;
}

export function defaultPayrollSettings(): PayrollSettingsValue {
  return {
    shgFunds: SG_SHG_FUNDS,
    sdl: SG_SDL_DEFAULT,
    approval: { enabled: false, steps: [] },
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
    approval: row.approval,
    defaultTemplateId: row.defaultTemplateId,
  };
}

const settingsView = v.object({
  shgFunds: v.array(shgFundConfig),
  sdl: sdlConfig,
  approval: payrollApprovalConfig,
  defaultTemplateId: v.union(v.id("payslipTemplates"), v.null()),
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
      approval: s.approval,
      defaultTemplateId: s.defaultTemplateId ?? null,
    };
  },
});

export const save = mutation({
  args: {
    shgFunds: v.array(shgFundConfig),
    sdl: sdlConfig,
    approval: payrollApprovalConfig,
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
        approval: args.approval,
      });
    } else {
      await ctx.db.insert("payrollSettings", {
        orgId,
        shgFunds: args.shgFunds,
        sdl: args.sdl,
        approval: args.approval,
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
