import {
  IconUser,
  IconReceipt2,
  IconId,
  IconCalendarStats,
  IconCalendarEvent,
  IconFileDollar,
  IconChartBar,
  IconTargetArrow,
  IconMessage2,
  IconBriefcase,
  IconClock,
  IconClockDollar,
  IconBuildingBank,
  type Icon,
} from "@tabler/icons-react"
import type { ModuleKey } from "@/convex/lib/modules"

/**
 * The Report builder catalogue. `available` reports have a backing dataset in
 * `convex/reportBuilder.ts`; the rest are shown as "coming soon" cards.
 *
 * `module` is the product module a report belongs to — the report card is only
 * shown when that module is enabled for the org. `core` reports are always
 * available (the Reports section itself is gated by the `reports` module).
 */
export type ReportDef = {
  key: string
  title: string
  description: string
  icon: Icon
  available: boolean
  module: ModuleKey
  /** Show a month/year date picker in the builder and scope rows to it. */
  dateFilter?: boolean
}

export const REPORTS: ReportDef[] = [
  {
    key: "employee_information",
    title: "Employee Information",
    description:
      "Build your own report containing personal details, employment information and much more",
    icon: IconUser,
    available: true,
    module: "core",
  },
  {
    key: "employee_payroll",
    title: "Employee Payroll",
    description: "Generate an employee payroll report for a given period of time",
    icon: IconFileDollar,
    available: true,
    module: "payroll",
  },
  {
    key: "identity_documents",
    title: "Identity Documents",
    description:
      "Build your own reports containing employee identity documents (Passport, IC etc.)",
    icon: IconId,
    available: true,
    module: "core",
  },
  {
    key: "leave_balances",
    title: "Leave Balances",
    description:
      "Build your own report containing employee leave balance calculations",
    icon: IconCalendarStats,
    available: true,
    module: "leave",
  },
  {
    key: "leave_records",
    title: "Leave Records",
    description:
      "See all the leave employees take, filtered by month and year",
    icon: IconCalendarEvent,
    available: true,
    module: "leave",
    dateFilter: true,
  },
  {
    key: "expense_claims",
    title: "Expense Claims",
    description: "Build your own report containing employee expense claims",
    icon: IconReceipt2,
    available: true,
    module: "claims",
  },
  {
    key: "performance_management",
    title: "Performance Management",
    description: "Build your own report containing employee performance ratings",
    icon: IconChartBar,
    available: true,
    module: "performance",
  },
  {
    key: "company_payroll",
    title: "Company Payroll Report",
    description: "Build your own company payroll report",
    icon: IconBuildingBank,
    available: true,
    module: "payroll",
  },
  {
    key: "performance_objective",
    title: "Performance Objective",
    description:
      "Build your own report containing employee performance objectives",
    icon: IconTargetArrow,
    available: false,
    module: "performance",
  },
  {
    key: "performance_feedback",
    title: "Performance 1 on 1 feedback",
    description:
      "Build your own report containing employees' performance 1 on 1 feedback",
    icon: IconMessage2,
    available: false,
    module: "performance",
  },
  {
    key: "recruitment",
    title: "Recruitment",
    description: "Build your own report containing candidate job application",
    icon: IconBriefcase,
    available: false,
    module: "recruitment",
  },
  {
    key: "timesheets_project",
    title: "Timesheets by Project",
    description: "Build your own report containing timesheets by project",
    icon: IconClock,
    available: true,
    module: "timesheets",
  },
  {
    key: "timesheet_employee",
    title: "Timesheet by Employee",
    description: "Build your own report containing employee timesheet",
    icon: IconClockDollar,
    available: true,
    module: "timesheets",
  },
]

export function reportByKey(key: string): ReportDef | undefined {
  return REPORTS.find((r) => r.key === key)
}
