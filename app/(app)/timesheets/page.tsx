import { PageHeader } from "@/components/shared/page-header"
import { MyTimesheet } from "@/features/timesheets/components/my-timesheet"

export default function TimesheetsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Timesheets"
        description="Log what you worked on each day."
      />
      <MyTimesheet />
    </div>
  )
}
