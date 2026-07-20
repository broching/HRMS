import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requirePermission } from "./auth";
import {
  employmentType,
  jobStatus,
  candidateStage,
  candidateSource,
  interviewMode,
} from "./lib/enums";
import {
  jobRow,
  candidateRow,
  recruitmentSummary,
  jobBoardSettingsValue,
  interviewRow,
} from "./lib/validators";
import { writeAuditLog } from "./lib/audit";

// Notify a job's recruiter + hiring manager (in-app; real email isn't wired
// yet, matching the feed/claims convention).
async function notifyStakeholders(
  ctx: MutationCtx,
  job: Doc<"jobs">,
  type: string,
  title: string,
  body: string,
) {
  const recipients = new Set<Id<"users">>();
  if (job.recruiterUserId) recipients.add(job.recruiterUserId);
  if (job.hiringManagerEmployeeId) {
    const mgr = await ctx.db.get(job.hiringManagerEmployeeId);
    if (mgr?.userId) recipients.add(mgr.userId);
  }
  for (const recipientUserId of recipients) {
    await ctx.db.insert("notifications", {
      orgId: job.orgId,
      recipientUserId,
      type,
      title,
      body,
      entityRef: { table: "jobs", id: job._id },
      read: false,
    });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function hydrateJob(ctx: QueryCtx, job: Doc<"jobs">) {
  const [dept, mgr, recruiter, applicants] = await Promise.all([
    job.departmentId ? ctx.db.get(job.departmentId) : Promise.resolve(null),
    job.hiringManagerEmployeeId
      ? ctx.db.get(job.hiringManagerEmployeeId)
      : Promise.resolve(null),
    job.recruiterUserId ? ctx.db.get(job.recruiterUserId) : Promise.resolve(null),
    ctx.db
      .query("candidates")
      .withIndex("by_job", (q) => q.eq("jobId", job._id))
      .collect(),
  ]);
  const hiringManagerPhotoUrl = mgr?.photoUrl ?? null;
  return {
    _id: job._id,
    _creationTime: job._creationTime,
    title: job.title,
    status: job.status,
    level: job.level ?? null,
    country: job.country ?? null,
    departmentId: job.departmentId ?? null,
    departmentName: dept?.name ?? null,
    employmentType: job.employmentType ?? null,
    description: job.description ?? null,
    hiringManagerEmployeeId: job.hiringManagerEmployeeId ?? null,
    hiringManagerName: mgr ? `${mgr.firstName} ${mgr.lastName}` : null,
    hiringManagerPhotoUrl,
    recruiterUserId: job.recruiterUserId ?? null,
    recruiterName: recruiter?.name ?? null,
    postedToBoard: job.postedToBoard,
    applicantCount: applicants.length,
  };
}

async function hydrateCandidate(ctx: QueryCtx, c: Doc<"candidates">) {
  const job = await ctx.db.get(c.jobId);
  const resumeUrl = c.resumeStorageId
    ? await ctx.storage.getUrl(c.resumeStorageId)
    : null;
  return {
    _id: c._id,
    _creationTime: c._creationTime,
    jobId: c.jobId,
    jobTitle: job?.title ?? "—",
    name: c.name,
    email: c.email,
    phone: c.phone ?? null,
    stage: c.stage,
    source: c.source,
    resumeUrl,
    coverLetter: c.coverLetter ?? null,
    rating: c.rating ?? null,
    note: c.note ?? null,
  };
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export const dashboard = query({
  args: {},
  returns: recruitmentSummary,
  handler: async (ctx) => {
    const { orgId, org } = await requirePermission(ctx, "recruitment:manage");
    const candidates = await ctx.db
      .query("candidates")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const counts = { screening: 0, interview: 0, offer: 0, kiv: 0 };
    for (const c of candidates) {
      if (c.stage === "screening") counts.screening += 1;
      else if (c.stage === "interview") counts.interview += 1;
      else if (c.stage === "offer") counts.offer += 1;
      else if (c.stage === "kiv") counts.kiv += 1;
    }
    const openJobs = await ctx.db
      .query("jobs")
      .withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "open"))
      .collect();
    const settings = await ctx.db
      .query("jobBoardSettings")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .unique();
    const logoUrl = settings?.logoStorageId
      ? await ctx.storage.getUrl(settings.logoStorageId)
      : null;
    return {
      counts,
      jobCount: openJobs.length,
      board: {
        slug: settings?.slug ?? null,
        published: settings?.published ?? false,
        companyName: settings?.companyName ?? org.name,
        logoUrl,
      },
    };
  },
});

// ─── Jobs ──────────────────────────────────────────────────────────────────

export const listJobs = query({
  args: {
    status: v.optional(v.union(jobStatus, v.literal("all"))),
    search: v.optional(v.string()),
    hiringManagerEmployeeId: v.optional(v.id("employees")),
    recruiterUserId: v.optional(v.id("users")),
  },
  returns: v.array(jobRow),
  handler: async (ctx, args) => {
    const { orgId } = await requirePermission(ctx, "recruitment:manage");
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .order("desc")
      .collect();
    const search = args.search?.trim().toLowerCase();
    const filtered = jobs.filter((j) => {
      if (args.status && args.status !== "all" && j.status !== args.status) return false;
      if (
        args.hiringManagerEmployeeId &&
        j.hiringManagerEmployeeId !== args.hiringManagerEmployeeId
      )
        return false;
      if (args.recruiterUserId && j.recruiterUserId !== args.recruiterUserId)
        return false;
      if (search && !j.title.toLowerCase().includes(search)) return false;
      return true;
    });
    return await Promise.all(filtered.map((j) => hydrateJob(ctx, j)));
  },
});

export const getJob = query({
  args: { jobId: v.id("jobs") },
  returns: v.union(jobRow, v.null()),
  handler: async (ctx, { jobId }) => {
    const { orgId } = await requirePermission(ctx, "recruitment:manage");
    const job = await ctx.db.get(jobId);
    if (!job || job.orgId !== orgId) return null;
    return await hydrateJob(ctx, job);
  },
});

export const createJob = mutation({
  args: {
    title: v.string(),
    departmentId: v.optional(v.id("departments")),
    level: v.optional(v.string()),
    country: v.optional(v.string()),
    employmentType: v.optional(employmentType),
    description: v.optional(v.string()),
    hiringManagerEmployeeId: v.optional(v.id("employees")),
    recruiterUserId: v.optional(v.id("users")),
    status: v.optional(jobStatus),
    postedToBoard: v.optional(v.boolean()),
  },
  returns: v.id("jobs"),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(ctx, "recruitment:manage");
    if (!args.title.trim()) throw new Error("A job title is required.");
    const id = await ctx.db.insert("jobs", {
      orgId,
      title: args.title.trim(),
      departmentId: args.departmentId,
      level: args.level?.trim() || undefined,
      country: args.country?.trim() || undefined,
      employmentType: args.employmentType,
      description: args.description?.trim() || undefined,
      hiringManagerEmployeeId: args.hiringManagerEmployeeId,
      recruiterUserId: args.recruiterUserId,
      status: args.status ?? "open",
      postedToBoard: args.postedToBoard ?? false,
      createdBy: userId,
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "job.create",
      entity: "jobs",
      entityId: id,
      after: { title: args.title },
    });
    return id;
  },
});

