"use client"

import { useEffect } from "react"

/**
 * Root-level error boundary. This replaces the root layout when the failure is
 * in the layout itself, so it must render its own <html>/<body> and cannot rely
 * on providers, fonts, or app CSS variables — everything here is inlined.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "4rem 1.5rem",
          textAlign: "center",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          background: "#f8fafc",
          color: "#0f172a",
        }}
      >
        <div
          style={{
            fontSize: "0.72rem",
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "#64748b",
          }}
        >
          Unexpected error
        </div>
        <h1
          style={{
            marginTop: "0.75rem",
            fontSize: "1.6rem",
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          Something went wrong
        </h1>
        <p
          style={{
            marginTop: "0.5rem",
            maxWidth: "28rem",
            fontSize: "0.95rem",
            lineHeight: 1.6,
            color: "#475569",
          }}
        >
          The application hit an error it couldn&apos;t recover from. Reloading
          usually fixes it.
        </p>
        {error.digest ? (
          <p
            style={{
              marginTop: "0.75rem",
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
              fontSize: "0.72rem",
              color: "#94a3b8",
            }}
          >
            Ref: {error.digest}
          </p>
        ) : null}
        <button
          onClick={reset}
          style={{
            marginTop: "2rem",
            cursor: "pointer",
            borderRadius: "9999px",
            border: "none",
            padding: "0.7rem 1.5rem",
            fontSize: "0.9rem",
            fontWeight: 600,
            color: "#ffffff",
            background: "#1e56e8",
            boxShadow: "0 14px 30px -12px rgba(30,86,232,0.7)",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  )
}
