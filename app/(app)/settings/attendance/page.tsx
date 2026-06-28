import { PageHeader } from "@/components/shared/page-header"
import { OfficeQrSettings } from "@/features/attendance/components/office-qr-settings"

export default function AttendanceSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Attendance"
        description="Enable QR clock-in and set each office's geofence."
      />
      <OfficeQrSettings />
    </div>
  )
}
