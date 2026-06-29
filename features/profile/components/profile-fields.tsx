"use client"

import * as React from "react"
import type { FunctionReturnType } from "convex/server"
import { api } from "@/convex/_generated/api"

/** Resolved employee profile returned by employees.get (with capability flags). */
export type ProfileData = NonNullable<FunctionReturnType<typeof api.employees.get>>

/** Read-only labelled value used across the profile sections. */
export function Field({
  label,
  value,
}: {
  label: string
  value?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {label}
      </span>
      <span className="text-sm">{value || "—"}</span>
    </div>
  )
}
