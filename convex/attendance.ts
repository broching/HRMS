import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import {
  requireOrg,
  requireModule,
  getOrgContext,
  requirePermission,
  OrgContext,
} from "./auth";
import { ctxHasPermission } from "./auth";
import { employeeByUserId } from "./employees";
import {
  attendanceRow,
  attendanceStatusResult,
  presenceRow,
  correctionRow,
  attendanceBoardResult,
} from "./lib/validators";
import { reportingSubtree } from "./model/org";
import { writeAuditLog } from "./lib/audit";
import {
  signQrToken,
  verifyQrToken,
  peekQrPayload,
  newOfficeSecret,
} from "./model/qrToken";
import { checkGeofence } from "./model/geo";
import { localDateISO, localMinuteOfDay } from "./model/datetime";
import {
  getAttendanceSettings,
  attendanceRequiredFor,
} from "./attendanceSettings";

// Rotating clock-in QR validity. Kept short so a screenshot is not reusable.
const QR_TTL_MS = 90_000;

const geoArg = v.object({ lat: v.number(), lng: v.number() });

// ─── Hydration ─────────────────────────────────────────────────────────────

async function hydrateRecord(ctx: QueryCtx, rec: Doc<"attendanceRecords">) {
  const [emp, office] = await Promise.all([
    ctx.db.get(rec.employeeId),
    rec.officeId ? ctx.db.get(rec.officeId) : Promise.resolve(null),
  ]);
  return {
    _id: rec._id,
    _creationTime: rec._creationTime,
    employeeId: rec.employeeId,
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
    officeName: office?.name ?? null,
    date: rec.date,
    clockInAt: rec.clockInAt,
    clockOutAt: rec.clockOutAt ?? null,
    workedMinutes: rec.workedMinutes ?? null,
    method: rec.method,
    status: rec.status,
    note: rec.note ?? null,
  };
}

async function hydrateCorrection(
  ctx: QueryCtx,
  c: Doc<"attendanceCorrections">,
) {
  const emp = await ctx.db.get(c.employeeId);
  return {
    _id: c._id,
    _creationTime: c._creationTime,
    employeeId: c.employeeId,
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
    recordId: c.recordId ?? null,
    date: c.date,
    requestedClockInAt: c.requestedClockInAt ?? null,
    requestedClockOutAt: c.requestedClockOutAt ?? null,
    reason: c.reason,
    status: c.status,
    decisionNote: c.decisionNote ?? null,
  };
}

async function notify(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  recipientUserId: Id<"users"> | undefined,
  type: string,
  title: string,
  body: string,
  recordId?: Id<"attendanceRecords">,
) {
  if (!recipientUserId) return;
  await ctx.db.insert("notifications", {
    orgId,
    recipientUserId,
    type,
    title,
    body,
    entityRef: recordId
      ? { table: "attendanceRecords", id: recordId }
      : undefined,
    read: false,
  });
}

// Caller may manage an employee's attendance: HR/admin (attendance:config) or
// any manager above the employee in the reporting chain.
async function assertCanManageAttendance(
  ctx: QueryCtx,
  orgCtx: OrgContext,
  employeeId: Id<"employees">,
) {
  if (ctxHasPermission(orgCtx, "attendance:config")) return;
  const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
  if (own) {
    const subtree = await reportingSubtree(ctx, orgCtx.orgId, own._id);
    if (subtree.has(employeeId)) return;
  }
  throw new Error("Not authorized to manage this employee's attendance.");
}

// Caller may review a correction: HR/admin (attendance:config) or the
// requesting employee's direct manager.
async function assertCorrectionReviewer(
  ctx: QueryCtx,
  orgCtx: OrgContext,
  correction: Doc<"attendanceCorrections">,
) {
  await assertCanManageAttendance(ctx, orgCtx, correction.employeeId);
}

// ─── Office QR configuration ─────────────────────────────────────────────────

