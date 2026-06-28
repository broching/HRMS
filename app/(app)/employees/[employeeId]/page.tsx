import { EmployeeProfile } from "@/features/employees/components/employee-profile"
import type { Id } from "@/convex/_generated/dataModel"

export default async function EmployeeProfilePage({
  params,
}: {
  params: Promise<{ employeeId: string }>
}) {
  const { employeeId } = await params
  return <EmployeeProfile employeeId={employeeId as Id<"employees">} />
}
