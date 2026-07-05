import { PageHeader } from "@/components/shared/page-header"
import { MyClaims } from "@/features/claims/components/my-claims"

export default function ClaimsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My claims"
        description="Submit expenses and track reimbursement."
      />
      <MyClaims />
    </div>
  )
}