// Toggle QR clock-in for an office, minting a signing secret on first enable.
export const setOfficeQr = mutation({
  args: { officeId: v.id("offices"), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { officeId, enabled }) => {
    const { orgId, userId } = await requirePermission(ctx, "attendance:config");
    const office = await ctx.db.get(officeId);
    if (!office || office.orgId !== orgId) throw new Error("Office not found.");

    const patch: Partial<Doc<"offices">> = { qrEnabled: enabled };
    if (enabled && !office.qrSecret) patch.qrSecret = newOfficeSecret();
    await ctx.db.patch(officeId, patch);

    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: enabled ? "attendance.qr_enable" : "attendance.qr_disable",
      entity: "offices",
      entityId: officeId,
    });
    return null;
  },
});

// Set an office's QR presentation mode. Poster mode (a static printed code)
// requires a configured geofence, since the code never expires and the fence is
// the only thing tying a clock-in to the physical office.
export const setOfficeQrMode = mutation({
  args: {
    officeId: v.id("offices"),
    mode: v.union(v.literal("poster"), v.literal("kiosk")),
  },
  returns: v.null(),
  handler: async (ctx, { officeId, mode }) => {
    const { orgId, userId } = await requirePermission(ctx, "attendance:config");
    const office = await ctx.db.get(officeId);
    if (!office || office.orgId !== orgId) throw new Error("Office not found.");
    if (mode === "poster" && !(office.geo && office.radiusMeters)) {
      throw new Error(
        "Set this office's geofence before switching to a printed poster code.",
      );
    }
    await ctx.db.patch(officeId, { qrMode: mode });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "attendance.qr_mode",
      entity: "offices",
      entityId: officeId,
      after: { mode },
    });
    return null;
  },
});

// Mint the office's static (never-expiring) poster token. Safe to print and
// paste on a wall — a scan still has to pass the geofence to clock in.
export const generateStaticQr = mutation({
  args: { officeId: v.id("offices") },
  returns: v.object({ token: v.string(), officeName: v.string() }),
  handler: async (ctx, { officeId }) => {
    const { orgId } = await requirePermission(ctx, "attendance:config");
    const office = await ctx.db.get(officeId);
    if (!office || office.orgId !== orgId) throw new Error("Office not found.");
    if (!office.qrEnabled || !office.qrSecret) {
      throw new Error("QR clock-in is not enabled for this office.");
    }
    if (!(office.geo && office.radiusMeters)) {
      throw new Error("Set this office's geofence before generating a poster code.");
    }
    const token = await signQrToken(office.qrSecret, { o: officeId });
    return { token, officeName: office.name };
  },
});

// Mint a fresh, short-lived signed token for an office's kiosk display.
export const generateQrToken = mutation({
  args: { officeId: v.id("offices") },
  returns: v.object({
    token: v.string(),
    expiresAt: v.number(),
    ttlSeconds: v.number(),
    officeName: v.string(),
  }),
  handler: async (ctx, { officeId }) => {
    const { orgId } = await requirePermission(ctx, "attendance:config");
    const office = await ctx.db.get(officeId);
    if (!office || office.orgId !== orgId) throw new Error("Office not found.");
    if (!office.qrEnabled || !office.qrSecret) {
      throw new Error("QR clock-in is not enabled for this office.");
    }
    const expiresAt = Date.now() + QR_TTL_MS;
    const token = await signQrToken(office.qrSecret, {
      o: officeId,
      e: expiresAt,
    });
    return {
      token,
      expiresAt,
      ttlSeconds: Math.round(QR_TTL_MS / 1000),
      officeName: office.name,
    };
  },
});

// ─── Clock in / out ──────────────────────────────────────────────────────────

