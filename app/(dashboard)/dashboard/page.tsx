// Dashboard Page - Main dashboard showing tracked items overview

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = createClient()

  // Get user's tracked items
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: items } = await supabase
    .from('tracked_items')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5)

  const { data: alerts } = await supabase
    .from('price_alerts')
    .select('*, tracked_items(*)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('triggered_at', { ascending: false })
    .limit(5)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Welcome back!</h2>
        <p className="mt-1 text-gray-600">Here's what's happening with your tracked items</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-blue-600">{items?.length || 0}</div>
          <div className="text-gray-600 mt-1">Tracked Items</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-green-600">{alerts?.length || 0}</div>
          <div className="text-gray-600 mt-1">Active Alerts</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-purple-600">
            {items?.filter(i => i.current_price <= i.alert_threshold).length || 0}
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
          {items && items.length > 0 ? (
            <div className="space-y-3">
              {items.map((item) => (
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
              No items tracked yet. <a href="/dashboard/items" className="text-blue-600 hover:text-blue-700">Add your first item</a>
            </p>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <a href="/dashboard/items" className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow p-6 block transition-colors">
          <h3 className="text-lg font-medium">Manage Items</h3>
          <p className="mt-1 text-blue-100">Add, edit, or remove tracked items</p>
        </a>
        <a href="/dashboard/alerts" className="bg-green-600 hover:bg-green-700 text-white rounded-lg shadow p-6 block transition-colors">
          <h3 className="text-lg font-medium">View Alerts</h3>
          <p className="mt-1 text-green-100">See price drops and manage alerts</p>
        </a>
      </div>
    </div>
  )
}
