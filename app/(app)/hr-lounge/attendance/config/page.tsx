import { PageHeader } from "@/components/shared/page-header"
import { RoleGate } from "@/components/shared/role-gate"
import { AttendanceTabs } from "@/features/attendance/components/attendance-tabs"
import { AttendancePolicySettings } from "@/features/attendance/components/attendance-policy-settings"
import { AttendanceRoster } from "@/features/attendance/components/attendance-roster"
import { OfficeQrSettings } from "@/features/attendance/components/office-qr-settings"

export default function AttendanceConfigPage() {
  return (
    <RoleGate permission="attendance:config">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Attendance"
          description="Set who must clock attendance, and each office's QR code and geofence."
        />
        <AttendanceTabs />
        <AttendancePolicySettings />
        <AttendanceRoster />
        <OfficeQrSettings />
      </div>
    </RoleGate>
  )
}
