"use client"

import * as React from "react"
import { QRCodeSVG } from "qrcode.react"
import { useMutation } from "convex/react"
import { IconLoader2, IconPrinter, IconMapPin } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"

/**
 * A print-ready clock-in poster for an office. Mints the office's static
 * (never-expiring) signed token once, renders it large with instructions, and
 * prints only the poster (chrome is hidden via the print stylesheet below).
 * Anti-fraud is the GPS geofence, so a printed copy is safe to paste on a wall.
 */
export function QrPoster({
  officeId,
  officeName,
}: {
  officeId: Id<"offices">
  officeName: string
}) {
  const generate = useMutation(api.attendance.generateStaticQr)
  const [token, setToken] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    generate({ officeId })
      .then((res) => {
        if (!cancelled) setToken(res.token)
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Couldn't generate the code")
      })
    return () => {
      cancelled = true
    }
  }, [generate, officeId])

  return (
    <div className="flex flex-col items-center gap-6">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #qr-poster, #qr-poster * { visibility: visible !important; }
        #qr-poster { position: absolute; inset: 0; margin: auto; }
        .qr-poster-noprint { display: none !important; }
      }`}</style>

      <div
        id="qr-poster"
        className="flex w-full max-w-md flex-col items-center gap-6 rounded-2xl border bg-white p-10 text-center text-neutral-900"
      >
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium tracking-wide text-neutral-500 uppercase">
            Clock in / out
          </p>
          <h1 className="text-3xl font-bold">{officeName}</h1>
        </div>

        <div className="rounded-xl border p-4">
          {token ? (
            <QRCodeSVG value={token} size={320} level="M" marginSize={1} />
          ) : (
            <div className="flex size-[320px] items-center justify-center">
              {error ? (
                <span className="px-4 text-center text-sm text-red-600">
                  {error}
                </span>
              ) : (
                <IconLoader2 className="size-8 animate-spin text-neutral-400" />
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 text-neutral-600">
          <p className="flex items-center justify-center gap-1.5 text-sm font-medium">
            <IconMapPin className="size-4" />
            You must be at the office to clock in.
          </p>
          <p className="text-sm">
            Open the HRMS app → <strong>Attendance</strong> → Scan &amp; clock in.
          </p>
        </div>
      </div>

      <Button
        className="qr-poster-noprint"
        disabled={!token}
        onClick={() => window.print()}
      >
        <IconPrinter className="size-4" />
        Print poster
      </Button>
    </div>
  )
}
