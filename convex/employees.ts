import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import {
  hrmsRole,
  employmentType,
  employeeStatus,
  gender,
  addressValidator,
  contactValidator,
  emergencyContactValidator,
} from "./lib/enums";
import { requireOrg, getOrgContext, requirePermission } from "./auth";
import { hasPermission } from "./lib/permissions";
import { writeAuditLog } from "./lib/audit";
import { buildSearchName } from "./model/employee";
import {
  employeeDoc,
  employeeProfile,
  employeeRow,
} from "./lib/validators";

// ─── Access helpers ──────────────────────────────────────────────────────

export async function employeeByUserId(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  userId: Id<"users">,
) {
  const matches = await ctx.db
    .query("employees")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  return matches.find((e) => e.orgId === orgId) ?? null;
}

// Resolve an employee the caller is allowed to view: HR/admin see anyone;
// employees see themselves; managers see their direct reports.
export async function requireEmployeeAccess(
  ctx: QueryCtx,
  employeeId: Id<"employees">,
) {
  const orgCtx = await requireOrg(ctx);
  const employee = await ctx.db.get(employeeId);
  if (!employee || employee.orgId !== orgCtx.orgId) {
    throw new Error("Employee not found.");
  }
  if (hasPermission(orgCtx.role, "employees:read:all")) return { orgCtx, employee };
  if (employee.userId && employee.userId === orgCtx.userId) {
    return { orgCtx, employee };
  }
  const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
  if (own && employee.managerId === own._id) return { orgCtx, employee };
  throw new Error("Not authorized to view this employee.");
}

// If someone with this email is already a member of the org, link the new
// employee to their login account and apply the intended HRMS role. Most new
// hires won't be members yet — the reverse link happens on invite-acceptance
// in members.ts (linkEmployeeOnJoin).
async function linkExistingMember(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  employeeId: Id<"employees">,
  loginEmail: string,
  invitedRole?: "admin" | "hr" | "manager" | "employee",
) {
  const members = await ctx.db
    .query("members")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  for (const m of members) {
    const u = await ctx.db.get(m.userId);
    if (u?.email && u.email.toLowerCase() === loginEmail) {
      await ctx.db.patch(employeeId, { userId: m.userId });
      if (invitedRole) await ctx.db.patch(m._id, { role: invitedRole });
      return;
    }
  }
}

function maskId(idNumber: string): { masked: string; last4: string } {
  const trimmed = idNumber.trim();
  const last4 = trimmed.slice(-4);
  const masked = "•".repeat(Math.max(0, trimmed.length - 4)) + last4;
  return { masked, last4 };
}

// ─── Queries ─────────────────────────────────────────────────────────────

// Directory listing for HR/Admin. Supports full-text search and filters.
export const list = query({
  args: {
    search: v.optional(v.string()),
    status: v.optional(employeeStatus),
    departmentId: v.optional(v.id("departments")),
  },
  returns: v.array(employeeRow),
  handler: async (ctx, args) => {
    const { orgId } = await requirePermission(ctx, "employees:read:all");

    let rows;
    const search = args.search?.trim();
    if (search) {
      rows = await ctx.db
        .query("employees")
        .withSearchIndex("search_name", (q) => {
          const base = q.search("searchName", search).eq("orgId", orgId);
          return args.status ? base.eq("status", args.status) : base;
        })
        .take(50);
    } else if (args.status) {
      rows = await ctx.db
        .query("employees")
        .withIndex("by_org_status", (q) =>
          q.eq("orgId", orgId).eq("status", args.status!),
        )
        .take(200);
    } else {
      rows = await ctx.db
        .query("employees")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .take(200);
    }

    if (args.departmentId) {
      rows = rows.filter((e) => e.departmentId === args.departmentId);
    }

    // Resolve small org-structure lookups once for label hydration.
    const [departments, positions] = await Promise.all([
      ctx.db.query("departments").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
      ctx.db.query("positions").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
    ]);
    const deptName = new Map(departments.map((d) => [d._id, d.name]));
    const posTitle = new Map(positions.map((p) => [p._id, p.title]));

    return rows.map((e) => ({
      _id: e._id,
      employeeNumber: e.employeeNumber,
      firstName: e.firstName,
      lastName: e.lastName,
      preferredName: e.preferredName,
      status: e.status,
      employmentType: e.employmentType,
      joinDate: e.joinDate,
      workEmail: e.contact?.workEmail,
      departmentName: e.departmentId ? deptName.get(e.departmentId) : undefined,
      positionTitle: e.positionId ? posTitle.get(e.positionId) : undefined,
    }));
  },
});

