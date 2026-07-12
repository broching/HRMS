# Payroll — Handoff

Convex + Next.js HRMS. This document covers the payroll subsystem: proration,
statutory funds, deductions/employer contributions, payslip templates, and the
multi-step approval + signature flow — plus the most recent round of fixes.

## Lifecycle

A run moves `draft → pending_approval → approved → paid` (legacy `finalized`
treated like `approved`). Employees can only see a payslip once its run is
`paid`.

1. **Draft** — HR builds the roster and adjusts items (`RunWizard` steps 1–2).
2. **Complete** — preparer signs; the org approval chain is snapshotted onto
   every payslip and the run goes `pending_approval` (or straight to `approved`
   when approval is disabled). `payrollApproval.completeRun`.
3. **Approve** — each payslip is approved (and signed, if the step requires it)
   individually, per approver step. Bulk "approve & sign selected" just loops —
   never batches at the data level. `payrollApproval.approvePayslip` /
   `approvePayslipsBulk`. When every payslip clears its chain the run becomes
   `approved`.
4. **Release** — `payrollApproval.releaseRun` marks the run/payslips `paid`,
   reimburses pulled claims, and notifies employees.

## Compute engine

`convex/payroll.ts::computePayslip(comp, dob, periodEnd, adjustments,
proration, settings)` is the single source of truth. It:

- **Prorates base** by the MOM incomplete-month formula
  `base × daysWorked / totalWorkingDays` (pure math in
  `convex/model/proration.ts`). Public holidays and unpaid-leave working days
  reduce `daysWorked`. `prorationContextFor` assembles the context. HR can
  **override** the day counts per payslip (`payslips.prorationOverride`,
  applied via `applyProrationOverride`, surviving recompute); the Adjust step
  has an inline editor (Edit proration → days worked / total → Apply / Reset)
  and the Review step shows the `base × d/t` calc read-only.
- Computes **CPF** on the prorated ordinary wage (`convex/model/cpf.ts`).
  `cpfStatus` is `citizen | pr | foreigner | exempt` (+ legacy `citizen_pr` =
  citizen). Citizens use full age-banded rates; **PRs are graduated** — Year 1
  (4%/5%), Year 2 (9%/15%), Year 3+ full — with the year derived at pay time
  from `compensation.prStartDate` via `prYearOn`. **Foreigners/exempt = 0%.**
  The applied PR year is snapshotted onto `payslips.prYear`.
- Emits **fund lines**: SHG (e.g. CDAC) as an employee **deduction**, SDL +
  custom funds as **employer** contributions (pure math in
  `convex/model/funds.ts`). These lines carry `category: "fund"` so the UI can
  surface them distinctly.
- Folds recurring `deductions` and `employerContributions` from compensation,
  plus per-run inline adjustments (`payrollAdjustments`, `kind` includes
  `"employer"`).

The computed breakdown lives on `payslips.lines`
(`{ label, amountCents, type: earning|deduction|employer, category? }`) — this
is what the payslip document, the review step, and the CSV exports render.

## Effective-dated compensation

`compensation` is insert-only; the record in effect on a date is the latest
`effectiveDate ≤ date`, and on a same-day tie **the most recently created row
wins** (`effectiveCompensation`, and the shared `byEffectiveThenNewest`
comparator used by `forProfile`/`listForEmployee`). Re-saving compensation the
same day takes effect immediately, and open **draft** runs recompute on save
(`recomputeDraftPayslipsForEmployee`). A manual **Refresh** button on the adjust
step (`payroll.refreshRun`) recomputes a draft on demand.

## Settings

