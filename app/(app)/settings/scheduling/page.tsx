import { PageHeader } from "@/components/shared/page-header"
import { SchedulingSettings } from "@/features/scheduling/components/scheduling-settings"
import { HrLoungeShell } from "@/features/hr-lounge/components/hr-lounge-shell"

export default function SchedulingSettingsPage() {
  return (
    <HrLoungeShell>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Scheduling"
          description="Work patterns auto-fill the roster for salaried staff; shift templates are reusable presets for building shifts quickly."
        />
        <SchedulingSettings />
      </div>
    </HrLoungeShell>
  )
}
