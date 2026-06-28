import { PageHeader } from "@/components/shared/page-header"
import { ClockCard } from "@/features/attendance/components/clock-card"
import { AttendanceHistory } from "@/features/attendance/components/attendance-history"

export default function AttendancePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Attendance"
        description="Scan the office QR code to clock in and out."
      />
      <ClockCard />
      <AttendanceHistory />
    </div>
  )
}
