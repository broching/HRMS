# Attendance & Overtime — Implementation Plan

Extension plan for the attendance-taking system. Grounded in the code that
already exists (2026-07); most hard parts are built — the work is reconciling
three design tensions and wiring the pieces into one flow.

## Status (implemented 2026-07-14)

Phases 1, 2, 4 and the appeal/manager-adjust part of Phase 3 are **built and
typecheck/lint clean**. Remaining: attendance-rate analytics (Phase 3) and the
Phase 5 reporting glue. What shipped:

- **Config:** `attendanceSettings` table + `convex/attendanceSettings.ts`
  (`get`/`save`, `getAttendanceSettings`, `attendanceRequiredFor`); per-employee
  `employees.attendanceRequired` (tri-state override in the employee editor);
  Policy card in `/settings/attendance`.
- **Home:** Attendance leads the quick-access grid when required or mid-session,
  with live clock state (`attendance.myAttendanceConfig`).
- **Printed QR:** `qrToken` `e` now optional; `attendance.generateStaticQr` +
  `setOfficeQrMode`; `clockIn` skips expiry when absent; office Poster/Kiosk
  switch; printable route `/attendance/poster/[officeId]` (`qr-poster.tsx`).
- **Overtime:** `overtimeRecords` table + `overtimeStatus`; `convex/overtime.ts`
  (`schedule`/`approve`/`reject`/`cancel`/`myOvertime`/`reviewList`);
  `payroll.pullOvertime` (idempotent via `pulledRunId`/`sourceRefId`, un-marked
  on adjustment removal); `available.overtime` = pullable count + "Pull overtime"
  button in the adjust step. UI: `/overtime` (mine), `/overtime/manage`
  (schedule + approve), nav entries.
- **Appeal / manager adjust:** existing employee correction flow surfaced;
  new `attendance.adjustRecord` + `ManagerAdjustDialog` on Team Attendance.

Auth: OT scheduling reuses `scheduling:roster` (managers) / `scheduling:manage`
(HR). No new permissions were added.

## Status (round 2 — UX upgrades, 2026-07-14)

- **Map geofence picker:** `geofence-map.tsx` (Leaflet, dynamic import, OSM tiles,
  custom divIcon — no API key). Click/drag to set lat/lng, circle previews the
  radius. Replaces the raw lat/lng inputs in `office-qr-settings`.
- **Poster QR on the config page:** `poster-qr-inline.tsx` shows the static QR
  with a one-click **PNG download** (SVG→canvas), plus the printable route.
- **Employee attendance-type list:** `attendanceSettings.roster` +
  `setAttendanceRequired`; `attendance-roster.tsx` — searchable, department/team
  filtered, per-row Required/Exempt/Default toggle. Added to `/settings/attendance`.
- **Friendly toasts:** swept attendance/overtime/office components to
  `getErrorMessage(e, "<friendly fallback>")`.
- **Team attendance calendar:** `attendance.attendanceDayBoard` (team =
  `reportingSubtree`, org = HR/admin) → `attendance-day-grid.tsx` (timesheets-style
  columns-per-person hour grid, 15-min minor gridlines, live now-line, open
  sessions run to now) + `attendance-calendar.tsx` toolbar (day nav, search,
  dept/team filters, KPIs). Wired into `/attendance/team` (team scope) and new
  `/hr-lounge/attendance` (org scope). `localMinuteOfDay` added to `model/datetime`.

Dep added: `leaflet` + `@types/leaflet`. Not yet runtime-verified.

## Locked decisions

1. **Printed office QR = static poster + geofence.** Each office gets a stable,
   signed code printed once and pasted on the wall. Anti-fraud comes from the
   GPS geofence (unforgeable HMAC signature + must be physically present).
   Poster mode requires a configured geofence. Keep the existing rotating kiosk
   QR as an optional per-office alternative.
2. **"Who must take attendance" = org default + per-employee override.** Org-wide
   `attendanceRequired` default, plus `employees.attendanceRequired?` override
   resolving to the default when unset. (Group/office/department rules = later.)
3. **Overtime is scheduled-first, then pulled into payroll.** Managers/HR
   schedule OT; employees can only do OT if scheduled; approved OT auto-pulls
   into payroll the same idempotent way claims do.

## What already exists (polish, don't rebuild)

- **Clock in/out:** `convex/attendance.ts` — QR-signed + geofenced records
  (`open`/`completed`). Helpers in `convex/model/{qrToken,geo,datetime}.ts`.
- **Office QR:** per-office secret + **rotating 90s** signed token + kiosk
  display. `attendance.ts::{setOfficeQr,generateQrToken}`, `qr-kiosk.tsx`,
  `office-qr-settings.tsx`.
- **Corrections:** employee request → manager/HR review → writes onto record.
  `attendance.ts::{requestCorrection,reviewCorrection,correctionQueue,myCorrections}`,
  `request-correction-dialog.tsx`.
