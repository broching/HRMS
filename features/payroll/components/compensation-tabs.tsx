"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useTabParam } from "@/hooks/use-tab-param"
import { CompensationManagement } from "@/features/payroll/components/compensation-management"
import { CpfSettings } from "@/features/payroll/components/cpf-settings"
import { FundsSettings } from "@/features/payroll/components/funds-settings"

const TABS = ["employees", "cpf", "funds"] as const

export function CompensationTabs() {
  // Deep-linkable via `?tab=` so the global search can open CPF / funds directly.
  const [tab, setTab] = useTabParam(TABS, "employees")
  return (
    <Tabs value={tab} onValueChange={setTab} className="gap-4">
      <div className="px-4 lg:px-6">
        <TabsList>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="cpf">CPF</TabsTrigger>
          <TabsTrigger value="funds">Statutory funds</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="employees">
        <CompensationManagement />
      </TabsContent>
      <TabsContent value="cpf">
        <CpfSettings />
      </TabsContent>
      <TabsContent value="funds">
        <FundsSettings />
      </TabsContent>
    </Tabs>
  )
}
