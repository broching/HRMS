"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import { IconDownload } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/shared/page-header"
import {
  PAYROLL_STATUS_BADGE,
  PAYROLL_STATUS_LABELS,
} from "@/features/payroll/lib/labels"
import { downloadPayslipPdf } from "@/features/payroll/lib/payslip-pdf"
import { PayslipDocument } from "./payslip-document"

export function PayslipDetail({ payslipId }: { payslipId: Id<"payslips"> }) {
  const slip = useQuery(api.payroll.getPayslip, { payslipId })
  const [downloading, setDownloading] = React.useState(false)

  if (slip === undefined) {
    return (
      <div className="px-4 lg:px-6">
        <Skeleton className="h-80 w-full max-w-2xl" />
      </div>
    )
  }

  async function handleDownload() {
    if (!slip) return
    setDownloading(true)
    try {
      await downloadPayslipPdf(slip, `${slip.employeeName} — ${slip.periodMonth}.pdf`)
    } catch {
      toast.error("Couldn't build the payslip PDF")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Payslip · ${slip.periodMonth}`}
        description={slip.employeeName}
      >
        <Badge variant={PAYROLL_STATUS_BADGE[slip.status]}>
          {PAYROLL_STATUS_LABELS[slip.status]}
        </Badge>
        <Button onClick={handleDownload} disabled={downloading}>
          <IconDownload className="size-4" />
          {downloading ? "Preparing…" : "Download"}
        </Button>
      </PageHeader>

      <div className="px-4 lg:px-6">
        <div className="max-w-2xl">
          <PayslipDocument slip={slip} />
        </div>
      </div>
    </div>
  )
}
