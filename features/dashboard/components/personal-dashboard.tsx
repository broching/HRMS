"use client"

import { useCurrentMember } from "@/hooks/use-current-member"
import { ProfileCard } from "./profile-card"
import { HomeTiles } from "./home-tiles"
import { WhoIsAway } from "./who-is-away"

function todayLine(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
}

export function PersonalDashboard() {
  const member = useCurrentMember()
  const firstName = member?.userName?.split(" ")[0]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 px-4 lg:flex-row lg:items-baseline lg:justify-between lg:px-6">
        <h2 className="text-xl font-semibold">
          Welcome back{firstName ? `, ${firstName}!` : "!"}
        </h2>
        <p className="text-muted-foreground text-sm">
          It&apos;s {todayLine()}. Have a wonderful day!
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 px-4 lg:px-6 xl:grid-cols-[320px_minmax(0,1fr)_320px]">
        <ProfileCard />
        <HomeTiles />
        <WhoIsAway />
      </div>
    </div>
  )
}
