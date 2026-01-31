// Dashboard Page - Main dashboard showing tracked items overview

import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { ItemsService } from '@/lib/services/database/items-service'
import { AlertsService } from '@/lib/services/database/alerts-service'
import { redirect } from 'next/navigation'

interface TrackedItem {
  id: number
  current_price: number
  alert_threshold: number
  title: string
  asin: string
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    redirect('/login')
  }

  // Get user's tracked items
  const items = await ItemsService.getUserItems(session.user.id)

  // Get active alerts
  const alerts = await AlertsService.getUserAlerts(session.user.id, 'active')

  const typedItems = items as TrackedItem[]

  // Limit to 5 items for display
  const recentItems = typedItems.slice(0, 5)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Welcome back!</h2>
        <p className="mt-1 text-gray-600">Here's what's happening with your tracked items</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-blue-600">{items.length}</div>
          <div className="text-gray-600 mt-1">Tracked Items</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-green-600">{alerts.length}</div>
          <div className="text-gray-600 mt-1">Active Alerts</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-purple-600">
            {items.filter(i => i.current_price <= i.alert_threshold).length}
          </div>
          <div className="text-gray-600 mt-1">Items Below Alert Price</div>
        </div>
      </div>

      {/* Recent Items */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Recently Tracked Items</h3>
        </div>
        <div className="px-6 py-4">
          {recentItems.length > 0 ? (
            <div className="space-y-3">
              {recentItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{item.title}</p>
                    <p className="text-sm text-gray-500">{item.asin}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">${item.current_price?.toFixed(2) || 'N/A'}</p>
                    <p className="text-sm text-gray-500">Alert: ${item.alert_threshold.toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">
              No items tracked yet. <a href="/items" className="text-blue-600 hover:text-blue-700">Add your first item</a>
            </p>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <a href="/items" className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow p-6 block transition-colors">
          <h3 className="text-lg font-medium">Manage Items</h3>
          <p className="mt-1 text-blue-100">Add, edit, or remove tracked items</p>
        </a>
        <a href="/alerts" className="bg-green-600 hover:bg-green-700 text-white rounded-lg shadow p-6 block transition-colors">
          <h3 className="text-lg font-medium">View Alerts</h3>
          <p className="mt-1 text-green-100">See price drops and manage alerts</p>
        </a>
      </div>
    </div>
  )
}
