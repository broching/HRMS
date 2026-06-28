import { PageHeader } from "@/components/shared/page-header"
import { LeaveSettings } from "@/features/leave/components/leave-settings"

export default function LeaveTypesSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Leave types & holidays"
        description="Configure leave entitlements and the public holiday calendar."
      />
      <LeaveSettings />
    </div>
  )
}
