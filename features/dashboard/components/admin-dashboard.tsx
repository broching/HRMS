"use client"

import Link from "next/link"
import { useQuery } from "convex/react"
import {
  IconUsers,
  IconPlane,
  IconChecklist,
  IconUserPlus,
  IconCake,
} from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { MetricCard } from "./metric-card"
import { OnLeaveToday } from "./on-leave-today"
import { DepartmentBreakdown } from "./department-breakdown"
import { QuickActions } from "./quick-actions"

const today = () => new Date().toISOString().slice(0, 10)

function birthdayWhen(inDays: number) {
  if (inDays === 0) return "Today"
  if (inDays === 1) return "Tomorrow"
  return `in ${inDays} days`
}

function monthDay(mmdd: string) {
  const [mm, dd] = mmdd.split("-").map(Number)
  return new Date(2000, mm - 1, dd).toLocaleString("en", {
    month: "short",
    day: "numeric",
  })
}

export function AdminDashboard() {
  const stats = useQuery(api.dashboard.stats)
  const t = today()
  const onLeave = useQuery(api.leaveRequests.calendar, { start: t, end: t })
  const pending = useQuery(api.leaveRequests.approvalQueue)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 px-4 sm:grid-cols-2 lg:grid-cols-4 lg:px-6">
        <MetricCard
          label="Headcount"
          value={stats?.headcount}
          icon={IconUsers}
          href="/employees"
        />
        <MetricCard
          label="On leave today"
          value={onLeave?.length}
          icon={IconPlane}
        />
        <MetricCard
          label="Pending approvals"
          value={pending?.length}
          icon={IconChecklist}
          href="/leave/requests"
        />
        <MetricCard
          label="New hires (30d)"
          value={stats?.newHires.length}
          icon={IconUserPlus}
        />
      </div>

      <div className="grid gap-4 px-4 lg:grid-cols-2 lg:px-6">
        <OnLeaveToday />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconCake className="size-4" />
              Upcoming birthdays
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats === undefined ? (
              <Skeleton className="h-6 w-full" />
            ) : stats.upcomingBirthdays.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No birthdays in the next 30 days.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {stats.upcomingBirthdays.map((b) => (
                  <li
                    key={b.employeeId}
                    className="flex items-center justify-between text-sm"
                  >
                    <Link
                      href={`/employees/${b.employeeId}`}
                      className="font-medium hover:underline"
                    >
                      {b.name}
                    </Link>
                    <span className="text-muted-foreground text-xs">
                      {monthDay(b.date)} · {birthdayWhen(b.inDays)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>New hires</CardTitle>
          </CardHeader>
          <CardContent>
            {stats === undefined ? (
              <Skeleton className="h-6 w-full" />
            ) : stats.newHires.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No new hires in the last 30 days.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {stats.newHires.map((h) => (
                  <li
                    key={h.employeeId}
                    className="flex items-center justify-between text-sm"
                  >
                    <Link
                      href={`/employees/${h.employeeId}`}
                      className="font-medium hover:underline"
                    >
                      {h.name}
                    </Link>
                    <span className="text-muted-foreground text-xs">
                      {h.positionTitle ? `${h.positionTitle} · ` : ""}
                      {h.joinDate}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {stats && <DepartmentBreakdown data={stats.byDepartment} />}
      </div>

      <div className="px-4 lg:px-6">
        <QuickActions />
      </div>
    </div>
  )
}
