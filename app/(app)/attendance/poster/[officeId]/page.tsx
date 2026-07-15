"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import { IconArrowLeft } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { QrPoster } from "@/features/attendance/components/qr-poster"

export default function OfficePosterPage({
  params,
}: {
  params: Promise<{ officeId: string }>
}) {
  const { officeId } = React.use(params)
  const office = useQuery(api.offices.get, { id: officeId as Id<"offices"> })

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 lg:px-6">
      <div className="qr-poster-noprint">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/hr-lounge/attendance/config">
            <IconArrowLeft className="size-4" />
            Back to attendance settings
          </Link>
        </Button>
      </div>

      {office === undefined ? (
        <Skeleton className="h-[520px] w-full max-w-md" />
      ) : office === null ? (
        <p className="text-muted-foreground text-sm">Office not found.</p>
      ) : !office.qrEnabled ? (
        <p className="text-muted-foreground text-sm">
          QR clock-in isn&apos;t enabled for {office.name}. Enable it in attendance
          settings first.
        </p>
      ) : (
        <QrPoster officeId={office._id} officeName={office.name} />
      )}
    </div>
  )
}
