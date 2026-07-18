"use client"

import { getErrorMessage } from "@/lib/errors"
import * as React from "react"
import { useRouter } from "next/navigation"
import { useForm, type Control, type FieldPath } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useQuery, useMutation, useAction } from "convex/react"
import { useOrganization } from "@clerk/nextjs"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { HrmsRole } from "@/convex/lib/enums"
import type { Id, TableNames } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  EMPLOYEE_STATUSES,
  STATUS_LABELS,
} from "@/features/employees/lib/labels"

const schema = z.object({
  employeeNumber: z.string().min(1, "Required"),
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  preferredName: z.string().optional(),
  dob: z.string().optional(),
  gender: z.string().optional(),
  nationality: z.string().optional(),
  idNumber: z.string().optional(),
  personalEmail: z.string().optional(),
  workEmail: z.string().optional(),
  username: z.string().optional(),
  role: z.enum(["admin", "hr", "finance", "manager", "employee"]),
  phone: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  emergencyName: z.string().optional(),
  emergencyRelationship: z.string().optional(),
  emergencyPhone: z.string().optional(),
  employmentType: z.enum(["full_time", "part_time", "contract", "intern"]),
  status: z.enum([
    "active",
    "probation",
    "on_leave",
    "suspended",
    "terminated",
  ]),
  joinDate: z.string().min(1, "Required"),
  confirmationDate: z.string().optional(),
  probationEndDate: z.string().optional(),
  departmentId: z.string().optional(),
  teamId: z.string().optional(),
  positionId: z.string().optional(),
  managerId: z.string().optional(),
  additionalManagerIds: z.array(z.string()).optional(),
  officeId: z.string().min(1, "Required"),
  // Tri-state attendance override: inherit the org default, force on, or off.
  attendanceRequired: z.enum(["default", "required", "exempt"]).optional(),
})

export type EmployeeFormValues = z.infer<typeof schema>

const NONE = "none"
const opt = (s?: string) => (s && s.trim() ? s.trim() : undefined)

const HRMS_ROLES: { value: HrmsRole; label: string }[] = [
  { value: "employee", label: "Employee" },
  { value: "manager", label: "Manager" },
  { value: "hr", label: "HR" },
  { value: "finance", label: "Finance" },
  { value: "admin", label: "Admin" },
]

