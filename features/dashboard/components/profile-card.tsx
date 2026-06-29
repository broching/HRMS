"use client"

import Link from "next/link"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EMPLOYMENT_TYPE_LABELS } from "@/features/employees/lib/labels"

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {label}
      </span>
      <span className="text-sm">{value || "—"}</span>
    </div>
  )
}

export function ProfileCard() {
  const card = useQuery(api.employees.homeCard)

  if (card === undefined) {
    return <Skeleton className="h-[600px] w-full rounded-xl" />
  }
  if (!card.hasProfile) {
    return (
      <Card className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-muted-foreground text-sm">
          You don&apos;t have an employee profile yet.
        </p>
        <Button asChild size="sm">
          <Link href="/profile">Set up your profile</Link>
        </Button>
      </Card>
    )
  }

  const formattedJoin = (() => {
    const d = new Date(`${card.joinDate}T00:00:00`)
    return Number.isNaN(d.getTime())
      ? card.joinDate
      : d.toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
  })()

  return (
    <Card className="overflow-hidden p-0">
      {/* Banner + avatar */}
      <div className="from-primary/30 to-primary/10 relative h-24 bg-gradient-to-r">
        <div className="absolute -bottom-10 left-1/2 -translate-x-1/2">
          <Avatar className="ring-background size-20 ring-4">
            <AvatarImage src={card.photoUrl ?? undefined} alt={card.name} />
            <AvatarFallback className="text-lg">
              {card.name
                .split(" ")
                .map((n) => n.charAt(0))
                .slice(0, 2)
                .join("")}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>

      <div className="flex flex-col gap-5 px-6 pb-6 pt-12">
        <div className="text-center">
          <Link
            href={`/employees/${card.employeeId}`}
            className="text-lg font-semibold hover:underline"
          >
            {card.name}
          </Link>
          <p className="text-muted-foreground text-sm">
            {card.positionTitle ?? "—"}
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <Field label="Employee ID" value={card.employeeNumber} />
          <Field
            label="Employment Type"
            value={EMPLOYMENT_TYPE_LABELS[card.employmentType]}
          />
          <Field label="Department" value={card.departmentName} />
          <Field label="Office" value={card.officeName} />
          <Field label="Date Joined" value={formattedJoin} />
          <Field label="Email" value={card.workEmail} />

          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Manager
            </span>
            {card.manager ? (
              <div className="flex items-center gap-2">
                <Avatar className="size-7">
                  <AvatarImage src={card.manager.photoUrl ?? undefined} />
                  <AvatarFallback className="text-xs">
                    {card.manager.initials}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm">{card.manager.name}</span>
              </div>
            ) : (
              <span className="text-sm">—</span>
            )}
          </div>

          {card.team.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Team
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {card.team.map((t) => (
                  <Link key={t.employeeId} href={`/employees/${t.employeeId}`}>
                    <Avatar className="ring-background size-8 ring-2">
                      <AvatarImage src={t.photoUrl ?? undefined} alt={t.name} />
                      <AvatarFallback className="text-xs">
                        {t.initials}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
