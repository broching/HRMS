import { IconRss } from "@tabler/icons-react"
import { PageHeader } from "@/components/shared/page-header"

export default function FeedPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Feed"
        description="Company announcements and updates."
      />
      <div className="px-4 lg:px-6">
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-20 text-center">
          <IconRss className="text-muted-foreground size-10" stroke={1.5} />
          <div className="space-y-1">
            <p className="font-medium">No announcements yet</p>
            <p className="text-muted-foreground text-sm">
              The company feed is coming soon.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
