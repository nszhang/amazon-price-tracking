// Dashboard Layout - Shared layout for protected dashboard pages

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Amazon Price Tracker</h1>
            <nav className="flex space-x-4">
              <a href="/dashboard" className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Dashboard</a>
              <a href="/items" className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Items</a>
              <a href="/price-movers" className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Price Movers</a>
              <a href="/daily-changes" className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">24h Changes</a>
              <a href="/alerts" className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Alerts</a>
              <a href="/settings" className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Settings</a>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}