`convex/payrollSettings.ts` — one `payrollSettings` row per org:
`shgFunds` (band tables), `sdl`, **`cpf`** (org-configurable CPF: `owCeilingCents`,
age `bands[]` incl. older-worker rates, `prYear1`/`prYear2` graduated rates —
`saveCpf`/`seedCpfDefaults`; engine reads `settings.cpf`), `approval`
(`{ enabled, steps[] }`, each step `role|specific` + `requiresSignature`),
`defaultTemplateId`, and `showSignaturesToEmployees`. Defaults seeded from
`convex/lib/sgDefaults.ts` (`SG_CPF_DEFAULT` + SHG/SDL, flagged **"verify against
current tables"**).

**Settings placement:** CPF rates and Statutory funds live under **Compensation**
(`compensation-tabs.tsx` → Employees · CPF · Statutory funds). Payroll settings
keeps only Approval flow + Payslip templates.

## Multi-currency pay

An employee's compensation carries a **pay `currency`** plus a default
`exchangeMode` (`auto`|`manual`) and optional `manualRate` (set in the
compensation dialog). When it differs from the org base currency, the payslip is
denominated in the pay currency; each payslip snapshots
`baseCurrency`/`exchangeRate`/`exchangeRateDate`/`exchangeMode`/`exchangeProvider`.
Rates are **seeded at run creation** (`seedExchangeFields`) and **edited during the
run** in the Adjust step's `ExchangeEditor` (`payroll.setPayslipExchangeRate`;
auto uses `exchange.getRate` — same Frankfurter/er-api flow as claims). Run totals
are summed **in base currency** (`toBaseCents`); `completeRun` blocks until every
foreign payslip has a rate. The payslip's optional **`exchangeInfo`** block shows
the rate/date + base-currency net (toggle in the template builder).

`convex/payslipTemplates.ts` — multiple named templates; a run picks one at
creation (`payrollRuns.templateId`). Config drives `payslip-document.tsx`. As
well as accent colour, logo and header/footer, a template now carries a
**drag-and-drop block `layout`** (ordered, toggleable blocks incl. user-added
`customText`/`divider`/`spacer`), an expanded **font** list, **fontScale**,
**density**, and body **textColor**. `payslip-document.tsx` renders from
`layout` when present and falls back to the legacy `show` toggles otherwise
(structural blocks: header · payMeta · employeeDetails · earnings · deductions ·
employerContribs · totals · cpfNote · signatures · footer). The builder UI
(`payslip-templates-settings.tsx`) uses `@dnd-kit/sortable`; shared block
metadata + font/density options live in `features/payroll/lib/payslip-layout.ts`.

UI: `/hr-lounge/payroll/settings` (tabs: Statutory funds · Approval flow ·
Payslip templates).

## Approver inbox

Non-payroll-manager approvers (e.g. Finance/CEO roles) act via the
`payroll:approve` permission and the **Team → "Payslip Approvals"** page
(`/payroll/approvals`, `payrollApproval.myApprovalRuns`). `getRunApprovals` is
org-scoped, not `payroll:manage`-gated, so approvers can sign without full
payroll access.

## Most recent fixes (this round)

1. **Approver payslip preview** — the approvals table has a **View** button
   opening a read-only `PayslipDocument` dialog so an approver can verify before
   signing. `getPayslip` now authorizes any user on the payslip's approval chain
   (in addition to payroll managers and the employee-self-when-paid).
2. **Funds shown in adjust + review** — SDL/CDAC/custom-fund lines
   (`category: "fund"`) now render in the adjust step's expanded breakdown
   (`FundLines`) and the review step (which renders the authoritative
   `payslips.lines` grouped by earning/deduction/employer).
3. **Signatures to employees (opt-in)** — new `showSignaturesToEmployees`
   setting (Approval-flow tab). When off, employees viewing/downloading their
   own payslip see no signatures; HR and approvers always do. Enforced in
   `getPayslip`.
4. **Approver notifications** — `completeRun` notifies the first step's
   approvers; each approval that advances a payslip nudges the next step's
   approvers (`payroll.approval_pending`, links to `/payroll/approvals`).
   Previously only employees were notified (on release).
5. **Compensation note** — the profile Compensation section now displays the
   current note and a Note column in history; `forProfile`/`listForEmployee`
   sort with the same-day tie-break so a freshly-saved note/base is what shows.

## Key files

- Engine: `convex/payroll.ts`, `convex/compensation.ts`,
  `convex/model/{proration,funds,cpf}.ts`, `convex/payrollSettings.ts`,
  `convex/payslipTemplates.ts`, `convex/payrollApproval.ts`
