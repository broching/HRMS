"use client"

import * as React from "react"
import { useConvex } from "convex/react"
import { IconDownload, IconFileSpreadsheet, IconFileTypeCsv } from "@tabler/icons-react"
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
import {
  buildEmployeesCsv,
  buildEmployeesWorkbook,
  downloadBlob,
} from "@/features/employees/lib/employee-export"

// Bulk export for the HR Lounge employee directory: every employee's
// directory + job (and, for callers with employees:read:all, personal) fields
// in one Excel workbook or CSV. Upload is a separate, not-yet-built feature.
export function EmployeeExportMenu() {
  const convex = useConvex()
  const [busy, setBusy] = React.useState(false)

  async function run(kind: "excel" | "csv") {
    setBusy(true)
    try {
      const rows = await convex.query(api.employees.exportRows, {})
      if (rows.length === 0) {
        toast.error("No employees to export.")
        return
      }
      const stamp = new Date().toISOString().slice(0, 10)
      if (kind === "excel") {
        const blob = await buildEmployeesWorkbook(rows)
        downloadBlob(`Employees — ${stamp}.xlsx`, blob)
      } else {
        const blob = buildEmployeesCsv(rows)
        downloadBlob(`Employees — ${stamp}.csv`, blob)
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
        <Button variant="outline" disabled={busy}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <IconDownload className="size-4" />
          )}
          Bulk Download / Upload
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Download employees</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => run("excel")}>
          <IconFileSpreadsheet className="size-4" />
          Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("csv")}>
          <IconFileTypeCsv className="size-4" />
          CSV
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => toast.info("Bulk upload is coming soon.")}
        >
          Upload employees
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
