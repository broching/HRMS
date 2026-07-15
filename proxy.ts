import { clerkMiddleware } from '@clerk/nextjs/server'

// No auth checks run here. Per Clerk's guidance, `auth.protect()` must NOT live
// in middleware: on a Clerk dev instance the short-lived session token expires
// while the browser is away on an external site (e.g. the Stripe billing
// portal), and the return navigation carries no `__clerk_db_jwt`, so the
// middleware sees "signed-out" and `redirectToSignIn()` sends the user into an
// infinite sign-in redirect loop. Instead, protection is enforced at the
// resource level: app/(app)/layout.tsx (signed-in + active org) and
// app/super-admin/layout.tsx (signed-in), with every data read authorized
// server-side in Convex. Middleware still runs the Clerk session handshake for
// every matched route.
export default clerkMiddleware()

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
    // Always run for Clerk-specific frontend API routes (session handshake)
    '/__clerk/(.*)',
  ],
}