- Schema/validators/enums: `convex/schema.ts`, `convex/lib/enums.ts`,
  `convex/lib/validators.ts`, `convex/lib/permissions.ts`,
  `convex/lib/sgDefaults.ts`
- UI: `features/payroll/components/*` (`run-wizard`, `adjust-payroll-step`,
  `approvals-table`, `payslip-document`, `payroll-approvals-inbox`,
  `set-compensation-dialog`, `signature-pad`, `compensation-tabs`,
  `cpf-settings`, `funds-settings`, settings tabs),
  `features/payroll/lib/{payslip-layout,payroll-excel}.ts`,
  `features/profile/components/compensation-section.tsx`,
  `components/layout/notification-center.tsx`
- **Detailed Excel export** (`features/payroll/lib/payroll-excel.ts`, ExcelJS):
  the Payment step's "Detailed breakdown (Excel)" builds one row per employee
  with a column per distinct line item (earnings→gross→deductions→net→employer),
  plus Currency / Exchange rate / Rate date / Net(base), and a **grand total
  row**. Approver + preparer signature images are embedded at the bottom once
  the run is approved (`payrollApproval.runSignatures`).
- **Bulk payslip PDF ZIP** (`features/payroll/lib/payslip-pdf.tsx`): the Payment
  step's "Payslips (PDF ZIP)" renders each employee's **actual** `PayslipDocument`
  (the exact copy the employee gets) into an isolated light-themed iframe,
  rasterizes it with `html-to-image` (`toPng`) and lays it onto A4 via `jspdf`,
  then bundles one `{Employee} — {month}.pdf` per employee via `createZip`. Full
  render data comes from `payroll.getRunPayslipsForPrint` (manager-gated, returns
  every payslip in `getPayslip` shape). Deps: `jspdf`, `html-to-image` (chosen
  over html2canvas because it renders via SVG foreignObject and so handles
  Tailwind v4 `oklch` colours).
- **Payslip template header split**: the old combined `header` block (logo + name
  + header text) is split into three independently toggleable/reorderable blocks
  — `logo`, `companyName`, `headerText` (`convex/lib/enums.ts` `payslipBlockType`,
  `payslip-layout.ts` `DEFAULT_BLOCK_ORDER`/`BLOCK_META`). `normalizeLayout`
  migrates any legacy `header` block in place (inheriting its visibility), so old
  templates keep working and complete the migration on next save. The builder is
  data-driven so the three rows appear automatically.
- **Hourly pay**: `compensation.payType` (`fixed` | `hourly`, `convex/lib/enums.ts`)
  + `hourlyRateCents`. For hourly employees `baseMonthlyCents` is stored 0 and pay
  = `hourlyRate × hoursWorked`; hours are entered per-run at the adjust stage
  (`payslips.hoursWorked`, `payroll.setPayslipHours`, `HoursEditor` in
  `adjust-payroll-step.tsx` replacing the proration editor). `computePayslip`
  takes `hoursWorked` and skips day-proration for hourly. Set in the compensation
  dialog (Pay basis selector); shown in the profile Compensation section and the
  compensation management list.

## Claims — signatures + Excel exports

- **Approver signatures** mirror payroll. Each approval-flow **workflow step**
  carries `requiresSignature` (checkbox in Claim Settings → Approval flows), and
  the Finance stage has its own `financeRequiresSignature` toggle
  (`claimSettings`). At submit, `buildApprovalChain` snapshots `requiresSignature`
  onto each `claimChainStep`; the finance flag is read live. On approve
  (`managerApprove`/`financeApprove` + bulk `approveAllForGroup`/`ForEmployee`)
  an optional `signatureStorageId` is threaded through: a signature-gated step
  throws (individual) or is skipped (bulk) without one, and the signature is
  appended to `claims.signatures` (`claimSignature`, same shape as
  `payslipSignature`). `claims.get` and the group drill-down items expose
  `needsSignature`; the approve buttons flip to "Approve & sign" and open the
  shared `SignatureCaptureDialog` (`features/payroll/components/signature-pad`).
