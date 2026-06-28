import { EmployeeForm } from "@/features/employees/components/employee-form"
import { PageHeader } from "@/components/shared/page-header"

export default function NewEmployeePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="New employee"
        description="Add a person to your organization."
      />
      <EmployeeForm />
    </div>
  )
}
