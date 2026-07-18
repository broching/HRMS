"use client"

import { getErrorMessage } from "@/lib/errors"
import * as React from "react"
import { QRCodeSVG } from "qrcode.react"
import { useMutation } from "convex/react"
import { IconLoader2, IconRefresh } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"

/**
 * Rotating clock-in QR for an office kiosk/display. Mints a fresh signed token
 * shortly before the current one expires, so a photographed code stops working
 * within the TTL window.
 */
export function QrKiosk({
  officeId,
  officeName,
}: {
  officeId: Id<"offices">
  officeName: string
}) {
  const generate = useMutation(api.attendance.generateQrToken)
  const [token, setToken] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = React.useState(0)

  const refresh = React.useCallback(async () => {
    try {
      const res = await generate({ officeId })
      setToken(res.token)
      setError(null)
      setSecondsLeft(Math.max(1, Math.round((res.expiresAt - Date.now()) / 1000)))
    } catch (e) {
      setError(getErrorMessage(e, "Couldn't generate a code"))
    }
  }, [generate, officeId])

  React.useEffect(() => {
    refresh()
  }, [refresh])

  // Countdown; auto-refresh ~10s before expiry.
  React.useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          refresh()
          return 0
        }
        if (s === 11) refresh()
        return s - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [refresh])

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <div className="bg-white rounded-xl p-5">
        {token ? (
          <QRCodeSVG value={token} size={240} level="M" marginSize={1} />
        ) : (
          <div className="flex size-[240px] items-center justify-center">
            {error ? (
              <span className="px-4 text-center text-sm text-red-600">
                {error}
              </span>
            ) : (
              <IconLoader2 className="size-6 animate-spin text-neutral-500" />
            )}
          </div>
        )}
      </div>
      <div className="text-center">
        <p className="font-medium">{officeName}</p>
        <p className="text-muted-foreground text-sm">
          Scan to clock in · refreshes in {secondsLeft}s
        </p>
      </div>
      <button
        onClick={refresh}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
      >
        <IconRefresh className="size-3.5" />
        Refresh now
      </button>
    </div>
  )
}