export const clockIn = mutation({
  args: {
    token: v.string(),
    geo: v.optional(geoArg),
    accuracy: v.optional(v.number()),
  },
  returns: v.object({
    recordId: v.id("attendanceRecords"),
    clockInAt: v.number(),
    officeName: v.string(),
  }),
  handler: async (ctx, { token, geo, accuracy }) => {
    const { orgId, userId } = await requireModule(ctx, "attendance");
    const own = await employeeByUserId(ctx, orgId, userId);
    if (!own) throw new Error("You don't have an employee profile yet.");

    const peeked = peekQrPayload(token);
    if (!peeked) throw new Error("That QR code isn't valid.");
    const office = await ctx.db.get(peeked.o as Id<"offices">);
    if (!office || office.orgId !== orgId || !office.qrEnabled || !office.qrSecret) {
      throw new Error("This QR code is not active.");
    }
    const payload = await verifyQrToken(office.qrSecret, token);
    if (!payload) throw new Error("This QR code is invalid or has been tampered with.");
    // Kiosk (rotating) codes carry an expiry; static poster codes don't and rely
    // on the geofence below instead.
    if (payload.e !== undefined && payload.e < Date.now()) {
      throw new Error("This QR code has expired — scan the latest one on the display.");
    }

    // Geofence (when the office has a configured location + radius). Distance is
    // always recorded for reference; it's only enforced when geoRequired isn't
    // explicitly disabled for this office. Offices that enforce the fence still
    // require a device fix — without one there's nothing to check against.
    const enforceGeo =
      office.geoRequired !== false && !!office.geo && !!office.radiusMeters;
    let distance: number | undefined;
    if (office.geo && office.radiusMeters && geo) {
      const fence = checkGeofence(office.geo, geo, office.radiusMeters, accuracy);
      distance = fence.distance;
      if (enforceGeo && !fence.ok) {
        throw new Error(
          `You appear to be about ${Math.round(fence.distance)}m from ${office.name}. Move closer to clock in.`,
        );
      }
    } else if (enforceGeo && !geo) {
      throw new Error(
        `${office.name} requires your location to clock in. Enable location access and try again.`,
      );
    }

    const existingOpen = await ctx.db
      .query("attendanceRecords")
      .withIndex("by_employee_status", (q) =>
        q.eq("employeeId", own._id).eq("status", "open"),
      )
      .first();
    if (existingOpen) throw new Error("You're already clocked in.");

    const now = Date.now();
    const recordId = await ctx.db.insert("attendanceRecords", {
      orgId,
      employeeId: own._id,
      officeId: office._id,
      date: localDateISO(now, office.timezone),
      clockInAt: now,
      clockInGeo: geo,
      clockInAccuracy: accuracy,
      clockInDistance: distance,
      method: "qr_gps",
      status: "open",
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "attendance.clock_in",
      entity: "attendanceRecords",
      entityId: recordId,
      after: { officeId: office._id, distance },
    });
    return { recordId, clockInAt: now, officeName: office.name };
  },
});

export const clockOut = mutation({
  args: { geo: v.optional(geoArg), accuracy: v.optional(v.number()) },
  returns: v.object({ workedMinutes: v.number() }),
  handler: async (ctx, { geo, accuracy }) => {
    const { orgId, userId } = await requireOrg(ctx);
    const own = await employeeByUserId(ctx, orgId, userId);
    if (!own) throw new Error("You don't have an employee profile yet.");

    const open = await ctx.db
      .query("attendanceRecords")
      .withIndex("by_employee_status", (q) =>
        q.eq("employeeId", own._id).eq("status", "open"),
      )
      .first();
    if (!open) throw new Error("You're not clocked in.");

    let distance: number | undefined;
    const office = open.officeId ? await ctx.db.get(open.officeId) : null;
    const enforceGeo =
      !!office && office.geoRequired !== false && !!office.geo && !!office.radiusMeters;
    if (office?.geo && office.radiusMeters && geo) {
      const fence = checkGeofence(office.geo, geo, office.radiusMeters, accuracy);
      distance = fence.distance;
      if (enforceGeo && !fence.ok) {
        throw new Error(
          `You appear to be about ${Math.round(fence.distance)}m from ${office.name}. Move closer to clock out.`,
        );
      }
    } else if (enforceGeo && !geo) {
      throw new Error(
        `${office!.name} requires your location to clock out. Enable location access and try again.`,
      );
    }

    const now = Date.now();
    const workedMinutes = Math.max(0, Math.round((now - open.clockInAt) / 60000));
    await ctx.db.patch(open._id, {
      status: "completed",
      clockOutAt: now,
      clockOutGeo: geo,
      clockOutAccuracy: accuracy,
      clockOutDistance: distance,
      workedMinutes,
    });
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "attendance.clock_out",
      entity: "attendanceRecords",
      entityId: open._id,
      after: { workedMinutes },
    });
    return { workedMinutes };
  },
});

