"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PaymentRequestSettingsGeneral } from "./payment-request-settings-general"
import { PaymentRequestTemplatesSettings } from "./payment-request-templates-settings"

export function PaymentRequestSettingsShell() {
  return (
    <Tabs defaultValue="general" className="gap-4">
      <div className="px-4 lg:px-6">
        <TabsList>
          <TabsTrigger value="general">Approval flow</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="general">
        <PaymentRequestSettingsGeneral />
      </TabsContent>
      <TabsContent value="templates">
        <PaymentRequestTemplatesSettings />
      </TabsContent>
    </Tabs>
  )
}
