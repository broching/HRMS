export interface DeviceFix {
  lat: number
  lng: number
  accuracy: number
}

/**
 * Read a single GPS fix from the browser. Wraps the callback geolocation API in
 * a promise and surfaces a human-readable error for the common failure modes
 * (permission denied, unavailable, timeout).
 */
export function getDeviceLocation(): Promise<DeviceFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Location isn't available on this device."))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new Error("Location permission denied. Enable it to clock in."))
        } else if (err.code === err.TIMEOUT) {
          reject(new Error("Timed out getting your location. Try again."))
        } else {
          reject(new Error("Couldn't determine your location."))
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  })
}
