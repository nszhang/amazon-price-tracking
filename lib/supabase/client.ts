// Supabase Client for Client-Side Usage
// This file is safe to import in client components ('use client')

import { createClientComponentClient } from '@supabase/ssr'
import type { Database } from './types'

// Create a singleton client for use in client components
let supabaseClient: ReturnType<typeof createClientComponentClient<Database>> | null = null

export function createClient() {
  if (!supabaseClient) {
    supabaseClient = createClientComponentClient<Database>()
  }
  return supabaseClient
}

// Type export for convenience
export type { Database }
