import { internalAction, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  featureForType,
  routeForNotification,
  ctaLabelForType,
} from "./lib/notificationRoutes";
import { renderNotificationEmail } from "./lib/emailTemplate";

// The frontend base URL used to build absolute CTA links in emails. Set the
// `APP_URL` Convex env var to your deployed app origin (e.g.
// https://app.example.com). Falls back to localhost for dev.
function appBaseUrl(): string {
  const raw = process.env.APP_URL ?? "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

const entityRefValidator = v.optional(
  v.object({ table: v.string(), id: v.string() }),
);

// Resolve everything needed to send a notification email — but only if the
// org has opted the feature into email and the recipient has an address.
// Returns null (no email) otherwise. All DB access lives here so the action
// stays a thin sender.
export const buildNotificationEmail = internalQuery({
  args: {
    orgId: v.id("organizations"),
    recipientUserId: v.id("users"),
    type: v.string(),
    title: v.string(),
    body: v.optional(v.string()),
    entityRef: entityRefValidator,
  },
  returns: v.union(
    v.null(),
    v.object({
      to: v.string(),
      subject: v.string(),
      html: v.string(),
      fromName: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const feature = featureForType(args.type);
    if (!feature) return null;

    const settings = await ctx.db
      .query("emailSettings")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .unique();
    if (!settings) return null;

    // Resolve this module's config, falling back to the legacy flat fields for
    // orgs configured before per-module settings existed.
    const mod = settings.modules?.[feature];
    const enabled = mod?.enabled ?? settings.features?.[feature] ?? false;
    if (!enabled) return null;

    const accentColor = mod?.accentColor ?? settings.accentColor;
    const fontFamily = mod?.fontFamily;
    const footerText = mod?.footerText ?? settings.footerText;
    const fromNameSetting = mod?.fromName ?? settings.fromName;

    const user = await ctx.db.get(args.recipientUserId);
    const to = user?.email?.trim();
    if (!to) return null;

    const org = await ctx.db.get(args.orgId);
    const orgName = org?.name ?? "Your workspace";

    const logoUrl = settings.logoStorageId
      ? await ctx.storage.getUrl(settings.logoStorageId)
      : null;

    const ctaUrl = `${appBaseUrl()}${routeForNotification(args.type)}`;

    const html = renderNotificationEmail({
      orgName,
      title: args.title,
      body: args.body,
      ctaUrl,
      ctaLabel: ctaLabelForType(args.type),
      accentColor,
      fontFamily,
      logoUrl,
      footerText,
    });

    return {
      to,
      subject: args.title,
      html,
      fromName: fromNameSetting?.trim() || orgName,
    };
  },
});

// Fire-and-forget email sender scheduled from mutations after an in-app
// notification is created. No-ops gracefully when email is disabled for the
// feature or when RESEND_API_KEY isn't configured.
export const sendNotificationEmail = internalAction({
  args: {
    orgId: v.id("organizations"),
    recipientUserId: v.id("users"),
    type: v.string(),
    title: v.string(),
    body: v.optional(v.string()),
    entityRef: entityRefValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const built = await ctx.runQuery(
      internal.email.buildNotificationEmail,
      args,
    );
    if (!built) return null;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn(
        "[email] RESEND_API_KEY not set — skipping notification email.",
      );
      return null;
    }
    // Resend requires a verified domain sender; `onboarding@resend.dev` works
    // for testing but only delivers to the Resend account owner.
    const fromEmail = process.env.RESEND_FROM ?? "onboarding@resend.dev";
    const from = `${built.fromName} <${fromEmail}>`;

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: built.to,
          subject: built.subject,
          html: built.html,
        }),
      });
      if (!res.ok) {
        console.error(
          "[email] Resend send failed",
          res.status,
          await res.text(),
        );
      }
    } catch (e) {
      console.error("[email] Resend request threw", e);
    }
    return null;
  },
});
