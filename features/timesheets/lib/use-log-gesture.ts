"use client"

import * as React from "react"

/**
 * Pointer gesture shared by the hourly grids' "select a time range to log"
 * action (timesheets, team day, attendance, roster).
 *
 * Mouse/pen: press-and-drag selects a range, previewed live via `drag`.
 * Touch: the gesture never captures the pointer, so the page scrolls
 * naturally — a clean tap (finger stays put) commits a zero-length press at
 * the tapped time instead, which each grid maps to its default block length
 * and opens its prefilled dialog. Any pan/scroll cancels the tap.
 */
export function useLogGesture(
  minuteAt: (clientY: number, rect: DOMRect) => number,
  onCommit: (key: string, fromMin: number, toMin: number) => void,
) {
  const [drag, setDrag] = React.useState<{
    key: string
    fromMin: number
    toMin: number
  } | null>(null)
  const dragRef = React.useRef(drag)
  dragRef.current = drag

  // A touch press that hasn't moved yet — commits as a tap on release.
  const tapRef = React.useRef<{
    key: string
    x: number
    y: number
    min: number
  } | null>(null)

  function onDown(e: React.PointerEvent<HTMLDivElement>, key: string) {
    const rect = e.currentTarget.getBoundingClientRect()
    const min = minuteAt(e.clientY, rect)
    if (e.pointerType === "touch") {
      // Don't capture: the browser keeps scrolling. If the finger stays put
      // this becomes a tap on release (pointercancel fires if a scroll starts).
      tapRef.current = { key, x: e.clientX, y: e.clientY, min }
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ key, fromMin: min, toMin: min })
  }

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const tap = tapRef.current
    if (tap) {
      // A moving finger is a scroll, not a tap.
      if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 10) {
        tapRef.current = null
      }
      return
    }
    if (!dragRef.current) return
    const rect = e.currentTarget.getBoundingClientRect()
    setDrag((d) => (d ? { ...d, toMin: minuteAt(e.clientY, rect) } : d))
  }

  function onUp() {
    const tap = tapRef.current
    tapRef.current = null
    if (tap) {
      onCommit(tap.key, tap.min, tap.min)
      return
    }
    const d = dragRef.current
    setDrag(null)
    if (!d) return
    onCommit(d.key, d.fromMin, d.toMin)
  }

  function onCancel() {
    tapRef.current = null
    setDrag(null)
  }

  return { drag, onDown, onMove, onUp, onCancel }
}
