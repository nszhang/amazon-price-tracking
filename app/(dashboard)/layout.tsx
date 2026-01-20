// Dashboard Layout - Shared layout for protected dashboard pages

import { ProtectedRoute } from '@/components/auth/ProtectedRoute'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold text-gray-900">Amazon Price Tracker</h1>
              <nav className="flex space-x-4">
                <a href="/dashboard" className="text-gray-700 hover:text-gray-900">Dashboard</a>
                <a href="/dashboard/items" className="text-gray-700 hover:text-gray-900">Items</a>
                <a href="/dashboard/alerts" className="text-gray-700 hover:text-gray-900">Alerts</a>
                <a href="/dashboard/settings" className="text-gray-700 hover:text-gray-900">Settings</a>
              </nav>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </div>
    </ProtectedRoute>
  )
}
