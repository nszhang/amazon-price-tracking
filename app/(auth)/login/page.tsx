'use client'

// Login Page - Email/password authentication with NextAuth
// Replaces Supabase Auth with self-hosted NextAuth.js

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

type AuthMode = 'login' | 'signup'

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      if (mode === 'signup') {
        // Register new user
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, full_name: fullName }),
        })

        const data = await response.json()

        if (!response.ok) {
          setMessage(data.error || 'Failed to create account')
          setLoading(false)
          return
        }

        setMessage('Account created! Please sign in.')
        setMode('login')
        setLoading(false)
        return
      }

      // Sign in with NextAuth
      console.log('[LOGIN] Attempting sign in for:', email)
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      console.log('[LOGIN] Sign in result:', result)

      if (result?.error) {
        console.error('[LOGIN] Sign in error:', result.error)
        setMessage(`Sign in failed: ${result.error}`)
      } else if (result?.ok) {
        console.log('[LOGIN] Sign in successful, redirecting to items')
        console.log('[LOGIN] Session data:', result)
        setMessage('Sign in successful! Redirecting...')
        // Try direct navigation without setTimeout
        try {
          console.log('[LOGIN] Attempting router.push to /items')
          await router.push('/items')
          console.log('[LOGIN] router.push completed, now refreshing')
          router.refresh()
        } catch (pushError) {
          console.error('[LOGIN] Router push error:', pushError)
          setMessage(`Redirect error: ${pushError instanceof Error ? pushError.message : String(pushError)}`)
        }
      } else {
        console.error('[LOGIN] Unknown sign in result:', result)
        setMessage('Unexpected response from server')
      }
    } catch (error) {
      console.error('[LOGIN] Exception during sign in:', error)
      setMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {mode === 'login' ? 'Sign in to your account' : 'Create your account'}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Amazon Price Tracker - Track prices and get alerts
          </p>
        </div>

        <div className="mt-8 space-y-6">
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="rounded-md shadow-sm -space-y-px">
              {mode === 'signup' && (
                <div>
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    autoComplete="name"
                    required={mode === 'signup'}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    disabled={loading}
                    className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                    placeholder="Full name (optional)"
                  />
                </div>
              )}
              <div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  className={`appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm ${mode === 'signup' ? '' : 'rounded-t-md'}`}
                  placeholder="Email address"
                />
              </div>
              <div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  minLength={6}
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                  placeholder="Password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Sign up'}
            </button>
          </form>

          {message && (
            <div className={`text-sm text-center ${message.includes('error') || message.includes('invalid') || message.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>
              {message}
            </div>
          )}

          <div className="text-center">
            <button
              type="button"
              onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
              disabled={loading}
              className="text-sm text-blue-600 hover:text-blue-500 disabled:opacity-50"
            >
              {mode === 'login'
                ? "Don't have an account? Sign up"
                : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
