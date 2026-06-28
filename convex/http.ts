import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { WebhookEvent } from "@clerk/backend";
import { Webhook } from "svix";
import { transformWebhookData } from "./paymentAttemptTypes";

const http = httpRouter();

http.route({
  path: "/clerk-users-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const event = await validateRequest(request);
    if (!event) {
      return new Response("Error occured", { status: 400 });
    }
    switch ((event as any).type) {
      case "user.created": // intentional fallthrough
      case "user.updated":
        await ctx.runMutation(internal.users.upsertFromClerk, {
          data: event.data as any,
        });
        break;

      case "user.deleted": {
        const clerkUserId = (event.data as any).id!;
        await ctx.runMutation(internal.users.deleteFromClerk, { clerkUserId });
        break;
      }

      case "organization.created": // intentional fallthrough
      case "organization.updated": {
        const org = (event.data as any);
        await ctx.runMutation(internal.organizations.upsertFromClerk, {
          clerkOrgId: org.id,
          name: org.name,
          slug: org.slug ?? undefined,
          imageUrl: org.image_url ?? undefined,
        });
        break;
      }

      case "organization.deleted": {
        const clerkOrgId = (event.data as any).id!;
        await ctx.runMutation(internal.organizations.deleteFromClerk, {
          clerkOrgId,
        });
        break;
      }

      case "organizationMembership.created": // intentional fallthrough
      case "organizationMembership.updated": {
        const m = (event.data as any);
        const pud = m.public_user_data ?? {};
        const name = `${pud.first_name ?? ""} ${pud.last_name ?? ""}`.trim();
        await ctx.runMutation(internal.members.upsertFromClerk, {
          clerkMembershipId: m.id,
          clerkOrgId: m.organization.id,
          clerkUserId: pud.user_id,
          userName: name || pud.identifier || "Unknown",
          userEmail: pud.identifier ?? undefined,
          userImageUrl: pud.image_url ?? undefined,
          clerkRole: m.role ?? undefined,
          status: "active",
        });
        break;
      }

      case "organizationMembership.deleted": {
        const clerkMembershipId = (event.data as any).id!;
        await ctx.runMutation(internal.members.deleteFromClerk, {
          clerkMembershipId,
        });
        break;
      }

      case "paymentAttempt.updated": {
        const paymentAttemptData = transformWebhookData((event as any).data);
        await ctx.runMutation(internal.paymentAttempts.savePaymentAttempt, {
          paymentAttemptData,
        });
        break;
      }

      default:
        console.log("Ignored webhook event", (event as any).type);
    }

    return new Response(null, { status: 200 });
  }),
});

async function validateRequest(req: Request): Promise<WebhookEvent | null> {
  const payloadString = await req.text();
  const svixHeaders = {
    "svix-id": req.headers.get("svix-id")!,
    "svix-timestamp": req.headers.get("svix-timestamp")!,
    "svix-signature": req.headers.get("svix-signature")!,
  };
  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!);
  try {
    return wh.verify(payloadString, svixHeaders) as unknown as WebhookEvent;
  } catch (error) {
    console.error("Error verifying webhook event", error);
    return null;
  }
}

export default http;