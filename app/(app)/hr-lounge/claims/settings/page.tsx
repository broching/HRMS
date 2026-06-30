import { PageHeader } from "@/components/shared/page-header"
import { ClaimsTabs } from "@/features/claims/components/claims-tabs"
import { ClaimSettingsShell } from "@/features/claims/components/claim-settings-shell"

export default function ClaimSettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Expense Claims" description="Claim Settings" />
      <ClaimsTabs />
      <ClaimSettingsShell />
    </div>
  )
}
