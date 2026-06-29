import { PageHeader } from "@/components/shared/page-header"
import { TeamOverview } from "@/features/team/components/team-overview"

export default function TeamPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Team" description="Manage and support your team." />
      <TeamOverview />
    </div>
  )
}
