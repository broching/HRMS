import { IconSitemap } from "@tabler/icons-react"
import { PageHeader } from "@/components/shared/page-header"

export default function OrgChartPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Org chart"
        description="Visualise your reporting structure."
      />
      <div className="px-4 lg:px-6">
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-20 text-center">
          <IconSitemap className="text-muted-foreground size-10" stroke={1.5} />
          <div className="space-y-1">
            <p className="font-medium">Org chart coming soon</p>
            <p className="text-muted-foreground text-sm">
              An interactive reporting-line view is on the way. For now, browse
              the Employee List.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