// Full profile with resolved labels + photo URL. Scoped access.
export const get = query({
  args: { employeeId: v.id("employees") },
  returns: employeeProfile,
  handler: async (ctx, { employeeId }) => {
    const { employee } = await requireEmployeeAccess(ctx, employeeId);

    const [department, team, position, manager, office] = await Promise.all([
      employee.departmentId ? ctx.db.get(employee.departmentId) : null,
      employee.teamId ? ctx.db.get(employee.teamId) : null,
      employee.positionId ? ctx.db.get(employee.positionId) : null,
      employee.managerId ? ctx.db.get(employee.managerId) : null,
      employee.officeId ? ctx.db.get(employee.officeId) : null,
    ]);
    const photoUrl = employee.photoStorageId
      ? await ctx.storage.getUrl(employee.photoStorageId)
      : null;

    return {
      ...employee,
      photoUrl,
      departmentName: department?.name ?? null,
      teamName: team?.name ?? null,
      positionTitle: position?.title ?? null,
      managerName: manager
        ? `${manager.firstName} ${manager.lastName}`
        : null,
      officeName: office?.name ?? null,
    };
  },
});

// The caller's own employee record (Employee Self-Service entry point).
export const me = query({
  args: {},
  returns: v.union(employeeDoc, v.null()),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return null;
    return await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
  },
});

// Direct reports of the calling manager.
export const listMyTeam = query({
  args: {},
  returns: v.array(employeeDoc),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    if (!own) return [];
    return await ctx.db
      .query("employees")
      .withIndex("by_org_manager", (q) =>
        q.eq("orgId", orgCtx.orgId).eq("managerId", own._id),
      )
      .collect();
  },
});

function initialsOf(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
}

// Resolved data for the personal "home" dashboard card: the caller's own
// profile with labels, plus their manager and team (direct reports, or
// teammates under the same manager when they have no reports).
export const homeCard = query({
  args: {},
  returns: v.union(
    v.object({ hasProfile: v.literal(false) }),
    v.object({
      hasProfile: v.literal(true),
      employeeId: v.id("employees"),
      employeeNumber: v.string(),
      name: v.string(),
      photoUrl: v.union(v.string(), v.null()),
      positionTitle: v.union(v.string(), v.null()),
      employmentType: employmentType,
      joinDate: v.string(),
      workEmail: v.union(v.string(), v.null()),
      departmentName: v.union(v.string(), v.null()),
      officeName: v.union(v.string(), v.null()),
      manager: v.union(
        v.object({
          name: v.string(),
          initials: v.string(),
          photoUrl: v.union(v.string(), v.null()),
        }),
        v.null(),
      ),
      team: v.array(
        v.object({
          employeeId: v.id("employees"),
          name: v.string(),
          initials: v.string(),
          photoUrl: v.union(v.string(), v.null()),
        }),
      ),
    }),
  ),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx)
    if (!orgCtx) return { hasProfile: false as const }
    const me = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId)
    if (!me) return { hasProfile: false as const }

    const [department, office, position, manager, reports] = await Promise.all([
      me.departmentId ? ctx.db.get(me.departmentId) : null,
      me.officeId ? ctx.db.get(me.officeId) : null,
      me.positionId ? ctx.db.get(me.positionId) : null,
      me.managerId ? ctx.db.get(me.managerId) : null,
      ctx.db
        .query("employees")
        .withIndex("by_org_manager", (q) =>
          q.eq("orgId", orgCtx.orgId).eq("managerId", me._id),
        )
        .take(12),
    ])

    // Team = direct reports; fall back to teammates under the same manager.
    let teamMembers = reports
    if (teamMembers.length === 0 && me.managerId) {
      const peers = await ctx.db
        .query("employees")
        .withIndex("by_org_manager", (q) =>
          q.eq("orgId", orgCtx.orgId).eq("managerId", me.managerId!),
        )
        .take(12)
      teamMembers = peers.filter((p) => p._id !== me._id)
    }

    const team = await Promise.all(
      teamMembers.slice(0, 8).map(async (t) => ({
        employeeId: t._id,
        name: `${t.preferredName ?? t.firstName} ${t.lastName}`,
        initials: initialsOf(t.firstName, t.lastName),
        photoUrl: t.photoStorageId
          ? await ctx.storage.getUrl(t.photoStorageId)
          : null,
      })),
    )

    return {
      hasProfile: true as const,
      employeeId: me._id,
      employeeNumber: me.employeeNumber,
      name: `${me.preferredName ?? me.firstName} ${me.lastName}`,
      photoUrl: me.photoStorageId
        ? await ctx.storage.getUrl(me.photoStorageId)
        : null,
      positionTitle: position?.title ?? null,
      employmentType: me.employmentType,
      joinDate: me.joinDate,
      workEmail: me.contact?.workEmail ?? null,
      departmentName: department?.name ?? null,
      officeName: office?.name ?? null,
      manager: manager
        ? {
            name: `${manager.preferredName ?? manager.firstName} ${manager.lastName}`,
            initials: initialsOf(manager.firstName, manager.lastName),
            photoUrl: manager.photoStorageId
              ? await ctx.storage.getUrl(manager.photoStorageId)
              : null,
          }
        : null,
      team,
    }
  },
})

// ─── Mutations ───────────────────────────────────────────────────────────

