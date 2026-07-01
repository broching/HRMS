import {
  IconUser,
  IconReceipt2,
  IconId,
  IconCalendarStats,
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

/**
 * The Report builder catalogue. `available` reports have a backing dataset in
 * `convex/reportBuilder.ts`; the rest are shown as "coming soon" cards.
 */
export type ReportDef = {
  key: string
  title: string
  description: string
  icon: Icon
  available: boolean
}

export const REPORTS: ReportDef[] = [
  {
    key: "employee_information",
    title: "Employee Information",
    description:
      "Build your own report containing personal details, employment information and much more",
    icon: IconUser,
    available: true,
  },
  {
    key: "employee_payroll",
    title: "Employee Payroll",
    description: "Generate an employee payroll report for a given period of time",
    icon: IconFileDollar,
    available: true,
  },
  {
    key: "identity_documents",
    title: "Identity Documents",
    description:
      "Build your own reports containing employee identity documents (Passport, IC etc.)",
    icon: IconId,
    available: true,
  },
  {
    key: "leave_balances",
    title: "Leave Balances",
    description:
      "Build your own report containing employee leave balance calculations",
    icon: IconCalendarStats,
    available: true,
  },
  {
    key: "expense_claims",
    title: "Expense Claims",
    description: "Build your own report containing employee expense claims",
    icon: IconReceipt2,
    available: true,
  },
  {
    key: "performance_management",
    title: "Performance Management",
    description: "Build your own report containing employee performance ratings",
    icon: IconChartBar,
    available: true,
  },
  {
    key: "company_payroll",
    title: "Company Payroll Report",
    description: "Build your own company payroll report",
    icon: IconBuildingBank,
    available: true,
  },
  {
    key: "performance_objective",
    title: "Performance Objective",
    description:
      "Build your own report containing employee performance objectives",
    icon: IconTargetArrow,
    available: false,
  },
  {
    key: "performance_feedback",
    title: "Performance 1 on 1 feedback",
    description:
      "Build your own report containing employees' performance 1 on 1 feedback",
    icon: IconMessage2,
    available: false,
  },
  {
    key: "recruitment",
    title: "Recruitment",
    description: "Build your own report containing candidate job application",
    icon: IconBriefcase,
    available: false,
  },
  {
    key: "timesheets_project",
    title: "Timesheets by Project",
    description: "Build your own report containing timesheets by project",
    icon: IconClock,
    available: false,
  },
  {
    key: "timesheet_employee",
    title: "Timesheet by Employee",
    description: "Build your own report containing employee timesheet",
    icon: IconClockDollar,
    available: false,
  },
]

export function reportByKey(key: string): ReportDef | undefined {
  return REPORTS.find((r) => r.key === key)
}