// ─── Corrections ─────────────────────────────────────────────────────────────

export const requestCorrection = mutation({
  args: {
    recordId: v.optional(v.id("attendanceRecords")),
    date: v.string(),
    requestedClockInAt: v.optional(v.number()),
    requestedClockOutAt: v.optional(v.number()),
    reason: v.string(),
  },
  returns: v.id("attendanceCorrections"),
  handler: async (ctx, args) => {
    const { orgId, userId } = await requireOrg(ctx);
    const own = await employeeByUserId(ctx, orgId, userId);
    if (!own) throw new Error("You don't have an employee profile yet.");
    if (!args.reason.trim()) throw new Error("Please give a reason.");
    if (!args.requestedClockInAt && !args.requestedClockOutAt) {
      throw new Error("Provide a corrected clock-in or clock-out time.");
    }
    if (args.recordId) {
      const rec = await ctx.db.get(args.recordId);
      if (!rec || rec.employeeId !== own._id) {
        throw new Error("Attendance record not found.");
      }
    } else if (!args.requestedClockInAt) {
      throw new Error("A new entry needs a clock-in time.");
    }

    const id = await ctx.db.insert("attendanceCorrections", {
      orgId,
      employeeId: own._id,
      recordId: args.recordId,
      date: args.date,
      requestedClockInAt: args.requestedClockInAt,
      requestedClockOutAt: args.requestedClockOutAt,
      reason: args.reason.trim(),
      status: "pending",
    });

    if (own.managerId) {
      const manager = await ctx.db.get(own.managerId);
      await notify(
        ctx,
        orgId,
        manager?.userId,
        "attendance.correction_requested",
        "Attendance correction",
        `${own.firstName} ${own.lastName} requested a correction for ${args.date}`,
      );
    }
    await writeAuditLog(ctx, {
      orgId,
      actorUserId: userId,
      action: "attendance.correction_request",
      entity: "attendanceCorrections",
      entityId: id,
    });
    return id;
  },
});

export const reviewCorrection = mutation({
  args: {
    correctionId: v.id("attendanceCorrections"),
    approve: v.boolean(),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { correctionId, approve, note }) => {
    const orgCtx = await requireOrg(ctx);
    const correction = await ctx.db.get(correctionId);
    if (!correction || correction.orgId !== orgCtx.orgId) {
      throw new Error("Correction not found.");
    }
    if (correction.status !== "pending") {
      throw new Error("This correction has already been reviewed.");
    }
    await assertCorrectionReviewer(ctx, orgCtx, correction);

    if (approve) {
      await applyCorrection(ctx, orgCtx, correction);
    }
    await ctx.db.patch(correctionId, {
      status: approve ? "approved" : "rejected",
      reviewerUserId: orgCtx.userId,
      decidedAt: Date.now(),
      decisionNote: note,
    });

    const emp = await ctx.db.get(correction.employeeId);
    await notify(
      ctx,
      orgCtx.orgId,
      emp?.userId,
      approve ? "attendance.correction_approved" : "attendance.correction_rejected",
      approve ? "Correction approved" : "Correction rejected",
      `Your attendance correction for ${correction.date} was ${approve ? "approved" : "rejected"}.`,
    );
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: approve ? "attendance.correction_approve" : "attendance.correction_reject",
      entity: "attendanceCorrections",
      entityId: correctionId,
    });
    return null;
  },
});

