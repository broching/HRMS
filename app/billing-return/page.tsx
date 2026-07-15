import { Suspense } from "react"
import { BillingReturn } from "@/features/billing/components/billing-return"

// Public landing target for Stripe Checkout / billing-portal returns. Lives
// outside the (app) group so no server-side auth guard runs before Clerk's
// client session has re-synced after the cross-site round trip; BillingReturn
// then forwards to the real (server-protected) billing page. Uses
// useSearchParams, so it sits under a Suspense boundary.
export default function BillingReturnRoute() {
  return (
    <Suspense fallback={null}>
      <BillingReturn />
    </Suspense>
  )
}
