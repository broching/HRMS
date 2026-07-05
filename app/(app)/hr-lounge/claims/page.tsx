import { PageHeader } from "@/components/shared/page-header"
import { ClaimsTabs } from "@/features/claims/components/claims-tabs"
import { ClaimsApprovalQueue } from "@/features/claims/components/claims-approval-queue"

export default function HrClaimsPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Expense Claims"
        description="Claims awaiting finance approval and reimbursement."
      />
      <ClaimsTabs />
      <ClaimsApprovalQueue showOrgFilters />
    </div>
  )
}
