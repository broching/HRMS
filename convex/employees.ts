import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
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
import {
  requireOrg,
  getOrgContext,
  requirePermission,
  requireAnyPermission,
} from "./auth";
import { ctxHasPermission } from "./auth";
import { internal } from "./_generated/api";
import { memberByOrgAndUser } from "./members";
import { writeAuditLog } from "./lib/audit";
import { buildSearchName } from "./model/employee";
import { encryptId } from "./lib/crypto";
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

// The encrypted national-ID ciphertext is stored on the row but must never reach
// a client — `employeeDoc` (and every query returning it) deliberately omits it.
// Strip it from a raw row before returning so strict returns validation passes.
function stripSensitive<T extends { idNumberEncrypted?: string }>(
  employee: T,
): Omit<T, "idNumberEncrypted"> {
  const { idNumberEncrypted: _omit, ...safe } = employee;
  return safe;
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

export function maskId(idNumber: string): { masked: string; last4: string } {
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
      officeName: e.officeId ? officeName.get(e.officeId) : undefined,
      photoUrl: e.photoUrl ?? null,
      isVacant: e.isVacant,
    }));
  },
});

// Paginated directory page — the employee-list table. Kept separate from
// `list` (which the name-picker callers rely on as a plain array) so the table
// has no directory-size ceiling. See usePaginatedQuery in employee-directory.
export const directoryPage = query({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    status: v.optional(employeeStatus),
    departmentId: v.optional(v.id("departments")),
    officeId: v.optional(v.id("offices")),
    joinedBefore: v.optional(v.string()), // ISO date — joinDate <= this
  },
  returns: paginationResultValidator(employeeRow),
  handler: async (ctx, args) => {
    const { orgId } = await requireOrg(ctx);
    const search = args.search?.trim();

    // Non-search results are ordered by employeeNumber (stable directory order)
    // via by_org_employeeNumber; search results are relevance-ordered. Status is
    // pushed into the search index (its only free filter field). The remaining
    // optional filters have no dedicated index and are applied to each page in
    // memory below.
    const base = search
      ? ctx.db.query("employees").withSearchIndex("search_name", (s) => {
          const b = s.search("searchName", search).eq("orgId", orgId);
          return args.status ? b.eq("status", args.status) : b;
        })
      : ctx.db
          .query("employees")
          .withIndex("by_org_employeeNumber", (i) => i.eq("orgId", orgId));

    const result = await base.paginate(args.paginationOpts);

    // Secondary filters (no dedicated index) applied to the fetched page. A page
    // may render short when filters are active; usePaginatedQuery's isDone /
    // loadMore keeps fetching until the data is exhausted. This scans no more
    // rows than the previous full-org collect did.
    let rows = result.page;
    if (!search && args.status) {
      rows = rows.filter((e) => e.status === args.status);
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

    // Resolve small org-structure lookups once for label hydration.
    const [departments, positions, offices] = await Promise.all([
      ctx.db.query("departments").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
      ctx.db.query("positions").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
      ctx.db.query("offices").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
    ]);
    const deptName = new Map(departments.map((d) => [d._id, d.name]));
    const posTitle = new Map(positions.map((p) => [p._id, p.title]));
    const officeName = new Map(offices.map((o) => [o._id, o.name]));

    const page = rows.map((e) => ({
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
      photoUrl: e.photoUrl ?? null,
      isVacant: e.isVacant,
    }));

    return { ...result, page };
  },
});

