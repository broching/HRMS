"use client"

import { IconReportAnalytics } from "@tabler/icons-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { EmployeeDirectory } from "@/features/employees/components/employee-directory"
import { EmployeeExportMenu } from "@/features/employees/components/employee-export-menu"

// HR Lounge landing: the people directory with HR action buttons. Reports is
// stubbed (coming soon) for now.
export function HrEmployeeList() {
  return (
    <EmployeeDirectory
      memberControls
      actions={
        <>
          <EmployeeExportMenu />
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
