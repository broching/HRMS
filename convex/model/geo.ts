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

// Upper bound on the GPS-accuracy slack. A fix reports how uncertain it is
// (`coords.accuracy`, in metres); we treat the office as "reachable" when it
// falls inside that uncertainty circle. Wi-Fi/IP fixes on laptops routinely
// report ~1–2 km of uncertainty, so a low cap (the old 100 m) wrongly rejected
// staff who are genuinely on-site. We honour the reported accuracy up to this
// ceiling so an absurd/garbage value still can't disable the fence entirely.
const MAX_ACCURACY_SLACK_M = 2000;

/**
 * Is `point` within `radiusMeters` of `center`, allowing for the device's
 * reported GPS accuracy? Passes when the office lies within the fix's
 * uncertainty: `distance <= radius + min(accuracy, MAX_ACCURACY_SLACK_M)`.
 */
export function checkGeofence(
  center: LatLng,
  point: LatLng,
  radiusMeters: number,
  accuracyMeters?: number,
): GeofenceCheck {
  const distance = haversineMeters(center, point);
  const slack = Math.min(Math.max(accuracyMeters ?? 0, 0), MAX_ACCURACY_SLACK_M);
  return { ok: distance <= radiusMeters + slack, distance };
}
