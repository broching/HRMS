import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { publicBoard, publicJob } from "./lib/validators";

// PUBLIC job-board endpoints (no authentication). Everything is scoped to an
// org by its board `slug`, and only *published* boards / board-posted *open*
// jobs are ever exposed.

async function boardBySlug(ctx: QueryCtx, slug: string) {
  const settings = await ctx.db
    .query("jobBoardSettings")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (!settings || !settings.published) return null;
  return settings;
}

// Public open jobs posted to the board, for a given org.
async function publicJobsFor(ctx: QueryCtx, settings: Doc<"jobBoardSettings">) {
  const jobs = await ctx.db
    .query("jobs")
    .withIndex("by_org_status", (q) =>
      q.eq("orgId", settings.orgId).eq("status", "open"),
    )
    .collect();
  return jobs.filter((j) => j.postedToBoard);
}

export const getBoard = query({
  args: { slug: v.string() },
  returns: v.union(publicBoard, v.null()),
  handler: async (ctx, { slug }) => {
    const settings = await boardBySlug(ctx, slug);
    if (!settings) return null;
    const [logoUrl, bannerUrl] = await Promise.all([
      settings.logoStorageId
        ? ctx.storage.getUrl(settings.logoStorageId)
        : Promise.resolve(null),
      settings.bannerStorageId
        ? ctx.storage.getUrl(settings.bannerStorageId)
        : Promise.resolve(null),
    ]);
    const jobs = await publicJobsFor(ctx, settings);
    const listings = await Promise.all(
      jobs.map(async (j) => {
        const dept = j.departmentId ? await ctx.db.get(j.departmentId) : null;
        return {
          _id: j._id,
          title: j.title,
          level: j.level ?? null,
          country: j.country ?? null,
          departmentName: dept?.name ?? null,
        };
      }),
    );
    listings.sort((a, b) =>
      (a.departmentName ?? "~").localeCompare(b.departmentName ?? "~"),
    );
    return {
      companyName: settings.companyName,
      headline: settings.headline ?? null,
      description: settings.description ?? null,
      logoUrl,
      bannerUrl,
      jobs: listings,
    };
  },
});

export const getJob = query({
  args: { slug: v.string(), jobId: v.id("jobs") },
  returns: v.union(publicJob, v.null()),
  handler: async (ctx, { slug, jobId }) => {
    const settings = await boardBySlug(ctx, slug);
    if (!settings) return null;
    const job = await ctx.db.get(jobId);
    if (
      !job ||
      job.orgId !== settings.orgId ||
      job.status !== "open" ||
      !job.postedToBoard
    ) {
      return null;
    }
    const dept = job.departmentId ? await ctx.db.get(job.departmentId) : null;
    return {
      _id: job._id,
      title: job.title,
      level: job.level ?? null,
      country: job.country ?? null,
      departmentName: dept?.name ?? null,
      employmentType: job.employmentType ?? null,
      description: job.description ?? null,
      companyName: settings.companyName,
    };
  },
});

// Public resume upload (only for valid, published boards).
export const uploadUrl = mutation({
  args: { slug: v.string() },
  returns: v.string(),
  handler: async (ctx, { slug }) => {
    const settings = await boardBySlug(ctx, slug);
    if (!settings) throw new Error("Job board not found.");
    return await ctx.storage.generateUploadUrl();
  },
});

export const apply = mutation({
  args: {
    slug: v.string(),
    jobId: v.id("jobs"),
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    resumeStorageId: v.optional(v.id("_storage")),
    coverLetter: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const settings = await boardBySlug(ctx, args.slug);
    if (!settings) throw new Error("Job board not found.");
    const job = await ctx.db.get(args.jobId);
    if (
      !job ||
      job.orgId !== settings.orgId ||
      job.status !== "open" ||
      !job.postedToBoard
    ) {
      throw new Error("This position is no longer accepting applications.");
    }
    if (!args.name.trim()) throw new Error("Your name is required.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(args.email.trim())) {
      throw new Error("A valid email is required.");
    }
    await ctx.db.insert("candidates", {
      orgId: settings.orgId,
      jobId: args.jobId,
      name: args.name.trim(),
      email: args.email.trim(),
      phone: args.phone?.trim() || undefined,
      resumeStorageId: args.resumeStorageId,
      coverLetter: args.coverLetter?.trim() || undefined,
      stage: "applied",
      source: "board",
    });
    // Notify the recruiter (if assigned) that a new application arrived.
    if (job.recruiterUserId) {
      await ctx.db.insert("notifications", {
        orgId: settings.orgId,
        recipientUserId: job.recruiterUserId,
        type: "recruitment.application",
        title: "New application",
        body: `${args.name.trim()} applied for ${job.title}`,
        entityRef: { table: "jobs", id: args.jobId },
        read: false,
      });
    }
    return null;
  },
});
