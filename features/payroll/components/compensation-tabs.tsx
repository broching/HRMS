"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CompensationManagement } from "@/features/payroll/components/compensation-management"
import { CpfSettings } from "@/features/payroll/components/cpf-settings"
import { FundsSettings } from "@/features/payroll/components/funds-settings"

export function CompensationTabs() {
  return (
    <Tabs defaultValue="employees" className="gap-4">
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
