"use client"

import { useEffect } from "react"

// Registers the service worker so the app is installable and has an offline
// fallback. No-ops in browsers without service-worker support.
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!("serviceWorker" in navigator)) return
    const register = () =>
      navigator.serviceWorker.register("/sw.js").catch(() => {})
    if (document.readyState === "complete") register()
    else window.addEventListener("load", register, { once: true })
  }, [])
  return null
}
