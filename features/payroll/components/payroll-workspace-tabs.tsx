"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { permitted } from "@/convex/lib/permissions"
import { useCurrentMember } from "@/hooks/use-current-member"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PayrollRuns } from "@/features/payroll/components/payroll-runs"
import { PayrollApprovalSettings } from "@/features/payroll/components/payroll-approval-settings"
import { PayslipTemplatesSettings } from "@/features/payroll/components/payslip-templates-settings"
import { Ir8aSettings } from "@/features/payroll/components/ir8a-settings"
import { ModuleEmailSettings } from "@/features/org-settings/components/email-settings"

const TABS = ["runs", "approval", "templates", "ir8a", "email"] as const
type TabKey = (typeof TABS)[number]

// The Payroll page: runs + settings in one tab bar. The tab is reflected in the
// URL (?tab=) so it's deep-linkable — the legacy /payroll/settings route
// redirects here with the relevant tab.
export function PayrollWorkspaceTabs() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const member = useCurrentMember()
  // The IR8A / Tax tab hosts income classification + the AIS-registered toggle,
  // so it needs at least one of those granular permissions.
  const showIr8a =
    permitted(member?.permissions, "payroll:classify") ||
    permitted(member?.permissions, "payroll:ais")
  const param = searchParams.get("tab")
  const active: TabKey =
    TABS.includes(param as TabKey) && (param !== "ir8a" || showIr8a)
      ? (param as TabKey)
      : "runs"

  function onValueChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === "runs") params.delete("tab")
    else params.set("tab", value)
    const qs = params.toString()
    router.replace(qs ? `/hr-lounge/payroll?${qs}` : "/hr-lounge/payroll", {
      scroll: false,
    })
  }

  return (
    <Tabs value={active} onValueChange={onValueChange} className="gap-4">
      <div className="px-4 lg:px-6">
        <TabsList>
          <TabsTrigger value="runs">Runs</TabsTrigger>
          <TabsTrigger value="approval">Approval flow</TabsTrigger>
          <TabsTrigger value="templates">Payslip templates</TabsTrigger>
          {showIr8a && <TabsTrigger value="ir8a">IR8A / Tax</TabsTrigger>}
          <TabsTrigger value="email">Email</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="runs">
        <PayrollRuns />
      </TabsContent>
      <TabsContent value="approval">
        <PayrollApprovalSettings />
      </TabsContent>
      <TabsContent value="templates">
        <PayslipTemplatesSettings />
      </TabsContent>
      {showIr8a && (
        <TabsContent value="ir8a">
          <Ir8aSettings />
        </TabsContent>
      )}
      <TabsContent value="email">
        <ModuleEmailSettings module="payroll" />
      </TabsContent>
    </Tabs>
  )
}
