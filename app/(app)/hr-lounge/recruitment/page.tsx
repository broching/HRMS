import { PageHeader } from "@/components/shared/page-header"
import { RecruitmentTabs } from "@/features/recruitment/components/recruitment-tabs"
import { RecruitmentDashboard } from "@/features/recruitment/components/recruitment-dashboard"

export default function RecruitmentPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Recruitment" description="Jobs, candidates and your job board." />
      <RecruitmentTabs />
      <RecruitmentDashboard />
    </div>
  )
}
