// Supabase Client for Server-Side Usage
// This file is for use in Server Components, API routes, and Server Actions

import { createServerComponentClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './types'

export function createClient() {
  const cookieStore = cookies()
  return createServerComponentClient<Database>({ cookies: () => cookieStore })
}

export type { Database }
