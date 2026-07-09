"use client"

import { IconDownload, IconReportAnalytics } from "@tabler/icons-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { EmployeeDirectory } from "@/features/employees/components/employee-directory"

// HR Lounge landing: the people directory with HR action buttons. Bulk
// download/upload and reports are stubbed (coming soon) for now.
export function HrEmployeeList() {
  return (
    <EmployeeDirectory
      memberControls
      actions={
        <>
          <Button
            variant="outline"
            onClick={() => toast.info("Bulk download / upload is coming soon.")}
          >
            <IconDownload className="size-4" />
            Bulk Download / Upload
          </Button>
          <Button
            variant="outline"
            onClick={() => toast.info("Reports are coming soon.")}
          >
            <IconReportAnalytics className="size-4" />
            Reports
          </Button>
        </>
      }
    />
  )
}
