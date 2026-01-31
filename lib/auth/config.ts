// NextAuth Configuration
// Replaces Supabase Auth with self-hosted authentication

import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { query } from '@/lib/db/config'

export const authOptions = {
  secret: process.env.NEXTAUTH_SECRET || 'development-secret-change-in-production',
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        console.log('[AUTH] Authorize called with email:', credentials?.email)

        if (!credentials?.email || !credentials?.password) {
          console.log('[AUTH] Missing credentials')
          return null
        }

        try {
          // Find user by email
          console.log('[AUTH] Looking up user:', credentials.email.toLowerCase())
          const result = await query(
            'SELECT id, email, password_hash, full_name, avatar_url FROM users WHERE email = $1',
            [credentials.email.toLowerCase()]
          )

          const user = result.rows[0]

          if (!user) {
            console.log('[AUTH] User not found:', credentials.email.toLowerCase())
            return null
          }

          console.log('[AUTH] User found, verifying password')
          // Verify password
          const isValid = await bcrypt.compare(credentials.password, user.password_hash)

          if (!isValid) {
            console.log('[AUTH] Invalid password for:', credentials.email.toLowerCase())
            return null
          }

          console.log('[AUTH] Authentication successful for:', user.email)
          return {
            id: user.id,
            email: user.email,
            name: user.full_name,
            image: user.avatar_url,
          }
        } catch (error) {
          console.error('[AUTH] Exception during authorization:', error)
          return null
        }
      }
    })
  ],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt' as const,
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, user }: { token: any; user: any }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }: { session: any; token: any }) {
      if (token && session.user) {
        session.user.id = token.id as string
      }
      return session
    }
  },
  events: {
    async signIn({ user }: { user: any }) {
      console.log(`User signed in: ${user.email}`)
    },
    async signOut({ token }: { token: any }) {
      console.log(`User signed out: ${token.email}`)
    }
  }
}
