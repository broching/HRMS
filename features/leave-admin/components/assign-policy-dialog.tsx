"use client"

import { getErrorMessage } from "@/lib/errors"
import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { IconSearch, IconX } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type PolicyOpt = { _id: Id<"leavePolicies">; name: string; isDefault: boolean }

export function AssignPolicyDialog({
  open,
  onOpenChange,
  leaveTypeId,
  policies,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  leaveTypeId: Id<"leaveTypes">
  policies: PolicyOpt[]
}) {
  const directory = useQuery(api.employees.directoryOptions, {}) ?? []
  const assignments = useQuery(api.leavePolicies.assignmentsForType, {
    leaveTypeId,
  })
  const assign = useMutation(api.leavePolicies.assign)
  const unassign = useMutation(api.leavePolicies.unassign)

  const [policyId, setPolicyId] = React.useState<string>("")
  const [search, setSearch] = React.useState("")
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (open && !policyId) {
      const firstGroup = policies.find((p) => !p.isDefault)
      setPolicyId(firstGroup?._id ?? policies[0]?._id ?? "")
    }
  }, [open, policies, policyId])

  const term = search.trim().toLowerCase()
  const filtered = directory.filter((e) =>
    !term ? true : e.name.toLowerCase().includes(term),
  )

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleAssign() {
    if (!policyId) return toast.error("Pick a policy")
    if (selected.size === 0) return toast.error("Select at least one employee")
    setBusy(true)
    try {
      await assign({
        leaveTypeId,
        policyId: policyId as Id<"leavePolicies">,
        employeeIds: [...selected] as Id<"employees">[],
      })
      toast.success("Policy assigned")
      setSelected(new Set())
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not assign"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign policy</DialogTitle>
          <DialogDescription>
            Assign a group policy to specific employees. Unassigned employees use
            the default policy.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Policy</Label>
            <Select value={policyId} onValueChange={setPolicyId}>
              <SelectTrigger>
                <SelectValue placeholder="Select policy" />
              </SelectTrigger>
              <SelectContent>
                {policies.map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    {p.name}
                    {p.isDefault ? " (default — clears overrides)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Employees</Label>
            <div className="relative">
              <IconSearch className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                placeholder="Search employees"
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="max-h-56 overflow-y-auto rounded-md border">
              {filtered.map((e) => (
                <label
                  key={e._id}
                  className="hover:bg-accent/40 flex items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0"
                >
                  <Checkbox
                    checked={selected.has(e._id)}
                    onCheckedChange={() => toggle(e._id)}
                  />
                  {e.name}
                </label>
              ))}
              {filtered.length === 0 && (
                <p className="text-muted-foreground p-3 text-center text-sm">
                  No employees.
                </p>
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              {selected.size} selected
            </p>
          </div>

          {assignments && assignments.length > 0 && (
            <div className="grid gap-2">
              <Label>Current assignments</Label>
              <div className="flex flex-wrap gap-2">
                {assignments.map((a) => (
                  <span
                    key={a._id}
                    className="bg-muted flex items-center gap-1 rounded-full px-2.5 py-1 text-xs"
                  >
                    {a.employeeName}
                    <button
                      onClick={() => unassign({ assignmentId: a._id })}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <IconX className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleAssign} disabled={busy}>
            {busy ? "Assigning…" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