export const updateJob = mutation({
  args: {
    jobId: v.id("jobs"),
    title: v.optional(v.string()),
    departmentId: v.optional(v.union(v.id("departments"), v.null())),
    level: v.optional(v.union(v.string(), v.null())),
    country: v.optional(v.union(v.string(), v.null())),
    employmentType: v.optional(v.union(employmentType, v.null())),
    description: v.optional(v.union(v.string(), v.null())),
    hiringManagerEmployeeId: v.optional(v.union(v.id("employees"), v.null())),
    recruiterUserId: v.optional(v.union(v.id("users"), v.null())),
    status: v.optional(jobStatus),
    postedToBoard: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { jobId, ...rest }) => {
    const { orgId } = await requirePermission(ctx, "recruitment:manage");
    const job = await ctx.db.get(jobId);
    if (!job || job.orgId !== orgId) throw new Error("Job not found.");
    const patch: Partial<Doc<"jobs">> = {};
    if (rest.title !== undefined) patch.title = rest.title.trim();
    if (rest.departmentId !== undefined)
      patch.departmentId = rest.departmentId ?? undefined;
    if (rest.level !== undefined) patch.level = rest.level?.trim() || undefined;
    if (rest.country !== undefined) patch.country = rest.country?.trim() || undefined;
    if (rest.employmentType !== undefined)
      patch.employmentType = rest.employmentType ?? undefined;
    if (rest.description !== undefined)
      patch.description = rest.description?.trim() || undefined;
    if (rest.hiringManagerEmployeeId !== undefined)
      patch.hiringManagerEmployeeId = rest.hiringManagerEmployeeId ?? undefined;
    if (rest.recruiterUserId !== undefined)
      patch.recruiterUserId = rest.recruiterUserId ?? undefined;
    if (rest.status !== undefined) patch.status = rest.status;
    if (rest.postedToBoard !== undefined) patch.postedToBoard = rest.postedToBoard;
    await ctx.db.patch(jobId, patch);
    return null;
  },
});