// Clerk org roles available on every plan; the richer HRMS role is stored in
// Convex and applied to the membership when the invite is accepted.
function clerkRoleFor(role: HrmsRole): "org:admin" | "org:member" {
  return role === "admin" ? "org:admin" : "org:member"
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const stripNone = (s?: string) => (s && s !== NONE ? s : undefined)
function optId<T extends TableNames>(s?: string) {
  return s && s !== NONE ? (s as Id<T>) : undefined
}

// ─── Field helpers ───────────────────────────────────────────────────────

function TextField({
  control,
  name,
  label,
  type = "text",
  placeholder,
}: {
  control: Control<EmployeeFormValues>
  name: FieldPath<EmployeeFormValues>
  label: string
  type?: string
  placeholder?: string
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type={type}
              placeholder={placeholder}
              {...field}
              value={(field.value as string | undefined) ?? ""}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

function SelectField({
  control,
  name,
  label,
  options,
  includeNone,
}: {
  control: Control<EmployeeFormValues>
  name: FieldPath<EmployeeFormValues>
  label: string
  options: { value: string; label: string }[]
  includeNone?: boolean
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select
            value={(field.value as string) || (includeNone ? NONE : undefined)}
            onValueChange={field.onChange}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {includeNone && <SelectItem value={NONE}>None</SelectItem>}
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

// Multiselect list of secondary (dotted-line) managers. The primary manager is
// excluded from the options so the two fields can't disagree.
function MultiManagerField({
  control,
  options,
}: {
  control: Control<EmployeeFormValues>
  options: { value: string; label: string }[]
}) {
  return (
    <FormField
      control={control}
      name="additionalManagerIds"
      render={({ field }) => {
        const selected = new Set(field.value ?? [])
        const toggle = (id: string, checked: boolean) => {
          const next = new Set(selected)
          if (checked) next.add(id)
          else next.delete(id)
          field.onChange([...next])
        }
        return (
          <FormItem>
            <FormLabel>Additional managers</FormLabel>
            {options.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No other people available.
              </p>
            ) : (
              <div className="max-h-40 overflow-y-auto rounded-md border p-1">
                {options.map((o) => (
                  <label
                    key={o.value}
                    className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
                  >
                    <Checkbox
                      checked={selected.has(o.value)}
                      onCheckedChange={(c) => toggle(o.value, c === true)}
                    />
                    <span className="truncate">{o.label}</span>
                  </label>
                ))}
              </div>
            )}
            <FormMessage />
          </FormItem>
        )
      }}
    />
  )
}

// ─── Form ────────────────────────────────────────────────────────────────

export function EmployeeForm({
  employeeId,
  initial,
  loginUsername,
  loginEmail,
}: {
  employeeId?: Id<"employees">
  initial?: Partial<EmployeeFormValues>
  // The linked sign-in identifiers, shown read-only when editing (an account's
  // username/invite email can't be changed from the employee record).
  loginUsername?: string
  loginEmail?: string
}) {
  const router = useRouter()
  const { organization } = useOrganization()
  const create = useMutation(api.employees.create)
  const update = useMutation(api.employees.update)
  const setAdditionalManagers = useMutation(api.employees.setAdditionalManagers)
  const addByUsername = useAction(api.orgMembers.addByUsername)

  const departments = useQuery(api.departments.list) ?? []
  const teams = useQuery(api.teams.list) ?? []
  const positions = useQuery(api.positions.list) ?? []
  const offices = useQuery(api.offices.list) ?? []
  const allEmployees = useQuery(api.employees.list, {}) ?? []

  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      employeeNumber: "",
      firstName: "",
      lastName: "",
      employmentType: "full_time",
      status: "active",
      role: "employee",
      additionalManagerIds: [],
      joinDate: new Date().toISOString().slice(0, 10),
      country: "SG",
      attendanceRequired: "default",
      ...initial,
    },
  })

  const [saving, setSaving] = React.useState(false)

  // Office is required; preselect the org's default office when creating a new
  // employee who doesn't already have one set.
  React.useEffect(() => {
    if (employeeId) return
    if (offices.length === 0 || form.getValues("officeId")) return
    const def = offices.find((o) => o.isDefault) ?? offices[0]
    if (def) form.setValue("officeId", def._id)
  }, [offices, employeeId, form])

  async function onSubmit(values: EmployeeFormValues) {
    setSaving(true)
    try {
      const contact = {
        personalEmail: opt(values.personalEmail),
        workEmail: opt(values.workEmail),
        phone: opt(values.phone),
      }
      const hasContact = Object.values(contact).some(Boolean)
      const address = {
        line1: opt(values.addressLine1),
        line2: opt(values.addressLine2),
        city: opt(values.city),
        state: opt(values.state),
        postalCode: opt(values.postalCode),
        country: opt(values.country),
      }
      const hasAddress = Object.values(address).some(Boolean)
      const emergencyContacts = opt(values.emergencyName)
        ? [
            {
              name: values.emergencyName!.trim(),
              relationship: opt(values.emergencyRelationship),
              phone: opt(values.emergencyPhone),
            },
          ]
        : undefined

      const common = {
        firstName: values.firstName,
        lastName: values.lastName,
        preferredName: opt(values.preferredName),
        dob: opt(values.dob),
        gender: stripNone(values.gender) as
          | "male"
          | "female"
          | "other"
          | "undisclosed"
          | undefined,
        nationality: opt(values.nationality),
        idNumber: opt(values.idNumber),
        address: hasAddress ? address : undefined,
        contact: hasContact ? contact : undefined,
        emergencyContacts,
        employmentType: values.employmentType,
        status: values.status,
        joinDate: values.joinDate,
        confirmationDate: opt(values.confirmationDate),
        probationEndDate: opt(values.probationEndDate),
        departmentId: optId<"departments">(values.departmentId),
        teamId: optId<"teams">(values.teamId),
        positionId: optId<"positions">(values.positionId),
        managerId: optId<"employees">(values.managerId),
        officeId: optId<"offices">(values.officeId),
      }

      // Secondary (dotted-line) managers: drop the primary and any blanks so the
      // two fields never disagree. Persisted via a dedicated mutation (cycle- and
      // ownership-guarded server-side) after the main record is saved.
      const primaryManagerId = optId<"employees">(values.managerId)
      const additionalManagerIds = (values.additionalManagerIds ?? []).filter(
        (id) => id && id !== NONE && id !== primaryManagerId,
      ) as Id<"employees">[]

      if (employeeId) {
        // "default" clears the override (null); required/exempt force it.
        const attendanceRequired =
          values.attendanceRequired === "required"
            ? true
            : values.attendanceRequired === "exempt"
              ? false
              : null
        await update({
          employeeId,
          employeeNumber: values.employeeNumber,
          ...common,
          attendanceRequired,
        })
        await setAdditionalManagers({
          employeeId,
          managerIds: additionalManagerIds,
        })
        toast.success("Employee updated")
        router.push(`/employees/${employeeId}`)
      } else {
        const email = opt(values.workEmail)
        const username = opt(values.username)?.toLowerCase()
        if (!email && !username) {
          toast.error("Enter a work email or a username to add this person.")
          return
        }
        if (email && !EMAIL_RE.test(email)) {
          toast.error("Enter a valid work email.")
          return
        }

        // Inline pre-check against the loaded directory so a taken work email
        // surfaces on the field immediately. The server (employees.create)
        // re-validates authoritatively (and also catches usernames + races).
        if (email) {
          const taken = allEmployees.find(
            (e) => e.workEmail?.toLowerCase() === email.toLowerCase(),
          )
          if (taken) {
            form.setError("workEmail", {
              message: `Already assigned to ${taken.firstName} ${taken.lastName} (${taken.employeeNumber}).`,
            })
            toast.error("This work email is already assigned to an employee.")
            return
          }
        }

        // Create + link the profile first, so whichever join path completes
        // (email invite acceptance, or username org-add) links it reliably.
        const id = await create({
          employeeNumber: values.employeeNumber,
          loginEmail: email,
          loginUsername: username,
          invitedRole: values.role,
          ...common,
        })

        if (additionalManagerIds.length > 0) {
          await setAdditionalManagers({
            employeeId: id,
            managerIds: additionalManagerIds,
          })
        }

        // Then wire up access (best-effort — a failure here doesn't undo the
        // profile). Email → Clerk org invitation. Username → direct org-add of
        // the existing account, or a pending link auto-resolved on signup.
        const notes: string[] = []
        if (email) {
          try {
            await organization?.inviteMember({
              emailAddress: email,
              role: clerkRoleFor(values.role),
            })
          } catch (e) {
            notes.push(
              `email invite not sent (${getErrorMessage(e, "unknown error")})`,
            )
          }
        }
        if (username) {
          try {
            const res = await addByUsername({ username, role: values.role })
            if (res.status === "not_found") {
              notes.push(
                `no account named “${username}” yet — they’ll be added automatically when they sign up`,
              )
            }
          } catch (e) {
            notes.push(
              `could not add “${username}” (${getErrorMessage(e, "unknown error")})`,
            )
          }
        }

        if (notes.length) {
          toast.warning(`Employee created. ${notes.join("; ")}.`)
        } else {
          toast.success("Employee created and added to the organization")
        }
        router.push(`/employees/${id}`)
      }
    } catch (err) {
      toast.error(
        getErrorMessage(err, "Could not save employee"),
      )
    } finally {
      setSaving(false)
    }
  }

  const managerOptions = allEmployees
    .filter((e) => e._id !== employeeId)
    .map((e) => ({
      value: e._id,
      label: `${e.preferredName ?? e.firstName} ${e.lastName}`,
    }))

  // Keep the additional-manager list from offering the primary manager.
  const watchedManagerId = form.watch("managerId")

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-6 px-4 lg:px-6"
      >
        <Card>
          <CardHeader>
            <CardTitle>Account & access</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <TextField
              control={form.control}
              name="workEmail"
              label={
                employeeId ? "Work email" : "Work email (sends org invite)"
              }
              type="email"
              placeholder="name@company.com"
            />
            {employeeId && loginUsername && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="account-username">Username</Label>
                <Input
                  id="account-username"
                  value={loginUsername}
                  readOnly
                  disabled
                />
                <p className="text-muted-foreground text-xs">
                  Linked sign-in account — can&apos;t be changed here.
                </p>
              </div>
            )}
            {employeeId && loginEmail && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="account-login-email">Sign-in email</Label>
                <Input
                  id="account-login-email"
                  value={loginEmail}
                  readOnly
                  disabled
                />
                <p className="text-muted-foreground text-xs">
                  The email this person was invited with.
                </p>
              </div>
            )}
            {!employeeId && (
              <TextField
                control={form.control}
                name="username"
                label="Username (adds by account)"
                placeholder="jdoe"
              />
            )}
            {!employeeId && (
              <SelectField
                control={form.control}
                name="role"
                label="Role"
                options={HRMS_ROLES}
              />
            )}
            {!employeeId && (
              <p className="text-muted-foreground col-span-full text-xs">
                Add a person by <strong>work email</strong>, <strong>username</strong>,
                or both — you need at least one. An email sends an org invite they
                accept; a username adds their existing account directly (or links
                automatically once they sign up with it). Their profile is linked
                either way.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Personal</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <TextField
              control={form.control}
              name="employeeNumber"
              label="Employee number"
              placeholder="E-0001"
            />
            <SelectField
              control={form.control}
              name="gender"
              label="Gender"
              includeNone
              options={[
                { value: "male", label: "Male" },
                { value: "female", label: "Female" },
                { value: "other", label: "Other" },
                { value: "undisclosed", label: "Undisclosed" },
              ]}
            />
            <TextField control={form.control} name="firstName" label="First name" />
            <TextField control={form.control} name="lastName" label="Last name" />
            <TextField
              control={form.control}
              name="preferredName"
              label="Preferred name"
            />
            <TextField
              control={form.control}
              name="dob"
              label="Date of birth"
              type="date"
            />
            <TextField
              control={form.control}
              name="nationality"
              label="Nationality"
            />
            <TextField
              control={form.control}
              name="idNumber"
              label="Identification number"
              placeholder="Stored masked"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contact & address</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <TextField
              control={form.control}
              name="personalEmail"
              label="Personal email"
              type="email"
            />
            <TextField control={form.control} name="phone" label="Phone" />
            <TextField
              control={form.control}
              name="addressLine1"
              label="Address line 1"
            />
            <TextField
              control={form.control}
              name="addressLine2"
              label="Address line 2"
            />
            <TextField control={form.control} name="city" label="City" />
            <TextField control={form.control} name="state" label="State" />
            <TextField
              control={form.control}
              name="postalCode"
              label="Postal code"
            />
            <TextField control={form.control} name="country" label="Country" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Emergency contact</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <TextField
              control={form.control}
              name="emergencyName"
              label="Name"
            />
            <TextField
              control={form.control}
              name="emergencyRelationship"
              label="Relationship"
            />
            <TextField
              control={form.control}
              name="emergencyPhone"
              label="Phone"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Employment</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <SelectField
              control={form.control}
              name="employmentType"
              label="Employment type"
              options={EMPLOYMENT_TYPES.map((t) => ({
                value: t,
                label: EMPLOYMENT_TYPE_LABELS[t],
              }))}
            />
            <SelectField
              control={form.control}
              name="status"
              label="Status"
              options={EMPLOYEE_STATUSES.map((s) => ({
                value: s,
                label: STATUS_LABELS[s],
              }))}
            />
            <TextField
              control={form.control}
              name="joinDate"
              label="Join date"
              type="date"
            />
            <TextField
              control={form.control}
              name="confirmationDate"
              label="Confirmation date"
              type="date"
            />
            <TextField
              control={form.control}
              name="probationEndDate"
              label="Probation end date"
              type="date"
            />
            <div className="hidden sm:block" />
            <SelectField
              control={form.control}
              name="departmentId"
              label="Department"
              includeNone
              options={departments.map((d) => ({ value: d._id, label: d.name }))}
            />
            <SelectField
              control={form.control}
              name="teamId"
              label="Team"
              includeNone
              options={teams.map((t) => ({ value: t._id, label: t.name }))}
            />
            <SelectField
              control={form.control}
              name="positionId"
              label="Position"
              includeNone
              options={positions.map((p) => ({ value: p._id, label: p.title }))}
            />
            <SelectField
              control={form.control}
              name="managerId"
              label="Manager"
              includeNone
              options={managerOptions}
            />
            <SelectField
              control={form.control}
              name="officeId"
              label="Office"
              options={offices.map((o) => ({ value: o._id, label: o.name }))}
            />
            <div className="sm:col-span-2">
              <MultiManagerField
                control={form.control}
                options={managerOptions.filter(
                  (o) => o.value !== watchedManagerId,
                )}
              />
            </div>
            {employeeId && (
              <SelectField
                control={form.control}
                name="attendanceRequired"
                label="Attendance"
                options={[
                  { value: "default", label: "Org default" },
                  { value: "required", label: "Required" },
                  { value: "exempt", label: "Not required" },
                ]}
              />
            )}
          </CardContent>
        </Card>

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : employeeId ? "Save changes" : "Create employee"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.back()}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  )
}
