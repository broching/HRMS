"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { IconSearch } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { ClaimStatus } from "@/convex/lib/enums"
import { getErrorMessage } from "@/lib/errors"
import { ClaimDetailDialog } from "@/features/claims/components/claim-detail"
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
import { Skeleton } from "@/components/ui/skeleton"
import {
  CLAIM_STATUS_BADGE,
  CLAIM_STATUS_LABELS,
  formatMoney,
} from "@/features/claims/lib/labels"

const ALL = "all"
const STATUSES: ClaimStatus[] = [
  "pending_manager",
  "pending_finance",
  "approved",
  "rejected",
  "reimbursed",
  "cancelled",
]

export function MyClaims() {
  const claims = useQuery(api.claims.mine)
  const claimTypes = useQuery(api.claimTypes.list, { includeInactive: true }) ?? []
  const cancel = useMutation(api.claims.cancel)

  const [typeId, setTypeId] = React.useState(ALL)
  const [status, setStatus] = React.useState(ALL)
  const [search, setSearch] = React.useState("")
  const [fromDate, setFromDate] = React.useState("")
  const [openId, setOpenId] = React.useState<Id<"claims"> | null>(null)

  async function handleCancel(claimId: Id<"claims">) {
    try {
      await cancel({ claimId })
      toast.success("Claim cancelled")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't cancel this claim"))
    }
  }

  const typeNameById = new Map(claimTypes.map((t) => [t._id, t.name]))

  const filtered = (claims ?? []).filter((c) => {
    if (typeId !== ALL && typeNameById.get(typeId as Id<"claimTypes">) !== c.claimTypeName)
      return false
    if (status !== ALL && c.status !== status) return false
    if (fromDate && c.incurredDate < fromDate) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const hay = `${c.claimTypeName} ${c.description}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 px-4 lg:flex-row lg:items-center lg:px-6">
        <Select value={typeId} onValueChange={setTypeId}>
          <SelectTrigger className="w-full lg:w-48">
            <SelectValue placeholder="All claim types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All claim types</SelectItem>
            {claimTypes.map((t) => (
              <SelectItem key={t._id} value={t._id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full lg:w-44">
            <SelectValue placeholder="All status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All status</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {CLAIM_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative lg:max-w-xs lg:flex-1">
          <IconSearch className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search type / description"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1">
          <Input
            type="date"
            aria-label="From date"
            className="w-full lg:w-44"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
          {fromDate && (
            <Button variant="ghost" size="sm" onClick={() => setFromDate("")}>
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="mx-4 rounded-lg border lg:mx-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {claims === undefined ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-muted-foreground py-8 text-center"
                >
                  No claims found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => (
                <TableRow
                  key={c._id}
                  className="hover:bg-muted/50 cursor-pointer"
                  onClick={() => setOpenId(c._id)}
                >
                  <TableCell>
                    <span className="font-medium">{c.claimTypeName}</span>
                    <div className="text-muted-foreground max-w-[280px] truncate text-xs">
                      {c.description}
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatMoney(c.amountCents, c.currency)}
                  </TableCell>
                  <TableCell className="text-sm">{c.incurredDate}</TableCell>
                  <TableCell>
                    <Badge variant={CLAIM_STATUS_BADGE[c.status]}>
                      {CLAIM_STATUS_LABELS[c.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenId(c._id)
                      }}
                    >
                      View
                    </Button>
                    {(c.status === "pending_manager" ||
                      c.status === "pending_finance") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCancel(c._id)
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ClaimDetailDialog
        claimId={openId}
        open={openId !== null}
        onOpenChange={(o) => !o && setOpenId(null)}
      />
    </div>
  )
}