export const deleteJob = mutation({
  args: { jobId: v.id("jobs") },
  returns: v.null(),
  handler: async (ctx, { jobId }) => {
    const { orgId, userId } = await requirePermission(ctx, "recruitment:manage");
    const job = await ctx.db.get(jobId);
    if (!job || job.orgId !== orgId) throw new Error("Job not found.");
    const candidates = await ctx.db
      .query("candidates")
      .withIndex("by_job", (q) => q.eq("jobId", jobId))
      .collect();
    for (const c of candidates) await ctx.db.delete(c._id);
    await ctx.db.delete(jobId);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "job.delete",
      entity: "jobs",
      entityId: jobId,
    });
    return null;
  },
});

// ─── Candidates ──────────────────────────────────────────────────────────────

export const listCandidates = query({
  args: {
    jobId: v.optional(v.id("jobs")),
    stage: v.optional(v.union(candidateStage, v.literal("all"))),
    search: v.optional(v.string()),
  },
  returns: v.array(candidateRow),
  handler: async (ctx, args) => {
    const { orgId } = await requirePermission(ctx, "recruitment:manage");
    const all = args.jobId
      ? await ctx.db
          .query("candidates")
          .withIndex("by_job", (q) => q.eq("jobId", args.jobId!))
          .collect()
      : await ctx.db
          .query("candidates")
          .withIndex("by_org", (q) => q.eq("orgId", orgId))
          .order("desc")
          .collect();
    const search = args.search?.trim().toLowerCase();
    const filtered = all.filter((c) => {
      if (c.orgId !== orgId) return false;
      if (args.stage && args.stage !== "all" && c.stage !== args.stage) return false;
      if (search && !`${c.name} ${c.email}`.toLowerCase().includes(search))
        return false;
      return true;
    });
    return await Promise.all(filtered.map((c) => hydrateCandidate(ctx, c)));
  },
});

export const addCandidate = mutation({
  args: {
    jobId: v.id("jobs"),
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    resumeStorageId: v.optional(v.id("_storage")),
    coverLetter: v.optional(v.string()),
    stage: v.optional(candidateStage),
    source: v.optional(candidateSource),
  },
  returns: v.id("candidates"),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(ctx, "recruitment:manage");
    const job = await ctx.db.get(args.jobId);
    if (!job || job.orgId !== orgId) throw new Error("Job not found.");
    if (!args.name.trim()) throw new Error("Candidate name is required.");
    const id = await ctx.db.insert("candidates", {
      orgId,
      jobId: args.jobId,
      name: args.name.trim(),
      email: args.email.trim(),
      phone: args.phone?.trim() || undefined,
      resumeStorageId: args.resumeStorageId,
      coverLetter: args.coverLetter?.trim() || undefined,
      stage: args.stage ?? "screening",
      source: args.source ?? "manual",
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "candidate.add",
      entity: "candidates",
      entityId: id,
    });
    return id;
  },
});

export const setCandidateStage = mutation({
  args: { candidateId: v.id("candidates"), stage: candidateStage },
  returns: v.null(),
  handler: async (ctx, { candidateId, stage }) => {
    const { orgId } = await requirePermission(ctx, "recruitment:manage");
    const c = await ctx.db.get(candidateId);
    if (!c || c.orgId !== orgId) throw new Error("Candidate not found.");
    if (c.stage === stage) return null;
    await ctx.db.patch(candidateId, { stage });
    // Stage-change automation: notify the job's recruiter + hiring manager.
    const job = await ctx.db.get(c.jobId);
    if (job) {
      await notifyStakeholders(
        ctx,
        job,
        "recruitment.stage_change",
        "Candidate moved",
        `${c.name} → ${stage} for ${job.title}`,
      );
    }
    return null;
  },
});