const writableFields = {
  firstName: v.string(),
  lastName: v.string(),
  preferredName: v.optional(v.string()),
  dob: v.optional(v.string()),
  gender: v.optional(gender),
  nationality: v.optional(v.string()),
  idNumber: v.optional(v.string()), // full value; stored masked only
  address: v.optional(addressValidator),
  contact: v.optional(contactValidator),
  emergencyContacts: v.optional(v.array(emergencyContactValidator)),
  departmentId: v.optional(v.id("departments")),
  teamId: v.optional(v.id("teams")),
  positionId: v.optional(v.id("positions")),
  managerId: v.optional(v.id("employees")),
  employmentType: employmentType,
  officeId: v.optional(v.id("offices")),
  joinDate: v.string(),
  confirmationDate: v.optional(v.string()),
  probationEndDate: v.optional(v.string()),
  status: v.optional(employeeStatus),
};

export const create = mutation({
  args: {
    employeeNumber: v.string(),
    // The email used to invite this person to the org (= their work email).
    loginEmail: v.optional(v.string()),
    // HRMS role to grant once they accept the org invite.
    invitedRole: v.optional(hrmsRole),
    ...writableFields,
  },
  returns: v.id("employees"),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(ctx, "employees:manage");

    const dup = await ctx.db
      .query("employees")
      .withIndex("by_org_employeeNumber", (q) =>
        q.eq("orgId", orgId).eq("employeeNumber", args.employeeNumber),
      )
      .unique();
    if (dup) throw new Error("Employee number already exists.");

    const { idNumber, status, loginEmail, invitedRole, ...rest } = args;
    const masked = idNumber ? maskId(idNumber) : undefined;
    const email = loginEmail?.trim().toLowerCase() || undefined;
    // The invite email is canonical for work email; keep contact in sync.
    const contact = email
      ? { ...(rest.contact ?? {}), workEmail: email }
      : rest.contact;

    const id = await ctx.db.insert("employees", {
      orgId,
      ...rest,
      contact,
      loginEmail: email,
      invitedRole,
      status: status ?? "active",
      idNumberMasked: masked?.masked,
      idNumberLast4: masked?.last4,
      searchName: buildSearchName(args),
      createdBy: userId,
      updatedAt: Date.now(),
    });

    // If they're already in the org, link immediately; otherwise the link is
    // made when they accept the invite (members.linkEmployeeOnJoin).
    if (email) await linkExistingMember(ctx, orgId, id, email, invitedRole);

    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "employee.create",
      entity: "employees",
      entityId: id,
      after: { employeeNumber: args.employeeNumber, loginEmail: email },
    });
    return id;
  },
});

export const update = mutation({
  args: {
    employeeId: v.id("employees"),
    employeeNumber: v.optional(v.string()),
    ...{ ...writableFields, employmentType: v.optional(employmentType), joinDate: v.optional(v.string()) },
  },
  returns: v.null(),
  handler: async (ctx, { employeeId, idNumber, ...patch }) => {
    const { orgId, userId } = await requirePermission(ctx, "employees:manage");
    const existing = await ctx.db.get(employeeId);
    if (!existing || existing.orgId !== orgId) {
      throw new Error("Employee not found.");
    }

    const next: Record<string, unknown> = { ...patch, updatedAt: Date.now() };
    if (idNumber !== undefined) {
      const masked = maskId(idNumber);
      next.idNumberMasked = masked.masked;
      next.idNumberLast4 = masked.last4;
    }
    // Recompute search name if any name component changed.
    next.searchName = buildSearchName({
      firstName: patch.firstName ?? existing.firstName,
      lastName: patch.lastName ?? existing.lastName,
      preferredName: patch.preferredName ?? existing.preferredName,
      employeeNumber: patch.employeeNumber ?? existing.employeeNumber,
    });

    await ctx.db.patch(employeeId, next);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "employee.update",
      entity: "employees",
      entityId: employeeId,
    });
    return null;
  },
});

// Soft-terminate rather than hard-delete to preserve history.
export const archive = mutation({
  args: { employeeId: v.id("employees"), exitDate: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { employeeId, exitDate }) => {
    const { orgId, userId } = await requirePermission(ctx, "employees:manage");
    const existing = await ctx.db.get(employeeId);
    if (!existing || existing.orgId !== orgId) {
      throw new Error("Employee not found.");
    }
    await ctx.db.patch(employeeId, {
      status: "terminated",
      exitDate: exitDate ?? new Date().toISOString().slice(0, 10),
      updatedAt: Date.now(),
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "employee.archive",
      entity: "employees",
      entityId: employeeId,
    });
    return null;
  },
});

// ─── Photo upload ────────────────────────────────────────────────────────

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requirePermission(ctx, "employees:manage");
    return await ctx.storage.generateUploadUrl();
  },
});

export const setPhoto = mutation({
  args: { employeeId: v.id("employees"), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { employeeId, storageId }) => {
    const { orgId } = await requirePermission(ctx, "employees:manage");
    const existing = await ctx.db.get(employeeId);
    if (!existing || existing.orgId !== orgId) {
      throw new Error("Employee not found.");
    }
    if (existing.photoStorageId) {
      await ctx.storage.delete(existing.photoStorageId);
    }
    await ctx.db.patch(employeeId, { photoStorageId: storageId });
    return null;
  },
});
