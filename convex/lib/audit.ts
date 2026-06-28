import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Append an audit-log entry. Call from mutations after a meaningful change so
 * the org has a tamper-evident trail (who did what, before/after).
 */
export async function writeAuditLog(
  ctx: MutationCtx,
  args: {
    orgId: Id<"organizations">;
    actorUserId?: Id<"users">;
    action: string;
    entity: string;
    entityId?: string;
    before?: unknown;
    after?: unknown;
    ip?: string;
  },
): Promise<void> {
  await ctx.db.insert("auditLogs", {
    orgId: args.orgId,
    actorUserId: args.actorUserId,
    action: args.action,
    entity: args.entity,
    entityId: args.entityId,
    before: args.before,
    after: args.after,
    ip: args.ip,
  });
}
