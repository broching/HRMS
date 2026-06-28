import { EmployeeEdit } from "@/features/employees/components/employee-edit"
import type { Id } from "@/convex/_generated/dataModel"

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ employeeId: string }>
}) {
  const { employeeId } = await params
  return <EmployeeEdit employeeId={employeeId as Id<"employees">} />
}
