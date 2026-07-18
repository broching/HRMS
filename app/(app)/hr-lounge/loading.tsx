import { PageLoader } from "@/components/layout/page-loader"

// Keeps the HR Lounge rail (from hr-lounge/layout.tsx) in place while the
// selected module's page streams in, instead of a frozen content area.
export default function HrLoungeLoading() {
  return <PageLoader />
}
