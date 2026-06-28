"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery, useMutation } from "convex/react"
import { IconPencil } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useCurrentMember } from "@/hooks/use-current-member"
import { hasPermission } from "@/convex/lib/permissions"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { FileUpload } from "@/components/shared/file-upload"
import { PageHeader } from "@/components/shared/page-header"
import {
  EMPLOYMENT_TYPE_LABELS,
  GENDER_LABELS,
  STATUS_BADGE,
  STATUS_LABELS,
} from "@/features/employees/lib/labels"
import { EmployeeDocuments } from "./employee-documents"

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm">{value || "—"}</span>
    </div>
  )
}

export function EmployeeProfile({
  employeeId,
}: {
  employeeId: Id<"employees">
}) {
  const employee = useQuery(api.employees.get, { employeeId })
  const member = useCurrentMember()
  const setPhoto = useMutation(api.employees.setPhoto)

  const canManage = member ? hasPermission(member.role, "employees:manage") : false

  async function handlePhoto(storageId: Id<"_storage">) {
    try {
      await setPhoto({ employeeId, storageId })
      toast.success("Photo updated")
    } catch {
      toast.error("Could not update photo")
    }
  }

  if (employee === undefined) {
    return (
      <div className="px-4 lg:px-6">
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  const displayName = `${employee.preferredName ?? employee.firstName} ${employee.lastName}`
  const initials = `${employee.firstName[0] ?? ""}${employee.lastName[0] ?? ""}`.toUpperCase()
  const address = employee.address
  const addressLine = address
    ? [address.line1, address.line2, address.city, address.state, address.postalCode, address.country]
        .filter(Boolean)
        .join(", ")
    : ""

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Employee profile">
        {canManage && (
          <Button asChild variant="outline">
            <Link href={`/employees/${employeeId}/edit`}>
              <IconPencil className="size-4" />
              Edit
            </Link>
          </Button>
        )}
      </PageHeader>

      <div className="flex flex-col items-start gap-4 px-4 sm:flex-row sm:items-center lg:px-6">
        <Avatar className="size-16">
          <AvatarImage src={employee.photoUrl ?? ""} alt={displayName} />
          <AvatarFallback className="text-lg">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">{displayName}</h2>
            <Badge variant={STATUS_BADGE[employee.status]}>
              {STATUS_LABELS[employee.status]}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            {employee.employeeNumber}
            {employee.positionTitle ? ` · ${employee.positionTitle}` : ""}
            {employee.departmentName ? ` · ${employee.departmentName}` : ""}
          </p>
        </div>
        {canManage && (
          <FileUpload
            accept="image/*"
            label="Change photo"
            onUploaded={handlePhoto}
          />
        )}
      </div>

      <div className="px-4 lg:px-6">
        <Tabs defaultValue="personal">
          <TabsList>
            <TabsTrigger value="personal">Personal</TabsTrigger>
            <TabsTrigger value="employment">Employment</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>

          <TabsContent
            value="personal"
            className="grid gap-6 pt-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <Field label="Preferred name" value={employee.preferredName} />
            <Field label="Date of birth" value={employee.dob} />
            <Field
              label="Gender"
              value={employee.gender ? GENDER_LABELS[employee.gender] : undefined}
            />
            <Field label="Nationality" value={employee.nationality} />
            <Field label="ID number" value={employee.idNumberMasked} />
            <Field label="Work email" value={employee.contact?.workEmail} />
            <Field label="Personal email" value={employee.contact?.personalEmail} />
            <Field label="Phone" value={employee.contact?.phone} />
            <Field label="Address" value={addressLine} />
            {employee.emergencyContacts?.map((c, i) => (
              <Field
                key={i}
                label={`Emergency contact${c.relationship ? ` (${c.relationship})` : ""}`}
                value={[c.name, c.phone].filter(Boolean).join(" · ")}
              />
            ))}
          </TabsContent>

          <TabsContent
            value="employment"
            className="grid gap-6 pt-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <Field label="Department" value={employee.departmentName} />
            <Field label="Team" value={employee.teamName} />
            <Field label="Position" value={employee.positionTitle} />
            <Field label="Manager" value={employee.managerName} />
            <Field label="Office" value={employee.officeName} />
            <Field
              label="Employment type"
              value={EMPLOYMENT_TYPE_LABELS[employee.employmentType]}
            />
            <Field label="Join date" value={employee.joinDate} />
            <Field label="Confirmation date" value={employee.confirmationDate} />
            <Field label="Probation end" value={employee.probationEndDate} />
            <Field label="Exit date" value={employee.exitDate} />
          </TabsContent>

          <TabsContent value="documents" className="pt-4">
            <EmployeeDocuments
              employeeId={employeeId}
              canManage={canManage}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
