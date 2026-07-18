import { PageLoader } from "@/components/layout/page-loader"

// Shown inside the persistent app chrome (top nav + section sidebar/sub-nav)
// while a page's server component streams in on navigation.
export default function AppLoading() {
  return <PageLoader />
}
