"use client"

import { useSearchParams } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { WorkPatternsSettings } from "./work-patterns-settings"
import { ShiftTemplatesSettings } from "./shift-templates-settings"

export function SchedulingSettings({
  defaultTab = "patterns",
}: {
  defaultTab?: "patterns" | "templates"
}) {
  const tab = useSearchParams().get("tab")
  const initial = tab === "templates" ? "templates" : defaultTab
  return (
    <Tabs defaultValue={initial} className="gap-4">
      <div className="px-4 lg:px-6">
        <TabsList>
          <TabsTrigger value="patterns">Work patterns</TabsTrigger>
          <TabsTrigger value="templates">Shift templates</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="patterns">
        <WorkPatternsSettings />
      </TabsContent>
      <TabsContent value="templates">
        <ShiftTemplatesSettings />
      </TabsContent>
    </Tabs>
  )
}
