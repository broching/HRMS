"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { IconSearch } from "@tabler/icons-react"
import { useCurrentMember } from "@/hooks/use-current-member"
import { cn } from "@/lib/utils"
import {
  visibleEntries,
  searchEntries,
  type SearchEntry,
} from "@/components/layout/search-catalog"

// Permission-aware command palette. Searches every page, feature and config the
// current member can actually open (see search-catalog), so e.g. typing "leave"
// surfaces "My Leave (Personal)", "Leave Approvals (Team)" and "Leave (HR
// Lounge)" — the latter only when the role carries leave:config. Open with the
// header bar, ⌘K / Ctrl-K, or "/".
export function GlobalSearch() {
  const router = useRouter()
  const member = useCurrentMember()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [active, setActive] = React.useState(0)

  const entries = React.useMemo(
    () => visibleEntries(member?.role, member?.permissions, member?.enabledModules),
    [member?.role, member?.permissions, member?.enabledModules],
  )
  const results = React.useMemo(
    () => searchEntries(entries, query),
    [entries, query],
  )

  // Global shortcut: ⌘K / Ctrl-K anywhere, or "/" outside a text field.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const k = e.key.toLowerCase()
      const target = e.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      if (k === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === "/" && !typing && !open) {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  // Reset query + selection each time the palette opens/closes.
  React.useEffect(() => {
    if (!open) {
      setQuery("")
      setActive(0)
    }
  }, [open])

  React.useEffect(() => {
    setActive(0)
  }, [query])

  function go(entry: SearchEntry | undefined) {
    if (!entry) return
    setOpen(false)
    router.push(entry.href)
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      go(results[active])
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 text-sm text-white/80 backdrop-blur-md transition-colors hover:bg-white/20"
        aria-label="Search"
      >
        <IconSearch className="size-4" />
        <span className="hidden lg:inline">Search…</span>
        <kbd className="hidden rounded border border-white/30 px-1.5 py-0.5 text-[10px] font-medium lg:inline">
          ⌘K
        </kbd>
      </button>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50" />
          <DialogPrimitive.Content
            className="bg-popover data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed top-[15%] left-[50%] z-50 flex max-h-[70vh] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] flex-col overflow-hidden rounded-xl border shadow-lg sm:max-w-lg"
            aria-describedby={undefined}
          >
            <DialogPrimitive.Title className="sr-only">
              Search
            </DialogPrimitive.Title>
            <div className="flex items-center gap-2 border-b px-3">
              <IconSearch className="text-muted-foreground size-4 shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Search pages, features and settings…"
                className="placeholder:text-muted-foreground h-11 flex-1 bg-transparent text-sm outline-none"
              />
            </div>

            <div className="overflow-y-auto p-1.5">
              {results.length === 0 ? (
                <p className="text-muted-foreground px-3 py-6 text-center text-sm">
                  No matches for “{query}”.
                </p>
              ) : (
                results.map((entry, i) => (
                  <button
                    key={`${entry.context}:${entry.href}:${entry.group ?? ""}:${entry.label}`}
                    type="button"
                    onClick={() => go(entry)}
                    onMouseMove={() => setActive(i)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      i === active ? "bg-accent" : "hover:bg-accent/50",
                    )}
                  >
                    <entry.icon className="text-muted-foreground size-4 shrink-0" />
                    <span className="flex-1 truncate">
                      {entry.group ? (
                        <>
                          <span className="text-muted-foreground">
                            {entry.group}
                          </span>
                          <span className="text-muted-foreground/60 px-1">
                            ›
                          </span>
                          {entry.label}
                        </>
                      ) : (
                        entry.label
                      )}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {entry.context}
                    </span>
                  </button>
                ))
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  )
}
