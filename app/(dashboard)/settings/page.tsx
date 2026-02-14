'use client'

// Settings Page - User profile and preferences

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useTheme } from 'next-themes'
import type { AmazonDomain, Theme } from '@/lib/types'

const AMAZON_DOMAINS: { value: AmazonDomain; name: string; flag: string }[] = [
  { value: 'com', name: 'United States', flag: '🇺🇸' },
  { value: 'ca', name: 'Canada', flag: '🇨🇦' },
  { value: 'co.uk', name: 'United Kingdom', flag: '🇬🇧' },
  { value: 'de', name: 'Germany', flag: '🇩🇪' },
  { value: 'fr', name: 'France', flag: '🇫🇷' },
  { value: 'es', name: 'Spain', flag: '🇪🇸' },
  { value: 'it', name: 'Italy', flag: '🇮🇹' },
  { value: 'co.jp', name: 'Japan', flag: '🇯🇵' },
]

const THEMES: { value: Theme; name: string; icon: string }[] = [
  { value: 'light', name: 'Light', icon: '☀️' },
  { value: 'dark', name: 'Dark', icon: '🌙' },
  { value: 'system', name: 'System', icon: '💻' },
]

export default function SettingsPage() {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [alertEmail, setAlertEmail] = useState('')
  const [defaultDomain, setDefaultDomain] = useState<AmazonDomain>('com')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [mounted, setMounted] = useState(false)

  const { data: session, status } = useSession()
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'unauthenticated') {
      router.push('/login')
      return
    }
    fetchProfile()
  }, [status])

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/user/profile')
      if (res.ok) {
        const json = await res.json()
        setEmail(json.data.email || '')
        setFullName(json.data.full_name || '')
        setAlertEmail(json.data.alert_email || '')
        setDefaultDomain(json.data.preferences?.default_amazon_domain || 'com')
        // Set theme from profile (only if different from current theme to avoid flicker)
        if (json.data.theme && theme !== json.data.theme) {
          setTheme(json.data.theme)
        }
      }
    } catch (error) {
      console.error('Error fetching profile:', error)
    }
    setLoading(false)
  }

  // Custom theme handler that manually applies the class
  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme)
    // Manually apply the class to html element for immediate effect
    const root = document.documentElement
    if (newTheme === 'system') {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      if (systemDark) {
        root.classList.add('dark')
      } else {
        root.classList.remove('dark')
      }
    } else if (newTheme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')

    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          alert_email: alertEmail || null,
          theme: theme,
          preferences: {
            default_amazon_domain: defaultDomain,
          },
        }),
      })

      if (res.ok) {
        setMessage('Profile saved successfully!')
      } else {
        const data = await res.json()
        setMessage('Error saving profile: ' + (data.error || 'Unknown error'))
      }
    } catch (error) {
      setMessage('Error saving profile: ' + (error as any).message)
    }

    setSaving(false)
  }

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/login' })
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100 mx-auto"></div>
      </div>
    )
  }

  // Don't render theme-dependent UI until mounted to avoid hydration mismatch
  if (!mounted) {
    return (
      <div className="max-w-2xl">
        <div className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Settings</h2>
            <p className="mt-1 text-gray-600">Manage your account settings and preferences</p>
          </div>
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Settings</h2>
          <p className="mt-1 text-gray-600 dark:text-gray-400">Manage your account settings and preferences</p>
        </div>

        {/* Appearance */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Appearance</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Customize how the app looks</p>
          </div>
          <div className="p-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Theme</label>
            <div className="flex gap-3 mb-4">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => handleThemeChange(t.value)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                    theme === t.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <span className="text-xl">{t.icon}</span>
                  <span className="font-medium">{t.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Amazon Preferences */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Amazon Preferences</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Set your default Amazon marketplace</p>
          </div>
          <div className="p-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Default Country</label>
            <select
              value={defaultDomain}
              onChange={(e) => setDefaultDomain(e.target.value as AmazonDomain)}
              className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
            >
              {AMAZON_DOMAINS.map((domain) => (
                <option key={domain.value} value={domain.value}>
                  {domain.flag} {domain.name} (amazon.{domain.value})
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              This will be the default marketplace when adding new items
            </p>
          </div>
        </div>

        {/* Profile */}
        <form onSubmit={saveProfile} className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Profile</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Update your personal information</p>
          </div>
          <div className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
              <input
                type="email"
                value={email}
                disabled
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Contact support to change your email</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Alert Email (Optional)</label>
              <input
                type="email"
                value={alertEmail}
                onChange={(e) => setAlertEmail(e.target.value)}
                placeholder="Send alerts to a different email"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Leave blank to use your account email</p>
            </div>

            {message && (
              <p className={`text-sm ${message.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>
                {message}
              </p>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <button
            onClick={handleSignOut}
            className="px-4 py-2 border border-red-300 text-red-700 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}
