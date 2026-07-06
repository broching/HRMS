import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import {
  SG_LEAVE_TYPES,
  SG_HOLIDAYS_2026,
  CLAIM_TYPE_DEFAULTS,
  defaultLeavePolicyFields,
} from "./lib/sgDefaults";
import { ensureDefaultCompetencies } from "./competencies";

/**
 * Per-organization seeding, run once when an organization is first synced
 * from Clerk (see organizations.upsertFromClerk). Seeds the Singapore default
 * leave types and public holidays. Idempotent: skips if leave types exist.
 */
export const seedOrganization = internalMutation({
  args: { orgId: v.id("organizations") },
  returns: v.null(),
  handler: async (ctx, { orgId }) => {
    const existing = await ctx.db
      .query("leaveTypes")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .first();
    if (existing) return null;

    for (const lt of SG_LEAVE_TYPES) {
      const leaveTypeId = await ctx.db.insert("leaveTypes", { orgId, ...lt });
      await ctx.db.insert("leavePolicies", {
        orgId,
        leaveTypeId,
        ...defaultLeavePolicyFields(lt),
      });
    }
    for (const h of SG_HOLIDAYS_2026) {
      await ctx.db.insert("holidays", {
        orgId,
        date: h.date,
        name: h.name,
        country: "SG",
      });
    }
    for (const ct of CLAIM_TYPE_DEFAULTS) {
      await ctx.db.insert("claimTypes", { orgId, ...ct });
    }
    // Protected default office so there's always somewhere to assign employees.
    await ctx.db.insert("offices", {
      orgId,
      name: "Singapore",
      timezone: "Asia/Singapore",
      defaultCurrency: "SGD",
      isDefault: true,
      qrEnabled: false,
    });
    await ensureDefaultCompetencies(ctx, orgId);
    return null;
  },
});
