"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import { IconFilter } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { PaymentRequestStatus } from "@/convex/lib/enums"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  PR_STATUS_LABELS,
  PR_STATUS_BADGE,
  PR_SORT_OPTIONS,
  sortPaymentRequests,
  type PrSortKey,
  requestRef,
  formatMoney,
  currentMonth,
} from "@/features/payment-requests/lib/labels"
import { cn } from "@/lib/utils"
import { countryName } from "@/lib/countries"
import { MonthNav } from "@/features/claims/components/month-nav"
import { SubmitPaymentRequestDialog } from "@/features/payment-requests/components/submit-payment-request-dialog"
import { PaymentRequestDetailDialog } from "@/features/payment-requests/components/payment-request-detail"

const ALL = "__all__"
const STATUS_OPTIONS = Object.keys(PR_STATUS_LABELS) as PaymentRequestStatus[]

export function MyPaymentRequests() {
  const [month, setMonth] = React.useState(currentMonth())
  const [openId, setOpenId] = React.useState<Id<"paymentRequests"> | null>(null)
  const [search, setSearch] = React.useState("")
  const [country, setCountry] = React.useState<string>(ALL)
  const [status, setStatus] = React.useState<string>(ALL)
  const [minAmount, setMinAmount] = React.useState("")
  const [maxAmount, setMaxAmount] = React.useState("")
  const [sort, setSort] = React.useState<PrSortKey>("submitted_desc")
  const [filtersOpen, setFiltersOpen] = React.useState(false)
  const requests = useQuery(api.paymentRequests.mine, { month })

  const countryOptions = React.useMemo(() => {
    const codes = new Set<string>()
    for (const r of requests ?? []) if (r.country) codes.add(r.country)
    return [...codes].sort((a, b) => countryName(a).localeCompare(countryName(b)))
  }, [requests])

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    const min = minAmount ? Math.round(Number(minAmount) * 100) : null
    const max = maxAmount ? Math.round(Number(maxAmount) * 100) : null
    return (requests ?? []).filter((r) => {
      if (country !== ALL && r.country !== country) return false
      if (status !== ALL && r.status !== status) return false
      if (min != null && r.amountCents < min) return false
      if (max != null && r.amountCents > max) return false
      if (q) {
        const hay =
          `${requestRef(r.requestNumber)} ${r.payeeName} ${r.purpose}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [requests, search, country, status, minAmount, maxAmount])

  const sorted = React.useMemo(
    () => sortPaymentRequests(filtered, sort),
    [filtered, sort],
  )

  const hasFilters =
    search.trim() !== "" ||
    country !== ALL ||
    status !== ALL ||
    minAmount !== "" ||
    maxAmount !== ""

  // Count of active advanced filters (everything but the always-visible search),
  // shown as a badge on the mobile Filters toggle.
  const advancedCount =
    (country !== ALL ? 1 : 0) +
    (status !== ALL ? 1 : 0) +
    (minAmount !== "" || maxAmount !== "" ? 1 : 0)

  return (
    <div className="flex flex-col gap-4">
      {/* Month + New request. On mobile this drops below the search/filters
          (order-2) so the request table sits higher; inline padding keeps the
          controls off the screen edge. */}
      <div className="order-2 flex flex-wrap items-center justify-between gap-2 px-4 lg:order-1 lg:px-6">
        <MonthNav month={month} onChange={setMonth} />
        <SubmitPaymentRequestDialog month={month} />
      </div>

      {/* Search + filters. Search + Sort stay visible; the rest collapse behind a
          Filters toggle on mobile and sit inline from lg. Pinned to the top on
          mobile (order-1). */}
      <div className="order-1 flex flex-col gap-2 px-4 lg:order-2 lg:px-6">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search ref, payee, purpose…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 flex-1 sm:w-64 sm:flex-none"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 lg:hidden"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <IconFilter className="size-4" />
            Filters
            {advancedCount > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5">
                {advancedCount}
              </Badge>
            )}
          </Button>
          <Select value={sort} onValueChange={(v) => setSort(v as PrSortKey)}>
            <SelectTrigger className="hidden h-9 w-[11rem] lg:flex">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              {PR_SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div
          className={cn(
            "flex-wrap items-center gap-2",
            filtersOpen ? "flex" : "hidden lg:flex",
          )}
        >
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger className="h-9 w-full sm:w-[9.5rem]">
              <SelectValue placeholder="Country" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All countries</SelectItem>
              {countryOptions.map((code) => (
                <SelectItem key={code} value={code}>
                  {countryName(code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-full sm:w-[9rem]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {PR_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="Min $"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              className="h-9 w-24"
            />
            <span className="text-muted-foreground text-xs">–</span>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="Max $"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              className="h-9 w-24"
            />
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as PrSortKey)}>
            <SelectTrigger className="h-9 w-[11rem] lg:hidden">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              {PR_SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters && (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground text-xs underline"
              onClick={() => {
                setSearch("")
                setCountry(ALL)
                setStatus(ALL)
                setMinAmount("")
                setMaxAmount("")
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="order-3 mx-4 rounded-lg border lg:mx-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Ref</TableHead>
              <TableHead>Purpose</TableHead>
              <TableHead className="hidden sm:table-cell">Payee</TableHead>
              <TableHead className="hidden lg:table-cell">Country</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="hidden sm:table-cell">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests === undefined ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-8 text-center text-sm">
                  Loading…
                </TableCell>
              </TableRow>
            ) : sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-8 text-center text-sm">
                  {hasFilters
                    ? "No payment requests match your filters."
                    : "No payment requests this month."}
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((r) => (
                <TableRow
                  key={r._id}
                  className="cursor-pointer"
                  onClick={() => setOpenId(r._id)}
                >
                  <TableCell className="font-mono text-xs">
                    {requestRef(r.requestNumber)}
                  </TableCell>
                  <TableCell className="max-w-[16rem] truncate">
                    {r.purpose}
                    {r.itemCount > 0 && (
                      <span className="text-muted-foreground ml-2 hidden text-xs sm:inline">
                        · {r.itemCount} items
                      </span>
                    )}
                    <span className="text-muted-foreground block text-xs sm:hidden">
                      {r.payeeName} · {PR_STATUS_LABELS[r.status]}
                      {r.itemCount > 0 && ` · ${r.itemCount} items`}
                    </span>
                  </TableCell>
                  <TableCell className="hidden max-w-[12rem] truncate sm:table-cell">
                    {r.payeeName}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-xs lg:table-cell">
                    {r.country ? countryName(r.country) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(r.amountCents, r.currency)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant={PR_STATUS_BADGE[r.status]}>
                      {PR_STATUS_LABELS[r.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PaymentRequestDetailDialog
        requestId={openId}
        open={openId != null}
        onOpenChange={(o) => !o && setOpenId(null)}
        onNavigate={setOpenId}
      />
    </div>
  )
}
