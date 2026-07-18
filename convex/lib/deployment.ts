/**
 * Deployment mode — the one thing that differs between an ordinary shared
 * (multi-tenant) deployment and a dedicated single-tenant Enterprise deployment.
 *
 * The codebase and schema are IDENTICAL across every deployment; only Convex
 * environment variables differ:
 *   - `DEPLOYMENT_MODE=dedicated` marks a deployment as a single-org Enterprise
 *     instance (default/absent = `shared`, i.e. today's multi-tenant behaviour).
 *   - `DEDICATED_ORG_CLERK_ID` pins that deployment to exactly one Clerk org id.
 *     `getOrgContext` (convex/auth.ts) refuses every other org, so even if a
 *     different frontend is pointed at this deployment it can only ever serve
 *     the pinned org's data.
 *
 * On a dedicated deployment billing is handled manually (custom Enterprise
 * quote), so the paywall is off (convex/billing.ts) and all modules are enabled
 * (convex/auth.ts `resolveEnabledModules`). No Stripe/webhook env is set there.
 *
 * Framework-agnostic (no Convex imports) so it can be shared freely.
 */

export type DeploymentMode = "shared" | "dedicated";

/** Resolved deployment mode from env (defaults to `shared` when unset). */
export function deploymentMode(): DeploymentMode {
  return process.env.DEPLOYMENT_MODE === "dedicated" ? "dedicated" : "shared";
}

/** Whether this deployment is a dedicated single-tenant Enterprise instance. */
export function isDedicated(): boolean {
  return deploymentMode() === "dedicated";
}

/** The Clerk org id this deployment is pinned to, or null when not dedicated. */
export function dedicatedOrgClerkId(): string | null {
  const id = process.env.DEDICATED_ORG_CLERK_ID;
  return id && id.length > 0 ? id : null;
}
