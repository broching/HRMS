import { PageHeader } from "@/components/shared/page-header"
import { Ir8aForms } from "@/features/payroll/components/ir8a-forms"

export default function Ir8aPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tax Forms (IR8A)"
        description="Generate, review and finalize employees' annual IR8A income returns for IRAS."
      />
      <Ir8aForms />
    </div>
  )
}
