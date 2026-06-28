import { PageHeader } from "@/components/shared/page-header"
import { ClaimSettings } from "@/features/claims/components/claim-settings"

export default function ClaimTypesSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Claim types"
        description="Configure expense categories and receipt requirements."
      />
      <ClaimSettings />
    </div>
  )
}
