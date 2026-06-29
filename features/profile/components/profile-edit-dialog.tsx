"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useMutation } from "convex/react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { GENDER_LABELS } from "@/features/employees/lib/labels"

const schema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  preferredName: z.string().optional(),
  dob: z.string().optional(),
  gender: z.string().optional(),
  nationality: z.string().optional(),
  personalEmail: z.string().optional(),
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
})

export type ProfileEditValues = z.infer<typeof schema>

const trim = (s?: string) => {
  const v = s?.trim()
  return v ? v : undefined
}

type Gender = "male" | "female" | "other" | "undisclosed"

export function ProfileEditDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: ProfileEditValues
}) {
  const update = useMutation(api.employees.updateOwnProfile)
  const form = useForm<ProfileEditValues>({
    resolver: zodResolver(schema),
    values: initial,
  })

  async function onSubmit(values: ProfileEditValues) {
    try {
      await update({
        firstName: values.firstName,
        lastName: values.lastName,
        preferredName: trim(values.preferredName),
        dob: trim(values.dob),
        gender: trim(values.gender) as Gender | undefined,
        nationality: trim(values.nationality),
        address: {
          line1: trim(values.addressLine1),
          line2: trim(values.addressLine2),
          city: trim(values.city),
          state: trim(values.state),
          postalCode: trim(values.postalCode),
          country: trim(values.country),
        },
        contact: {
          personalEmail: trim(values.personalEmail),
          phone: trim(values.phone),
        },
        emergencyContacts: trim(values.emergencyName)
          ? [
              {
                name: values.emergencyName!.trim(),
                relationship: trim(values.emergencyRelationship),
                phone: trim(values.emergencyPhone),
              },
            ]
          : [],
      })
      toast.success("Profile updated")
      onOpenChange(false)
    } catch {
      toast.error("Could not save your changes")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>
            Update your personal, contact and emergency details. Your work email
            and job information are managed by HR.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-6"
          >
            <section className="grid gap-4 sm:grid-cols-2">
              <Text form={form} name="firstName" label="First name" />
              <Text form={form} name="lastName" label="Last name" />
              <Text form={form} name="preferredName" label="Preferred name" />
              <Text form={form} name="dob" label="Date of birth" type="date" />
              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gender</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(GENDER_LABELS).map(([k, label]) => (
                          <SelectItem key={k} value={k}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <Text form={form} name="nationality" label="Nationality" />
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-medium">Contact</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Text form={form} name="personalEmail" label="Personal email" />
                <Text form={form} name="phone" label="Phone" />
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-medium">Address</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Text form={form} name="addressLine1" label="Address line 1" />
                <Text form={form} name="addressLine2" label="Address line 2" />
                <Text form={form} name="city" label="City" />
                <Text form={form} name="state" label="State" />
                <Text form={form} name="postalCode" label="Postal code" />
                <Text form={form} name="country" label="Country" />
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-medium">Emergency contact</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <Text form={form} name="emergencyName" label="Name" />
                <Text
                  form={form}
                  name="emergencyRelationship"
                  label="Relationship"
                />
                <Text form={form} name="emergencyPhone" label="Phone" />
              </div>
            </section>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

function Text({
  form,
  name,
  label,
  type,
}: {
  form: ReturnType<typeof useForm<ProfileEditValues>>
  name: keyof ProfileEditValues
  label: string
  type?: string
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input type={type} {...field} value={field.value ?? ""} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
