"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ClaimSettingsGeneral } from "./claim-settings-general"
import { ClaimSettings } from "./claim-settings"
import { ClaimGroupsSettings } from "./claim-groups-settings"

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="text-muted-foreground rounded-lg border py-12 text-center text-sm">
      {label} configuration is coming soon.
    </div>
  )
}

export function ClaimSettingsShell() {
  return (
    <Tabs defaultValue="general" className="gap-4">
      <div className="px-4 lg:px-6">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="types">Claim types</TabsTrigger>
          <TabsTrigger value="groups">Claim groups</TabsTrigger>
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
      <TabsContent value="custom">
        <div className="px-4 lg:px-6">
          <ComingSoon label="Custom" />
        </div>
      </TabsContent>
    </Tabs>
  )
}
