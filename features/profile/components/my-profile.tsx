"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import { IconUserPlus } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import { useCurrentMember } from "@/hooks/use-current-member"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ProfileView } from "./profile-view"
import { ProfileEditDialog } from "./profile-edit-dialog"

const EMPTY = {
  firstName: "",
  lastName: "",
  preferredName: "",
  dob: "",
  gender: "",
  nationality: "",
  personalEmail: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
  emergencyName: "",
  emergencyRelationship: "",
  emergencyPhone: "",
}

export function MyProfile() {
  const card = useQuery(api.employees.homeCard)
  const member = useCurrentMember()
  const [creating, setCreating] = React.useState(false)

  if (card === undefined) {
    return (
      <div className="px-4 lg:px-6">
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    )
  }

  if (card.hasProfile) {
    return <ProfileView employeeId={card.employeeId} mode="self" />
  }

  // Self-provisioning: anyone can create their own profile.
  const [first, ...rest] = (member?.userName ?? "").split(" ")
  const initial = {
    ...EMPTY,
    firstName: first ?? "",
    lastName: rest.join(" "),
  }

  return (
    <div className="px-4 lg:px-6">
      <Card className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <IconUserPlus className="text-primary size-10" stroke={1.5} />
        <div className="space-y-1">
          <p className="text-lg font-medium">Set up your profile</p>
          <p className="text-muted-foreground text-sm">
            Add your personal, contact and emergency details. Your job and
            compensation are managed by HR.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <IconUserPlus className="size-4" />
          Create my profile
        </Button>
      </Card>

      <ProfileEditDialog
        open={creating}
        onOpenChange={setCreating}
        initial={initial}
      />
    </div>
  )
}
