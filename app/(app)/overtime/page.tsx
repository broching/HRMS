import { PageHeader } from "@/components/shared/page-header"
import { MyOvertime } from "@/features/overtime/components/my-overtime"

export default function OvertimePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Overtime"
        description="Overtime scheduled for you."
      />
      <MyOvertime />
    </div>
  )
}
