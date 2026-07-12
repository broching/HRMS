"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery, useMutation } from "convex/react"
import {
  IconUser,
  IconBriefcase,
  IconFile,
  IconUsers,
  IconDeviceLaptop,
  IconCertificate,
  IconCalendarStats,
  IconCoin,
  IconReceipt2,
  IconPencil,
  IconTrash,
  type Icon,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { getErrorMessage } from "@/lib/errors"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { FileUpload } from "@/components/shared/file-upload"
import { cn } from "@/lib/utils"
import { STATUS_BADGE, STATUS_LABELS } from "@/features/employees/lib/labels"
import { AboutSection } from "./about-section"
import { CurrentJobSection } from "./current-job-section"
import { PhotoGallery } from "./photo-gallery"
import { PersonalDetailsSection } from "./personal-details-section"
import { ResumeSection } from "./resume-section"
import { JobHistorySection } from "./job-history-section"
import { DocumentsSection } from "./documents-section"
import { CompensationSection } from "./compensation-section"
import { FamilySection } from "./family-section"
import { EquipmentSection } from "./equipment-section"
import { ProfileRoleSelect } from "./role-select"
import { LeavePoliciesSection } from "./leave-policies-section"
import { PayrollSection } from "./payroll-section"

type SectionKey =
  | "profile"
  | "job"
  | "documents"
  | "compensation"
  | "family"
  | "equipment"
  | "training"
  | "leave"
  | "payroll"

export function ProfileView({ employeeId }: { employeeId: Id<"employees"> }) {
  const router = useRouter()
  // Optional deep-link to a specific section, e.g. `/employees/<id>?tab=leave`
  // from the HR Lounge leave dashboard (opens the person's leave balances).
  const initialTab = useSearchParams().get("tab") as SectionKey | null
  const [deleted, setDeleted] = React.useState(false)
  // Once deleted, stop subscribing to `employees.get` — the record is gone and
  // the query would throw "Employee not found" while we navigate away.
  const employee = useQuery(
    api.employees.get,
    deleted ? "skip" : { employeeId },
  )
  const setMyPhoto = useMutation(api.employees.setMyPhoto)
  const setPhoto = useMutation(api.employees.setPhoto)
  const removeEmployee = useMutation(api.employees.remove)
  const [section, setSection] = React.useState<SectionKey>(
    initialTab ?? "profile",
  )
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      await removeEmployee({ employeeId })
      setDeleted(true)
      setConfirmDelete(false)
      toast.success("Employee deleted")
      router.push("/employees")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't delete this employee"))
      setDeleting(false)
    }
  }

  if (employee === undefined) {
    return <Skeleton className="mx-4 h-96 rounded-xl lg:mx-6" />
  }

  const { isSelf, canEdit, canManage, canViewPersonal, canViewCompensation } =
    employee

  // The rail is built from the caller's capability flags.
  const sections: { key: SectionKey; label: string; icon: Icon; show: boolean }[] =
    [
      { key: "profile", label: "Profile", icon: IconUser, show: true },
      { key: "job", label: "Job", icon: IconBriefcase, show: true },
      {
        key: "documents",
        label: "Documents",
        icon: IconFile,
        show: canViewPersonal,
      },
      {
        key: "compensation",
        label: "Compensation",
        icon: IconCoin,
        show: canViewCompensation,
      },
      {
        key: "family",
        label: "Family Details",
        icon: IconUsers,
        show: canViewPersonal,
      },
      {
        key: "equipment",
        label: "Equipment",
        icon: IconDeviceLaptop,
        show: canViewPersonal,
      },
      {
        key: "training",
        label: "Training & Certification",
        icon: IconCertificate,
        // Professional info — visible to every colleague, like experience.
        show: true,
      },
      {
        key: "leave",
        label: "Leave Policies",
        icon: IconCalendarStats,
        // The person's own entitlements — self or HR/admin only.
        show: isSelf || canViewPersonal,
      },
      {
        key: "payroll",
        label: "Payroll",
        icon: IconReceipt2,
        show: canViewCompensation,
      },
    ]
  const visible = sections.filter((s) => s.show)
  const active = visible.some((s) => s.key === section) ? section : "profile"

  const displayName = `${employee.preferredName ?? employee.firstName} ${employee.lastName}`
  const initials =
    `${employee.firstName[0] ?? ""}${employee.lastName[0] ?? ""}`.toUpperCase()

  // Profile completion over the fields the caller can actually see.
  const checks = [
    !!employee.photoUrl,
    !!employee.bio,
    !!employee.dob,
    !!employee.gender,
    !!employee.nationality,
    !!employee.contact?.phone,
    !!employee.contact?.personalEmail,
    !!employee.address?.line1,
    !!(employee.emergencyContacts && employee.emergencyContacts.length > 0),
    !!(employee.experience && employee.experience.length > 0),
  ]
  const completion = Math.round(
    (checks.filter(Boolean).length / checks.length) * 100,
  )

  async function handlePhoto(storageId: Id<"_storage">) {
    try {
      if (isSelf) await setMyPhoto({ storageId })
      else await setPhoto({ employeeId, storageId })
      toast.success("Photo updated")
    } catch {
      toast.error("Could not update photo")
    }
  }

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      {/* Header band */}
      <Card className="overflow-hidden p-0">
        <div className="bg-muted/40 flex flex-col gap-6 p-6 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center gap-2">
              <Avatar className="ring-background size-20 ring-4">
                <AvatarImage src={employee.photoUrl ?? undefined} alt={displayName} />
                <AvatarFallback className="text-xl">{initials}</AvatarFallback>
              </Avatar>
              {canEdit && (
                <FileUpload
                  accept="image/*"
                  label="Photo"
                  maxBytes={5 * 1024 * 1024}
                  onUploaded={handlePhoto}
                />
              )}
            </div>
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
            {canManage && !isSelf && (
              <div className="flex items-center gap-2">
                <Button asChild variant="outline">
                  <Link href={`/employees/${employeeId}/edit`}>
                    <IconPencil className="size-4" />
                    Edit
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <IconTrash className="size-4" />
                  Delete
                </Button>
              </div>
            )}
            {canManage && !isSelf && (
              <ProfileRoleSelect employeeId={employeeId} />
            )}
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
            {visible.map((s) => (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                  active === s.key
                    ? "bg-accent font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                )}
              >
                <s.icon className="size-4" />
                {s.label}
              </button>
            ))}
          </nav>
        </Card>

        {/* Content */}
        <Card className="p-6">
          {active === "profile" ? (
            <div className="flex flex-col gap-6">
              <AboutSection employee={employee} />
              <Separator />
              <PhotoGallery employee={employee} />
              {canViewPersonal && (
                <>
                  <Separator />
                  <PersonalDetailsSection employee={employee} />
                </>
              )}
              <Separator />
              <ResumeSection employee={employee} kind="experience" />
              <Separator />
              <ResumeSection employee={employee} kind="education" />
            </div>
          ) : active === "job" ? (
            <div className="flex flex-col gap-6">
              <CurrentJobSection employee={employee} />
              <Separator />
              <JobHistorySection employeeId={employeeId} canManage={canManage} />
            </div>
          ) : active === "documents" ? (
            <DocumentsSection
              employeeId={employeeId}
              canUpload={isSelf || canManage}
            />
          ) : active === "compensation" ? (
            <CompensationSection employeeId={employeeId} />
          ) : active === "family" ? (
            <FamilySection employee={employee} />
          ) : active === "equipment" ? (
            <EquipmentSection employeeId={employeeId} canManage={canManage} />
          ) : active === "training" ? (
            <ResumeSection employee={employee} kind="trainings" />
          ) : active === "leave" ? (
            <LeavePoliciesSection employeeId={employeeId} />
          ) : (
            <PayrollSection employeeId={employeeId} />
          )}
        </Card>
      </div>

      <Dialog open={confirmDelete} onOpenChange={(o) => !deleting && setConfirmDelete(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete employee?</DialogTitle>
            <DialogDescription>
              This permanently deletes {employee.firstName} {employee.lastName} and
              their records (documents, claims, leave, attendance, scheduling,
              compensation and performance). This can&apos;t be undone. To keep
              their history instead, edit their status to Terminated.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete employee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
