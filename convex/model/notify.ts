import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

export type NotifyEntityRef = { table: string; id: string };

export type PushNotificationArgs = {
  orgId: Id<"organizations">;
  recipientUserId: Id<"users">;
  type: string;
  title: string;
  body?: string;
  entityRef?: NotifyEntityRef;
};

/**
 * Single entry point for raising a notification. Inserts the in-app row and
 * schedules the email sender, which itself no-ops unless the org has opted the
 * feature into email. Every feature that used to `ctx.db.insert("notifications")`
 * inline should route through here so email delivery stays consistent.
 */
export async function pushNotification(
  ctx: MutationCtx,
  args: PushNotificationArgs,
): Promise<void> {
  await ctx.db.insert("notifications", {
    orgId: args.orgId,
    recipientUserId: args.recipientUserId,
    type: args.type,
    title: args.title,
    body: args.body,
    entityRef: args.entityRef,
    read: false,
  });
  await ctx.scheduler.runAfter(0, internal.email.sendNotificationEmail, {
    orgId: args.orgId,
    recipientUserId: args.recipientUserId,
    type: args.type,
    title: args.title,
    body: args.body,
    entityRef: args.entityRef,
  });
}
