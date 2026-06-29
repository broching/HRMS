import { PageHeader } from "@/components/shared/page-header"
import { Feed } from "@/features/feed/components/feed"

export default function FeedPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Feed"
        description="Company announcements and updates."
      />
      <Feed />
    </div>
  )
}