- **Claim Excel exports** (`features/claims/lib/claims-excel.ts`, ExcelJS) are
  all driven by one query, `claims.exportForms` (per-employee groups: claims +
  resolved approver signature URLs + department/designation). The approval-queue
  `ExportMenu` offers: **Claims list** (`.xlsx`, one row per claim, grand total,
  signatures at bottom), **Monthly totals** (`.xlsx`, bank-listing style — one
  row per payee + grand Total, with the union of approver signatures at the
  bottom), and **Claim form(s)** (the staff-expense claim form — one `.xlsx` when
  scoped to an employee, else a ZIP of all employees for the month via
  `createZip`). The claim form lays out one column per amount bucket present:
  fixed categories use their category label, but each distinct **custom** claim
  type gets its **own column headed by the claim type name** (e.g. "Parking",
  "Corporate Gift") rather than collapsing into a single generic "Custom" column.
  Columns are keyed by `columnIdFor` (`custom:{claimType}` for custom, else the
  category) — fixed categories first in `CATEGORY_ORDER`, then custom columns A→Z
  — and the Total / Remarks / GST columns and signatures follow. (CSV export was
  removed; `unionSignatures` de-dupes signatures across employees for the list +
  totals workbooks.)

## Claims — mobile UX (My claims)

`features/claims/components/my-claims.tsx` is tuned mobile-first:

- **Actions**: the claim dialog trigger is now **"Add"** (was "Submit a claim");
  the batch submit button is **"Submit ({draftCount})"** (was "Submit all · …")
  and is a filled **emerald** button (`bg-emerald-600`) so it pops against the
  blue "Add". Both stretch (`flex-1`) on mobile, natural width from `sm`.
- **Filters**: search stays visible; the two selects (type/status) collapse
  behind a **"Filters"** toggle (`filtersOpen` state) on mobile with an active-
  count badge, and show inline from `lg`. Selects are hidden via
  `filtersOpen ? "flex" : "hidden lg:flex"`.
- **Table**: gives the list ~60% of the mobile viewport (`min-h-[60vh]
  lg:min-h-0`). The **Date** column is `hidden md:table-cell` and **Status** is
  `hidden sm:table-cell`; both fold into a meta line under the type name on
  small screens. Row actions collapse from inline Edit/View/Delete buttons
  (`hidden sm:flex`) to a **kebab `DropdownMenu`** on mobile (drafts only; other
  rows open on row tap).

## Payment Requests (new module)

A "Request for Payment" workflow (pay a vendor/payee), modelled on the sample
Deye forms. Submitted from **Team → Payment Requests** (`/payment-requests`) and
configured/overseen in **HR Lounge → Payment Requests** (`/hr-lounge/payment-requests`).
Reuses the claim approval structures but is **independent** of claim settings and
approves **individually** (no monthly batch / group barrier).

- **Schema** (`convex/schema.ts`): `paymentRequestTemplates` (org form templates:
  `fields: paymentRequestField[]` + `headerText`/`isDefault`/`active`),
  `paymentRequestSettings` (one/org: HR/Finance approvers, `financeRequiresSignature`,
  `assigneeGroups`, `approvalWorkflow` + `approvalFlows`, `defaultTemplateId`),
  `paymentRequests` (core fields purpose/amountCents/currency/payeeName/requestDate +
  `incurredMonth` for the monthly filter; `fieldValues` record for template custom
  fields; `attachmentStorageIds` ≤10; `approvalChain` reusing `claimChainStep`;
  `requestorSignatureStorageId` + `signatures` reusing `claimSignature`; `requestNumber`
  per-org sequence rendered as `PR-0007`), `paymentRequestComments`. Statuses
  (`convex/lib/enums.ts` `paymentRequestStatus`): draft → pending_manager →
  pending_finance? → approved → paid, plus rejected.
