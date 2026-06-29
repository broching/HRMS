"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useQuery, useMutation } from "convex/react"
import { IconUserPlus } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import { useCurrentMember } from "@/hooks/use-current-member"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// "My profile" resolves to the People profile page so every entry point lands
// on the same place. If the caller has no employee record yet, they can
// self-provision one (name only) and are then redirected to fill it in inline.
export function MyProfile() {
  const router = useRouter()
  const card = useQuery(api.employees.homeCard)
  const member = useCurrentMember()
  const createProfile = useMutation(api.employees.updateOwnProfile)

  const [open, setOpen] = React.useState(false)
  const [firstName, setFirstName] = React.useState("")
  const [lastName, setLastName] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  // Prefill the name from the Clerk account once it loads.
  React.useEffect(() => {
    if (member?.userName) {
      const [f, ...rest] = member.userName.split(" ")
      setFirstName((v) => v || f || "")
      setLastName((v) => v || rest.join(" "))
    }
  }, [member?.userName])

  // Redirect to the People profile page once a profile exists.
  React.useEffect(() => {
    if (card?.hasProfile) {
      router.replace(`/employees/${card.employeeId}`)
    }
  }, [card, router])

  if (card === undefined || card.hasProfile) {
    return (
      <div className="px-4 lg:px-6">
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    )
  }

  async function create() {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("First and last name are required.")
      return
    }
    setSaving(true)
    try {
      await createProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      })
      toast.success("Profile created")
      setOpen(false)
      // The homeCard query will update and the redirect effect will fire.
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create profile")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-4 lg:px-6">
      <Card className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <IconUserPlus className="text-primary size-10" stroke={1.5} />
        <div className="space-y-1">
          <p className="text-lg font-medium">Set up your profile</p>
          <p className="text-muted-foreground text-sm">
            Create your profile, then add your personal, contact and emergency
            details. Your job and compensation are managed by HR.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <IconUserPlus className="size-4" />
          Create my profile
        </Button>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create your profile</DialogTitle>
            <DialogDescription>
              Start with your name — you can add the rest afterwards.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={create} disabled={saving}>
              {saving ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
