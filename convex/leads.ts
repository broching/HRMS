import { mutation } from "./_generated/server";
import { v } from "convex/values";

// PUBLIC endpoint (no authentication) backing the LeadMighty landing page's
// "Contact us" form. Everything written here is untrusted input, so values are
// trimmed, length-capped, and the email is shape-checked before insert.
export const submitLead = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    company: v.optional(v.string()),
    product: v.optional(v.string()),
    message: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const name = args.name.trim().slice(0, 120);
    const email = args.email.trim().toLowerCase().slice(0, 200);
    const message = args.message.trim().slice(0, 4000);
    const company = args.company?.trim().slice(0, 160);

    if (!name || !email || !message) {
      throw new Error("Please fill in your name, email, and a message.");
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new Error("That email address doesn't look right.");
    }

    await ctx.db.insert("contactLeads", {
      name,
      email,
      message,
      company: company || undefined,
      product: args.product,
      source: "landing",
    });
    return null;
  },
});
