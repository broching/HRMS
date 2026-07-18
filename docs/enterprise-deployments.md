# Enterprise dedicated deployments

An **Enterprise** customer runs on its own **dedicated, single-tenant Convex
deployment** (separate database + keys) on its own domain. The application code
and the Convex schema are **identical** to the shared multi-tenant app — the only
difference is environment variables. Nothing in `convex/` or the frontend is
forked per customer.

Two modes, selected purely by env:

| | Shared (default) | Dedicated (Enterprise) |
|---|---|---|
| Convex deployment | one shared, all tenants | one per enterprise org |
| `DEPLOYMENT_MODE` (Convex) | unset / `shared` | `dedicated` |
| `DEDICATED_ORG_CLERK_ID` (Convex) | — | the org's Clerk org id |
| `NEXT_PUBLIC_DEPLOYMENT_MODE` (frontend) | unset / `shared` | `dedicated` |
| `NEXT_PUBLIC_CONVEX_URL` (frontend) | shared deployment | the org's deployment |
| Billing | self-serve Stripe (à la carte) | manual custom quote (no Stripe) |
| Modules | super-admin toggles per org | super-admin toggles per org (same) |
| Auth | shared Clerk, any org | shared Clerk, **pinned** to one org |

## How the pinning works (code)

- `convex/lib/deployment.ts` — `isDedicated()` / `dedicatedOrgClerkId()` read the
  Convex env.
- `convex/auth.ts::getOrgContext` — on a dedicated deployment, any Clerk org id
  that isn't the pinned one resolves to `null`. Every authorised query/mutation
  funnels through `getOrgContext`, so the deployment can only ever read/write the
  one org's data, even if a different frontend is pointed at it.
- Module entitlements are **unchanged** from shared: `resolveEnabledModules`
  reads `orgModules.disabled` (absent row = all on). A dedicated org still starts
  with everything enabled, but the **super-admin console on the dedicated
  deployment** (`SUPER_ADMIN_USER_IDS`) can toggle any module off per that org —
  "Enterprise" does not mean every feature is forced on.
- `convex/billing.ts` — `billingEnforced()` is forced `false` on dedicated (no
  paywall); `getBillingSummary().dedicated` drives the managed-support panel on
  the in-app billing page. No Stripe webhook is wired for dedicated deployments,
  so nothing ever rewrites entitlements.
- `convex/dedicated.ts::bootstrap` — a fresh dedicated DB is empty, so on first
  load the client (`components/layout/ensure-membership.tsx`) calls this action.
  It pulls the pinned org + the caller + their membership from the Clerk Backend
  API (`CLERK_SECRET_KEY`) and creates those rows via the same internal mutations
  the webhooks use — so the first admin lands provisioned without waiting on the
  org's original `*.created` webhooks (which fired against the shared deployment,
  never here). Guarded to dedicated mode + the pinned org; idempotent.

> Public, no-auth endpoints (`convex/board.ts`) don't call `getOrgContext`, but a
> dedicated database only ever contains the pinned org's data, so there's nothing
> for them to leak.

## Provisioning a new enterprise (runbook)

Prereqs: the org already exists as a **Clerk organization** (note its
`org_...` id). Auth stays on the **same Clerk application** as the shared app.

### 1. Create the dedicated Convex project
Create a new project in the Convex dashboard for the customer (e.g.
`leadmighty-acme`). Grab a **deploy key** for it.

### 2. Deploy the (unmodified) code to it
From this repo — same `convex/` code and schema, zero edits:
```bash
CONVEX_DEPLOY_KEY=<acme deploy key> npx convex deploy
```

### 3. Set the dedicated deployment's Convex env vars
> ⚠️ **The #1 footgun.** These go in the **dedicated deployment's OWN Convex
> environment** (the new project you just created), **not** your local
> `.env.local` and **not** the shared deployment. If the dedicated deployment
> still has `DEPLOYMENT_MODE=shared` (or an empty `DEDICATED_ORG_CLERK_ID`), the
> backend runs in shared mode: the paywall-bypass/pin logic never kicks in
> and `dedicated.bootstrap` refuses with `not_dedicated`. The symptom is a
> **"Subscription inactive"** screen (see Troubleshooting). Verify with
> `npx convex env list` against the **dedicated** deployment before moving on.

On the new deployment (dashboard → Settings → Environment Variables, or
`npx convex env set NAME value --deployment-key <acme deploy key>`):
```
DEPLOYMENT_MODE=dedicated
DEDICATED_ORG_CLERK_ID=org_xxxxxxxxxxxxxxxx     # the pinned Clerk org
NEXT_PUBLIC_CLERK_FRONTEND_API_URL=<same as shared>   # auth.config.ts issuer
CLERK_SECRET_KEY=<same as shared>               # required — bootstrap uses it
CLERK_WEBHOOK_SECRET=<the endpoint's signing secret>  # see step 5
APP_URL=https://hr.acme.com                     # the dedicated domain
# Optional, as needed:
RESEND_API_KEY=... / RESEND_FROM=...
SUPER_ADMIN_USER_IDS=...
```
**Do NOT set** `BILLING_ENFORCED` or any `STRIPE_*` — Enterprise billing is
handled manually. **Do NOT** add a `/stripe-webhook` endpoint for this
deployment.

