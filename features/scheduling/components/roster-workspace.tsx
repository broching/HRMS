"use client"

import { useSearchParams } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useTabParam } from "@/hooks/use-tab-param"
import { RosterBoard } from "./roster-board"
import { RosterReports } from "./roster-reports"
import { WorkPatternsSettings } from "./work-patterns-settings"

/**
 * Roster & OT workspace: the scheduling board, the cross-source reports, and —
 * for org managers (HR Lounge) — the work-pattern setup, all sharing a scope.
 * `team` (Team workspace) is limited to the caller's reports and hides setup;
 * `org` (HR Lounge) covers all employees and owns the configuration. The active
 * tab is deep-linkable via `?view=` (`setup` kept for old shift-setup links).
 */
export function RosterWorkspace({ scope }: { scope: "team" | "org" }) {
  const showSetup = scope === "org"
  const rawView = useSearchParams().get("view")
  // Deep-linkable + reactive so the global search can open Reports / Work
  // patterns directly. `setup` is kept as an alias of `patterns` for old links.
  const [view, setView] = useTabParam(
    showSetup ? ["roster", "reports", "patterns"] : ["roster", "reports"],
    "roster",
    "view",
  )
  const active = rawView === "setup" && showSetup ? "patterns" : view

  return (
    <Tabs value={active} onValueChange={setView} className="gap-4">
      <div className="px-4 lg:px-6">
        <TabsList>
          <TabsTrigger value="roster">Roster</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          {showSetup && (
            <TabsTrigger value="patterns">Work patterns</TabsTrigger>
          )}
        </TabsList>
      </div>
      <TabsContent value="roster">
        <RosterBoard scope={scope} />
      </TabsContent>
      <TabsContent value="reports">
        <RosterReports scope={scope} />
      </TabsContent>
      {showSetup && (
        <TabsContent value="patterns">
          <WorkPatternsSettings />
        </TabsContent>
      )}
    </Tabs>
  )
}
