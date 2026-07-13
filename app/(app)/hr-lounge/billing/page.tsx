import { Suspense } from "react"
import { BillingPage } from "@/features/billing/components/billing-page"
import { PageHeader } from "@/components/shared/page-header"

// Subscription & billing is an HR Lounge module; the HR Lounge layout provides
// the rail, so this page only renders its own content. BillingPage reads
// `?checkout=` search params, so it sits under a Suspense boundary.
export default function BillingRoute() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Billing & plan"
        description="Manage your LeadMighty HR subscription, seats and payment method."
      />
      <div className="flex flex-col gap-6 px-4 lg:px-6">
        <Suspense fallback={null}>
          <BillingPage />
        </Suspense>
      </div>
    </div>
  )
}
