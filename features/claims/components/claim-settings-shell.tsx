"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useTabParam } from "@/hooks/use-tab-param"
import { ClaimSettingsGeneral } from "./claim-settings-general"
import { ClaimSettings } from "./claim-settings"
import { ClaimGroupsSettings } from "./claim-groups-settings"
import { ModuleEmailSettings } from "@/features/org-settings/components/email-settings"

const TABS = ["general", "types", "groups", "email", "custom"] as const

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="text-muted-foreground rounded-lg border py-12 text-center text-sm">
      {label} configuration is coming soon.
    </div>
  )
}

export function ClaimSettingsShell() {
  // Deep-linkable via `?tab=` so the global search can open a specific tab.
  const [tab, setTab] = useTabParam(TABS, "general")
  return (
    <Tabs value={tab} onValueChange={setTab} className="gap-4">
      <div className="px-4 lg:px-6">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="types">Claim types</TabsTrigger>
          <TabsTrigger value="groups">Claim groups</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="custom">Custom configuration</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="general">
        <ClaimSettingsGeneral />
      </TabsContent>
      <TabsContent value="types">
        <ClaimSettings />
      </TabsContent>
      <TabsContent value="groups">
        <ClaimGroupsSettings />
      </TabsContent>
      <TabsContent value="email">
        <ModuleEmailSettings module="claims" />
      </TabsContent>
      <TabsContent value="custom">
        <div className="px-4 lg:px-6">
          <ComingSoon label="Custom" />
        </div>
      </TabsContent>
    </Tabs>
  )
}
