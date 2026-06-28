/**
 * Pure geolocation helpers — no `ctx`, unit-testable. Used by attendance to
 * enforce that a clock event happened within an office's geofence.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two points, in metres (Haversine). */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface GeofenceCheck {
  ok: boolean;
  distance: number; // metres from the office centre
}

/**
 * Is `point` within `radiusMeters` of `center`? The device's reported GPS
 * accuracy is added as slack (capped) so a legitimately-present employee with
 * a fuzzy fix is not rejected, without making the fence meaninglessly large.
 */
export function checkGeofence(
  center: LatLng,
  point: LatLng,
  radiusMeters: number,
  accuracyMeters?: number,
): GeofenceCheck {
  const distance = haversineMeters(center, point);
  const slack = Math.min(accuracyMeters ?? 0, 100);
  return { ok: distance <= radiusMeters + slack, distance };
}
