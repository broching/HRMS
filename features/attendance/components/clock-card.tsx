"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import { IconMapPin, IconClockHour4, IconLoader2 } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { QrScanner } from "@/features/attendance/components/qr-scanner"
import { getDeviceLocation } from "@/features/attendance/lib/geo"
import { formatTime, elapsedSince } from "@/features/attendance/lib/labels"
import { getErrorMessage } from "@/lib/errors"

export function ClockCard() {
  const status = useQuery(api.attendance.myStatus)
  const clockIn = useMutation(api.attendance.clockIn)
  const clockOut = useMutation(api.attendance.clockOut)

  const [scanOpen, setScanOpen] = React.useState(false)
  const [busy, setBusy] = React.useState<null | "in" | "out">(null)
  const [now, setNow] = React.useState(() => Date.now())

  // Tick the live "clocked in for" label once a minute while open.
  React.useEffect(() => {
    if (!status?.open) return
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [status?.open])

  async function handleScan(token: string) {
    setScanOpen(false)
    setBusy("in")
    try {
      const fix = await getDeviceLocation()
      const res = await clockIn({
        token,
        geo: { lat: fix.lat, lng: fix.lng },
        accuracy: fix.accuracy,
      })
      toast.success(`Clocked in at ${res.officeName}`)
    } catch (e) {
      toast.error(
        getErrorMessage(e, "We couldn't clock you in. Please try again."),
      )
    } finally {
      setBusy(null)
    }
  }

  async function handleClockOut() {
    setBusy("out")
    try {
      const fix = await getDeviceLocation()
      const res = await clockOut({
        geo: { lat: fix.lat, lng: fix.lng },
        accuracy: fix.accuracy,
      })
      const h = Math.floor(res.workedMinutes / 60)
      const m = res.workedMinutes % 60
      toast.success(`Clocked out · worked ${h}h ${m}m`)
    } catch (e) {
      toast.error(
        getErrorMessage(e, "We couldn't clock you out. Please try again."),
      )
    } finally {
      setBusy(null)
    }
  }

  if (status === undefined) {
    return (
      <div className="px-4 lg:px-6">
        <Skeleton className="h-44 w-full max-w-md" />
      </div>
    )
  }

  const open = status.open

  return (
    <div className="px-4 lg:px-6">
      <Card className="max-w-md">
        <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
          {!status.hasProfile ? (
            <p className="text-muted-foreground text-sm">
              You don&apos;t have an employee profile yet. Ask your HR team to
              add you before clocking in.
            </p>
          ) : open ? (
            <>
              <div className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-full">
                <IconClockHour4 className="size-7" />
              </div>
              <div>
                <p className="text-lg font-semibold">You&apos;re clocked in</p>
                <p className="text-muted-foreground text-sm">
                  Since {formatTime(open.clockInAt)}
                  {open.officeName ? ` · ${open.officeName}` : ""} ·{" "}
                  {elapsedSince(open.clockInAt, now)}
                </p>
              </div>
              <Button
                size="lg"
                variant="destructive"
                disabled={busy !== null}
                onClick={handleClockOut}
                className="w-full"
              >
                {busy === "out" ? (
                  <IconLoader2 className="size-4 animate-spin" />
                ) : (
                  <IconMapPin className="size-4" />
                )}
                Clock out
              </Button>
            </>
          ) : (
            <>
              <div className="bg-muted text-muted-foreground flex size-14 items-center justify-center rounded-full">
                <IconClockHour4 className="size-7" />
              </div>
              <div>
                <p className="text-lg font-semibold">Not clocked in</p>
                <p className="text-muted-foreground text-sm">
                  Scan the office QR code to clock in.
                </p>
              </div>
              <Button
                size="lg"
                disabled={busy !== null}
                onClick={() => setScanOpen(true)}
                className="w-full"
              >
                {busy === "in" ? (
                  <IconLoader2 className="size-4 animate-spin" />
                ) : (
                  <IconMapPin className="size-4" />
                )}
                Scan & clock in
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scan office QR code</DialogTitle>
            <DialogDescription>
              Point your camera at the QR code on display. We&apos;ll confirm
              your location to clock you in.
            </DialogDescription>
          </DialogHeader>
          {scanOpen && (
            <QrScanner
              onResult={handleScan}
              onError={(m) => {
                toast.error(m)
                setScanOpen(false)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
