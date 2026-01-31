// Next.js Middleware with NextAuth
// Replaces Supabase middleware for self-hosted setup

import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    // Add user info to headers for server components
    const requestHeaders = new Headers(req.headers)
    if (req.nextauth.token?.id) {
      requestHeaders.set('x-user-id', req.nextauth.token.id as string)
    }

    // Add Content-Security-Policy to upgrade insecure requests
    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    })

    // Set CSP header to upgrade HTTP to HTTPS for images
    response.headers.set(
      'Content-Security-Policy',
      "upgrade-insecure-requests"
    )

    return response
  },
  {
    callbacks: {
      authorized({ req, token }) {
        // Protect dashboard routes
        if (req.nextUrl.pathname.startsWith('/items') ||
            req.nextUrl.pathname.startsWith('/alerts') ||
            req.nextUrl.pathname.startsWith('/settings')) {
          return token !== null
        }
        return true
      },
    },
    pages: {
      signIn: '/login',
    },
  }
)

export const config = {
  matcher: [
    '/items/:path*',
    '/alerts/:path*',
    '/settings/:path*',
  ],
}
