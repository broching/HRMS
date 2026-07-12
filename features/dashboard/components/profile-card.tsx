"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import { IconChevronDown } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EMPLOYMENT_TYPE_LABELS } from "@/features/employees/lib/labels"

function initialsOf(name: string) {
  return name
    .split(" ")
    .map((n) => n.charAt(0))
    .slice(0, 2)
    .join("")
}

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
  // On mobile the full card is long enough to bury the quick actions, so it
  // starts collapsed to a compact header the member can expand. Desktop always
  // shows the full card (the collapse only applies below lg).
  const [expanded, setExpanded] = React.useState(false)

  if (card === undefined) {
    return <Skeleton className="h-20 w-full rounded-xl lg:h-[600px]" />
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

  // Shared detail fields — rendered inside the desktop card and the mobile
  // expandable section.
  const details = (
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
  )

  return (
    <Card className="overflow-hidden p-0">
      {/* Desktop: full card with banner + centered identity. */}
      <div className="hidden lg:block">
        <div className="from-primary/30 to-primary/10 relative h-24 bg-gradient-to-r">
          <div className="absolute -bottom-10 left-1/2 -translate-x-1/2">
            <Avatar className="ring-background size-20 ring-4">
              <AvatarImage src={card.photoUrl ?? undefined} alt={card.name} />
              <AvatarFallback className="text-lg">
                {initialsOf(card.name)}
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
          {details}
        </div>
      </div>

      {/* Mobile: compact header that expands to the full details on tap. */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="hover:bg-muted/40 flex w-full items-center gap-3 p-3 text-left transition-colors"
        >
          <Avatar className="size-11 shrink-0">
            <AvatarImage src={card.photoUrl ?? undefined} alt={card.name} />
            <AvatarFallback>{initialsOf(card.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold leading-tight">{card.name}</p>
            <p className="text-muted-foreground truncate text-sm">
              {card.positionTitle ?? "—"}
            </p>
          </div>
          <IconChevronDown
            className={cn(
              "text-muted-foreground size-5 shrink-0 transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>
        {expanded && (
          <div className="border-t px-4 pb-4 pt-4">
            <Link
              href={`/employees/${card.employeeId}`}
              className="text-primary mb-4 inline-block text-sm hover:underline"
            >
              View full profile
            </Link>
            {details}
          </div>
        )}
      </div>
    </Card>
  )
}
