import { PageHeader } from "@/components/shared/page-header"
import { AttendancePolicySettings } from "@/features/attendance/components/attendance-policy-settings"
import { AttendanceRoster } from "@/features/attendance/components/attendance-roster"
import { OfficeQrSettings } from "@/features/attendance/components/office-qr-settings"
import { HrLoungeShell } from "@/features/hr-lounge/components/hr-lounge-shell"

export default function AttendanceSettingsPage() {
  return (
    <HrLoungeShell>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Attendance"
          description="Set who must clock attendance, and each office's QR code and geofence."
        />
        <AttendancePolicySettings />
        <AttendanceRoster />
        <OfficeQrSettings />
      </div>
    </HrLoungeShell>
  )
}
