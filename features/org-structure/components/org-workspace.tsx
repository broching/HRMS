"use client"

import * as React from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCurrentMember } from "@/hooks/use-current-member"
import { useTabParam } from "@/hooks/use-tab-param"
import { permitted } from "@/convex/lib/permissions"
import { OrgSettings } from "@/features/org-settings/components/org-settings"
import { OrgStructureManager } from "./org-structure-manager"
import { RolesManager } from "./roles-manager"

/**
 * Unified Organization workspace: the org profile/locale/statutory settings, the
 * org structure (departments, teams, positions, offices) and roles &
 * permissions, all on one page as tabs. Tabs are gated by permission (org
 * profile needs `org:manage`; structure/roles need `employees:manage`), and the
 * active tab is deep-linkable via `?tab=` (old `/org-structure` links pass
 * `?tab=structure`).
 */
export function OrgWorkspace() {
  const member = useCurrentMember()
  const perms = member?.permissions
  // Deep-linkable + reactive so the global search can open Structure or Roles
  // directly, even when already on this page.
  const [tab, setTab] = useTabParam(["organization", "structure", "roles"], "organization")

  const tabs = [
    permitted(perms, "org:manage") && {
      value: "organization",
      label: "Organization",
      content: (
        <div className="flex flex-col gap-6 px-4 lg:px-6">
          <OrgSettings />
        </div>
      ),
    },
    permitted(perms, "employees:manage") && {
      value: "structure",
      label: "Org structure",
      content: <OrgStructureManager />,
    },
    permitted(perms, "employees:manage") && {
      value: "roles",
      label: "Roles & permissions",
      content: (
        <div className="px-4 lg:px-6">
          <RolesManager />
        </div>
      ),
    },
  ].filter(Boolean) as {
    value: string
    label: string
    content: React.ReactNode
  }[]

  if (member === undefined) return null // still loading permissions
  if (tabs.length === 0) return null

  const active = tabs.some((t) => t.value === tab) ? tab : tabs[0].value

  return (
    <Tabs value={active} onValueChange={setTab} className="gap-4">
      <div className="px-4 lg:px-6">
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {tabs.map((t) => (
        <TabsContent key={t.value} value={t.value}>
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  )
}
