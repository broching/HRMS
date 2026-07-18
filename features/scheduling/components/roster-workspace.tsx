"use client"

import { useSearchParams } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RosterBoard } from "./roster-board"
import { RosterReports } from "./roster-reports"
import { SchedulingSettings } from "./scheduling-settings"

/**
 * Roster & OT workspace: the scheduling board, the cross-source reports, and —
 * for org managers (HR Lounge) — the shift setup (work patterns + shift
 * templates), all sharing a scope. `team` (Team workspace) is limited to the
 * caller's reports and hides setup; `org` (HR Lounge) covers all employees and
 * owns the configuration. The active tab is deep-linkable via `?view=`.
 */
export function RosterWorkspace({ scope }: { scope: "team" | "org" }) {
  const view = useSearchParams().get("view")
  const showSetup = scope === "org"
  const initial =
    view === "reports"
      ? "reports"
      : view === "setup" && showSetup
        ? "setup"
        : "roster"

  return (
    <Tabs defaultValue={initial} className="gap-4">
      <div className="px-4 lg:px-6">
        <TabsList>
          <TabsTrigger value="roster">Roster</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          {showSetup && <TabsTrigger value="setup">Shift setup</TabsTrigger>}
        </TabsList>
      </div>
      <TabsContent value="roster">
        <RosterBoard scope={scope} />
      </TabsContent>
      <TabsContent value="reports">
        <RosterReports scope={scope} />
      </TabsContent>
      {showSetup && (
        <TabsContent value="setup">
          <SchedulingSettings />
        </TabsContent>
      )}
    </Tabs>
  )
}
