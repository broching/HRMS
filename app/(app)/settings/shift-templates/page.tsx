import { PageHeader } from "@/components/shared/page-header"
import { ShiftTemplatesSettings } from "@/features/scheduling/components/shift-templates-settings"
import { HrLoungeShell } from "@/features/hr-lounge/components/hr-lounge-shell"

export default function ShiftTemplatesPage() {
  return (
    <HrLoungeShell>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Shift templates"
          description="Reusable shift definitions for building rosters quickly."
        />
        <ShiftTemplatesSettings />
      </div>
    </HrLoungeShell>
  )
}
