import { PageHeader } from "@/components/shared/page-header"
import { OfficeQrSettings } from "@/features/attendance/components/office-qr-settings"
import { HrLoungeShell } from "@/features/hr-lounge/components/hr-lounge-shell"

export default function AttendanceSettingsPage() {
  return (
    <HrLoungeShell>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Attendance"
          description="Enable QR clock-in and set each office's geofence."
        />
        <OfficeQrSettings />
      </div>
    </HrLoungeShell>
  )
}
