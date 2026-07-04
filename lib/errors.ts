import { ConvexError } from "convex/values"

// Turn a thrown value from a Convex call into a short, human-readable message
// safe to show in a toast. Convex wraps server errors with a noisy prefix
// ("[CONVEX M(claims:submit)] [Request ID: …] Server Error Uncaught …") and a
// trailing stack ("at handler (../convex/claims.ts:123:4)"); we strip both.
export function getErrorMessage(err: unknown, fallback = "Something went wrong"): string {
  // Errors thrown as `ConvexError(<string>)` carry the clean message in `data`.
  if (err instanceof ConvexError) {
    const data = err.data as unknown
    if (typeof data === "string" && data.trim()) return data
    if (
      data &&
      typeof data === "object" &&
      "message" in data &&
      typeof (data as { message: unknown }).message === "string"
    ) {
      return (data as { message: string }).message
    }
  }

  if (err instanceof Error && err.message) {
    let msg = err.message
    // Drop the "[CONVEX …] … Uncaught (ConvexError|Error): " prefix.
    msg = msg.replace(/^\[CONVEX[^\]]*\][^]*?Uncaught\s+\w*Error:\s*/i, "")
    // Drop a trailing "  at handler (…)" stack fragment.
    msg = msg.replace(/\s+at\s+handler\s*\([^]*$/i, "")
    msg = msg.replace(/\s+Called by client\s*$/i, "").trim()
    if (msg) return msg
  }

  return fallback
}
