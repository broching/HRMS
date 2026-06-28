import { PayslipDetail } from "@/features/payroll/components/payslip-detail"
import type { Id } from "@/convex/_generated/dataModel"

export default async function PayslipDetailPage({
  params,
}: {
  params: Promise<{ payslipId: string }>
}) {
  const { payslipId } = await params
  return <PayslipDetail payslipId={payslipId as Id<"payslips">} />
}