- **Permissions** (`convex/lib/permissions.ts`): `payment_requests:approve` (Team
  approver — Manager/Finance/HR/admin) and `payment_requests:read:all` (HR Lounge
  config + oversight — HR/admin). Finance's stage is gated by membership of
  `financeApproverUserIds` (or read:all), mirroring how claims Finance works.
- **Engine** (`convex/paymentRequests.ts`): `buildApprovalChain` is a copy of the
  claims resolver (flow selection person>role>default, thresholds, group steps,
  implicit-HR append, dedupe) **without** the `workflowIndex`/group barrier. Key
  fns: `create({andSubmit})` (draft or route immediately), `submitRequest`,
  `approve` (handles both the chain and the finance stage, appends signatures),
  `reject` (reason required, records `rejectedStepIndex`), `editRequest`,
  `deleteRequest` (draft owner / pending approver; rejected NOT deletable),
  `markPaid`, `setRemarks`, `addComment`, `generateUploadUrl`. Queries: `mine`,
  `get` (hydrated detail incl. template fields + resolved signature/attachment
  URLs + `canApprove`/`canEdit`/`needsSignature`), `approvalQueue` (Team inbox,
  actionable), `allRequests` (HR oversight), `exportRows` (one row/request the
  caller can see) and `getForPrint` (full print payloads for PDF/ZIP/merge).
  Settings/templates live in `convex/paymentRequestSettings.ts` (mirrors
  `claimSettings.save` validation) + `convex/paymentRequestTemplates.ts`
  (`list`/`get`/`save`/`remove`/`seedDefault` — seeds the "Request for Payment"
  template with bank fields as custom fields).
- **UI** (`features/payment-requests/`): `submit-payment-request-dialog` (core +
  template-driven custom fields via `payment-request-fields` + attachments ≤10 +
  optional requestor signature via the shared `SignatureCaptureDialog`; dialog is
  `sm:max-w-3xl`), `my-payment-requests`, `payment-requests-approval-queue`
  (`source: "approver" | "all"`; month nav + `PaymentRequestExportMenu`; **active**
  requests in the main table, **completed** approved/rejected/paid tucked under a
  chevron toggle. `approvalQueue` shows every request the caller is *involved in* —
  eligible at any chain step, a finance approver, or the recorded approver — across
  all statuses, so completed history is visible; drafts are never surfaced there),
  `payment-request-detail` (chain stepper, signatures, approve/sign, reject-with-
  reason, edit, mark-paid, delete, per-request **Download PDF** form-only /
  form+documents), `edit-payment-request-dialog`, settings shell (Approval flow reusing
  a self-contained copy of the claims `WorkflowEditor` + Templates tab with a
  drag-reorder field editor). Nav wired in `components/layout/nav-config.ts` (Team +
  Home), `features/hr-lounge/components/hr-lounge-shell.tsx`,
  `components/layout/search-catalog.ts`, plus quick-access cards on the Home
  (`features/dashboard/components/home-tiles.tsx`) and Team
  (`features/team/components/team-overview.tsx`) dashboards.
- **Template styling** (payslip-style): each template carries `accentColor`,
  `fontFamily`, `textColor`, `fontScale`, `density` (reuses `payslipDensity` +
  `FONT_OPTIONS`/`DENSITY_OPTIONS` from `payslip-layout.ts`) and a `show` object
  (`logo`/`heading`/`attachNote`/`signatures`/`requestorSignature`/`footer`) for
  "what to hide" — `convex/lib/enums.ts` `paymentRequestShow`. `getForPrint` returns
  a resolved `style`; `payment-request-document.tsx` applies it via `resolveStyle`
  (sensible defaults when absent). The **`requestorSignature`** toggle lets orgs that
  don't want the requestor to sign hide the "Requested by" block — and the submit
  form hides its signature capture when the chosen template disables it. The template
  editor (`payment-request-templates-settings.tsx`) has font/colour/size/density
  controls + section toggles + a **live preview** rendering `PaymentRequestDocument`
  with a sample request.
