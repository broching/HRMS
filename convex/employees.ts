import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import {
  hrmsRole,
  HrmsRole,
  employmentType,
  employeeStatus,
  gender,
  maritalStatus,
  addressValidator,
  contactValidator,
  emergencyContactValidator,
  familyMemberValidator,
  personalFieldValidator,
  resumeEntryValidator,
} from "./lib/enums";
import { requireOrg, getOrgContext, requirePermission } from "./auth";
import { ctxHasPermission } from "./auth";
import { writeAuditLog } from "./lib/audit";
import { buildSearchName } from "./model/employee";
import {
  employeeDoc,
  employeeProfile,
  employeeRow,
  orgChartNode,
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

// Resolve an employee any org member may view. Basic profile (name, job,
// experience/education, training) is directory-level information available to
// every colleague — the sensitive sections (personal details, documents,
// compensation, payroll) are redacted or gated by their own permission checks
// in the individual callers. Only enforces same-org scope here.
export async function requireEmployeeAccess(
  ctx: QueryCtx,
  employeeId: Id<"employees">,
) {
  const orgCtx = await requireOrg(ctx);
  const employee = await ctx.db.get(employeeId);
  if (!employee || employee.orgId !== orgCtx.orgId) {
    throw new Error("Employee not found.");
  }
  return { orgCtx, employee };
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
  invitedRole?: HrmsRole,
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

// Same as linkExistingMember but keys on the Clerk username. Handles the case
// where someone added by username is already a member of the org (the org-add
// via Clerk was a no-op, so no membership webhook fires to link them).
async function linkExistingMemberByUsername(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  employeeId: Id<"employees">,
  loginUsername: string,
  invitedRole?: HrmsRole,
) {
  const members = await ctx.db
    .query("members")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  for (const m of members) {
    const u = await ctx.db.get(m.userId);
    if (u?.username && u.username.toLowerCase() === loginUsername) {
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

// Directory listing available to any org member. Returns only directory-safe
// fields (name, work email, department, position, office, photo) — no salary,
// personal ID, address or other locked personal data. Supports full-text search
// and filters.
export const list = query({
  args: {
    search: v.optional(v.string()),
    status: v.optional(employeeStatus),
    departmentId: v.optional(v.id("departments")),
    officeId: v.optional(v.id("offices")),
    joinedBefore: v.optional(v.string()), // ISO date — joinDate <= this
  },
  returns: v.array(employeeRow),
  handler: async (ctx, args) => {
    const { orgId } = await requireOrg(ctx);

    let rows;
    const search = args.search?.trim();
    if (search) {
      rows = await ctx.db
        .query("employees")
        .withSearchIndex("search_name", (q) => {
          const base = q.search("searchName", search).eq("orgId", orgId);
          return args.status ? base.eq("status", args.status) : base;
        })
        .take(200);
    } else if (args.status) {
      rows = await ctx.db
        .query("employees")
        .withIndex("by_org_status", (q) =>
          q.eq("orgId", orgId).eq("status", args.status!),
        )
        .take(500);
    } else {
      rows = await ctx.db
        .query("employees")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .take(500);
    }

    if (args.departmentId) {
      rows = rows.filter((e) => e.departmentId === args.departmentId);
    }
    if (args.officeId) {
      rows = rows.filter((e) => e.officeId === args.officeId);
    }
    if (args.joinedBefore) {
      rows = rows.filter((e) => e.joinDate <= args.joinedBefore!);
    }

    // Stable directory order by employee number.
    rows.sort((a, b) => a.employeeNumber.localeCompare(b.employeeNumber));

    // Resolve small org-structure lookups once for label hydration.
    const [departments, positions, offices] = await Promise.all([
      ctx.db.query("departments").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
      ctx.db.query("positions").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
      ctx.db.query("offices").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
    ]);
    const deptName = new Map(departments.map((d) => [d._id, d.name]));
    const posTitle = new Map(positions.map((p) => [p._id, p.title]));
    const officeName = new Map(offices.map((o) => [o._id, o.name]));

    return await Promise.all(
      rows.map(async (e) => ({
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
        officeName: e.officeId ? officeName.get(e.officeId) : undefined,
        photoUrl: e.photoStorageId
          ? await ctx.storage.getUrl(e.photoStorageId)
          : null,
        isVacant: e.isVacant,
      })),
    );
  },
});

// Minimal name list for pickers (e.g. targeting a feed post to specific
// people). Available to any member — names only, no sensitive fields.
export const directoryOptions = query({
  args: {},
  returns: v.array(v.object({ _id: v.id("employees"), name: v.string() })),
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    const rows = await ctx.db
      .query("employees")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .take(500);
    return rows
      .filter((e) => !e.isVacant && e.status !== "terminated")
      .map((e) => ({
        _id: e._id,
        name: `${e.preferredName ?? e.firstName} ${e.lastName}`.trim(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

// The caller's direct reports, resolved to directory rows (dept/office names +
// photo). Manager-scoped, so managers without `employees:read:all` can use it
// for the Team page.
export const myTeamRows = query({
  args: {},
  returns: v.array(employeeRow),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    if (!own) return [];

    const rows = await ctx.db
      .query("employees")
      .withIndex("by_org_manager", (q) =>
        q.eq("orgId", orgCtx.orgId).eq("managerId", own._id),
      )
      .collect();
    rows.sort((a, b) => a.employeeNumber.localeCompare(b.employeeNumber));

    const [departments, positions, offices] = await Promise.all([
      ctx.db.query("departments").withIndex("by_org", (q) => q.eq("orgId", orgCtx.orgId)).collect(),
      ctx.db.query("positions").withIndex("by_org", (q) => q.eq("orgId", orgCtx.orgId)).collect(),
      ctx.db.query("offices").withIndex("by_org", (q) => q.eq("orgId", orgCtx.orgId)).collect(),
    ]);
    const deptName = new Map(departments.map((d) => [d._id, d.name]));
    const posTitle = new Map(positions.map((p) => [p._id, p.title]));
    const officeName = new Map(offices.map((o) => [o._id, o.name]));

    return await Promise.all(
      rows.map(async (e) => ({
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
        officeName: e.officeId ? officeName.get(e.officeId) : undefined,
        photoUrl: e.photoStorageId
          ? await ctx.storage.getUrl(e.photoStorageId)
          : null,
        isVacant: e.isVacant,
      })),
    );
  },
});

// Reporting-structure graph for the org chart. Returns every active-ish
// employee as a flat node list (tree is built client-side via managerId).
export const orgChart = query({
  args: {},
  returns: v.array(orgChartNode),
  handler: async (ctx) => {
    // Reporting structure is directory-safe (name, position, department,
    // manager link) — visible to any org member.
    const { orgId } = await requireOrg(ctx);
    const employees = (
      await ctx.db
        .query("employees")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .collect()
    ).filter((e) => e.status !== "terminated");

    const [departments, positions, offices] = await Promise.all([
      ctx.db.query("departments").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
      ctx.db.query("positions").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
      ctx.db.query("offices").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
    ]);
    const deptName = new Map(departments.map((d) => [d._id, d.name]));
    const posTitle = new Map(positions.map((p) => [p._id, p.title]));
    const officeName = new Map(offices.map((o) => [o._id, o.name]));

    return await Promise.all(
      employees.map(async (e) => ({
        _id: e._id,
        name: e.isVacant
          ? (e.positionId ? (posTitle.get(e.positionId) ?? null) : null) ??
            (e.firstName.trim() || "Vacant")
          : `${e.preferredName ?? e.firstName} ${e.lastName}`,
        employeeNumber: e.employeeNumber,
        managerId: e.managerId ?? null,
        positionTitle: e.positionId ? (posTitle.get(e.positionId) ?? null) : null,
        departmentId: e.departmentId ?? null,
        departmentName: e.departmentId ? (deptName.get(e.departmentId) ?? null) : null,
        officeName: e.officeId ? (officeName.get(e.officeId) ?? null) : null,
        workEmail: e.contact?.workEmail ?? null,
        photoUrl: e.photoStorageId
          ? await ctx.storage.getUrl(e.photoStorageId)
          : null,
        isVacant: !!e.isVacant,
      })),
    );
  },
});

// Full profile with resolved labels + photo URL. Scoped access. The locked
// personal section (dob, gender, marital status, nationality, ID, address,
// personal contact + custom fields) is redacted unless the caller is the
// employee themselves or has org-wide read (HR/admin) — managers viewing a
// report see work info but not private personal details.
export const get = query({
  args: { employeeId: v.id("employees") },
  returns: employeeProfile,
  handler: async (ctx, { employeeId }) => {
    const { orgCtx, employee } = await requireEmployeeAccess(ctx, employeeId);

    const isSelf = !!employee.userId && employee.userId === orgCtx.userId;
    const canManage = ctxHasPermission(orgCtx, "employees:manage");
    const canViewPersonal =
      isSelf || ctxHasPermission(orgCtx, "employees:read:all");
    const canViewCompensation =
      isSelf || ctxHasPermission(orgCtx, "payroll:manage");
    const canEdit = isSelf || canManage;

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
    const galleryUrls = (
      await Promise.all(
        (employee.galleryStorageIds ?? []).map(async (storageId) => {
          const url = await ctx.storage.getUrl(storageId);
          return url ? { storageId, url } : null;
        }),
      )
    ).filter((g): g is { storageId: Id<"_storage">; url: string } => g !== null);

    // Redact the locked personal section when the caller may not view it.
    // Family is personal too — hidden from colleagues, shown to self + HR/admin.
    // Training & certification stays visible to everyone (professional info,
    // like experience/education), so it's not part of this block.
    const personal = canViewPersonal
      ? {
          dob: employee.dob,
          gender: employee.gender,
          maritalStatus: employee.maritalStatus,
          nationality: employee.nationality,
          idNumberMasked: employee.idNumberMasked,
          idNumberLast4: employee.idNumberLast4,
          address: employee.address,
          contact: employee.contact,
          personalFields: employee.personalFields,
          familyMembers: employee.familyMembers,
        }
      : {
          dob: undefined,
          gender: undefined,
          maritalStatus: undefined,
          nationality: undefined,
          idNumberMasked: undefined,
          idNumberLast4: undefined,
          address: undefined,
          // Work email is not private; keep it, drop personal email + phone.
          contact: employee.contact?.workEmail
            ? { workEmail: employee.contact.workEmail }
            : undefined,
          personalFields: undefined,
          familyMembers: undefined,
        };

    return {
      ...employee,
      ...personal,
      photoUrl,
      galleryUrls,
      departmentName: department?.name ?? null,
      teamName: team?.name ?? null,
      positionTitle: position?.title ?? null,
      managerName: manager
        ? `${manager.firstName} ${manager.lastName}`
        : null,
      officeName: office?.name ?? null,
      isSelf,
      canEdit,
      canManage,
      canViewPersonal,
      canViewCompensation,
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
    // The Clerk username used to add this person to the org, when they sign up
    // with a username instead of (or in addition to) an email.
    loginUsername: v.optional(v.string()),
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

    const { idNumber, status, loginEmail, loginUsername, invitedRole, ...rest } =
      args;
    const masked = idNumber ? maskId(idNumber) : undefined;
    const email = loginEmail?.trim().toLowerCase() || undefined;
    const username = loginUsername?.trim().toLowerCase() || undefined;
    // The invite email is canonical for work email; keep contact in sync.
    const contact = email
      ? { ...(rest.contact ?? {}), workEmail: email }
      : rest.contact;

    const id = await ctx.db.insert("employees", {
      orgId,
      ...rest,
      contact,
      loginEmail: email,
      loginUsername: username,
      invitedRole,
      status: status ?? "active",
      idNumberMasked: masked?.masked,
      idNumberLast4: masked?.last4,
      searchName: buildSearchName(args),
      createdBy: userId,
      updatedAt: Date.now(),
    });

    // If they're already in the org, link immediately; otherwise the link is
    // made when they join (members.linkEmployeeOnJoin) — via email on invite
    // acceptance, or via username once the org-add / signup completes.
    if (email) await linkExistingMember(ctx, orgId, id, email, invitedRole);
    if (username && !email)
      await linkExistingMemberByUsername(ctx, orgId, id, username, invitedRole);

    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "employee.create",
      entity: "employees",
      entityId: id,
      after: { employeeNumber: args.employeeNumber, loginEmail: email, loginUsername: username },
    });
    return id;
  },
});

// Create a vacant position — a placeholder role with no real person. Shows in
// the org chart + directory until filled. HR-controlled.
export const createVacant = mutation({
  args: {
    title: v.optional(v.string()),
    positionId: v.optional(v.id("positions")),
    departmentId: v.optional(v.id("departments")),
    teamId: v.optional(v.id("teams")),
    officeId: v.optional(v.id("offices")),
    managerId: v.optional(v.id("employees")),
    employmentType: v.optional(employmentType),
  },
  returns: v.id("employees"),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requirePermission(ctx, "employees:manage");
    const position = args.positionId ? await ctx.db.get(args.positionId) : null;
    const label = args.title?.trim() || position?.title || "Vacant";
    const employeeNumber = await nextEmployeeNumber(ctx, orgId);

    const id = await ctx.db.insert("employees", {
      orgId,
      isVacant: true,
      employeeNumber,
      firstName: label,
      lastName: "",
      positionId: args.positionId,
      departmentId: args.departmentId,
      teamId: args.teamId,
      officeId: args.officeId,
      managerId: args.managerId,
      employmentType: args.employmentType ?? "full_time",
      status: "active",
      joinDate: new Date().toISOString().slice(0, 10),
      searchName: buildSearchName({
        firstName: label,
        lastName: "",
        employeeNumber,
      }),
      createdBy: userId,
      updatedAt: Date.now(),
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "employee.createVacant",
      entity: "employees",
      entityId: id,
      after: { employeeNumber, title: label },
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

// Employee Self-Service: the caller edits their OWN profile. Limited to
// personal / contact / emergency fields — job, compensation, manager and
// status remain HR-controlled (see `update`).
// All-optional so a single mutation can both create a profile and save any one
// section inline. On create, first/last name are required (enforced in the
// handler). Job/compensation/manager/status stay HR-controlled (see `update`).
const selfEditableFields = {
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  preferredName: v.optional(v.string()),
  dob: v.optional(v.string()),
  gender: v.optional(gender),
  maritalStatus: v.optional(maritalStatus),
  nationality: v.optional(v.string()),
  address: v.optional(addressValidator),
  contact: v.optional(contactValidator),
  emergencyContacts: v.optional(v.array(emergencyContactValidator)),
  bio: v.optional(v.string()),
  personalFields: v.optional(v.array(personalFieldValidator)),
  experience: v.optional(v.array(resumeEntryValidator)),
  education: v.optional(v.array(resumeEntryValidator)),
  familyMembers: v.optional(v.array(familyMemberValidator)),
  trainings: v.optional(v.array(resumeEntryValidator)),
};

// Auto-generate the next free employee number for self-provisioned profiles
// (HR-created employees still pick their own). Format: E0001, E0002, …
async function nextEmployeeNumber(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
): Promise<string> {
  const all = await ctx.db
    .query("employees")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  const taken = new Set(all.map((e) => e.employeeNumber));
  let n = all.length + 1;
  let candidate = `E${String(n).padStart(4, "0")}`;
  while (taken.has(candidate)) {
    n += 1;
    candidate = `E${String(n).padStart(4, "0")}`;
  }
  return candidate;
}

// Employee Self-Service upsert: the caller creates OR edits their OWN profile.
// Anyone in the org can complete their personal details even if HR hasn't
// created an employee record for them yet. Job/compensation/manager/status
// remain HR-controlled (see `update`).
export const updateOwnProfile = mutation({
  args: selfEditableFields,
  returns: v.null(),
  handler: async (ctx, patch) => {
    const orgCtx = await requireOrg(ctx);
    const me = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    const userEmail = orgCtx.user.email?.trim().toLowerCase() || undefined;

    // Work email stays tied to the org account — never editable via self-edit.
    // Merge any contact changes onto the existing contact so a section save that
    // only touches phone/personal email doesn't clobber the rest.
    const lockedWorkEmail = me?.contact?.workEmail ?? userEmail;
    const contact = patch.contact
      ? { ...me?.contact, ...patch.contact, workEmail: lockedWorkEmail }
      : (me?.contact ?? (userEmail ? { workEmail: userEmail } : undefined));

    if (!me) {
      // Self-provision a new employee record linked to the caller. Name is the
      // one required field to bootstrap a record.
      if (!patch.firstName || !patch.lastName) {
        throw new Error("First and last name are required to create a profile.");
      }
      const employeeNumber = await nextEmployeeNumber(ctx, orgCtx.orgId);
      const id = await ctx.db.insert("employees", {
        orgId: orgCtx.orgId,
        userId: orgCtx.userId,
        employeeNumber,
        firstName: patch.firstName,
        lastName: patch.lastName,
        preferredName: patch.preferredName,
        dob: patch.dob,
        gender: patch.gender,
        maritalStatus: patch.maritalStatus,
        nationality: patch.nationality,
        address: patch.address,
        contact,
        emergencyContacts: patch.emergencyContacts,
        bio: patch.bio,
        personalFields: patch.personalFields,
        experience: patch.experience,
        education: patch.education,
        familyMembers: patch.familyMembers,
        trainings: patch.trainings,
        employmentType: "full_time",
        status: "active",
        joinDate: new Date().toISOString().slice(0, 10),
        loginEmail: userEmail,
        searchName: buildSearchName({
          firstName: patch.firstName,
          lastName: patch.lastName,
          preferredName: patch.preferredName,
          employeeNumber,
        }),
        createdBy: orgCtx.userId,
        updatedAt: Date.now(),
      });
      await writeAuditLog(ctx, {
        orgId: orgCtx.orgId,
        actorUserId: orgCtx.userId,
        action: "employee.selfCreate",
        entity: "employees",
        entityId: id,
        after: { employeeNumber },
      });
      return null;
    }

    // Merge: patch only updates provided keys. Recompute search name only when
    // a name component is part of this save.
    const next: Record<string, unknown> = {
      ...patch,
      contact,
      updatedAt: Date.now(),
    };
    if (
      patch.firstName !== undefined ||
      patch.lastName !== undefined ||
      patch.preferredName !== undefined
    ) {
      next.searchName = buildSearchName({
        firstName: patch.firstName ?? me.firstName,
        lastName: patch.lastName ?? me.lastName,
        preferredName: patch.preferredName ?? me.preferredName,
        employeeNumber: me.employeeNumber,
      });
    }
    await ctx.db.patch(me._id, next);
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "employee.updateOwnProfile",
      entity: "employees",
      entityId: me._id,
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

// Best-effort storage delete — ignores already-removed files.
async function tryDeleteStorage(ctx: MutationCtx, id?: Id<"_storage"> | null) {
  if (!id) return;
  try {
    await ctx.storage.delete(id);
  } catch {
    // already gone
  }
}

// Permanently delete an employee and cascade their owned operational records
// (documents, equipment, job history, leave, claims, attendance, scheduling,
// compensation, performance) plus their files, and clear references other rows
// hold to them (reports' manager, dept head, team lead, hiring manager,
// appraiser, feed audiences). Financial records are protected: an employee with
// payslips can't be deleted — archive instead to preserve payroll history.
export const remove = mutation({
  args: { employeeId: v.id("employees") },
  returns: v.null(),
  handler: async (ctx, { employeeId }) => {
    const { orgId, userId } = await requirePermission(ctx, "employees:manage");
    const employee = await ctx.db.get(employeeId);
    if (!employee || employee.orgId !== orgId) {
      throw new Error("Employee not found.");
    }

    // Protect payroll history: a generated payslip is a financial record.
    const payslip = await ctx.db
      .query("payslips")
      .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
      .first();
    if (payslip) {
      throw new Error(
        "This employee has payslips. Archive them instead of deleting to preserve payroll records.",
      );
    }

    // ── Delete owned records (+ their files) ────────────────────────────────
    const documents = await ctx.db
      .query("employeeDocuments")
      .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
      .collect();
    for (const d of documents) {
      await tryDeleteStorage(ctx, d.storageId);
      for (const sid of d.storageIds ?? []) await tryDeleteStorage(ctx, sid);
      await ctx.db.delete(d._id);
    }

    const claims = await ctx.db
      .query("claims")
      .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
      .collect();
    for (const c of claims) {
      for (const sid of c.receiptStorageIds) await tryDeleteStorage(ctx, sid);
      const comments = await ctx.db
        .query("claimComments")
        .withIndex("by_claim", (q) => q.eq("claimId", c._id))
        .collect();
      for (const cm of comments) await ctx.db.delete(cm._id);
      await ctx.db.delete(c._id);
    }

    const leaveRequests = await ctx.db
      .query("leaveRequests")
      .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
      .collect();
    for (const lr of leaveRequests) {
      await tryDeleteStorage(ctx, lr.attachmentStorageId);
      await ctx.db.delete(lr._id);
    }

    // Straightforward by-employee deletes (no owned files).
    const leaveBalances = await ctx.db
      .query("leaveBalances")
      .withIndex("by_org_employee_year", (q) =>
        q.eq("orgId", orgId).eq("employeeId", employeeId),
      )
      .collect();
    for (const row of leaveBalances) await ctx.db.delete(row._id);

    const equipment = await ctx.db
      .query("equipment")
      .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
      .collect();
    for (const row of equipment) await ctx.db.delete(row._id);

    const jobHistory = await ctx.db
      .query("jobHistory")
      .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
      .collect();
    for (const row of jobHistory) await ctx.db.delete(row._id);

    const attendance = await ctx.db
      .query("attendanceRecords")
      .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
      .collect();
    for (const row of attendance) await ctx.db.delete(row._id);

    const corrections = await ctx.db
      .query("attendanceCorrections")
      .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
      .collect();
    for (const row of corrections) await ctx.db.delete(row._id);

    const shifts = await ctx.db
      .query("shiftAssignments")
      .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
      .collect();
    for (const row of shifts) await ctx.db.delete(row._id);

    const compensation = await ctx.db
      .query("compensation")
      .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
      .collect();
    for (const row of compensation) await ctx.db.delete(row._id);

    const goals = await ctx.db
      .query("goals")
      .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
      .collect();
    for (const row of goals) await ctx.db.delete(row._id);

    const devPlans = await ctx.db
      .query("developmentPlans")
      .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
      .collect();
    for (const row of devPlans) await ctx.db.delete(row._id);

    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
      .collect();
    for (const row of reviews) await ctx.db.delete(row._id);

    const reviewObjectives = await ctx.db
      .query("reviewObjectives")
      .withIndex("by_employee_cycle", (q) => q.eq("employeeId", employeeId))
      .collect();
    for (const row of reviewObjectives) await ctx.db.delete(row._id);

    const reviewCompetencies = await ctx.db
      .query("reviewCompetencies")
      .withIndex("by_employee_cycle", (q) => q.eq("employeeId", employeeId))
      .collect();
    for (const row of reviewCompetencies) await ctx.db.delete(row._id);

    const feedbackAbout = await ctx.db
      .query("feedback")
      .withIndex("by_subject", (q) => q.eq("subjectEmployeeId", employeeId))
      .collect();
    for (const row of feedbackAbout) await ctx.db.delete(row._id);

    const f360Subject = await ctx.db
      .query("feedback360Assignments")
      .withIndex("by_subject", (q) => q.eq("subjectEmployeeId", employeeId))
      .collect();
    for (const row of f360Subject) await ctx.db.delete(row._id);
    const f360Giver = await ctx.db
      .query("feedback360Assignments")
      .withIndex("by_giver_status", (q) => q.eq("giverEmployeeId", employeeId))
      .collect();
    for (const row of f360Giver) await ctx.db.delete(row._id);

    // leavePolicyAssignments has no by-employee index; it's a small table.
    const assignments = await ctx.db.query("leavePolicyAssignments").collect();
    for (const a of assignments) {
      if (a.employeeId === employeeId) await ctx.db.delete(a._id);
    }

    // ── Clear references other rows hold to this employee ──────────────────
    const reports = await ctx.db
      .query("employees")
      .withIndex("by_org_manager", (q) =>
        q.eq("orgId", orgId).eq("managerId", employeeId),
      )
      .collect();
    for (const r of reports) await ctx.db.patch(r._id, { managerId: undefined });

    const appraisals = await ctx.db
      .query("reviews")
      .withIndex("by_manager_status", (q) => q.eq("managerId", employeeId))
      .collect();
    for (const r of appraisals) await ctx.db.patch(r._id, { managerId: undefined });

    const departments = await ctx.db
      .query("departments")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    for (const d of departments) {
      if (d.headEmployeeId === employeeId) {
        await ctx.db.patch(d._id, { headEmployeeId: undefined });
      }
    }

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    for (const t of teams) {
      if (t.leadEmployeeId === employeeId) {
        await ctx.db.patch(t._id, { leadEmployeeId: undefined });
      }
    }

    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    for (const j of jobs) {
      if (j.hiringManagerEmployeeId === employeeId) {
        await ctx.db.patch(j._id, { hiringManagerEmployeeId: undefined });
      }
    }

    const feedPosts = await ctx.db
      .query("feedPosts")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    for (const p of feedPosts) {
      if (p.audienceEmployeeIds?.includes(employeeId)) {
        await ctx.db.patch(p._id, {
          audienceEmployeeIds: p.audienceEmployeeIds.filter(
            (e) => e !== employeeId,
          ),
        });
      }
    }

    // ── Finally, the employee + their own files ─────────────────────────────
    await tryDeleteStorage(ctx, employee.photoStorageId);
    for (const sid of employee.galleryStorageIds ?? []) {
      await tryDeleteStorage(ctx, sid);
    }
    await ctx.db.delete(employeeId);

    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "employee.delete",
      entity: "employees",
      entityId: employeeId,
      before: {
        employeeNumber: employee.employeeNumber,
        name: `${employee.firstName} ${employee.lastName}`,
      },
    });
    return null;
  },
});

// ─── Photo upload ────────────────────────────────────────────────────────

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    // Any org member may obtain an upload URL (e.g. self-service photo change).
    // The actual photo assignment is authorized in setPhoto / setMyPhoto.
    await requireOrg(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

// Self-service: the caller sets their OWN profile photo.
export const setMyPhoto = mutation({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { storageId }) => {
    const orgCtx = await requireOrg(ctx);
    const me = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    if (!me) throw new Error("You don't have an employee profile.");
    if (me.photoStorageId) await ctx.storage.delete(me.photoStorageId);
    await ctx.db.patch(me._id, { photoStorageId: storageId });
    return null;
  },
});

const MAX_GALLERY_PHOTOS = 10;

// Self-service: append a photo to the caller's own gallery (max 10).
export const addGalleryPhoto = mutation({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { storageId }) => {
    const orgCtx = await requireOrg(ctx);
    const me = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    if (!me) throw new Error("You don't have an employee profile.");
    const gallery = me.galleryStorageIds ?? [];
    if (gallery.length >= MAX_GALLERY_PHOTOS) {
      // Don't leak the orphaned upload.
      await ctx.storage.delete(storageId);
      throw new Error(`You can upload at most ${MAX_GALLERY_PHOTOS} photos.`);
    }
    await ctx.db.patch(me._id, { galleryStorageIds: [...gallery, storageId] });
    return null;
  },
});

// Self-service: remove a photo from the caller's own gallery.
export const removeGalleryPhoto = mutation({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { storageId }) => {
    const orgCtx = await requireOrg(ctx);
    const me = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    if (!me) throw new Error("You don't have an employee profile.");
    const gallery = me.galleryStorageIds ?? [];
    if (!gallery.includes(storageId)) return null;
    await ctx.storage.delete(storageId);
    await ctx.db.patch(me._id, {
      galleryStorageIds: gallery.filter((id) => id !== storageId),
    });
    return null;
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