export const updateCandidate = mutation({
  args: {
    candidateId: v.id("candidates"),
    rating: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { candidateId, rating, note }) => {
    const { orgId } = await requirePermission(ctx, "recruitment:manage");
    const c = await ctx.db.get(candidateId);
    if (!c || c.orgId !== orgId) throw new Error("Candidate not found.");
    await ctx.db.patch(candidateId, {
      rating: rating ?? c.rating,
      note: note?.trim() || undefined,
    });
    return null;
  },
});

export const deleteCandidate = mutation({
  args: { candidateId: v.id("candidates") },
  returns: v.null(),
  handler: async (ctx, { candidateId }) => {
    const { orgId } = await requirePermission(ctx, "recruitment:manage");
    const c = await ctx.db.get(candidateId);
    if (!c || c.orgId !== orgId) throw new Error("Candidate not found.");
    await ctx.db.delete(candidateId);
    return null;
  },
});

// ─── Job board settings ──────────────────────────────────────────────────────

export const getBoardSettings = query({
  args: {},
  returns: jobBoardSettingsValue,
  handler: async (ctx) => {
    const { orgId, org } = await requirePermission(ctx, "recruitment:manage");
    const s = await ctx.db
      .query("jobBoardSettings")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .unique();
    const [logoUrl, bannerUrl] = await Promise.all([
      s?.logoStorageId ? ctx.storage.getUrl(s.logoStorageId) : Promise.resolve(null),
      s?.bannerStorageId
        ? ctx.storage.getUrl(s.bannerStorageId)
        : Promise.resolve(null),
    ]);
    return {
      slug: s?.slug ?? slugify(org.slug ?? org.name),
      companyName: s?.companyName ?? org.name,
      headline: s?.headline ?? null,
      description: s?.description ?? null,
      logoUrl,
      bannerUrl,
      published: s?.published ?? false,
    };
  },
});

export const saveBoardSettings = mutation({
  args: {
    slug: v.string(),
    companyName: v.string(),
    headline: v.optional(v.string()),
    description: v.optional(v.string()),
    logoStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    bannerStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    published: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { orgId } = await requirePermission(ctx, "recruitment:manage");
    const slug = slugify(args.slug);
    if (!slug) throw new Error("A valid board link is required.");
    if (!args.companyName.trim()) throw new Error("Company name is required.");

    // Slug must be unique across orgs.
    const clash = await ctx.db
      .query("jobBoardSettings")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (clash && clash.orgId !== orgId) {
      throw new Error("That board link is already taken.");
    }

    const existing = await ctx.db
      .query("jobBoardSettings")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .unique();
    const fields = {
      slug,
      companyName: args.companyName.trim(),
      headline: args.headline?.trim() || undefined,
      description: args.description?.trim() || undefined,
      published: args.published,
    };
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...fields,
        logoStorageId:
          args.logoStorageId === null
            ? undefined
            : (args.logoStorageId ?? existing.logoStorageId),
        bannerStorageId:
          args.bannerStorageId === null
            ? undefined
            : (args.bannerStorageId ?? existing.bannerStorageId),
      });
    } else {
      await ctx.db.insert("jobBoardSettings", {
        orgId,
        ...fields,
        logoStorageId: args.logoStorageId ?? undefined,
        bannerStorageId: args.bannerStorageId ?? undefined,
      });
    }
    return null;
  },
});

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requirePermission(ctx, "recruitment:manage");
    return await ctx.storage.generateUploadUrl();
  },
});

// ─── Interviews ──────────────────────────────────────────────────────────────

async function hydrateInterview(ctx: QueryCtx, iv: Doc<"interviews">) {
  const [cand, job, interviewer] = await Promise.all([
    ctx.db.get(iv.candidateId),
    ctx.db.get(iv.jobId),
    iv.interviewerUserId
      ? ctx.db.get(iv.interviewerUserId)
      : Promise.resolve(null),
  ]);
  return {
    _id: iv._id,
    _creationTime: iv._creationTime,
    candidateId: iv.candidateId,
    jobId: iv.jobId,
    candidateName: cand?.name ?? "Unknown",
    jobTitle: job?.title ?? "—",
    scheduledAt: iv.scheduledAt,
    durationMins: iv.durationMins,
    mode: iv.mode,
    locationOrLink: iv.locationOrLink ?? null,
    interviewerName: interviewer?.name ?? null,
    notes: iv.notes ?? null,
    status: iv.status,
  };
}

