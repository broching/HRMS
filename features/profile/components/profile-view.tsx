"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery, useMutation } from "convex/react"
import {
  IconUser,
  IconBriefcase,
  IconPhone,
  IconFile,
  IconPencil,
  IconLock,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useCurrentMember } from "@/hooks/use-current-member"
import { hasPermission } from "@/convex/lib/permissions"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { FileUpload } from "@/components/shared/file-upload"
import { cn } from "@/lib/utils"
import {
  EMPLOYMENT_TYPE_LABELS,
  GENDER_LABELS,
  STATUS_BADGE,
  STATUS_LABELS,
} from "@/features/employees/lib/labels"
import { EmployeeDocuments } from "@/features/employees/components/employee-documents"
import { ProfileEditDialog } from "./profile-edit-dialog"

type SectionKey = "profile" | "job" | "emergency" | "documents"

const SECTIONS: { key: SectionKey; label: string; icon: typeof IconUser }[] = [
  { key: "profile", label: "Profile", icon: IconUser },
  { key: "job", label: "Job", icon: IconBriefcase },
  { key: "emergency", label: "Emergency", icon: IconPhone },
  { key: "documents", label: "Documents", icon: IconFile },
]

const COMING_SOON = [
  "Compensation",
  "Identity Documents",
  "Family Details",
  "Equipment",
  "Training & Certification",
  "Leave Policies",
  "Payroll",
]

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {label}
      </span>
      <span className="text-sm">{value || "—"}</span>
    </div>
  )
}

