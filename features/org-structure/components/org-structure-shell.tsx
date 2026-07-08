"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { OrgStructureManager } from "@/features/org-structure/components/org-structure-manager"
import { RolesManager } from "@/features/org-structure/components/roles-manager"

export function OrgStructureShell() {
  return (
    <Tabs defaultValue="structure" className="gap-4">
      <div className="px-4 lg:px-6">
        <TabsList>
          <TabsTrigger value="structure">Structure</TabsTrigger>
          <TabsTrigger value="roles">Roles &amp; permissions</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="structure">
        <OrgStructureManager />
      </TabsContent>
      <TabsContent value="roles">
        <RolesManager />
      </TabsContent>
    </Tabs>
  )
}
