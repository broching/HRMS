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
  `createZip`). The claim form lays out one column per claim **category** present,
  with Total / Remarks / GST columns and signatures at the bottom. (CSV export was
  removed; `unionSignatures` de-dupes signatures across employees for the list +
  totals workbooks.)

## Known gaps / follow-ups

- No "recall" to send a `pending_approval` run back to `draft`.
- Seeded SHG/SDL rate tables still need verification against the current
  published figures (flagged in the Statutory-funds settings tab).
- Statutory report generation (CPF/bank files) exports CSV but is not an
  official submission format.

## Verify

`npx convex codegen` · `npx tsc --noEmit` · `npx next build` all pass. Live-data
checks for payroll are done with the Convex MCP (`runOneoffQuery`).
