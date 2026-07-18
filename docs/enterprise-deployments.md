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
| Modules | per-org entitlements | all always on |
| Auth | shared Clerk, any org | shared Clerk, **pinned** to one org |

## How the pinning works (code)

- `convex/lib/deployment.ts` — `isDedicated()` / `dedicatedOrgClerkId()` read the
  Convex env.
- `convex/auth.ts::getOrgContext` — on a dedicated deployment, any Clerk org id
  that isn't the pinned one resolves to `null`. Every authorised query/mutation
  funnels through `getOrgContext`, so the deployment can only ever read/write the
  one org's data, even if a different frontend is pointed at it.
- `convex/auth.ts::resolveEnabledModules` — dedicated ⇒ every module enabled
  (ignores `orgModules`), so no stray toggle can lock the enterprise out.
- `convex/billing.ts` — `billingEnforced()` is forced `false` on dedicated (no
  paywall); `getBillingSummary().dedicated` drives the managed-support panel on
  the in-app billing page. No Stripe webhook is wired for dedicated deployments,
  so nothing ever rewrites entitlements.

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
On the new deployment (dashboard → Settings → Environment Variables, or
`npx convex env set --deployment-key ...`):
```
DEPLOYMENT_MODE=dedicated
DEDICATED_ORG_CLERK_ID=org_xxxxxxxxxxxxxxxx     # the pinned Clerk org
NEXT_PUBLIC_CLERK_FRONTEND_API_URL=<same as shared>   # auth.config.ts issuer
CLERK_SECRET_KEY=<same as shared>
CLERK_WEBHOOK_SECRET=<the endpoint's signing secret>  # see step 5
APP_URL=https://hr.acme.com                     # the dedicated domain
# Optional, as needed:
RESEND_API_KEY=... / RESEND_FROM=...
SUPER_ADMIN_USER_IDS=...
```
**Do NOT set** `BILLING_ENFORCED` or any `STRIPE_*` — Enterprise billing is
handled manually. **Do NOT** add a `/stripe-webhook` endpoint for this
deployment.

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

### 5. Sync the pinned org's identity into the dedicated DB
Add the dedicated deployment's `.../clerk-users-webhook` as an endpoint in the
**same Clerk application's** webhooks (user + organization + membership events)
and put its signing secret in `CLERK_WEBHOOK_SECRET` (step 3). The shared Clerk
may fan out events for other orgs too — those rows are inert because of the org
pin, so this is safe. (Users can also be created lazily on first sign-in.)

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
  paywall**, all modules present.
- The **HR Lounge → Billing & plan** page shows the *"Enterprise · Dedicated
  deployment"* managed-support panel (not the self-serve builder).
- A user whose active org is a *different* Clerk org gets no access (queries
  resolve empty / unauthorised) — the pin holds.

## Selling it

The Enterprise offering is surfaced to prospects on:
- the landing pricing section (`app/(landing)/_components/pricing-section.tsx`) —
  Enterprise band → contact form,
- the in-app plan builder (`features/billing/components/pricing-plans.tsx`) —
  Enterprise card → `/leadmightyhr#contact`.

Copy lives once in `ENTERPRISE` (`convex/lib/plans.ts`).
