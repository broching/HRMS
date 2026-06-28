import { PageHeader } from "@/components/shared/page-header"
import { ShiftTemplatesSettings } from "@/features/scheduling/components/shift-templates-settings"

export default function ShiftTemplatesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Shift templates"
        description="Reusable shift definitions for building rosters quickly."
      />
      <ShiftTemplatesSettings />
    </div>
  )
}
