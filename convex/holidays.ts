import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrg, requirePermission } from "./auth";
import { holidayDoc } from "./lib/validators";
import { writeAuditLog } from "./lib/audit";

// List holidays, optionally restricted to a calendar year.
export const list = query({
  args: { year: v.optional(v.number()) },
  returns: v.array(holidayDoc),
  handler: async (ctx, { year }) => {
    const { orgId } = await requireOrg(ctx);
    if (year) {
      return await ctx.db
        .query("holidays")
        .withIndex("by_org_date", (q) =>
          q
            .eq("orgId", orgId)
            .gte("date", `${year}-01-01`)
            .lte("date", `${year}-12-31`),
        )
        .collect();
    }
    return await ctx.db
      .query("holidays")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
  },
});

export const create = mutation({
  args: { date: v.string(), name: v.string() },
  returns: v.id("holidays"),
  handler: async (ctx, args) => {
    const { orgId, userId, org } = await requirePermission(ctx, "leave:config");
    const id = await ctx.db.insert("holidays", {
      orgId,
      date: args.date,
      name: args.name,
      country: org.country,
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "holiday.create",
      entity: "holidays",
      entityId: id,
      after: args,
    });
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("holidays") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { orgId } = await requirePermission(ctx, "leave:config");
    const existing = await ctx.db.get(id);
    if (!existing || existing.orgId !== orgId) {
      throw new Error("Holiday not found.");
    }
    await ctx.db.delete(id);
    return null;
  },
});
