// NextAuth API Route
// Handles authentication endpoints

import NextAuth from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
