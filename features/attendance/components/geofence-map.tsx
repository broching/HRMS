"use client"

import * as React from "react"
import "leaflet/dist/leaflet.css"
import type { Map as LeafletMap, Marker, Circle } from "leaflet"

// Singapore city centre — a sensible default when an office has no location yet.
const DEFAULT_CENTER: [number, number] = [1.3521, 103.8198]

/**
 * Click-to-place geofence picker. Drops a draggable pin on a map; clicking or
 * dragging reports the new coordinates back up. A shaded circle previews the
 * clock-in radius. Leaflet is loaded lazily (client-only) and a custom HTML pin
 * avoids Leaflet's broken default-marker asset paths.
 */
export function GeofenceMap({
  lat,
  lng,
  radiusMeters,
  onChange,
  className,
}: {
  lat: number | null
  lng: number | null
  radiusMeters: number
  onChange: (lat: number, lng: number) => void
  className?: string
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const mapRef = React.useRef<LeafletMap | null>(null)
  const markerRef = React.useRef<Marker | null>(null)
  const circleRef = React.useRef<Circle | null>(null)
  // Keep the latest onChange without re-running the init effect.
  const onChangeRef = React.useRef(onChange)
  onChangeRef.current = onChange

  React.useEffect(() => {
    let cancelled = false
    let cleanup = () => {}

    ;(async () => {
      const L = (await import("leaflet")).default
      if (cancelled || !containerRef.current || mapRef.current) return

      const start: [number, number] =
        lat != null && lng != null ? [lat, lng] : DEFAULT_CENTER
      const map = L.map(containerRef.current, {
        center: start,
        zoom: lat != null && lng != null ? 17 : 12,
        scrollWheelZoom: true,
      })
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map)

      const pin = L.divIcon({
        className: "",
        html: `<div style="width:22px;height:22px;border-radius:9999px 9999px 9999px 0;background:#2563eb;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4);transform:rotate(-45deg);"></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 22],
      })
      const marker = L.marker(start, { icon: pin, draggable: true }).addTo(map)
      const circle = L.circle(start, {
        radius: radiusMeters,
        color: "#2563eb",
        fillColor: "#2563eb",
        fillOpacity: 0.12,
        weight: 1,
      }).addTo(map)

      function place(next: [number, number]) {
        marker.setLatLng(next)
        circle.setLatLng(next)
        onChangeRef.current(next[0], next[1])
      }
      map.on("click", (e: L.LeafletMouseEvent) =>
        place([e.latlng.lat, e.latlng.lng]),
      )
      marker.on("dragend", () => {
        const p = marker.getLatLng()
        place([p.lat, p.lng])
      })

      mapRef.current = map
      markerRef.current = marker
      circleRef.current = circle
      // Leaflet needs a size recalc once the container has laid out.
      setTimeout(() => map.invalidateSize(), 0)

      cleanup = () => {
        map.remove()
        mapRef.current = null
        markerRef.current = null
        circleRef.current = null
      }
    })()

    return () => {
      cancelled = true
      cleanup()
    }
    // Init once; external lat/lng/radius changes are synced by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync the radius circle when the radius input changes.
  React.useEffect(() => {
    circleRef.current?.setRadius(radiusMeters)
  }, [radiusMeters])

  // Recentre when lat/lng are set externally (e.g. "Use my location").
  React.useEffect(() => {
    if (lat == null || lng == null) return
    const p: [number, number] = [lat, lng]
    markerRef.current?.setLatLng(p)
    circleRef.current?.setLatLng(p)
    mapRef.current?.setView(p, Math.max(mapRef.current.getZoom(), 16))
  }, [lat, lng])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ height: 260, width: "100%", borderRadius: 8, zIndex: 0 }}
    />
  )
}