// Flat, spreadsheet-ready export of every employee — HR bulk download. Unlike
// `list`, this isn't paginated for a table: it's meant to be piped straight
// into a CSV/Excel builder. Personal fields (dob, gender, marital status,
// nationality, address, personal email/phone) are included only when the
// caller also holds employees:read:all, mirroring the redaction in `get`.
export const exportRows = query({
  args: {},
  returns: v.array(
    v.object({
      employeeNumber: v.string(),
      firstName: v.string(),
      lastName: v.string(),
      preferredName: v.optional(v.string()),
      status: employeeStatus,
      employmentType: employmentType,
      departmentName: v.optional(v.string()),
      positionTitle: v.optional(v.string()),
      teamName: v.optional(v.string()),
      officeName: v.optional(v.string()),
      managerName: v.optional(v.string()),
      joinDate: v.string(),
      confirmationDate: v.optional(v.string()),
      probationEndDate: v.optional(v.string()),
      exitDate: v.optional(v.string()),
      workEmail: v.optional(v.string()),
      personalEmail: v.optional(v.string()),
      phone: v.optional(v.string()),
      dob: v.optional(v.string()),
      gender: v.optional(gender),
      maritalStatus: v.optional(maritalStatus),
      nationality: v.optional(v.string()),
      addressLine1: v.optional(v.string()),
      addressLine2: v.optional(v.string()),
      city: v.optional(v.string()),
      state: v.optional(v.string()),
      postalCode: v.optional(v.string()),
      country: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => {
    const orgCtx = await requirePermission(ctx, "employees:manage");
    const { orgId } = orgCtx;
    const canViewPersonal = ctxHasPermission(orgCtx, "employees:read:all");

    const employees = await ctx.db
      .query("employees")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .take(2000);

    const [departments, positions, offices, teams] = await Promise.all([
      ctx.db.query("departments").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
      ctx.db.query("positions").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
      ctx.db.query("offices").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
      ctx.db.query("teams").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
    ]);
    const deptName = new Map(departments.map((d) => [d._id, d.name]));
    const posTitle = new Map(positions.map((p) => [p._id, p.title]));
    const officeName = new Map(offices.map((o) => [o._id, o.name]));
    const teamNameById = new Map(teams.map((t) => [t._id, t.name]));
    const empById = new Map(employees.map((e) => [e._id, e]));

    const rows = employees
      .filter((e) => !e.isVacant)
      .map((e) => {
        const manager = e.managerId ? empById.get(e.managerId) : undefined;
        return {
          employeeNumber: e.employeeNumber,
          firstName: e.firstName,
          lastName: e.lastName,
          preferredName: e.preferredName,
          status: e.status,
          employmentType: e.employmentType,
          departmentName: e.departmentId ? deptName.get(e.departmentId) : undefined,
          positionTitle: e.positionId ? posTitle.get(e.positionId) : undefined,
          teamName: e.teamId ? teamNameById.get(e.teamId) : undefined,
          officeName: e.officeId ? officeName.get(e.officeId) : undefined,
          managerName: manager
            ? `${manager.preferredName ?? manager.firstName} ${manager.lastName}`
            : undefined,
          joinDate: e.joinDate,
          confirmationDate: e.confirmationDate,
          probationEndDate: e.probationEndDate,
          exitDate: e.exitDate,
          workEmail: e.contact?.workEmail,
          personalEmail: canViewPersonal ? e.contact?.personalEmail : undefined,
          phone: canViewPersonal ? e.contact?.phone : undefined,
          dob: canViewPersonal ? e.dob : undefined,
          gender: canViewPersonal ? e.gender : undefined,
          maritalStatus: canViewPersonal ? e.maritalStatus : undefined,
          nationality: canViewPersonal ? e.nationality : undefined,
          addressLine1: canViewPersonal ? e.address?.line1 : undefined,
          addressLine2: canViewPersonal ? e.address?.line2 : undefined,
          city: canViewPersonal ? e.address?.city : undefined,
          state: canViewPersonal ? e.address?.state : undefined,
          postalCode: canViewPersonal ? e.address?.postalCode : undefined,
          country: canViewPersonal ? e.address?.country : undefined,
        };
      });
    rows.sort((a, b) => a.employeeNumber.localeCompare(b.employeeNumber));
    return rows;
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
        photoUrl: e.photoUrl ?? null,
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
        additionalManagerIds: e.additionalManagerIds ?? [],
        positionId: e.positionId ?? null,
        positionTitle: e.positionId ? (posTitle.get(e.positionId) ?? null) : null,
        departmentId: e.departmentId ?? null,
        departmentName: e.departmentId ? (deptName.get(e.departmentId) ?? null) : null,
        officeId: e.officeId ?? null,
        officeName: e.officeId ? (officeName.get(e.officeId) ?? null) : null,
        workEmail: e.contact?.workEmail ?? null,
        photoUrl: e.photoUrl ?? null,
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
    const photoUrl = employee.photoUrl ?? null;
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

    // Never expose the encrypted NRIC/FIN — it's decrypted only in gated
    // statutory (IR8A) functions, never in a profile read.
    const { idNumberEncrypted: _idEnc, ...employeeSafe } = employee;
    return {
      ...employeeSafe,
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
    const employee = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    return employee ? stripSensitive(employee) : null;
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
    const reports = await ctx.db
      .query("employees")
      .withIndex("by_org_manager", (q) =>
        q.eq("orgId", orgCtx.orgId).eq("managerId", own._id),
      )
      .collect();
    return reports.map(stripSensitive);
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
        photoUrl: t.photoUrl ?? null,
      })),
    )

    return {
      hasProfile: true as const,
      employeeId: me._id,
      employeeNumber: me.employeeNumber,
      name: `${me.preferredName ?? me.firstName} ${me.lastName}`,
      photoUrl: me.photoUrl ?? null,
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
            photoUrl: manager.photoUrl ?? null,
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
    const idNumberEncrypted = idNumber ? await encryptId(idNumber) : undefined;
    const email = loginEmail?.trim().toLowerCase() || undefined;
    const username = loginUsername?.trim().toLowerCase() || undefined;

    // The login identifier (work email or username) must be unique within the
    // org — otherwise two employee records would fight to link to the same
    // account. Reject early with a clear message rather than silently creating
    // a duplicate.
    if (email) {
      const emailDup = await ctx.db
        .query("employees")
        .withIndex("by_org_loginEmail", (q) =>
          q.eq("orgId", orgId).eq("loginEmail", email),
        )
        .first();
      if (emailDup) {
        throw new Error(
          `This work email is already assigned to employee ${emailDup.employeeNumber} (${emailDup.firstName} ${emailDup.lastName}).`,
        );
      }
    }
    if (username) {
      const usernameDup = await ctx.db
        .query("employees")
        .withIndex("by_org_loginUsername", (q) =>
          q.eq("orgId", orgId).eq("loginUsername", username),
        )
        .first();
      if (usernameDup) {
        throw new Error(
          `This username is already assigned to employee ${usernameDup.employeeNumber} (${usernameDup.firstName} ${usernameDup.lastName}).`,
        );
      }
    }
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
      idNumberEncrypted,
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
    // Attendance override: true/false forces on/off; null clears the override
    // (inherit the org default); absent leaves it untouched.
    attendanceRequired: v.optional(v.union(v.boolean(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, { employeeId, idNumber, ...patch }) => {
    const { orgId, userId } = await requirePermission(ctx, "employees:manage");
    const existing = await ctx.db.get(employeeId);
    if (!existing || existing.orgId !== orgId) {
      throw new Error("Employee not found.");
    }

    const next: Record<string, unknown> = { ...patch, updatedAt: Date.now() };
    // null override means "inherit the org default" — patch to undefined so the
    // field is removed from the document.
    if (patch.attendanceRequired === null) next.attendanceRequired = undefined;
    if (idNumber !== undefined) {
      const masked = maskId(idNumber);
      next.idNumberMasked = masked.masked;
      next.idNumberLast4 = masked.last4;
      next.idNumberEncrypted = idNumber ? await encryptId(idNumber) : undefined;
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

// Deactivate (offboard) someone who has left the org: terminate the employee
// record AND revoke their login. Setting the linked member to `removed` blocks
// all app access immediately (enforced in getOrgContext), and we schedule their
// removal from the Clerk organization so their session can't keep carrying it.
// History is preserved (unlike `remove`) and it's reversible via `reactivate`.
export const deactivate = mutation({
  args: { employeeId: v.id("employees"), exitDate: v.optional(v.string()) },
  returns: v.object({ revokedLogin: v.boolean() }),
  handler: async (ctx, { employeeId, exitDate }) => {
    const { orgId, userId } = await requirePermission(ctx, "employees:manage");
    const employee = await ctx.db.get(employeeId);
    if (!employee || employee.orgId !== orgId) {
      throw new Error("Employee not found.");
    }
    // Guard against locking yourself out of the org.
    if (employee.userId && employee.userId === userId) {
      throw new Error("You can't deactivate your own account.");
    }

    await ctx.db.patch(employeeId, {
      status: "terminated",
      exitDate: exitDate ?? new Date().toISOString().slice(0, 10),
      updatedAt: Date.now(),
    });

    // Revoke the login account, if this person ever joined.
    let revokedLogin = false;
    if (employee.userId) {
      const member = await memberByOrgAndUser(ctx, orgId, employee.userId);
      if (member && member.status !== "removed") {
        await ctx.db.patch(member._id, { status: "removed" });
        revokedLogin = true;
      }
      const user = await ctx.db.get(employee.userId);
      const org = await ctx.db.get(orgId);
      if (user?.externalId && org) {
        await ctx.scheduler.runAfter(
          0,
          internal.orgMembers.removeFromClerkOrg,
          { clerkOrgId: org.clerkOrgId, clerkUserId: user.externalId },
        );
      }
    }

    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "employee.deactivate",
      entity: "employees",
      entityId: employeeId,
      after: { status: "terminated", revokedLogin },
    });
    return { revokedLogin };
  },
});

// Reverse a deactivation: restore the employee (default `active`) and re-grant
// their login — the linked member goes back to `active` and we re-add them to
// the Clerk organization.
export const reactivate = mutation({
  args: { employeeId: v.id("employees"), status: v.optional(employeeStatus) },
  returns: v.null(),
  handler: async (ctx, { employeeId, status }) => {
    const { orgId, userId } = await requirePermission(ctx, "employees:manage");
    const employee = await ctx.db.get(employeeId);
    if (!employee || employee.orgId !== orgId) {
      throw new Error("Employee not found.");
    }

    await ctx.db.patch(employeeId, {
      status: status ?? "active",
      exitDate: undefined,
      updatedAt: Date.now(),
    });

    if (employee.userId) {
      const member = await memberByOrgAndUser(ctx, orgId, employee.userId);
      if (member && member.status === "removed") {
        await ctx.db.patch(member._id, { status: "active" });
        const user = await ctx.db.get(employee.userId);
        const org = await ctx.db.get(orgId);
        if (user?.externalId && org) {
          await ctx.scheduler.runAfter(0, internal.orgMembers.addToClerkOrg, {
            clerkOrgId: org.clerkOrgId,
            clerkUserId: user.externalId,
            role: member.role,
          });
        }
      }
    }

    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "employee.reactivate",
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
    await ctx.db.patch(me._id, {
      photoStorageId: storageId,
      photoUrl: (await ctx.storage.getUrl(storageId)) ?? undefined,
    });
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
    await ctx.db.patch(employeeId, {
      photoStorageId: storageId,
      photoUrl: (await ctx.storage.getUrl(storageId)) ?? undefined,
    });
    return null;
  },
});

// ─── Org chart layout (shared arrangement + reporting-line edits) ──────────

// Saved node coordinates for the org chart. Directory-safe read (same audience
// as `orgChart`): any org member sees the shared arrangement; only managers
// write it.
export const layoutPositions = query({
  args: {},
  returns: v.array(
    v.object({
      employeeId: v.id("employees"),
      x: v.number(),
      y: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const { orgId, userId } = await requireOrg(ctx);
    const rows = await ctx.db
      .query("orgChartPositions")
      .withIndex("by_org_user", (q) => q.eq("orgId", orgId).eq("userId", userId))
      .collect();
    return rows.map((r) => ({ employeeId: r.employeeId, x: r.x, y: r.y }));
  },
});

// Persist node coordinates. Called once per drop with every moved subtree node
// batched. Upserts one row per employee via the by_org_employee index.
export const saveLayoutPositions = mutation({
  args: {
    positions: v.array(
      v.object({
        employeeId: v.id("employees"),
        x: v.number(),
        y: v.number(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { positions }) => {
    // Layout is per-user (see orgChartPositions' by_org_user index) — purely a
    // personal display preference, so any org member may rearrange their own
    // view. Reassigning a reporting line is a separate, gated action below.
    const { orgId, userId } = await requireOrg(ctx);
    const now = Date.now();
    for (const p of positions) {
      // Defensive: only persist positions for employees in this org.
      const emp = await ctx.db.get(p.employeeId);
      if (!emp || emp.orgId !== orgId) continue;
      const existing = await ctx.db
        .query("orgChartPositions")
        .withIndex("by_org_user_employee", (q) =>
          q.eq("orgId", orgId).eq("userId", userId).eq("employeeId", p.employeeId),
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { x: p.x, y: p.y, updatedAt: now });
      } else {
        await ctx.db.insert("orgChartPositions", {
          orgId,
          userId,
          employeeId: p.employeeId,
          x: p.x,
          y: p.y,
          updatedAt: now,
        });
      }
    }
    return null;
  },
});

// Clear the shared layout → the chart reverts to the computed tidy-tree.
// Backs the "Auto arrange" button.
export const resetLayout = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // Per-user layout — any org member can reset their own view.
    const { orgId, userId } = await requireOrg(ctx);
    const rows = await ctx.db
      .query("orgChartPositions")
      .withIndex("by_org_user", (q) => q.eq("orgId", orgId).eq("userId", userId))
      .collect();
    for (const r of rows) await ctx.db.delete(r._id);
    return null;
  },
});

// Quick job edits from the org-chart card modal: department, position, office.
// Focused + all-optional so it never touches name/compensation. `null` clears a
// field; omit a field to leave it unchanged. Manager changes go through
// `setManager` (cycle-guarded). Gated on employees:manage OR employees:org_chart.
export const quickUpdateJob = mutation({
  args: {
    employeeId: v.id("employees"),
    departmentId: v.optional(v.union(v.id("departments"), v.null())),
    teamId: v.optional(v.union(v.id("teams"), v.null())),
    positionId: v.optional(v.union(v.id("positions"), v.null())),
    officeId: v.optional(v.union(v.id("offices"), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requireAnyPermission(ctx, [
      "employees:manage",
      "employees:org_chart",
    ]);
    const employee = await ctx.db.get(args.employeeId);
    if (!employee || employee.orgId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Employee not found." });
    }

    const patch: Record<string, unknown> = {};
    // For each provided field, verify the referenced doc is in this org, then
    // set it (null → undefined clears the field).
    if (args.departmentId !== undefined) {
      if (args.departmentId !== null) {
        const d = await ctx.db.get(args.departmentId);
        if (!d || d.orgId !== orgId)
          throw new ConvexError({ code: "INVALID", message: "Unknown department." });
      }
      patch.departmentId = args.departmentId ?? undefined;
    }
    if (args.teamId !== undefined) {
      if (args.teamId !== null) {
        const t = await ctx.db.get(args.teamId);
        if (!t || t.orgId !== orgId)
          throw new ConvexError({ code: "INVALID", message: "Unknown team." });
      }
      patch.teamId = args.teamId ?? undefined;
    }
    if (args.positionId !== undefined) {
      if (args.positionId !== null) {
        const p = await ctx.db.get(args.positionId);
        if (!p || p.orgId !== orgId)
          throw new ConvexError({ code: "INVALID", message: "Unknown position." });
      }
      patch.positionId = args.positionId ?? undefined;
    }
    if (args.officeId !== undefined) {
      if (args.officeId !== null) {
        const o = await ctx.db.get(args.officeId);
        if (!o || o.orgId !== orgId)
          throw new ConvexError({ code: "INVALID", message: "Unknown office." });
      }
      patch.officeId = args.officeId ?? undefined;
    }

    if (Object.keys(patch).length === 0) return null;
    patch.updatedAt = Date.now();
    await ctx.db.patch(args.employeeId, patch);
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "employee.quickUpdateJob",
      entity: "employees",
      entityId: args.employeeId,
    });
    return null;
  },
});

// Reassign a person's reporting line by dropping them onto a manager in the
// chart. Guards against self-management and cycles (can't report into your own
// subtree). Pass managerId: null to detach (report to no one). Gated on
// employees:manage OR employees:org_chart.
export const setManager = mutation({
  args: {
    employeeId: v.id("employees"),
    managerId: v.union(v.id("employees"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { employeeId, managerId }) => {
    const { orgId, userId } = await requireAnyPermission(ctx, [
      "employees:manage",
      "employees:org_chart",
    ]);

    const employee = await ctx.db.get(employeeId);
    if (!employee || employee.orgId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Employee not found." });
    }

    if (managerId === null) {
      if (employee.managerId === undefined) return null;
      await ctx.db.patch(employeeId, { managerId: undefined, updatedAt: Date.now() });
      await writeAuditLog(ctx, {
        orgId,
        actorUserId: userId,
        action: "employee.setManager",
        entity: "employees",
        entityId: employeeId,
        before: { managerId: employee.managerId ?? null },
        after: { managerId: null },
      });
      return null;
    }

    if (managerId === employeeId) {
      throw new ConvexError({
        code: "INVALID",
        message: "A person can't report to themselves.",
      });
    }
    const manager = await ctx.db.get(managerId);
    if (!manager || manager.orgId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Manager not found." });
    }

    // Cycle guard: walk up the proposed manager's chain — if it reaches the
    // employee, the assignment would create a loop.
    let cursor: Id<"employees"> | undefined = manager.managerId;
    const seen = new Set<Id<"employees">>([managerId]);
    while (cursor) {
      if (cursor === employeeId) {
        throw new ConvexError({
          code: "CYCLE",
          message: "That would make someone report into their own team.",
        });
      }
      if (seen.has(cursor)) break; // defend against a pre-existing loop
      seen.add(cursor);
      const next = await ctx.db.get(cursor);
      cursor = next?.managerId;
    }

    if (employee.managerId === managerId) return null;
    await ctx.db.patch(employeeId, { managerId, updatedAt: Date.now() });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "employee.setManager",
      entity: "employees",
      entityId: employeeId,
      before: { managerId: employee.managerId ?? null },
      after: { managerId },
    });
    return null;
  },
});

// Set the additional (dotted-line) managers for an employee. These grant the
// same team visibility + approval rights as the primary manager but never draw
// the solid org-chart hierarchy. Deduped; the person themselves and their
// primary manager are dropped (the primary is already covered by `managerId`).
// Pass an empty array to clear. Gated on employees:manage OR employees:org_chart.
export const setAdditionalManagers = mutation({
  args: {
    employeeId: v.id("employees"),
    managerIds: v.array(v.id("employees")),
  },
  returns: v.null(),
  handler: async (ctx, { employeeId, managerIds }) => {
    const { orgId, userId } = await requireAnyPermission(ctx, [
      "employees:manage",
      "employees:org_chart",
    ]);

    const employee = await ctx.db.get(employeeId);
    if (!employee || employee.orgId !== orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Employee not found." });
    }

    const cleaned: Id<"employees">[] = [];
    const seen = new Set<Id<"employees">>();
    for (const mid of managerIds) {
      if (mid === employeeId) continue; // can't manage themselves
      if (mid === employee.managerId) continue; // already the primary manager
      if (seen.has(mid)) continue;
      const mgr = await ctx.db.get(mid);
      if (!mgr || mgr.orgId !== orgId) {
        throw new ConvexError({ code: "NOT_FOUND", message: "Manager not found." });
      }
      seen.add(mid);
      cleaned.push(mid);
    }

    const before = employee.additionalManagerIds ?? [];
    const next = cleaned.length > 0 ? cleaned : undefined;
    // No-op if unchanged (same members, order-insensitive).
    if (
      before.length === cleaned.length &&
      before.every((id) => seen.has(id))
    ) {
      return null;
    }

    await ctx.db.patch(employeeId, {
      additionalManagerIds: next,
      updatedAt: Date.now(),
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "employee.setAdditionalManagers",
      entity: "employees",
      entityId: employeeId,
      before: { additionalManagerIds: before },
      after: { additionalManagerIds: cleaned },
    });
    return null;
  },
});
