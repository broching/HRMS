"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useTabParam } from "@/hooks/use-tab-param"
import { PaymentRequestSettingsGeneral } from "./payment-request-settings-general"
import { PaymentRequestTemplatesSettings } from "./payment-request-templates-settings"
import { ModuleEmailSettings } from "@/features/org-settings/components/email-settings"

const TABS = ["general", "templates", "email"] as const

export function PaymentRequestSettingsShell() {
  // Deep-linkable via `?tab=` so the global search can open a specific tab.
  const [tab, setTab] = useTabParam(TABS, "general")
  return (
    <Tabs value={tab} onValueChange={setTab} className="gap-4">
      <div className="px-4 lg:px-6">
        <TabsList>
          <TabsTrigger value="general">Approval flow</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="general">
        <PaymentRequestSettingsGeneral />
      </TabsContent>
      <TabsContent value="templates">
        <PaymentRequestTemplatesSettings />
      </TabsContent>
      <TabsContent value="email">
        <ModuleEmailSettings module="paymentRequests" />
      </TabsContent>
    </Tabs>
  )
}