// Write an approved correction onto the underlying record (or create one).
async function applyCorrection(
  ctx: MutationCtx,
  orgCtx: OrgContext,
  correction: Doc<"attendanceCorrections">,
) {
  if (correction.recordId) {
    const rec = await ctx.db.get(correction.recordId);
    if (!rec) return;
    const clockInAt = correction.requestedClockInAt ?? rec.clockInAt;
    const clockOutAt = correction.requestedClockOutAt ?? rec.clockOutAt;
    const completed = clockOutAt != null;
    await ctx.db.patch(rec._id, {
      clockInAt,
      clockOutAt,
      status: completed ? "completed" : "open",
      workedMinutes: completed
        ? Math.max(0, Math.round((clockOutAt! - clockInAt) / 60000))
        : undefined,
      correctedByUserId: orgCtx.userId,
    });
  } else {
    const clockInAt = correction.requestedClockInAt!;
    const clockOutAt = correction.requestedClockOutAt;
    const completed = clockOutAt != null;
    await ctx.db.insert("attendanceRecords", {
      orgId: orgCtx.orgId,
      employeeId: correction.employeeId,
      date: correction.date,
      clockInAt,
      clockOutAt,
      status: completed ? "completed" : "open",
      workedMinutes: completed
        ? Math.max(0, Math.round((clockOutAt! - clockInAt) / 60000))
        : undefined,
      method: "manual",
      note: "Created from approved correction",
      correctedByUserId: orgCtx.userId,
    });
  }
}

// Manager/HR directly sets or inserts an attendance record — the fallback when
// the system was down and an employee couldn't clock in/out normally. Creates a
// new manual record, or updates an existing one when `recordId` is given.
export const adjustRecord = mutation({
  args: {
    recordId: v.optional(v.id("attendanceRecords")),
    employeeId: v.id("employees"),
    date: v.string(),
    clockInAt: v.number(),
    clockOutAt: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  returns: v.id("attendanceRecords"),
  handler: async (ctx, args) => {
    const orgCtx = await requireOrg(ctx);
    await assertCanManageAttendance(ctx, orgCtx, args.employeeId);
    if (args.clockOutAt != null && args.clockOutAt < args.clockInAt) {
      throw new Error("Clock-out can't be before clock-in.");
    }
    const completed = args.clockOutAt != null;
    const workedMinutes = completed
      ? Math.max(0, Math.round((args.clockOutAt! - args.clockInAt) / 60000))
      : undefined;

    let recordId: Id<"attendanceRecords">;
    if (args.recordId) {
      const rec = await ctx.db.get(args.recordId);
      if (
        !rec ||
        rec.orgId !== orgCtx.orgId ||
        rec.employeeId !== args.employeeId
      ) {
        throw new Error("Attendance record not found.");
      }
      await ctx.db.patch(args.recordId, {
        clockInAt: args.clockInAt,
        clockOutAt: args.clockOutAt,
        status: completed ? "completed" : "open",
        workedMinutes,
        note: args.note?.trim() || rec.note,
        correctedByUserId: orgCtx.userId,
      });
      recordId = args.recordId;
    } else {
      recordId = await ctx.db.insert("attendanceRecords", {
        orgId: orgCtx.orgId,
        employeeId: args.employeeId,
        date: args.date,
        clockInAt: args.clockInAt,
        clockOutAt: args.clockOutAt,
        status: completed ? "completed" : "open",
        workedMinutes,
        method: "manual",
        note: args.note?.trim() || "Added by manager",
        correctedByUserId: orgCtx.userId,
      });
    }

    const emp = await ctx.db.get(args.employeeId);
    await notify(
      ctx,
      orgCtx.orgId,
      emp?.userId,
      "attendance.adjusted",
      "Attendance updated",
      `Your attendance for ${args.date} was updated by your manager.`,
      recordId,
    );
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "attendance.adjust",
      entity: "attendanceRecords",
      entityId: recordId,
    });
    return recordId;
  },
});

// Delete an attendance record (manager/HR). Used from the day board to remove a
// mistaken or duplicate clock session.
export const deleteRecord = mutation({
  args: { recordId: v.id("attendanceRecords") },
  returns: v.null(),
  handler: async (ctx, { recordId }) => {
    const orgCtx = await requireOrg(ctx);
    const rec = await ctx.db.get(recordId);
    if (!rec || rec.orgId !== orgCtx.orgId) {
      throw new Error("Attendance record not found.");
    }
    await assertCanManageAttendance(ctx, orgCtx, rec.employeeId);
    await ctx.db.delete(recordId);
    const emp = await ctx.db.get(rec.employeeId);
    await notify(
      ctx,
      orgCtx.orgId,
      emp?.userId,
      "attendance.adjusted",
      "Attendance removed",
      `An attendance record for ${rec.date} was removed by your manager.`,
      recordId,
    );
    await writeAuditLog(ctx, {
      orgId: orgCtx.orgId,
      actorUserId: orgCtx.userId,
      action: "attendance.delete",
      entity: "attendanceRecords",
      entityId: recordId,
      before: rec,
    });
    return null;
  },
});

