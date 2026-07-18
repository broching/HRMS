"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import {
  IconCurrentLocation,
  IconQrcode,
  IconPrinter,
  IconChevronRight,
  IconChevronDown,
  IconAlertTriangle,
} from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
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
import { GeofenceMap } from "@/features/attendance/components/geofence-map"
import { PosterQrInline } from "@/features/attendance/components/poster-qr-inline"
import { getDeviceLocation } from "@/features/attendance/lib/geo"
import { getErrorMessage } from "@/lib/errors"

function OfficeCard({
  office,
  onShowKiosk,
}: {
  office: Doc<"offices">
  onShowKiosk: (o: Doc<"offices">) => void
}) {
  const setOfficeQr = useMutation(api.attendance.setOfficeQr)
  const setOfficeQrMode = useMutation(api.attendance.setOfficeQrMode)
  const update = useMutation(api.offices.update)

  const mode = office.qrMode ?? "poster"
  const hasGeofence = Boolean(office.geo && office.radiusMeters)

  async function changeMode(next: "poster" | "kiosk") {
    try {
      await setOfficeQrMode({ officeId: office._id, mode: next })
    } catch (e) {
      toast.error(
        getErrorMessage(e, "We couldn't switch the QR type. Please try again."),
      )
    }
  }

  const [lat, setLat] = React.useState<number | null>(office.geo?.lat ?? null)
  const [lng, setLng] = React.useState<number | null>(office.geo?.lng ?? null)
  const [radius, setRadius] = React.useState(
    office.radiusMeters?.toString() ?? "100",
  )
  const [saving, setSaving] = React.useState(false)
  const [advancedOpen, setAdvancedOpen] = React.useState(false)
  // Optimistic mirror of office.geoRequired (absent = enforced by default).
  const [geoRequired, setGeoRequired] = React.useState(office.geoRequired !== false)
  const radiusN = Math.max(10, parseInt(radius, 10) || 100)

  async function toggleGeoRequired(next: boolean) {
    setGeoRequired(next)
    try {
      await update({ id: office._id, geoRequired: next })
      toast.success(
        next
          ? "Staff must be within the geofence to clock in."
          : "Location check is off — staff can clock in from anywhere.",
      )
    } catch (e) {
      setGeoRequired(!next)
      toast.error(
        getErrorMessage(e, "We couldn't update the location check. Try again."),
      )
    }
  }

  async function toggleQr(enabled: boolean) {
    try {
      await setOfficeQr({ officeId: office._id, enabled })
      toast.success(
        enabled
          ? "QR clock-in is now on for this office."
          : "QR clock-in is now off for this office.",
      )
    } catch (e) {
      toast.error(
        getErrorMessage(e, "We couldn't update QR clock-in. Please try again."),
      )
    }
  }

  async function useMyLocation() {
    try {
      const fix = await getDeviceLocation()
      setLat(Number(fix.lat.toFixed(6)))
      setLng(Number(fix.lng.toFixed(6)))
      toast.success("Centred the map on your current location.")
    } catch {
      toast.error(
        "We couldn't get your location. Check that location access is allowed.",
      )
    }
  }

  async function saveGeofence() {
    if (lat == null || lng == null) {
      toast.error("Tap the map to drop a pin on the office first.")
      return
    }
    setSaving(true)
    try {
      await update({
        id: office._id,
        geo: { lat, lng },
        radiusMeters: radiusN,
      })
      toast.success("Office location saved.")
    } catch (e) {
      toast.error(
        getErrorMessage(e, "We couldn't save the location. Please try again."),
      )
    } finally {
      setSaving(false)
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
        <div className="flex flex-col gap-2">
          <Label>Office location</Label>
          <p className="text-muted-foreground text-xs">
            Tap the map to place the office, then drag the pin to fine-tune. The
            shaded circle is how close staff must be to clock in.
          </p>
          <GeofenceMap
            lat={lat}
            lng={lng}
            radiusMeters={radiusN}
            onChange={(a, b) => {
              setLat(Number(a.toFixed(6)))
              setLng(Number(b.toFixed(6)))
            }}
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`rad-${office._id}`}>Radius (m)</Label>
            <Input
              id={`rad-${office._id}`}
              type="number"
              min="10"
              className="w-28"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              placeholder="100"
            />
          </div>
          <Button variant="outline" size="sm" onClick={useMyLocation}>
            <IconCurrentLocation className="size-4" />
            Use my location
          </Button>
          <Button size="sm" onClick={saveGeofence} disabled={saving}>
            {saving ? "Saving…" : "Save location"}
          </Button>
          {lat != null && lng != null && (
            <span className="text-muted-foreground text-xs tabular-nums">
              {lat.toFixed(5)}, {lng.toFixed(5)}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t pt-3">
          <button
            type="button"
            onClick={() => setAdvancedOpen((o) => !o)}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 self-start text-sm font-medium transition-colors"
          >
            {advancedOpen ? (
              <IconChevronDown className="size-4" />
            ) : (
              <IconChevronRight className="size-4" />
            )}
            Advanced
          </button>

          {advancedOpen && (
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label htmlFor={`geo-req-${office._id}`} className="text-sm">
                    Require location to clock in
                  </Label>
                  <p className="text-muted-foreground text-xs">
                    When off, staff can clock in without being inside the
                    geofence — useful if they clock in from desktops, where
                    browser location is often off by a kilometre or more.
                  </p>
                </div>
                <Switch
                  id={`geo-req-${office._id}`}
                  checked={geoRequired}
                  onCheckedChange={toggleGeoRequired}
                />
              </div>

              {!geoRequired && office.qrEnabled && mode === "poster" && (
                <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                  <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>
                    This office uses a printed poster code that never expires.
                    With the location check off, anyone who has the code can
                    clock in from anywhere.
                  </span>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Label className="text-sm">Set coordinates manually</Label>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label
                      htmlFor={`lat-${office._id}`}
                      className="text-muted-foreground text-xs"
                    >
                      Latitude
                    </Label>
                    <Input
                      id={`lat-${office._id}`}
                      type="number"
                      step="any"
                      className="w-40"
                      value={lat ?? ""}
                      placeholder="1.3521"
                      onChange={(e) =>
                        setLat(e.target.value === "" ? null : Number(e.target.value))
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label
                      htmlFor={`lng-${office._id}`}
                      className="text-muted-foreground text-xs"
                    >
                      Longitude
                    </Label>
                    <Input
                      id={`lng-${office._id}`}
                      type="number"
                      step="any"
                      className="w-40"
                      value={lng ?? ""}
                      placeholder="103.8198"
                      onChange={(e) =>
                        setLng(e.target.value === "" ? null : Number(e.target.value))
                      }
                    />
                  </div>
                </div>
                <p className="text-muted-foreground text-xs">
                  The map and pin follow these values. Click{" "}
                  <span className="font-medium">Save location</span> above to
                  apply.
                </p>
              </div>
            </div>
          )}
        </div>

        {office.qrEnabled && (
          <div className="flex flex-col gap-2 border-t pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Label className="text-sm font-medium">QR code type</Label>
                <p className="text-muted-foreground text-xs">
                  {mode === "poster"
                    ? "A static code you print once and paste on the wall."
                    : "A rotating code shown on a device screen at reception."}
                </p>
              </div>
              <ToggleGroup
                type="single"
                value={mode}
                onValueChange={(v) => v && changeMode(v as "poster" | "kiosk")}
                variant="outline"
                size="sm"
              >
                <ToggleGroupItem value="poster" className="px-3">
                  Poster
                </ToggleGroupItem>
                <ToggleGroupItem value="kiosk" className="px-3">
                  Kiosk
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            {mode === "poster" ? (
              hasGeofence ? (
                <div className="flex flex-col gap-3">
                  <PosterQrInline
                    officeId={office._id}
                    officeName={office.name}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="self-start"
                    asChild
                  >
                    <Link href={`/attendance/poster/${office._id}`}>
                      <IconPrinter className="size-4" />
                      Open printable poster
                    </Link>
                  </Button>
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">
                  Save the office location above to enable the printed poster.
                </p>
              )
            ) : (
              <Button
                variant="secondary"
                size="sm"
                className="self-start"
                onClick={() => onShowKiosk(office)}
              >
                <IconQrcode className="size-4" />
                Show kiosk QR
              </Button>
            )}
          </div>
        )}

        {!office.geo && (
          <p className="text-muted-foreground text-xs">
            No location set yet — until you save one, staff can clock in from
            anywhere.
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
