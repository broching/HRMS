"use client"

import Link from "next/link"
import { IconReportAnalytics } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { EmployeeDirectory } from "@/features/employees/components/employee-directory"
import { EmployeeExportMenu } from "@/features/employees/components/employee-export-menu"

// HR Lounge landing: the people directory with HR action buttons. "Reports"
// jumps straight to the Employee Information report in the report builder.
export function HrEmployeeList() {
  return (
    <EmployeeDirectory
      memberControls
      actions={
        <>
          <EmployeeExportMenu />
          <Button variant="outline" asChild>
            <Link href="/hr-lounge/reports/builder/employee_information">
              <IconReportAnalytics className="size-4" />
              Reports
            </Link>
          </Button>
        </>
      }
    />
  )
}