- **Printable doc + exports**: `payment-request-document.tsx` renders the business
  form (logo, heading, fields, Requested/Verified/Approved-by signature blocks; the
  requestor's own signature, if captured at submission, renders under **Requested by**).
  `payment-request-pdf.tsx` rasterizes it to A4 via the **same iframe → `toPng` →
  `jsPDF`** pipeline as payslips, and supports **plain PDF**, **PDF + attachments
  merged** (image attachments become pages; PDF attachments are merged page-by-page
  via **`pdf-lib`** — new dependency), plus a **ZIP** of either. `payment-request-excel.ts`
  (ExcelJS) exports **one row per request** (not grouped by payee) with a grand
  total + union of approver signatures.

### Payment Requests — edit-after-submit, resubmit, country & filters

- **Editing after submission**: `editRequest`'s `canEdit` now lets the
  **requestor** edit their own request while `draft`, while **pending**
  (`pending_manager`/`pending_finance`), or after it was **rejected**; eligible
  **approvers** can still edit a pending one (`canActNow`). The same rule drives
  `get`'s `canEdit`. The edit dialog isn't status-gated, so it just works.
- **Resubmit after rejection**: `submitRequest` now accepts `draft` **or**
  `rejected` (owner only). Resubmitting a rejected request first clears the
  prior decision (`decidedAt`/`decisionNote`/`rejectedStepIndex`/
  `financeApproverUserId`/`signatures` → undefined) then calls `routeRequest`,
  which rebuilds the chain fresh from `currentStepIndex 0`. `get` exposes
  `canResubmit` (`isMine && rejected`); the detail panel shows a **Resubmit**
  button (rejected requests remain non-deletable, mirroring claims).
- **Country (built-in field)**: `paymentRequests.country` (ISO-3166 alpha-2,
  optional for legacy rows) is now a first-class field on every request,
  defaulting to the org country (`org.country`) at create. Threaded through
  `create`/`editRequest` args, `hydrateRow`/`prRow`, `get`, `exportRows`,
  `getForPrint`. Shared country list at `lib/countries.ts` (`COUNTRIES`,
  `countryName(code)`). Rendered on the submit + edit dialogs (Country select
  next to payee), the detail panel, the printed document
  (`payment-request-document.tsx`), and the Excel export (new Country column).
- **Search + filters** (client-side over the month's rows) on **both** the
  approver/HR queue (`payment-requests-approval-queue.tsx`) **and** the
  requestor's own list (`my-payment-requests.tsx`): a search box (ref/payee/
  purpose — plus requestor on the queue), plus **Country**, **Status** (all
  `paymentRequestStatus`), and **Amount min/max** filters, with a Clear link.
  Country options are the distinct countries present in the loaded rows. A
  **Country** column (hidden < lg) was added to both lists.
- **Sorting**: both lists have a **Sort** dropdown (`PR_SORT_OPTIONS` +
  `sortPaymentRequests` in `lib/labels.ts`): Newest/Oldest (submission), Date
  newest/oldest (`requestDate`), Invoice date newest/oldest. **Invoice date** =
  the `invoiceDate` custom-field value ("Date of Invoice" on the default
  template), surfaced on `prRow`/`hydrateRow` as `invoiceDate`. Rows missing the
  chosen date sort to the bottom.
- **Mark paid in the table**: `prRow`/`hydrateRow` now carry `canMarkPaid`
  (true only for `approved` rows when the caller is oversight/finance —
  computed once per query). `approved` was pulled out of the queue's
  `COMPLETED` bucket so ready-to-pay requests stay in the **active** list with a
  prominent green **Mark paid** button (confirm dialog → `markPaid`). The
  requestor list passes `canMarkPaid=false`.
- **Template preview logo fix**: the template editor preview
  (`payment-request-templates-settings.tsx`) previously hardcoded
  `logoUrl:null`, so the Logo toggle showed nothing. It now feeds the org's real
  logo + name (`organizations.current` → `imageUrl`/`name`) into the sample
  request, and hints to upload an org logo when none exists. (The real printed
  document already resolved the logo via `getForPrint`.)

## Claims — per-row Mark reimbursed

In the claim-group drill-down (`claims-approval-queue.tsx` → `GroupClaims`),
**approved** claims now show a green **Mark reimbursed** button in the row's
Actions cell for finance (`claims:approve:finance`), with a confirm dialog →
`api.claims.markReimbursed` (single claim). The existing footer **Mark all
reimbursed (n)** (`markGroupReimbursed`) is unchanged.

## Payslip individual download now uses real PDF

`printPayslip` (browser print-to-PDF via `window.print` + `@media print`) is
replaced on **both** individual download buttons — employee `my-payslips.tsx` and
`payslip-detail.tsx` — with `downloadPayslipPdf` (`features/payroll/lib/payslip-pdf.tsx`,
new `downloadBlob`/`downloadPayslipPdf` helpers) which rasterizes the actual
`PayslipDocument` to a real `.pdf` (the same pipeline as the bulk ZIP). The old
`printPayslip` export is now unused.

## Saved signatures (reusable)

Users can save the signatures they draw/type and re-apply them anywhere the
shared `SignatureCaptureDialog` is used (claims, payslips, payment requests).

- **Schema** (`convex/schema.ts`): `savedSignatures` (`orgId`, `userId`,
  `storageId`, `label`), index `by_org_and_user`. Capped at 8 per user (oldest
  dropped on overflow).
- **Backend** (`convex/savedSignatures.ts`): `list` (newest-first, resolves
  image URLs), `generateUploadUrl`, `save({storageId,label})`, `remove({id})`.
  `remove` deletes **only the row, never the storage blob** — the `storageId`
  is shared with whatever document the signature was applied to, so deleting a
  saved signature must not break an already-signed claim/payslip.
- **UI** (`features/payroll/components/signature-pad.tsx`): the dialog now has
  three tabs — **Saved** (grid of saved signatures, click to select, hover-X to
  delete; the default tab when any exist), **Draw**, **Type**. Draw/Type mode
  has a "Save this signature for reuse" checkbox + label. On confirm with a
  saved signature it reuses that `storageId` directly (no upload); on a fresh
  one it uploads, optionally saves a reusable copy sharing that same
  `storageId`, then signs. All six call sites get this for free — no prop
  changes (the dialog talks to `api.savedSignatures` itself).

## Email notifications (Resend)

Every in-app notification for the four core features can now also fan out to an
email with a CTA button that deep-links to the relevant page. Off by default
(in-app only) until an org opts a feature in.

- **Central helper** (`convex/model/notify.ts`): `pushNotification(ctx, args)`
  inserts the `notifications` row **and** schedules the email action. Every
  feature that used to `ctx.db.insert("notifications")` inline now routes
  through it — `claims.ts`/`paymentRequests.ts`/`leaveRequests.ts` `notify`
  wrappers, `leaveRequests` nudge, and `payrollApproval` (`notifyApprovers` +
  release). New notification sites should call `pushNotification`, not insert
  directly.
- **Pipeline** (`convex/email.ts`): `sendNotificationEmail` (internalAction,
  scheduled) → `buildNotificationEmail` (internalQuery). The query gates on
  `emailSettings.features[feature]` (feature derived from the type prefix), the
  recipient having an email, then renders the HTML and returns
  `{to,subject,html,fromName}` or `null`. The action POSTs to the Resend API
  (`https://api.resend.com/emails`) with `RESEND_API_KEY`; **no-ops gracefully**
  if email is disabled or the key is unset. `fetch` runs in the default Convex
  runtime (no `"use node"`).
- **Feature/route/label mapping** (`convex/lib/notificationRoutes.ts`, pure,
  kept in sync with the client `hrefFor` in `notification-center.tsx`):
  `featureForType` (`claim.`→claims, `payment_request.`→paymentRequests,
  `payroll.`→payroll, `leave.`→leave), `routeForNotification`, `ctaLabelForType`.
  **Approver-facing events open the Team approval surface**, requester-facing
  events open the requester's own list — split by the notification `type`
  (which encodes the recipient):
  - `claim.submitted` → `/claims/requests`; other `claim.*` → `/claims`.
  - `payment_request.submitted` → `/payment-requests/requests`; other
    `payment_request.*` (progressed/approved/rejected/paid, all sent to the
    requester) → `/payment-requests`.
  - `leave.requested`/`leave.nudge`/`leave.resubmitted` → `/leave/requests`;
    other `leave.*` (incl. `info_requested`, which goes back to the employee) →
    `/leave`.
  - `payroll.approval*` → `/payroll/approvals`; payslip → `/payslips`.
  (The client `hrefFor` previously had **no** `payment_request` case and fell
  through to `/dashboard` — now fixed to match.)
- **HTML template** (`convex/lib/emailTemplate.ts`, pure): table-based,
  inline-styled, escaped; header (logo or org name on the accent colour), title,
  body, CTA button, footer. `accentColor` is hex-validated; `fontFamily`
  selects an email-safe stack (`system`/`serif`/`mono`/`rounded`).
- **Per-module settings** (`convex/emailSettings.ts`, one `emailSettings`
  row/org): each of the 4 modules has its own config —
  `modules.{claims,paymentRequests,payroll,leave}` = `{enabled, accentColor,
  fontFamily, fromName, footerText}` (all but `enabled` optional). A **shared
  `logoStorageId`** is used across all modules. Legacy flat fields
  (`features`/`fromName`/`accentColor`/`footerText`) are kept optional and read
  as fallbacks so pre-existing rows keep working. `get` returns the resolved
  per-module config + logo URL; `save({modules})` writes all four (admin only);
  `buildNotificationEmail` reads `modules[feature]` (falling back to the legacy
  flat fields) and gates on that module's `enabled`.
- **Settings UI relocated per module**: `ModuleEmailSettings`
  (`features/org-settings/components/email-settings.tsx`) renders **one**
  module's config — a Send-emails switch, accent colour, font, from-name,
  footer, the shared logo uploader, and a live preview. It's embedded as an
  **Email tab** in each module's own settings: Claims
  (`claim-settings-shell.tsx`), Payment requests
  (`payment-request-settings-shell.tsx`), Payroll (`payroll-settings-tabs.tsx`),
  and Leave (`leave-admin.tsx`). Saving preserves the other three modules
  untouched. **No longer** on the Organization settings page.
- **CTA links** need an absolute origin: Convex env `APP_URL` (set to
  `http://localhost:3000` for dev — **change to the deployed app origin for
  production**).
- **Resend env** (dev deployment, set via Convex): `RESEND_API_KEY` (a
  `sending_access` key named "HRMS notifications"), `RESEND_FROM`
  (`onboarding@resend.dev`). ⚠️ **The `chatnexis.com` domain is not verified**,
  so emails currently send from Resend's shared test sender and **only deliver
  to the Resend account owner**. To email real recipients: verify a domain in
  Resend and set `RESEND_FROM` to an address on it (and set the same env vars on
  the **prod** deployment, which does not have them yet).

## Known gaps / follow-ups

- `APP_URL` is dev localhost; email CTA links won't work for real recipients
  until it (and `RESEND_API_KEY`/`RESEND_FROM`) are set on prod and a Resend
  domain is verified.
- Email fan-out covers the 4 core features (claims/payment requests/payroll/
  leave), now configured per module (Claims/Payroll/Leave/Payment requests →
  **Email** tab), each with its own accent/font/from-name/footer + a shared
  logo. Other notification types (feed, recruitment, reviews, attendance,
  schedules) remain in-app only — route them through `pushNotification` and add
  a `featureForType` mapping to extend.
- Invoice-date sorting keys off the `invoiceDate` custom-field key (the default
  template's "Date of Invoice"); a template that renames that field's key won't
  populate the Invoice-date sort.
- No "recall" to send a `pending_approval` run back to `draft`.
- Seeded SHG/SDL rate tables still need verification against the current
  published figures (flagged in the Statutory-funds settings tab).
- Statutory report generation (CPF/bank files) exports CSV but is not an
  official submission format.

## Verify

`npx convex codegen` · `npx tsc --noEmit` · `npx next build` all pass. Live-data
checks for payroll are done with the Convex MCP (`runOneoffQuery`).
