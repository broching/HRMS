"use client"

import { getErrorMessage } from "@/lib/errors"
import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { IconSearch } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"

/**
 * Inline employee picker for a non-default group policy, shown in the policy's
 * "Policy availability" section. Checking a person assigns this policy to them;
 * unchecking clears it (falling back to the default policy). "Select all"
 * assigns everyone currently listed. Someone already on another group policy is
 * shown with a hint — assigning here moves them off it.
 */
export function PolicyAvailabilityAssign({
  leaveTypeId,
  policyId,
}: {
  leaveTypeId: Id<"leaveTypes">
  policyId: Id<"leavePolicies">
}) {
  const directory = useQuery(api.employees.directoryOptions, {}) ?? []
  const assignments = useQuery(api.leavePolicies.assignmentsForType, {
    leaveTypeId,
  })
  const assign = useMutation(api.leavePolicies.assign)
  const unassign = useMutation(api.leavePolicies.unassign)

  const [search, setSearch] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  // Assignment id for this policy, and the (other-policy) label, keyed by employee.
  const assignmentIdByEmployee = new Map<string, Id<"leavePolicyAssignments">>()
  const onOtherPolicy = new Set<string>()
  for (const a of assignments ?? []) {
    if (a.policyId === policyId) assignmentIdByEmployee.set(a.employeeId, a._id)
    else onOtherPolicy.add(a.employeeId)
  }

  const term = search.trim().toLowerCase()
  const filtered = directory.filter((e) =>
    !term ? true : e.name.toLowerCase().includes(term),
  )
  const assignedCount = assignmentIdByEmployee.size
  const allFilteredAssigned =
    filtered.length > 0 &&
    filtered.every((e) => assignmentIdByEmployee.has(e._id))

  async function toggle(employeeId: string, checked: boolean) {
    setBusy(true)
    try {
      if (checked) {
        await assign({
          leaveTypeId,
          policyId,
          employeeIds: [employeeId as Id<"employees">],
        })
      } else {
        const id = assignmentIdByEmployee.get(employeeId)
        if (id) await unassign({ assignmentId: id })
      }
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not update assignment"))
    } finally {
      setBusy(false)
    }
  }

  async function toggleAll() {
    setBusy(true)
    try {
      if (allFilteredAssigned) {
        // Clear everyone currently shown.
        for (const e of filtered) {
          const id = assignmentIdByEmployee.get(e._id)
          if (id) await unassign({ assignmentId: id })
        }
      } else {
        const toAdd = filtered
          .filter((e) => !assignmentIdByEmployee.has(e._id))
          .map((e) => e._id as Id<"employees">)
        if (toAdd.length > 0) {
          await assign({ leaveTypeId, policyId, employeeIds: toAdd })
        }
      }
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not update assignments"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs font-medium">
          Applied to {assignedCount}{" "}
          {assignedCount === 1 ? "employee" : "employees"}
        </p>
        <label className="flex items-center gap-2 text-xs font-medium">
          <Checkbox
            checked={allFilteredAssigned}
            disabled={busy || filtered.length === 0}
            onCheckedChange={() => toggleAll()}
          />
          Select all
        </label>
      </div>
      <div className="relative">
        <IconSearch className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          placeholder="Search employees"
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="max-h-64 overflow-y-auto rounded-md border">
        {filtered.map((e) => {
          const checked = assignmentIdByEmployee.has(e._id)
          const elsewhere = !checked && onOtherPolicy.has(e._id)
          return (
            <label
              key={e._id}
              className="hover:bg-accent/40 flex items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0"
            >
              <Checkbox
                checked={checked}
                disabled={busy}
                onCheckedChange={(c) => toggle(e._id, c === true)}
              />
              <span className="flex-1">{e.name}</span>
              {elsewhere && (
                <span className="text-muted-foreground text-xs">
                  On another policy
                </span>
              )}
            </label>
          )
        })}
        {filtered.length === 0 && (
          <p className="text-muted-foreground p-3 text-center text-sm">
            No employees.
          </p>
        )}
      </div>
    </div>
  )
}