// ─── Queries ─────────────────────────────────────────────────────────────────

// Whether the caller must clock attendance + whether they're currently open.
// Drives the Home quick-access card (shown when required or mid-session).
export const myAttendanceConfig = query({
  args: {},
  returns: v.object({
    hasProfile: v.boolean(),
    required: v.boolean(),
    hasOpenSession: v.boolean(),
  }),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) {
      return { hasProfile: false, required: false, hasOpenSession: false };
    }
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    if (!own) {
      return { hasProfile: false, required: false, hasOpenSession: false };
    }
    const settings = await getAttendanceSettings(ctx, orgCtx.orgId);
    const open = await ctx.db
      .query("attendanceRecords")
      .withIndex("by_employee_status", (q) =>
        q.eq("employeeId", own._id).eq("status", "open"),
      )
      .first();
    return {
      hasProfile: true,
      required: attendanceRequiredFor(own, settings),
      hasOpenSession: open !== null,
    };
  },
});

// The caller's live clock state + today's records (own self-service view).
export const myStatus = query({
  args: {},
  returns: attendanceStatusResult,
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return { open: null, today: [], hasProfile: false };
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    if (!own) return { open: null, today: [], hasProfile: false };

    const todayISO = localDateISO(Date.now(), orgCtx.org.settings.timezone);
    const [openRec, todayRecs] = await Promise.all([
      ctx.db
        .query("attendanceRecords")
        .withIndex("by_employee_status", (q) =>
          q.eq("employeeId", own._id).eq("status", "open"),
        )
        .first(),
      ctx.db
        .query("attendanceRecords")
        .withIndex("by_employee_date", (q) =>
          q.eq("employeeId", own._id).eq("date", todayISO),
        )
        .collect(),
    ]);

    const today = await Promise.all(todayRecs.map((r) => hydrateRecord(ctx, r)));
    today.sort((a, b) => b.clockInAt - a.clockInAt);
    return {
      open: openRec ? await hydrateRecord(ctx, openRec) : null,
      today,
      hasProfile: true,
    };
  },
});

// The caller's recent attendance history.
export const myHistory = query({
  args: {},
  returns: v.array(attendanceRow),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    if (!own) return [];
    const rows = await ctx.db
      .query("attendanceRecords")
      .withIndex("by_employee", (q) => q.eq("employeeId", own._id))
      .order("desc")
      .take(60);
    return await Promise.all(rows.map((r) => hydrateRecord(ctx, r)));
  },
});

// Who is currently clocked in — HR/admin see the whole org, managers see their
// direct reports.
export const teamToday = query({
  args: {},
  returns: v.array(presenceRow),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];

    let open: Doc<"attendanceRecords">[] = [];
    if (ctxHasPermission(orgCtx, "employees:read:all")) {
      open = await ctx.db
        .query("attendanceRecords")
        .withIndex("by_org_status", (q) =>
          q.eq("orgId", orgCtx.orgId).eq("status", "open"),
        )
        .take(500);
    } else {
      const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
      if (!own) return [];
      const reports = await ctx.db
        .query("employees")
        .withIndex("by_org_manager", (q) =>
          q.eq("orgId", orgCtx.orgId).eq("managerId", own._id),
        )
        .collect();
      const perReport = await Promise.all(
        reports.map((r) =>
          ctx.db
            .query("attendanceRecords")
            .withIndex("by_employee_status", (q) =>
              q.eq("employeeId", r._id).eq("status", "open"),
            )
            .first(),
        ),
      );
      open = perReport.filter((r): r is Doc<"attendanceRecords"> => r !== null);
    }

    const rows = await Promise.all(
      open.map(async (rec) => {
        const [emp, office] = await Promise.all([
          ctx.db.get(rec.employeeId),
          rec.officeId ? ctx.db.get(rec.officeId) : Promise.resolve(null),
        ]);
        return {
          recordId: rec._id,
          employeeId: rec.employeeId,
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
          officeName: office?.name ?? null,
          clockInAt: rec.clockInAt,
        };
      }),
    );
    rows.sort((a, b) => a.clockInAt - b.clockInAt);
    return rows;
  },
});

