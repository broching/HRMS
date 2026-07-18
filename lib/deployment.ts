/**
 * Client-side deployment mode. Mirrors `convex/lib/deployment.ts` for the
 * frontend: a dedicated Enterprise build sets `NEXT_PUBLIC_DEPLOYMENT_MODE`
 * (and points `NEXT_PUBLIC_CONVEX_URL` at that org's dedicated deployment).
 *
 * The backend is the real source of truth (org pinning + billing bypass live in
 * Convex); this only drives presentational choices such as swapping the billing
 * page for the dedicated-support panel. `NEXT_PUBLIC_*` vars are inlined at
 * build time, so this is safe to read synchronously in client components.
 */

/** Whether this frontend build targets a dedicated Enterprise deployment. */
export function isDedicatedClient(): boolean {
  return process.env.NEXT_PUBLIC_DEPLOYMENT_MODE === "dedicated";
}

/** Optional display label for the dedicated org (used in support copy). */
export function dedicatedOrgName(): string | null {
  const name = process.env.NEXT_PUBLIC_DEDICATED_ORG_NAME;
  return name && name.length > 0 ? name : null;
}
