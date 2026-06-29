import type { FeedAudience } from "@/convex/lib/enums"

export const AUDIENCE_LABELS: Record<FeedAudience, string> = {
  all: "All employees",
  specific: "Specific employees",
  department: "Department",
  office: "Office",
}

/** Compact "x minutes/hours/days ago" relative time from an epoch ms value. */
export function relativeTime(ms: number): string {
  const diff = Date.now() - ms
  const min = Math.floor(diff / 60000)
  if (min < 1) return "just now"
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo} month${mo === 1 ? "" : "s"} ago`
  const yr = Math.floor(mo / 12)
  return `${yr} year${yr === 1 ? "" : "s"} ago`
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

/** "2026-11-30" → { day: "30", month: "NOV" } for the event date chip. */
export function eventChipParts(iso: string): { day: string; month: string } {
  const [, m, d] = iso.split("-")
  const idx = Number(m) - 1
  return {
    day: String(Number(d)),
    month: (MONTHS_SHORT[idx] ?? m).toUpperCase(),
  }
}

/** "2026-11-30" → "30 Nov 2026". */
export function formatEventDate(iso: string): string {
  const [y, m, d] = iso.split("-")
  return `${Number(d)} ${MONTHS_SHORT[Number(m) - 1] ?? m} ${y}`
}

/**
 * Extract a YouTube video id from common URL shapes (watch?v=, youtu.be/,
 * /embed/, /shorts/) and return the privacy-friendly embed URL, or null.
 */
export function youtubeEmbedUrl(url: string | null): string | null {
  if (!url) return null
  const patterns = [
    /[?&]v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /\/embed\/([\w-]{11})/,
    /\/shorts\/([\w-]{11})/,
  ]
  for (const re of patterns) {
    const m = url.match(re)
    if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`
  }
  return null
}