export const listInterviews = query({
  args: {
    candidateId: v.optional(v.id("candidates")),
    fromMs: v.optional(v.number()),
    toMs: v.optional(v.number()),
    scheduledOnly: v.optional(v.boolean()),
  },
  returns: v.array(interviewRow),
  handler: async (ctx, args) => {
    const { orgId } = await requirePermission(ctx, "recruitment:manage");
    const all = args.candidateId
      ? await ctx.db
          .query("interviews")
          .withIndex("by_candidate", (q) => q.eq("candidateId", args.candidateId!))
          .collect()
      : await ctx.db
          .query("interviews")
          .withIndex("by_org_scheduledAt", (q) => {
            const base = q.eq("orgId", orgId);
            if (args.fromMs !== undefined && args.toMs !== undefined)
              return base.gte("scheduledAt", args.fromMs).lte("scheduledAt", args.toMs);
            if (args.fromMs !== undefined)
              return base.gte("scheduledAt", args.fromMs);
            if (args.toMs !== undefined) return base.lte("scheduledAt", args.toMs);
            return base;
          })
          .collect();
    const filtered = all
      .filter((iv) => iv.orgId === orgId)
      .filter((iv) => (args.scheduledOnly ? iv.status === "scheduled" : true))
      .sort((a, b) => a.scheduledAt - b.scheduledAt);
    return await Promise.all(filtered.map((iv) => hydrateInterview(ctx, iv)));
  },
});

export const scheduleInterview = mutation({
  args: {
    candidateId: v.id("candidates"),
    scheduledAt: v.number(),
    durationMins: v.number(),
    mode: interviewMode,
    locationOrLink: v.optional(v.string()),
    interviewerUserId: v.optional(v.id("users")),
    notes: v.optional(v.string()),
  },
  returns: v.id("interviews"),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(ctx, "recruitment:manage");
    const cand = await ctx.db.get(args.candidateId);
    if (!cand || cand.orgId !== orgId) throw new Error("Candidate not found.");
    const id = await ctx.db.insert("interviews", {
      orgId,
      candidateId: args.candidateId,
      jobId: cand.jobId,
      scheduledAt: args.scheduledAt,
      durationMins: args.durationMins,
      mode: args.mode,
      locationOrLink: args.locationOrLink?.trim() || undefined,
      interviewerUserId: args.interviewerUserId,
      notes: args.notes?.trim() || undefined,
      status: "scheduled",
      createdBy: userId,
    });
    // Advance early-stage candidates into the interview stage.
    if (cand.stage === "applied" || cand.stage === "screening") {
      await ctx.db.patch(args.candidateId, { stage: "interview" });
    }
    const job = await ctx.db.get(cand.jobId);
    const when = new Date(args.scheduledAt).toISOString().slice(0, 16).replace("T", " ");
    if (job) {
      await notifyStakeholders(
        ctx,
        job,
        "recruitment.interview",
        "Interview scheduled",
        `${cand.name} — ${job.title} on ${when}`,
      );
    }
    if (args.interviewerUserId && args.interviewerUserId !== userId) {
      await ctx.db.insert("notifications", {
        orgId,
        recipientUserId: args.interviewerUserId,
        type: "recruitment.interview",
        title: "You're interviewing",
        body: `${cand.name} on ${when}`,
        entityRef: { table: "interviews", id },
        read: false,
      });
    }
    return id;
  },
});

export const cancelInterview = mutation({
  args: { interviewId: v.id("interviews") },
  returns: v.null(),
  handler: async (ctx, { interviewId }) => {
    const { orgId } = await requirePermission(ctx, "recruitment:manage");
    const iv = await ctx.db.get(interviewId);
    if (!iv || iv.orgId !== orgId) throw new Error("Interview not found.");
    await ctx.db.patch(interviewId, { status: "cancelled" });
    return null;
  },
});
