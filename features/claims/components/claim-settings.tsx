"use client"

import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CLAIM_CATEGORY_LABELS } from "@/features/claims/lib/labels"

export function ClaimSettings() {
  const types = useQuery(api.claimTypes.list, { includeInactive: true })
  const update = useMutation(api.claimTypes.update)
  const seed = useMutation(api.claimTypes.seedDefaults)

  async function toggle(id: Id<"claimTypes">, active: boolean) {
    await update({ id, active })
  }
  async function toggleReceipt(id: Id<"claimTypes">, requiresReceipt: boolean) {
    await update({ id, requiresReceipt })
  }

  return (
    <div className="px-4 lg:px-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Claim types</CardTitle>
          {types && types.length === 0 && (
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await seed({})
                  toast.success("Default claim types seeded")
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed")
                }
              }}
            >
              Seed defaults
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Requires receipt</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {types?.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
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
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
