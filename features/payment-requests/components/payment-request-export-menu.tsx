"use client"

import * as React from "react"
import { useConvex } from "convex/react"
import { IconDownload, IconFileSpreadsheet, IconFileZip } from "@tabler/icons-react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { buildPaymentRequestsWorkbook } from "@/features/payment-requests/lib/payment-request-excel"
import {
  buildRequestsPdfZip,
  downloadBlob,
} from "@/features/payment-requests/lib/payment-request-pdf"

// Export actions for the payment-request queue: monthly Excel (one row per
// request), a ZIP of request PDFs, and a ZIP of request PDFs with their
// supporting documents merged in as trailing pages.
export function PaymentRequestExportMenu({ month }: { month: string }) {
  const convex = useConvex()
  const [busy, setBusy] = React.useState(false)

  async function run(kind: "excel" | "pdf" | "pdf-attachments") {
    setBusy(true)
    try {
      const rows = await convex.query(api.paymentRequests.exportRows, { month })
      if (rows.length === 0) {
        toast.error("No payment requests to export this month.")
        return
      }
      if (kind === "excel") {
        const blob = await buildPaymentRequestsWorkbook({ rows, periodMonth: month })
        downloadBlob(`Payment requests — ${month}.xlsx`, blob)
      } else {
        const ids = rows.map((r) => r._id)
        const prints = await convex.query(api.paymentRequests.getForPrint, {
          requestIds: ids,
        })
        if (prints.length === 0) {
          toast.error("Nothing to download.")
          return
        }
        const blob = await buildRequestsPdfZip(
          prints,
          kind === "pdf-attachments",
          month,
        )
        downloadBlob(
          `Payment requests${kind === "pdf-attachments" ? " + attachments" : ""} — ${month}.zip`,
          blob,
        )
      }
      toast.success("Export ready")
    } catch (e) {
      console.error(e)
      toast.error("Export failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={busy}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <IconDownload className="size-4" />
          )}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>This month</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => run("excel")}>
          <IconFileSpreadsheet className="size-4" />
          Excel (one row per request)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => run("pdf")}>
          <IconFileZip className="size-4" />
          PDF forms (ZIP)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("pdf-attachments")}>
          <IconFileZip className="size-4" />
          PDF forms + attachments (ZIP)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