export function ProfileView({
  employeeId,
  mode,
}: {
  employeeId: Id<"employees">
  mode: "self" | "manage"
}) {
  const employee = useQuery(api.employees.get, { employeeId })
  const member = useCurrentMember()
  const setMyPhoto = useMutation(api.employees.setMyPhoto)
  const setPhoto = useMutation(api.employees.setPhoto)
  const [section, setSection] = React.useState<SectionKey>("profile")
  const [editing, setEditing] = React.useState(false)

  const canManage =
    mode === "manage" &&
    member != null &&
    hasPermission(member.role, "employees:manage")
  const canEdit = mode === "self" || canManage

  if (employee === undefined) {
    return <Skeleton className="h-96 w-full rounded-xl" />
  }

  const displayName = `${employee.preferredName ?? employee.firstName} ${employee.lastName}`
  const initials =
    `${employee.firstName[0] ?? ""}${employee.lastName[0] ?? ""}`.toUpperCase()
  const addressLine = [
    employee.address?.line1,
    employee.address?.line2,
    employee.address?.city,
    employee.address?.state,
    employee.address?.postalCode,
    employee.address?.country,
  ]
    .filter(Boolean)
    .join(", ")

  // Lightweight "profile completed" indicator.
  const checks = [
    !!employee.photoUrl,
    !!employee.dob,
    !!employee.gender,
    !!employee.nationality,
    !!employee.contact?.phone,
    !!employee.contact?.personalEmail,
    !!employee.address?.line1,
    !!(employee.emergencyContacts && employee.emergencyContacts.length > 0),
  ]
  const completion = Math.round(
    (checks.filter(Boolean).length / checks.length) * 100,
  )

  async function handlePhoto(storageId: Id<"_storage">) {
    try {
      if (mode === "self") await setMyPhoto({ storageId })
      else await setPhoto({ employeeId, storageId })
      toast.success("Photo updated")
    } catch {
      toast.error("Could not update photo")
    }
  }

  function onEdit() {
    if (mode === "self") setEditing(true)
  }

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      {/* Header band */}
      <Card className="overflow-hidden p-0">
        <div className="bg-muted/40 flex flex-col gap-6 p-6 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4">
            <Avatar className="ring-background size-20 ring-4">
              <AvatarImage src={employee.photoUrl ?? undefined} alt={displayName} />
              <AvatarFallback className="text-xl">{initials}</AvatarFallback>
            </Avatar>
            <div className="space-y-0.5">
              <p className="text-muted-foreground text-xs">
                ID {employee.employeeNumber}
              </p>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {displayName}
                </h1>
                <Badge variant={STATUS_BADGE[employee.status]}>
                  {STATUS_LABELS[employee.status]}
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm">
                {employee.positionTitle ?? "—"}
              </p>
              <p className="text-muted-foreground text-sm">
                {employee.contact?.workEmail}
              </p>
              <p className="text-muted-foreground text-sm">
                {[
                  employee.departmentName,
                  employee.officeName,
                  employee.joinDate ? `Joined ${employee.joinDate}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>

          {employee.managerName && (
            <div className="flex flex-col gap-1.5 lg:ml-4">
              <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Manager
              </span>
              <span className="text-sm">{employee.managerName}</span>
            </div>
          )}

          <div className="flex flex-col items-start gap-3 lg:ml-auto lg:items-end">
            {canEdit &&
              (mode === "self" ? (
                <Button variant="outline" onClick={onEdit}>
                  <IconPencil className="size-4" />
                  Edit
                </Button>
              ) : (
                <Button asChild variant="outline">
                  <Link href={`/employees/${employeeId}/edit`}>
                    <IconPencil className="size-4" />
                    Edit
                  </Link>
                </Button>
              ))}
            <div className="flex flex-col items-start gap-1 lg:items-end">
              <span className="text-muted-foreground text-xs">
                Profile completed
              </span>
              <div className="flex items-center gap-2">
                <div className="bg-muted h-1.5 w-28 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full"
                    style={{ width: `${completion}%` }}
                  />
                </div>
                <span className="text-sm font-medium tabular-nums">
                  {completion}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Left rail (sidebar) */}
        <Card className="h-fit p-2">
          <nav className="flex flex-col gap-0.5">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                  section === s.key
                    ? "bg-accent font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                )}
              >
                <s.icon className="size-4" />
                {s.label}
              </button>
            ))}
            <div className="my-1 border-t" />
            {COMING_SOON.map((label) => (
              <div
                key={label}
                className="text-muted-foreground/60 flex items-center gap-2 rounded-md px-3 py-2 text-sm"
              >
                <IconLock className="size-4" />
                <span className="flex-1">{label}</span>
                <span className="text-[10px] uppercase">Soon</span>
              </div>
            ))}
          </nav>
        </Card>

        {/* Content */}
        <Card className="p-6">
          {section === "profile" ? (
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Personal details</h2>
                <div className="flex items-center gap-2">
                  {mode === "self" && (
                    <FileUpload
                      accept="image/*"
                      label="Change photo"
                      onUploaded={handlePhoto}
                    />
                  )}
                  {canManage && (
                    <FileUpload
                      accept="image/*"
                      label="Change photo"
                      onUploaded={handlePhoto}
                    />
                  )}
                </div>
              </div>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Preferred name" value={employee.preferredName} />
                <Field label="Date of birth" value={employee.dob} />
                <Field
                  label="Gender"
                  value={
                    employee.gender ? GENDER_LABELS[employee.gender] : undefined
                  }
                />
                <Field label="Nationality" value={employee.nationality} />
                <Field label="ID number" value={employee.idNumberMasked} />
                <Field label="Work email" value={employee.contact?.workEmail} />
                <Field
                  label="Personal email"
                  value={employee.contact?.personalEmail}
                />
                <Field label="Phone" value={employee.contact?.phone} />
                <Field label="Address" value={addressLine} />
              </div>
            </div>
          ) : section === "job" ? (
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Job</h2>
                {mode === "self" && (
                  <span className="text-muted-foreground flex items-center gap-1 text-xs">
                    <IconLock className="size-3" /> Managed by HR
                  </span>
                )}
              </div>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
                <Field
                  label="Confirmation date"
                  value={employee.confirmationDate}
                />
                <Field label="Probation end" value={employee.probationEndDate} />
                <Field label="Exit date" value={employee.exitDate} />
              </div>
            </div>
          ) : section === "emergency" ? (
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Emergency contacts</h2>
                {mode === "self" && (
                  <Button variant="outline" size="sm" onClick={onEdit}>
                    <IconPencil className="size-4" />
                    Edit
                  </Button>
                )}
              </div>
              {employee.emergencyContacts &&
              employee.emergencyContacts.length > 0 ? (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {employee.emergencyContacts.map((c, i) => (
                    <Field
                      key={i}
                      label={c.relationship || "Contact"}
                      value={[c.name, c.phone].filter(Boolean).join(" · ")}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No emergency contact on file.
                  {mode === "self" ? " Add one via Edit." : ""}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold">Documents</h2>
              <EmployeeDocuments employeeId={employeeId} canManage={canManage} />
            </div>
          )}
        </Card>
      </div>

      {mode === "self" && (
        <ProfileEditDialog
          open={editing}
          onOpenChange={setEditing}
          initial={{
            firstName: employee.firstName,
            lastName: employee.lastName,
            preferredName: employee.preferredName ?? "",
            dob: employee.dob ?? "",
            gender: employee.gender ?? "",
            nationality: employee.nationality ?? "",
            personalEmail: employee.contact?.personalEmail ?? "",
            phone: employee.contact?.phone ?? "",
            addressLine1: employee.address?.line1 ?? "",
            addressLine2: employee.address?.line2 ?? "",
            city: employee.address?.city ?? "",
            state: employee.address?.state ?? "",
            postalCode: employee.address?.postalCode ?? "",
            country: employee.address?.country ?? "",
            emergencyName: employee.emergencyContacts?.[0]?.name ?? "",
            emergencyRelationship:
              employee.emergencyContacts?.[0]?.relationship ?? "",
            emergencyPhone: employee.emergencyContacts?.[0]?.phone ?? "",
          }}
        />
      )}
    </div>
  )
}
