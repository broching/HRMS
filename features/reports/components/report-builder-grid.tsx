"use client"

import Link from "next/link"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { REPORTS } from "@/features/reports/lib/report-registry"
import { useEnabledModules } from "@/hooks/use-modules"

export function ReportBuilderGrid() {
  const enabledModules = useEnabledModules()

  // Only surface reports whose backing module is enabled for the org. While the
  // membership loads (`undefined`), show nothing to avoid a flash of reports
  // that then disappear.
  const reports =
    enabledModules === undefined
      ? []
      : REPORTS.filter((r) => enabledModules.has(r.module))

  return (
    <div className="grid grid-cols-1 gap-4 px-4 sm:grid-cols-2 lg:grid-cols-3 lg:px-6 xl:grid-cols-4">
      {reports.map((r) => (
        <Card key={r.key} className="flex flex-col">
          <CardContent className="flex flex-1 flex-col gap-3 p-5">
            <div className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg">
              <r.icon className="size-5" />
            </div>
            <div className="flex-1 space-y-1">
              <h3 className="font-semibold">{r.title}</h3>
              <p className="text-muted-foreground text-sm">{r.description}</p>
            </div>
            {r.available ? (
              <Button asChild className="self-start">
                <Link href={`/hr-lounge/reports/builder/${r.key}`}>Create</Link>
              </Button>
            ) : (
              <Button
                variant="secondary"
                className="self-start"
                onClick={() => toast.info(`${r.title} report is coming soon.`)}
              >
                Coming soon
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
