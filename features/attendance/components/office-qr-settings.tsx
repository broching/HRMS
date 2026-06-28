"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import { IconCurrentLocation, IconQrcode } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { QrKiosk } from "@/features/attendance/components/qr-kiosk"
import { getDeviceLocation } from "@/features/attendance/lib/geo"

function OfficeCard({
  office,
  onShowKiosk,
}: {
  office: Doc<"offices">
  onShowKiosk: (o: Doc<"offices">) => void
}) {
  const setOfficeQr = useMutation(api.attendance.setOfficeQr)
  const update = useMutation(api.offices.update)

  const [lat, setLat] = React.useState(office.geo?.lat?.toString() ?? "")
  const [lng, setLng] = React.useState(office.geo?.lng?.toString() ?? "")
  const [radius, setRadius] = React.useState(
    office.radiusMeters?.toString() ?? "100",
  )

  async function toggleQr(enabled: boolean) {
    try {
      await setOfficeQr({ officeId: office._id, enabled })
      toast.success(enabled ? "QR clock-in enabled" : "QR clock-in disabled")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update")
    }
  }

  async function useMyLocation() {
    try {
      const fix = await getDeviceLocation()
      setLat(fix.lat.toFixed(6))
      setLng(fix.lng.toFixed(6))
      toast.success("Filled in your current location")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't get location")
    }
  }

  async function saveGeofence() {
    const latN = parseFloat(lat)
    const lngN = parseFloat(lng)
    const radN = parseInt(radius, 10)
    if (Number.isNaN(latN) || Number.isNaN(lngN)) {
      toast.error("Enter a valid latitude and longitude.")
      return
    }
    try {
      await update({
        id: office._id,
        geo: { lat: latN, lng: lngN },
        radiusMeters: Number.isNaN(radN) ? 100 : radN,
      })
      toast.success("Geofence saved")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save")
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle>{office.name}</CardTitle>
          <CardDescription>{office.timezone}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`qr-${office._id}`} className="text-sm">
            QR clock-in
          </Label>
          <Switch
            id={`qr-${office._id}`}
            checked={office.qrEnabled}
            onCheckedChange={toggleQr}
          />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`lat-${office._id}`}>Latitude</Label>
            <Input
              id={`lat-${office._id}`}
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="1.3000"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`lng-${office._id}`}>Longitude</Label>
            <Input
              id={`lng-${office._id}`}
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="103.8000"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`rad-${office._id}`}>Radius (m)</Label>
            <Input
              id={`rad-${office._id}`}
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              placeholder="100"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={useMyLocation}>
            <IconCurrentLocation className="size-4" />
            Use my location
          </Button>
          <Button size="sm" onClick={saveGeofence}>
            Save geofence
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!office.qrEnabled}
            onClick={() => onShowKiosk(office)}
          >
            <IconQrcode className="size-4" />
            Show QR
          </Button>
        </div>
        {!office.geo && (
          <p className="text-muted-foreground text-xs">
            No geofence set — clock-in will be allowed from anywhere until a
            location and radius are saved.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export function OfficeQrSettings() {
  const offices = useQuery(api.offices.list)
  const [kiosk, setKiosk] = React.useState<Doc<"offices"> | null>(null)

  if (offices === undefined) {
    return (
      <div className="px-4 lg:px-6">
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      {offices.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No offices yet. Add an office under Settings → Org structure first.
        </p>
      ) : (
        offices.map((o) => (
          <OfficeCard
            key={o._id}
            office={o as Doc<"offices">}
            onShowKiosk={setKiosk}
          />
        ))
      )}

      <Dialog open={kiosk !== null} onOpenChange={(o) => !o && setKiosk(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clock-in QR</DialogTitle>
          </DialogHeader>
          {kiosk && (
            <QrKiosk
              officeId={kiosk._id as Id<"offices">}
              officeName={kiosk.name}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
