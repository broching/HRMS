import Link from "next/link"
import { notFound } from "next/navigation"
import { IconChevronLeft } from "@tabler/icons-react"
import { reportByKey } from "@/features/reports/lib/report-registry"
import { ReportBuilderDetail } from "@/features/reports/components/report-builder-detail"

export default async function ReportBuilderDetailPage({
  params,
}: {
  params: Promise<{ report: string }>
}) {
  const { report } = await params
  const def = reportByKey(report)
  if (!def || !def.available) notFound()

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <div className="flex items-center gap-2 pt-2 text-sm">
        <Link
          href="/hr-lounge/reports/builder"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <IconChevronLeft className="size-4" />
          Report builder
        </Link>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">{def.title}</h1>
      <ReportBuilderDetail reportKey={def.key} title={def.title} />
    </div>
  )
}
