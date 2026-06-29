import type {
  EmployeeStatus,
  EmploymentType,
} from "@/convex/lib/enums"

export const STATUS_LABELS: Record<EmployeeStatus, string> = {
  active: "Active",
  probation: "Probation",
  on_leave: "On leave",
  suspended: "Suspended",
  terminated: "Terminated",
}

export const STATUS_BADGE: Record<
  EmployeeStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  active: "default",
  probation: "secondary",
  on_leave: "secondary",
  suspended: "outline",
  terminated: "destructive",
}

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  intern: "Intern",
}

export const GENDER_LABELS: Record<string, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
  undisclosed: "Undisclosed",
}

export const MARITAL_STATUS_LABELS: Record<string, string> = {
  single: "Single",
  married: "Married",
  divorced: "Divorced",
  widowed: "Widowed",
  other: "Other",
  undisclosed: "Undisclosed",
}

export const MARITAL_STATUSES = [
  "single",
  "married",
  "divorced",
  "widowed",
  "other",
  "undisclosed",
] as const

export const EMPLOYEE_STATUSES: EmployeeStatus[] = [
  "active",
  "probation",
  "on_leave",
  "suspended",
  "terminated",
]

export const EMPLOYMENT_TYPES: EmploymentType[] = [
  "full_time",
  "part_time",
  "contract",
  "intern",
]
