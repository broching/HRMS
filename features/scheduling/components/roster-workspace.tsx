"use client"

import * as React from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RosterBoard } from "./roster-board"
import { RosterReports } from "./roster-reports"

/**
 * Roster & OT workspace: the scheduling board and the cross-source reports,
 * sharing a scope. `team` (Team workspace) is limited to the caller's reports;
 * `org` (HR Lounge) covers all employees.
 */
export function RosterWorkspace({ scope }: { scope: "team" | "org" }) {
  return (
    <Tabs defaultValue="roster" className="gap-4">
      <div className="px-4 lg:px-6">
        <TabsList>
          <TabsTrigger value="roster">Roster</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="roster">
        <RosterBoard scope={scope} />
      </TabsContent>
      <TabsContent value="reports">
        <RosterReports scope={scope} />
      </TabsContent>
    </Tabs>
  )
}
