import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// Public routes render without auth. Everything else requires a signed-in user.
// Active-organization enforcement happens in app/(app)/layout.tsx (OrgGuard).
const isPublicRoute = createRouteMatcher([
  '/',
  '/leadmightyhr(.*)', // public marketing page for the HR product
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/boards(.*)', // public job board (careers page)
])

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