- **Scheduling:** shift templates + roster (`draft`/`published`), `myShifts`.
  `convex/schedules.ts`, `shiftTemplates.ts`, `features/scheduling/*`.
- **Overtime (pay side):** `payrollAdjustments source:"overtime"` +
  `overtimeMeta{hours,multiplier}`, `overtimePayCents()`. Entered manually at the
  payroll adjust step (`adjustment-dialogs.tsx`). `available.overtime` currently
  counts existing OT adjustments (not a pull).
- **Surfaces:** `/attendance`, `/attendance/team`, `/settings/attendance`, Home
  tile (`home-tiles.tsx`), nav (`components/layout/nav-config.ts`).
- **Permissions:** `attendance:team`, `attendance:config`, `scheduling:roster`,
  `scheduling:manage`.

## The static-QR reconciliation (critical)

`QR_TTL_MS = 90_000` makes the current QR a rotating kiosk token — it **cannot
be printed** (a poster freezes one instant and expires in 90s). Fix:
- `convex/model/qrToken.ts`: make `QrPayload.e` **optional**; `verifyQrToken` /
  `peekQrPayload` tolerate its absence.
- `convex/attendance.ts`: add `generateStaticQr(officeId)` signing `{o: officeId}`
  with no `e`; `clockIn` skips the expiry check when `e` is absent, still
  enforces the geofence. Require `office.geo && office.radiusMeters` before
  poster mode can be enabled.

## Phase 1 — Attendance config + Home quick-access
- **Schema:** `attendanceSettings` (org default `attendanceRequired`, geofence
  defaults, default OT multiplier) + `employees.attendanceRequired?`.
- **Convex:** `attendanceSettings.get/save` (perm `attendance:config`); resolver
  `isAttendanceRequired(employee)`; `myAttendanceConfig` query for the Home card.
- **UI:** `/settings/attendance` gains a "Policy" tab (default toggle) beside the
  office QR/geofence cards; per-employee toggle in the employee/profile editor.
- **Home:** move **Attendance to the first tile** and make it a live card (clock
  state + one-tap scan/clock-out), rendered only when `attendanceRequired`.

## Phase 2 — Printed office QR + clock polish
- `qrToken.ts` + `attendance.ts` changes above (`generateStaticQr`, optional `e`).
- `office-qr-settings.tsx`: per-office **Poster / Kiosk** switch; poster mode
  shows a print-ready page (big QR + office name + instructions) via a
  `/attendance/poster/[officeId]` printable route. Keep `QrKiosk` for kiosk mode.
- Block poster mode until a geofence is configured (today clock-in is allowed
  from anywhere when no geofence — fine for kiosk, unsafe for a public poster).

## Phase 3 — Appeals + manager adjust + attendance rate
- The correction flow **is** the appeal path ("system down → adjust my scan
  time"). Surface an **Appeal / request correction** button on the attendance
  page + history rows (dialog already exists).
- Add `adjustRecord` — manager/HR **directly set/insert** a clock time without an
  employee request (`method:"manual"`, `correctedByUserId`), audit-logged.
- **Attendance rate:** `present days / expected days` over a range (expected =
  published `shiftAssignments`, else working-days for required employees). New
  `attendanceReport`/`rateFor` query feeding `team-attendance.tsx` + HR report.

## Phase 4 — Overtime scheduling → payroll
- **Schema `overtimeRecords`:** `{orgId, employeeId, date, plannedHours,
  multiplier, status: scheduled|worked|approved|rejected|cancelled, actualHours?,
  scheduledBy, note?, payrollAdjustmentId?}` — indexes `by_org_status`,
  `by_employee_date`, `by_org_date`.
- **Convex `overtime.ts`:** `schedule` (new perm `overtime:manage` or reuse
  `scheduling:roster`), `approve/reject`, `myOvertime`, `pendingQueue`. OT only
  originates here ("can only do OT if scheduled"); optionally validate actual
  hours against attendance clocked beyond shift end.
- **Payroll pull:** extend the run item-pull (mirror the claims path) to read
  **approved, unpulled** OT for the period → insert
  `payrollAdjustments(source:"overtime", sourceRefId=overtimeId,
  overtime:{hours,multiplier})`, idempotent by `sourceRefId`. Change
  `available.overtime` to count **approved-unpulled records**. Keep manual OT
  entry as an HR override.
- **UI:** "My Overtime" (employee) + OT scheduler in Team/HR (can extend the
  roster builder).

## Phase 5 — Glue & reporting
- Nav: "My Overtime" (self), OT approvals (Team), attendance-rate column (Team
  Attendance). Notifications: OT scheduled/approved (correction ones exist).
- Coherent story: **shift = expected → attendance = actual → OT = approved beyond
  shift → payroll pulls OT** (unpaid absences already flow via `unpaid_leave`).

## Build order
Phase 1 → 2 (unblocks printed QR + Home card) → 4 (OT→payroll, highest value)
→ 3 (appeals/rate) → 5 (glue).
