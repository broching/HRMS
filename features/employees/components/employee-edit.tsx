"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/shared/page-header"
import {
  EmployeeForm,
  type EmployeeFormValues,
} from "./employee-form"

export function EmployeeEdit({ employeeId }: { employeeId: Id<"employees"> }) {
  const employee = useQuery(api.employees.get, { employeeId })

  if (employee === undefined) {
    return (
      <div className="px-4 lg:px-6">
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  const initial: Partial<EmployeeFormValues> = {
    employeeNumber: employee.employeeNumber,
    firstName: employee.firstName,
    lastName: employee.lastName,
    preferredName: employee.preferredName ?? "",
    dob: employee.dob ?? "",
    gender: employee.gender ?? "",
    nationality: employee.nationality ?? "",
    idNumber: "", // full ID is never stored/prefilled; only masked is kept
    personalEmail: employee.contact?.personalEmail ?? "",
    workEmail: employee.contact?.workEmail ?? "",
    phone: employee.contact?.phone ?? "",
    addressLine1: employee.address?.line1 ?? "",
    addressLine2: employee.address?.line2 ?? "",
    city: employee.address?.city ?? "",
    state: employee.address?.state ?? "",
    postalCode: employee.address?.postalCode ?? "",
    country: employee.address?.country ?? "",
    emergencyName: employee.emergencyContacts?.[0]?.name ?? "",
    emergencyRelationship: employee.emergencyContacts?.[0]?.relationship ?? "",
    emergencyPhone: employee.emergencyContacts?.[0]?.phone ?? "",
    employmentType: employee.employmentType,
    status: employee.status,
    joinDate: employee.joinDate,
    confirmationDate: employee.confirmationDate ?? "",
    probationEndDate: employee.probationEndDate ?? "",
    departmentId: employee.departmentId ?? "",
    teamId: employee.teamId ?? "",
    positionId: employee.positionId ?? "",
    managerId: employee.managerId ?? "",
    additionalManagerIds: employee.additionalManagerIds ?? [],
    officeId: employee.officeId ?? "",
    attendanceRequired:
      employee.attendanceRequired === true
        ? "required"
        : employee.attendanceRequired === false
          ? "exempt"
          : "default",
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Edit employee"
        description={`${employee.firstName} ${employee.lastName}`}
      />
      <EmployeeForm
        employeeId={employeeId}
        initial={initial}
        loginUsername={employee.loginUsername}
        loginEmail={employee.loginEmail}
      />
    </div>
  )
}
