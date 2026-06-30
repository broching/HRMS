"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import { IconMapPin, IconBriefcase } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const ALL = "all"

export function PublicBoard({ slug }: { slug: string }) {
  const board = useQuery(api.board.getBoard, { slug })
  const [country, setCountry] = React.useState(ALL)
  const [dept, setDept] = React.useState(ALL)

  if (board === undefined) {
    return (
      <div className="text-muted-foreground flex min-h-svh items-center justify-center">
        Loading…
      </div>
    )
  }
  if (board === null) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-2">
        <h1 className="text-xl font-semibold">Careers page not found</h1>
        <p className="text-muted-foreground text-sm">
          This job board doesn&apos;t exist or isn&apos;t published.
        </p>
      </div>
    )
  }

  const countries = Array.from(
    new Set(board.jobs.map((j) => j.country).filter((c): c is string => !!c)),
  ).sort()
  const departments = Array.from(
    new Set(
      board.jobs.map((j) => j.departmentName).filter((d): d is string => !!d),
    ),
  ).sort()

  const visible = board.jobs.filter((j) => {
    if (country !== ALL && j.country !== country) return false
    if (dept !== ALL && j.departmentName !== dept) return false
    return true
  })

  // Group by department for the listing sections.
  const groups = new Map<string, typeof visible>()
  for (const j of visible) {
    const key = j.departmentName ?? "Other"
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(j)
  }
  const groupKeys = [...groups.keys()].sort()

  return (
    <div className="min-h-svh bg-background">
      {/* Hero */}
      <div className="relative">
        <div
          className="h-72 w-full bg-slate-800 bg-cover bg-center"
          style={
            board.bannerUrl
              ? { backgroundImage: `url(${board.bannerUrl})` }
              : undefined
          }
        >
          <div className="h-full w-full bg-black/40" />
        </div>
        <div className="mx-auto max-w-5xl px-4">
          <div className="-mt-16 flex flex-col gap-4 sm:flex-row sm:items-end">
            {board.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={board.logoUrl}
                alt={board.companyName}
                className="size-28 rounded-xl border-4 border-background bg-background object-cover shadow"
              />
            ) : (
              <div className="bg-muted flex size-28 items-center justify-center rounded-xl border-4 border-background text-lg font-semibold shadow">
                {board.companyName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="pb-2">
              <h1 className="text-3xl font-bold">
                {board.headline ?? `Careers at ${board.companyName}`}
              </h1>
              <a href="#openings" className="text-primary text-sm font-medium">
                See job openings ↓
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-10">
        {board.description && (
          <div className="text-muted-foreground mb-10 max-w-3xl whitespace-pre-line text-sm leading-relaxed">
            {board.description}
          </div>
        )}

        <div id="openings" className="flex flex-col gap-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger>
                <SelectValue placeholder="All countries" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All countries</SelectItem>
                {countries.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger>
                <SelectValue placeholder="All departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {visible.length === 0 ? (
            <p className="text-muted-foreground py-10 text-center text-sm">
              No open positions right now. Check back soon!
            </p>
          ) : (
            groupKeys.map((key) => (
              <div key={key} className="flex flex-col gap-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="flex items-center gap-2 font-semibold tracking-wide uppercase">
                    <IconBriefcase className="text-muted-foreground size-4" />
                    {key}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {groups.get(key)!.length} opening
                    {groups.get(key)!.length === 1 ? "" : "s"}
                  </span>
                </div>
                {groups.get(key)!.map((j) => (
                  <div
                    key={j._id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
                  >
                    <div>
                      <p className="font-semibold">{j.title}</p>
                      {j.level && (
                        <p className="text-muted-foreground text-sm">{j.level}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-6">
                      {j.country && (
                        <span className="text-muted-foreground flex items-center gap-1 text-sm">
                          <IconMapPin className="size-4" />
                          {j.country}
                        </span>
                      )}
                      <Button asChild>
                        <Link href={`/boards/${slug}/${j._id}`}>View job</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
