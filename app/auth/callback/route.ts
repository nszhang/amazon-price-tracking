// Auth Callback Route
// Can be used for OAuth callbacks if needed in future
// For now, redirects to dashboard

import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const redirectTo = searchParams.get('redirect_to')?.toString()

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(`${origin}${redirectTo ?? '/dashboard'}`)
}
