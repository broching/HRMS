"use client"

import * as React from "react"
import type { Id } from "@/convex/_generated/dataModel"
import { cn } from "@/lib/utils"
import { LeaveCalendarOverview } from "./leave-calendar-overview"
import { LeaveManagement } from "./leave-management"
import { LeavePoliciesList } from "./leave-policies-list"
import { LeaveDetailPanel } from "./leave-detail-panel"
import { HolidaysManager } from "./holidays-manager"
import { ModuleEmailSettings } from "@/features/org-settings/components/email-settings"

type Tab = "dashboard" | "management" | "policies" | "holidays" | "email"

const TABS: { key: Tab; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "management", label: "Leave Management" },
  { key: "policies", label: "Leave Policies" },
  { key: "holidays", label: "Public Holidays" },
  { key: "email", label: "Email" },
]

export function LeaveAdmin() {
  const [tab, setTab] = React.useState<Tab>("dashboard")
  const [selected, setSelected] = React.useState<Id<"leaveRequests"> | null>(null)

  return (
    <div className="flex min-w-0 flex-col gap-5 px-4 lg:px-6">
      <div>
        <p className="text-muted-foreground text-sm">HR Lounge / Leave</p>
        <div className="mt-2 flex gap-1 border-b">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "px-3 pb-2.5 text-sm font-medium transition-colors",
                tab === t.key
                  ? "border-primary text-primary border-b-2"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "dashboard" && (
        <LeaveCalendarOverview onSelectRequest={setSelected} />
      )}
      {tab === "management" && (
        <LeaveManagement onSelectRequest={setSelected} />
      )}
      {tab === "policies" && <LeavePoliciesList />}
      {tab === "holidays" && <HolidaysManager />}
      {/* ModuleEmailSettings self-pads; cancel the parent's px so it aligns. */}
      {tab === "email" && (
        <div className="-mx-4 lg:-mx-6">
          <ModuleEmailSettings module="leave" />
        </div>
      )}

      <LeaveDetailPanel requestId={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
