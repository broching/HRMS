import * as React from "react"
import Link from "next/link"
import type { Icon } from "@tabler/icons-react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
}: {
  label: string
  value: number | string | undefined
  hint?: string
  icon?: Icon
  href?: string
}) {
  const body = (
    <Card className={href ? "transition-colors hover:bg-accent/40" : undefined}>
      <CardContent className="flex flex-col gap-1 p-4">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">{label}</span>
          {Icon && <Icon className="text-muted-foreground size-4" />}
        </div>
        {value === undefined ? (
          <Skeleton className="h-9 w-12" />
        ) : (
          <span className="text-3xl font-semibold tabular-nums">{value}</span>
        )}
        {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
      </CardContent>
    </Card>
  )
  return href ? <Link href={href}>{body}</Link> : body
}
