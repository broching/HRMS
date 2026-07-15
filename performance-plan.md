# Performance — Phase 1: Appraisal Form Builder (PLAN)

Extend the existing review-cycle model into a structured **appraisal form
builder**: HR/admin build forms from templates, release them to targeted
participants (employee + appraiser, filling in parallel), with email
notifications and due dates. Reuses the existing objectives / competencies /
scoring / dashboard / report — those become *field types inside the form*.

## Locked decisions (2026-07-15)

| Topic | Decision |
| --- | --- |
| Architecture | **Extend the cycle model** (not a standalone system). |
| Field types | section · shortText · longText · ratingScale · radio · checkbox · yesNo · objectives · competencies · date · file · signature. Each field has `side`: `self` \| `appraiser` \| `both`. |
| Participants | 2-sided (employee + appraiser). Target audience: all \| departments \| offices \| individuals. |
| Flow | **Both sides open in parallel at release**; gate answering per-side by `selfSubmittedAt` / `managerSubmittedAt`, not `status`. |
| Finalize | Appraiser may FILL in parallel but **cannot finalize until self is submitted** (1b). |
| Email | Reuse the per-module Resend pattern — add `performance` module to `emailSettings` + `notificationRoutes`; route review notifs through `pushNotification`. |
| 360 feedback | **Out of scope** this phase (existing 360 left as-is). |
| Objectives | Entered **directly in the form** (no auto-seed from `goals`). |
| Access | Build/release strictly `performance:manage` (HR/admin). |
| Scoring | **Generalized weighted scoring** — `ratingScale` fields + objectives/competencies blocks each carry `weightPct`, normalized & combined into overall. Rating fields DO count. Legacy cycles map `objectivesWeightPct`/`competenciesWeightPct` via `normalizeForm`. |

## Data model

**enums.ts** — `formFieldType`, `formFieldSide`, `formScaleLabel`, `formField`,
`formSection`, `cycleForm` validators + `Infer` types.

**reviewCycles** — new optional cols: `form` (cycleForm), `templateId`,
`audience {mode, departmentIds?, officeIds?, employeeIds?}`,
`reminders {enabled, daysBefore[]}`. Reuse `dueDates` record with `self` /
`appraiser` keys. `questionnaire` / `feedback360Questions` kept for legacy.

**appraisalFormTemplates** (new): `orgId, name, description?, form,
isSystemDefault, active, createdBy?`; index `by_org`.

**reviewAnswers** (new): `orgId, reviewId, cycleId, employeeId, fieldId, side,
{text|rating|choice|choices|boolValue|date|fileStorageIds|signatureStorageId},
updatedAt`; indexes `by_review_side`, `by_review_field_side`. Legacy
`selfAnswers[]` / `appraiserAnswers[]` stay as read-only fallback.

`objectives` / `competencies` field types keep their existing dedicated tables
(`reviewObjectives` / `reviewCompetencies`).

**normalizeForm(cycle)** (pure helper) — returns `cycle.form`, else synthesizes
a form from the legacy `questionnaire` + objectives + competencies so old cycles
render unchanged.

## Backend

- `performanceDefaults.ts` — `DEFAULT_FORM_TEMPLATES` (Annual Appraisal, Simple
  Self-Assessment, Probation Review, Peer Feedback, Manager Effectiveness).
- `appraisalFormTemplates.ts` (new) — `list/get/save/remove/ensureDefaultFormTemplates`, `performance:manage`.
- `reviewCycles.ts` — `create({templateId?})`, `updateForm`, `saveAsTemplate`,
  `setAudience`, `setDueDates`, `setReminders`; **`release`** (generalizes
  `activate`) resolves audience → generates reviews → `active` → `pushNotification("review.opened")`; keep **Sync**.
- `reviews.ts` — `saveFieldAnswer({reviewId, fieldId, side, value})`;
  `getAppraisal` returns resolved form + merged answers + per-side
  `canSelf`/`canAppraiser`; appraiser finalize blocked until `selfSubmittedAt`;
  required-field validation; file/signature reuse `generateUploadUrl` +
  `SignatureCaptureDialog`; notifs via `pushNotification`; `status` derived
  (`in_progress` → `completed`).
- `computeAndPersistScores` — generalized weighted scorer (rating fields +
  objectives + competencies, normalized by scale, weighted, mapped to ratingBand).
- Email — add `performance` to `EMAIL_MODULES`, `emailSettings.get/save`,
  `notificationRoutes` (`review.` → performance + routes/CTA).
- `crons.ts` — daily `sendDueReminders` (nudge pending at `daysBefore` + overdue,
  track `lastRemindedAt`).

## Frontend (`features/performance/`)

- `form-builder.tsx` (core) — `@dnd-kit` drag-drop sections/fields, field
  palette, per-field config incl. side selector, live preview.
- Template gallery + Save as template; audience picker; due-dates & reminders panel.
- `review-cycles-settings.tsx` reworked: Build form → Set audience → Set due
  dates → **Release** (confirm w/ participant count).
- `FormRenderer` (shared) drives self + appraiser fill → `saveFieldAnswer`;
  objectives/competencies blocks embed existing editors.
- Email tab mounts `ModuleEmailSettings module="performance"`.

## Build order

1. Schema + validators + `normalizeForm` back-compat.
2. Templates + defaults seed.
3. Form builder UI.
4. `reviewAnswers` + `saveFieldAnswer` + `FormRenderer` + fill UIs.
5. Audience + Release.
6. Email module + `pushNotification` conversion.
7. Due dates + reminder cron.
