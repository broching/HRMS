# Project & Task management — enhancement plan

## Context

The projects/tasks module is already capable: `projects` (portfolio `phase`,
budget), per-project Kanban `projectStages`, `projectTasks` (stage, priority,
due date, estimate, attachments, rich-text description, completion), `taskComments`,
`projectAssignees`/`taskAssignees`, and task-level time logging via `timeEntries`
(a task's time rolls up to its project). UI lives in `features/projects/` with a
tabbed `project-workspace.tsx` (Board · List · Overview · People), a
`task-detail-panel.tsx` drawer, `project-board.tsx`, `project-task-list.tsx`,
`my-tasks.tsx`, and a `task-rich-editor.tsx`. Permissions: `projects:manage`
(project admin) and `tasks:manage` (work items); module = `projects`/`timesheets`.

**Goal (per decisions 2026-07-18):** make it feel like Nifty/Jira with a
**boards + timeline** emphasis. **Top priority: subtasks & checklists, and
labels + custom fields + filters/saved views.** Timeline/dependencies/milestones
next; watchers/@mentions/notifications after. **Time tracking stays exactly as it
is** — daily logging by task — we only surface the estimate-vs-logged rollups we
already compute.

**Non-goals (explicitly out):** sprints/backlog/story points, start-stop timer,
billable rates & billing reports, any change to the `timeEntries` model.

## Design principles (reuse, don't reinvent)

- **Widen-only schema.** Every new field on `projectTasks`/`projects` is optional;
  new tables are additive. No backfill needed (arrays/records default empty).
  Follow the repo's existing "optional to widen safely" convention already used
  for `stageId`.
- **Custom fields reuse the claim/payment-request field pattern** — a
  `{ key, label, type, options?, required? }` field-def list + a `values` record
  on the row (see `paymentRequestField` in `convex/lib/enums.ts` and its editors).
- **Notifications reuse `pushNotification`** (`convex/model/notify.ts`) + the
  `featureForType`/`routeForNotification` map (`convex/lib/notificationRoutes.ts`)
  + client `hrefFor` (`notification-center.tsx`), gated by the `projects` module.
- **Convex object-form** functions with validators, org-scoped via `getOrgContext`,
  permission-gated with `requirePermission`, per existing `convex/projects.ts`.

---

## Phase 1 — Subtasks & checklists (top priority)

Two distinct, complementary primitives:

**Checklists** (lightweight steps, no time/assignee):
- **Schema:** `projectTasks.checklist: v.optional(v.array(v.object({ id, text, done, order })))`.
- **Backend (`convex/projects.ts`):** `addChecklistItem`, `toggleChecklistItem`,
  `renameChecklistItem`, `removeChecklistItem`, `reorderChecklist` (all
  `tasks:manage` or assignee). Progress = done/total.
- **UI:** a checklist block in `task-detail-panel.tsx` (add row, tick, drag to
  reorder, inline progress `3/5`). A small `☑ 3/5` badge on `task-card.tsx`.

**Subtasks** (real child work items — assignable, datable, time-loggable):
- **Schema:** `projectTasks.parentTaskId: v.optional(v.id("projectTasks"))` + index
  `by_parent`. Subtasks inherit `projectId`; time logs to a subtask already roll up
  to the project (no time-tracking change).
- **Backend:** extend task create/list to accept/return `parentTaskId`; `board`
  returns only top-level tasks (subtasks nested); a `subtasks({taskId})` query;
  parent progress = share of done subtasks; deleting a parent blocks or cascades
  (decide: block if it has subtasks).
- **UI:** a "Subtasks" section in the detail panel (list with assignee avatars,
  due, status toggle, open-in-panel); a `⌘ 2/4` subtask count on the card; the
  List view (`project-task-list.tsx`) shows subtasks as an indented, collapsible
  group under the parent. Board shows the parent only (with the count badge).

*Why both:* checklists cover trivial "steps"; subtasks cover assignable work that
needs its own owner, date, comments and logged time — the Nifty/Jira split.

## Phase 2 — Labels, custom fields, filters & saved views (top priority)

**Labels/tags:**
- **Schema:** `taskLabels` table `{ orgId, name, color, order }` (index `by_org`);
  `projectTasks.labelIds: v.optional(v.array(v.id("taskLabels")))`.
- **Backend:** `labels.list/create/update/remove` (`tasks:manage`); task
  create/update accept `labelIds`.
- **UI:** label chips on card + detail panel; a label manager (small dialog reached
  from the board toolbar / project settings); a multi-select label picker.

**Custom fields** (org-defined, mirrors the payment-request field pattern):
- **Schema:** `taskFieldDefs` table `{ orgId, key, label, type: text|number|date|select|checkbox, options?, order, active }`;
  `projectTasks.customFields: v.optional(v.record(v.string(), v.any()))` (validated
  against defs at write time). Start org-wide; a `projectIds?` scoping field can come
  later for per-project schemes.
- **Backend:** `taskFields.list/save/remove`; task write validates/sanitizes
  `customFields` against active defs (reuse the claim/payment-request `sanitize`
  approach).
- **UI:** a "Custom fields" admin surface (in project workspace settings or the
  HR-Lounge projects config), and dynamic inputs rendered in the task detail panel
  + editor dialog (reuse `payment-request-fields.tsx` as the template).

**Filters & saved views:**
- **UI first (no schema):** a filter bar above Board + List — assignee, label,
  priority, due (overdue/soon/none), status, and any select/checkbox custom field —
  as client state applied to the already-loaded board data. A result count + Clear.
- **Saved views (schema):** `savedTaskViews` table `{ orgId, userId, projectId?, name, filter (json), isShared }`
  (index `by_user`). `savedViews.list/save/remove`. A "Save view" control + a view
  switcher chip row. Personal by default; `isShared` lets managers publish a view.

## Phase 3 — Timeline / roadmap, dependencies & milestones (boards+timeline emphasis)

- **Schema:**
  - `projectTasks.startDate: v.optional(v.string())` (ISO) — pairs with `dueDate`
    to give a bar span; default span = single day on `dueDate` when absent.
  - `taskLinks` table `{ orgId, projectId, fromTaskId, toTaskId, type: "blocks" }`
    (indexes `by_from`/`by_to`) — dependency edges (blocks / blocked-by).
  - `projectMilestones` table `{ orgId, projectId, name, dueDate, description?, order }`;
    optional `projectTasks.milestoneId`.
- **Backend (`convex/projects.ts`):** `timeline({projectId})` returning tasks (with
  start/due, stage, assignees), links and milestones; `link/unlink` mutations (guard
  against cycles — reuse the cycle-guard idea from the org-chart `setManager`);
  milestone CRUD.
- **UI:** a new **Timeline** tab in `project-workspace.tsx` — a self-contained
  CSS/SVG Gantt (weeks/months header, one row per task/subtask, bars from
  `startDate→dueDate`, milestone diamonds, dependency arrows). Drag a bar to
  reschedule (patches start/due); no heavy external Gantt lib (keep it inline,
  reduced-motion-safe). Portfolio roadmap (across projects) can reuse it later off
  the existing `phase`.

## Phase 4 — Watchers, @mentions & notifications (lower priority)

- **Schema:** `projectTasks.watcherEmployeeIds: v.optional(v.array(v.id("employees")))`
  (auto-add assignees + commenters + creator).
- **Backend:** `watch/unwatch`; on comment/assignment/status/due changes, call
  `pushNotification` for watchers with a new `task.` type prefix. @mentions: parse
  `@employee` tokens in `task-rich-editor.tsx` / comments, resolve to employees,
  add as watchers + notify.
- **Wiring:** add `task.` → `projects` in `featureForType`, a
  `routeForNotification` → `/projects/[projectId]?task={id}` (open the detail panel
  from a query param), and the matching client `hrefFor` case. In-app first; an
  email opt-in module for tasks can follow the existing per-module email pattern.

---

## Cross-cutting UI

- **Task detail panel** becomes the hub: description · checklist · subtasks · labels
  · custom fields · assignees · dates · dependencies · comments · logged time
  (read-only rollup) · watchers. Organize with clear sections; keep it mobile-usable.
- **Card** (`task-card.tsx`) gains: label chips, subtask/checklist badges, blocked
  indicator. Keep it compact.
- **`my-tasks.tsx`** gains the same label/priority/due filters so individuals get the
  richer triage too.

## Migration & safety

- All `projectTasks`/`projects` additions are **optional** → deploy schema, ship
  code; no backfill. New tables are empty-by-default.
- Only if we later make a field required do we run `@convex-dev/migrations`
  (widen → migrate → narrow). Not needed for Phases 1–4 as specced.

## Verification

- `npx convex codegen` · `npx tsc --noEmit` · `npx next build` after each phase.
- Drive each feature end-to-end in the running app (create subtasks, log time to a
  subtask and confirm it rolls into the project total, filter/save a view, draw a
  dependency, get a mention notification). Use the Convex MCP `runOneoffQuery` to
  confirm rollups and that time-entry behavior is unchanged.

## Suggested sequencing

1. **Phase 1** (subtasks + checklists) — highest value, self-contained.
2. **Phase 2** (labels + custom fields + filters/saved views).
3. **Phase 3** (timeline + dependencies + milestones).
4. **Phase 4** (watchers + @mentions + notifications).