> Note on `CONVEX_DEPLOYMENT` (in `.env.local`): this only tells the `npx convex`
> CLI which deployment to push code/env to. To operate on the dedicated
> deployment, either set `CONVEX_DEPLOYMENT` to it or pass its `--deployment-key`
> — otherwise `convex deploy` / `env set` hit the shared deployment. The frontend
> at runtime ignores `CONVEX_DEPLOYMENT` and uses `NEXT_PUBLIC_CONVEX_URL`.

### 4. Deploy a frontend for the dedicated domain
Create a separate hosting project (e.g. a Vercel project) building this same
repo, with env:
```
NEXT_PUBLIC_CONVEX_URL=https://<acme deployment>.convex.cloud
NEXT_PUBLIC_DEPLOYMENT_MODE=dedicated
NEXT_PUBLIC_DEDICATED_ORG_NAME=Acme Pte Ltd     # optional, for UI copy
# Same Clerk keys + redirect envs as the shared app:
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
NEXT_PUBLIC_CLERK_FRONTEND_API_URL=...
NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL=/dashboard
...
```
Point the customer's domain (`hr.acme.com`) at this project and add it to
**Clerk → allowed origins / redirect URLs**.

### 5. Bootstrap the pinned org into the (empty) dedicated DB
A fresh dedicated deployment has an empty database. The org's original Clerk
`organization.created` / `organizationMembership.created` events already fired
against the shared deployment (or before this endpoint existed), so they won't
replay here. Two mechanisms cover this:

- **Automatic (first sign-in).** The first admin just signs in on the dedicated
  domain. `dedicated.bootstrap` (step above) pulls the org + that user + their
  membership from the Clerk Backend API and provisions the rows. This needs
  `DEPLOYMENT_MODE=dedicated`, a matching `DEDICATED_ORG_CLERK_ID`, and
  `CLERK_SECRET_KEY` — all from step 3. **This is why the wrong `DEPLOYMENT_MODE`
  breaks everything.**
- **Ongoing sync (webhook).** Add the dedicated deployment's
  `.../clerk-users-webhook` as an endpoint in the **same Clerk application's**
  webhooks (user + organization + membership events) and put its signing secret
  in `CLERK_WEBHOOK_SECRET` (step 3). This keeps later members/edits in sync. The
  shared Clerk may fan out events for other orgs too — those rows are inert
  because of the org pin, so this is safe.

### 6. Data migration (only if the org already used the shared app)
If the org has existing data in the shared deployment, move it over:
```bash
# from the shared deployment
npx convex export --path acme-export.zip
# import into the dedicated deployment (filter to the org's rows first if needed)
CONVEX_DEPLOY_KEY=<acme deploy key> npx convex import acme-export.zip
```
Then remove the org from the shared deployment. Going forward the org pin keeps
the two deployments from cross-contaminating. Treat this as a careful, one-off,
owner-run step.

### 7. Verify
- Sign in as a member of the pinned org on the dedicated domain → app loads, **no
  paywall**, modules per the super-admin config (all on by default; toggle any off
  in `/super-admin` on the dedicated deployment).
- The **HR Lounge → Billing & plan** page shows the *"Enterprise · Dedicated
  deployment"* managed-support panel (not the self-serve builder).
- A user whose active org is a *different* Clerk org gets no access (queries
  resolve empty / unauthorised) — the pin holds.

## Troubleshooting

**"Subscription inactive" / "Only an admin can manage billing" on the dedicated
domain.** The deployment isn't actually running in dedicated mode — so the normal
paywall applies and, with no membership/subscription yet, you get the locked
screen. Almost always a step-3 misconfiguration:
1. Run `npx convex env list` against the **dedicated** deployment and confirm
   `DEPLOYMENT_MODE=dedicated` and `DEDICATED_ORG_CLERK_ID=org_...` (the value
   set, not empty). If it says `shared`/empty, the env was set on the wrong
   deployment (or in `.env.local` only) — fix it and redeploy.
2. Confirm the frontend build uses `NEXT_PUBLIC_CONVEX_URL=<dedicated url>` and
   `NEXT_PUBLIC_DEPLOYMENT_MODE=dedicated`.
3. Confirm `CLERK_SECRET_KEY` is set on the dedicated deployment (bootstrap needs
   it) and the signed-in user is a member of the pinned Clerk org.

Once dedicated mode is truly on, `billingEnforced()` returns `false` and this
screen cannot appear.

## Selling it

The Enterprise offering is surfaced to prospects on:
- the landing pricing section (`app/(landing)/_components/pricing-section.tsx`) —
  Enterprise band → contact form,
- the in-app plan builder (`features/billing/components/pricing-plans.tsx`) —
  Enterprise card → `/leadmightyhr#contact`.

Copy lives once in `ENTERPRISE` (`convex/lib/plans.ts`).
