import { PageHeader } from "@/components/shared/page-header"
import { RecruitmentTabs } from "@/features/recruitment/components/recruitment-tabs"
import { BoardSettings } from "@/features/recruitment/components/board-settings"

export default function RecruitmentSettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Recruitment" description="Job board settings." />
      <RecruitmentTabs />
      <BoardSettings />
    </div>
  )
}