// A day's attendance as a timesheet-style board: one column per person with
// their clock sessions as minute-of-day blocks. `scope: "team"` shows the
// caller's reporting subtree; `scope: "org"` shows everyone (HR/admin only).
export const attendanceDayBoard = query({
  args: {
    date: v.string(),
    scope: v.union(v.literal("team"), v.literal("org")),
    departmentId: v.optional(v.id("departments")),
    teamId: v.optional(v.id("teams")),
  },
  returns: attendanceBoardResult,
  handler: async (ctx, { date, scope, departmentId, teamId }) => {
    const orgCtx = await getOrgContext(ctx);
    const empty = { date, people: [], totalMinutes: 0, peopleCount: 0 };
    if (!orgCtx) return empty;

    // Resolve the employees whose columns to show. Org scope needs a privileged
    // caller; team scope is the caller's reporting subtree.
    const settings = await getAttendanceSettings(ctx, orgCtx.orgId);
    let scopeEmployees: Doc<"employees">[];
    if (scope === "org") {
      if (
        !ctxHasPermission(orgCtx, "attendance:config") &&
        !ctxHasPermission(orgCtx, "employees:read:all")
      ) {
        return empty;
      }
      const all = await ctx.db
        .query("employees")
        .withIndex("by_org", (q) => q.eq("orgId", orgCtx.orgId))
        .collect();
      scopeEmployees = all.filter(
        (e) => e.status !== "terminated" && !e.isVacant,
      );
    } else {
      const me = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
      if (!me) return empty;
      const ids = await reportingSubtree(ctx, orgCtx.orgId, me._id);
      const docs = await Promise.all([...ids].map((id) => ctx.db.get(id)));
      scopeEmployees = docs.filter(
        (d): d is Doc<"employees"> =>
          d !== null && d.status !== "terminated" && !d.isVacant,
      );
    }

    const records = await ctx.db
      .query("attendanceRecords")
      .withIndex("by_org_date", (q) =>
        q.eq("orgId", orgCtx.orgId).eq("date", date),
      )
      .take(3000);

    const byEmp = new Map<Id<"employees">, Doc<"attendanceRecords">[]>();
    for (const r of records) {
      const arr = byEmp.get(r.employeeId) ?? [];
      arr.push(r);
      byEmp.set(r.employeeId, arr);
    }

    const orgTz = orgCtx.org.settings.timezone;
    const officeCache = new Map<
      string,
      { tz: string; name: string | null }
    >();
    async function office(officeId?: Id<"offices">) {
      if (!officeId) return { tz: orgTz, name: null };
      const k = officeId as string;
      const cached = officeCache.get(k);
      if (cached) return cached;
      const o = await ctx.db.get(officeId);
      const val = { tz: o?.timezone ?? orgTz, name: o?.name ?? null };
      officeCache.set(k, val);
      return val;
    }

    const now = Date.now();
    const people = [];
    let totalMinutes = 0;
    // Show a column for anyone who is attendance-required or has records that
    // day — the set of people you'd add/adjust attendance for.
    for (const emp of scopeEmployees) {
      if (departmentId && emp.departmentId !== departmentId) continue;
      if (teamId && emp.teamId !== teamId) continue;
      const recs = byEmp.get(emp._id) ?? [];
      if (recs.length === 0 && !attendanceRequiredFor(emp, settings)) continue;
      const employeeId = emp._id;
      const [position, photoUrl] = await Promise.all([
        emp.positionId ? ctx.db.get(emp.positionId) : Promise.resolve(null),
        Promise.resolve(emp.photoUrl ?? null),
      ]);

      recs.sort((a, b) => a.clockInAt - b.clockInAt);
      const blocks = [];
      let personMinutes = 0;
      let open = false;
      let officeName: string | null = null;
      for (const r of recs) {
        const off = await office(r.officeId);
        if (!officeName) officeName = off.name;
        const clockOutMinute =
          r.clockOutAt != null ? localMinuteOfDay(r.clockOutAt, off.tz) : null;
        const worked =
          r.workedMinutes ??
          (r.clockOutAt != null
            ? Math.max(0, Math.round((r.clockOutAt - r.clockInAt) / 60000))
            : Math.max(0, Math.round((now - r.clockInAt) / 60000)));
        personMinutes += worked;
        if (r.status === "open") open = true;
        blocks.push({
          _id: r._id,
          clockInMinute: localMinuteOfDay(r.clockInAt, off.tz),
          clockOutMinute,
          status: r.status,
          method: r.method,
          clockInAt: r.clockInAt,
          clockOutAt: r.clockOutAt ?? null,
          workedMinutes: r.workedMinutes ?? null,
          officeName: off.name,
          note: r.note ?? null,
          clockInDistance: r.clockInDistance ?? null,
        });
      }
      totalMinutes += personMinutes;
      people.push({
        employeeId,
        name: `${emp.firstName} ${emp.lastName}`,
        jobTitle: position?.title ?? null,
        photoUrl,
        officeName,
        blocks,
        totalMinutes: personMinutes,
        open,
      });
    }
    people.sort((a, b) => a.name.localeCompare(b.name));
    return { date, people, totalMinutes, peopleCount: people.length };
  },
});

