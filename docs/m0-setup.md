# M0 — Foundation: Clerk setup

The multi-tenant foundation (schema, RBAC, app shell) is in place. To run it,
Clerk Organizations must be enabled and the active-org claims must reach Convex.
Do these once in the Clerk dashboard for this instance.

## 1. Enable Organizations
Clerk Dashboard → **Organizations** → enable. (Optional: allow members to
create organizations, so signing up + visiting `/select-org` lets a user create
their company.)

## 2. Add org claims to the "convex" JWT template
Clerk Dashboard → **JWT Templates** → open the template named **`convex`** →
add these claims so Convex can read the active organization from
`ctx.auth.getUserIdentity()`:

```json
{
  "org_id": "{{org.id}}",
  "org_role": "{{org.role}}",
  "org_slug": "{{org.slug}}"
}
```

> Without this, `OrgGuard` (which uses Clerk's own `auth()`) still passes, but
> Convex `members.current` returns `null` — the shell renders yet Settings is
> hidden and org-scoped queries are unauthorized. This step is required.

## 3. Add organization webhook events
Clerk Dashboard → **Webhooks** → the endpoint pointing at the Convex HTTP
action `…/clerk-users-webhook` → subscribe to:

- `organization.created`, `organization.updated`, `organization.deleted`
- `organizationMembership.created`, `organizationMembership.updated`,
  `organizationMembership.deleted`

(`user.*` and `paymentAttempt.*` should already be subscribed.) The signing
secret is `CLERK_WEBHOOK_SECRET` in the **Convex** dashboard env vars.

## 4. First-run roles
When an organization is created, Clerk marks the creator `org:admin`, which the
sync maps to the HRMS `admin` role. Admins/HR can then change any member's role
in **Settings → Members** (stored authoritatively in Convex — no Clerk paid
plan needed for HR/Manager roles).

## Smoke test
1. `npx convex dev` (terminal A) and `npm run dev` (terminal B).
2. Sign up → you're routed to `/select-org` → create an organization.
3. Convex dashboard → Data: an `organizations` row and a `members` row (role
   `admin`) appear.
4. `/dashboard` renders inside the shell with the OrganizationSwitcher.
5. **Settings → Members** lists members; change a role and it persists.
6. **Settings → Organization** shows SGD / Asia-Singapore defaults; edit + save.
7. Tenancy check: create a second org, switch to it — the first org's members
   are not visible.
