"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { IconPencil, IconPlus } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  CLAIM_CATEGORY_LABELS,
  formatMoney,
} from "@/features/claims/lib/labels"
import { getErrorMessage } from "@/lib/errors"
import { ClaimTypeDialog } from "./claim-type-dialog"

type ClaimType = FunctionReturnType<typeof api.claimTypes.list>[number]

function limitSummary(t: ClaimType): string {
  const parts: string[] = []
  if (t.maxAmountCents) parts.push(`${formatMoney(t.maxAmountCents, "SGD")}/txn`)
  if (t.monthlyLimitCents)
    parts.push(`${formatMoney(t.monthlyLimitCents, "SGD")}/mo`)
  if (t.yearlyLimitCents)
    parts.push(`${formatMoney(t.yearlyLimitCents, "SGD")}/yr`)
  return parts.length ? parts.join(" · ") : "No limit"
}

export function ClaimSettings() {
  const types = useQuery(api.claimTypes.list, { includeInactive: true })
  const update = useMutation(api.claimTypes.update)
  const seed = useMutation(api.claimTypes.seedDefaults)

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<ClaimType | undefined>(undefined)

  async function toggle(id: Id<"claimTypes">, active: boolean) {
    await update({ id, active })
  }
  async function toggleReceipt(id: Id<"claimTypes">, requiresReceipt: boolean) {
    await update({ id, requiresReceipt })
  }

  function openNew() {
    setEditing(undefined)
    setDialogOpen(true)
  }
  function openEdit(t: ClaimType) {
    setEditing(t)
    setDialogOpen(true)
  }

  return (
    <div className="px-4 lg:px-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Claim types</CardTitle>
          <div className="flex gap-2">
            {types && types.length === 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await seed({})
                    toast.success("Default claim types seeded")
                  } catch (e) {
                    toast.error(getErrorMessage(e, "Couldn't seed defaults"))
                  }
                }}
              >
                Seed defaults
              </Button>
            )}
            <Button size="sm" onClick={openNew}>
              <IconPlus className="size-4" />
              New claim type
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Limits</TableHead>
                <TableHead>Receipt</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">{""}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {types?.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-muted-foreground py-6 text-center"
                  >
                    No claim types yet.
                  </TableCell>
                </TableRow>
              ) : (
                types?.map((t) => (
                  <TableRow key={t._id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {CLAIM_CATEGORY_LABELS[t.category]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {limitSummary(t)}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={t.requiresReceipt}
                        onCheckedChange={(c) => toggleReceipt(t._id, c)}
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={t.active}
                        onCheckedChange={(c) => toggle(t._id, c)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-7"
                        onClick={() => openEdit(t)}
                      >
                        <IconPencil className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ClaimTypeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        claimType={editing}
      />
    </div>
  )
}