// Pending corrections awaiting the caller's review (manager-scoped or HR/admin).
export const correctionQueue = query({
  args: {},
  returns: v.array(correctionRow),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];

    let pending: Doc<"attendanceCorrections">[] = [];
    if (ctxHasPermission(orgCtx, "attendance:config")) {
      pending = await ctx.db
        .query("attendanceCorrections")
        .withIndex("by_org_status", (q) =>
          q.eq("orgId", orgCtx.orgId).eq("status", "pending"),
        )
        .take(200);
    } else {
      const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
      if (!own) return [];
      const reports = await ctx.db
        .query("employees")
        .withIndex("by_org_manager", (q) =>
          q.eq("orgId", orgCtx.orgId).eq("managerId", own._id),
        )
        .collect();
      const reportIds = new Set(reports.map((e) => e._id));
      if (reportIds.size === 0) return [];
      const all = await ctx.db
        .query("attendanceCorrections")
        .withIndex("by_org_status", (q) =>
          q.eq("orgId", orgCtx.orgId).eq("status", "pending"),
        )
        .take(200);
      pending = all.filter((c) => reportIds.has(c.employeeId));
    }
    return await Promise.all(pending.map((c) => hydrateCorrection(ctx, c)));
  },
});

// The caller's own correction requests (any status).
export const myCorrections = query({
  args: {},
  returns: v.array(correctionRow),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) return [];
    const own = await employeeByUserId(ctx, orgCtx.orgId, orgCtx.userId);
    if (!own) return [];
    const rows = await ctx.db
      .query("attendanceCorrections")
      .withIndex("by_employee", (q) => q.eq("employeeId", own._id))
      .order("desc")
      .take(50);
    return await Promise.all(rows.map((c) => hydrateCorrection(ctx, c)));
  },
});

// Org attendance report across a date range (HR/admin).
export const report = query({
  args: { from: v.string(), to: v.string() },
  returns: v.array(attendanceRow),
  handler: async (ctx, { from, to }) => {
    const { orgId } = await requirePermission(ctx, "attendance:config");
    const rows = await ctx.db
      .query("attendanceRecords")
      .withIndex("by_org_date", (q) =>
        q.eq("orgId", orgId).gte("date", from).lte("date", to),
      )
      .take(1000);
    rows.sort((a, b) => b.clockInAt - a.clockInAt);
    return await Promise.all(rows.map((r) => hydrateRecord(ctx, r)));
  },
});
