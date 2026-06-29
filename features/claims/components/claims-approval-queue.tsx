"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery, useMutation } from "convex/react"
import { IconCheck, IconX, IconSearch } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
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
import { CLAIM_STATUS_LABELS, formatMoney } from "@/features/claims/lib/labels"

const ALL = "all"
const STAGES = ["pending_manager", "pending_finance"] as const

export function ClaimsApprovalQueue() {
  const queue = useQuery(api.claims.approvalQueue)
  const claimTypes = useQuery(api.claimTypes.list, { includeInactive: true }) ?? []
  const managerApprove = useMutation(api.claims.managerApprove)
  const financeApprove = useMutation(api.claims.financeApprove)
  const reject = useMutation(api.claims.reject)

  const [stage, setStage] = React.useState(ALL)
  const [typeName, setTypeName] = React.useState(ALL)
  const [search, setSearch] = React.useState("")

  async function run(p: Promise<unknown>, ok: string) {
    try {
      await p
      toast.success(ok)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed")
    }
  }

  const filtered = (queue ?? []).filter((c) => {
    if (stage !== ALL && c.status !== stage) return false
    if (typeName !== ALL && c.claimTypeName !== typeName) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const hay = `${c.employeeName} ${c.claimTypeName} ${c.description}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 px-4 lg:flex-row lg:items-center lg:px-6">
        <Select value={stage} onValueChange={setStage}>
          <SelectTrigger className="w-full lg:w-48">
            <SelectValue placeholder="All stages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All stages</SelectItem>
            {STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                {CLAIM_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeName} onValueChange={setTypeName}>
          <SelectTrigger className="w-full lg:w-48">
            <SelectValue placeholder="All claim types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All claim types</SelectItem>
            {claimTypes.map((t) => (
              <SelectItem key={t._id} value={t.name}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative lg:max-w-xs lg:flex-1">
          <IconSearch className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search employee / type / description"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="mx-4 rounded-lg border lg:mx-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead className="text-right">Decision</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {queue === undefined ? (
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
                  Nothing awaiting your approval.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => (
                <TableRow key={c._id}>
                  <TableCell className="font-medium">{c.employeeName}</TableCell>
                  <TableCell>
                    <Link href={`/claims/${c._id}`} className="hover:underline">
                      {c.claimTypeName}
                    </Link>
                    <div className="text-muted-foreground max-w-[220px] truncate text-xs">
                      {c.description}
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatMoney(c.amountCents, c.currency)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {CLAIM_STATUS_LABELS[c.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          run(
                            c.status === "pending_manager"
                              ? managerApprove({ claimId: c._id })
                              : financeApprove({ claimId: c._id }),
                            "Approved",
                          )
                        }
                      >
                        <IconCheck className="size-4 text-green-600" />
                        Approve
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => run(reject({ claimId: c._id }), "Rejected")}
                      >
                        <IconX className="size-4 text-red-600" />
                        Reject
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
