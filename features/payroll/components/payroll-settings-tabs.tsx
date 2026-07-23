"use client"

import * as React from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PayrollApprovalSettings } from "@/features/payroll/components/payroll-approval-settings"
import { PayslipTemplatesSettings } from "@/features/payroll/components/payslip-templates-settings"
import { Ir8aSettings } from "@/features/payroll/components/ir8a-settings"
import { ModuleEmailSettings } from "@/features/org-settings/components/email-settings"

export function PayrollSettingsTabs() {
  return (
    <Tabs defaultValue="approval" className="gap-4">
      <div className="px-4 lg:px-6">
        <TabsList>
          <TabsTrigger value="approval">Approval flow</TabsTrigger>
          <TabsTrigger value="templates">Payslip templates</TabsTrigger>
          <TabsTrigger value="ir8a">IR8A / Tax</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="approval">
        <PayrollApprovalSettings />
      </TabsContent>
      <TabsContent value="templates">
        <PayslipTemplatesSettings />
      </TabsContent>
      <TabsContent value="ir8a">
        <Ir8aSettings />
      </TabsContent>
      <TabsContent value="email">
        <ModuleEmailSettings module="payroll" />
      </TabsContent>
    </Tabs>
  )
}
