"use client"

import * as React from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FundsSettings } from "@/features/payroll/components/funds-settings"
import { PayrollApprovalSettings } from "@/features/payroll/components/payroll-approval-settings"
import { PayslipTemplatesSettings } from "@/features/payroll/components/payslip-templates-settings"

export function PayrollSettingsTabs() {
  return (
    <Tabs defaultValue="funds" className="gap-4">
      <div className="px-4 lg:px-6">
        <TabsList>
          <TabsTrigger value="funds">Statutory funds</TabsTrigger>
          <TabsTrigger value="approval">Approval flow</TabsTrigger>
          <TabsTrigger value="templates">Payslip templates</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="funds">
        <FundsSettings />
      </TabsContent>
      <TabsContent value="approval">
        <PayrollApprovalSettings />
      </TabsContent>
      <TabsContent value="templates">
        <PayslipTemplatesSettings />
      </TabsContent>
    </Tabs>
  )
}
