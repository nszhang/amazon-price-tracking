'use client'

// Alerts Page - View and manage price drop alerts

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'

interface Alert {
  id: number
  threshold_price: number
  actual_price: number
  price_drop_percent?: number
  previous_price?: number
  status: 'active' | 'triggered' | 'disabled'
  triggered_at: string
  acknowledged_at?: string
  tracked_items?: {
    title: string
    asin: string
    amazon_url: string
  }
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const { data: session } = useSession()

  useEffect(() => {
    fetchAlerts()
  }, [session])

  const fetchAlerts = async () => {
    if (!(session?.user as any)?.id) {
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/alerts')
      if (res.ok) {
        const json = await res.json()
        setAlerts(json.data || [])
      }
    } catch (error) {
      console.error('Error fetching alerts:', error)
    }
    setLoading(false)
  }

  const acknowledgeAlert = async (alertId: number) => {
    try {
      const res = await fetch('/api/alerts/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId })
      })

      if (res.ok) {
        setAlerts(alerts.map(a =>
          a.id === alertId ? { ...a, status: 'triggered' as const, acknowledged_at: new Date().toISOString() } : a
        ))
      }
    } catch (error) {
      console.error('Error acknowledging alert:', error)
    }
  }

  const activeAlerts = alerts.filter(a => a.status === 'active')
  const triggeredAlerts = alerts.filter(a => a.status === 'triggered')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Price Alerts</h2>
        <p className="mt-1 text-gray-600">View price drops and manage your alerts</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="text-3xl font-bold text-green-600">{activeAlerts.length}</div>
          <div className="text-green-700 mt-1">New Alerts</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
          <div className="text-3xl font-bold text-gray-600">{triggeredAlerts.length}</div>
          <div className="text-gray-700 mt-1">Acknowledged</div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading alerts...</p>
        </div>
      ) : alerts.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <h3 className="mt-2 text-lg font-medium text-gray-900">No alerts yet</h3>
          <p className="mt-1 text-gray-500">You'll see price drop alerts here when items fall below your threshold.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active Alerts */}
          {activeAlerts.length > 0 && (
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">New Alerts</h3>
              <div className="space-y-4">
                {activeAlerts.map((alert) => (
                  <div key={alert.id} className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div>
                          <h4 className="font-medium text-gray-900">{alert.tracked_items?.title || 'Unknown Item'}</h4>
                          <p className="text-sm text-gray-500">{alert.tracked_items?.asin}</p>
                        </div>
                        <div className="mt-4 flex items-center gap-6">
                          <div>
                            <p className="text-sm text-gray-500">Was</p>
                            <p className="text-lg font-semibold text-gray-400 line-through">
                              ${alert.previous_price?.toFixed(2) || alert.threshold_price.toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Now</p>
                            <p className="text-2xl font-bold text-green-600">${alert.actual_price.toFixed(2)}</p>
                          </div>
                          {alert.price_drop_percent && (
                            <div>
                              <p className="text-sm text-gray-500">Drop</p>
                              <p className="text-lg font-semibold text-green-600">
                                {alert.price_drop_percent.toFixed(1)}%
                              </p>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-3">
                          Triggered: {new Date(alert.triggered_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <a
                          href={alert.tracked_items?.amazon_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                        >
                          View on Amazon
                        </a>
                        <button
                          onClick={() => acknowledgeAlert(alert.id)}
                          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800 text-sm"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Triggered Alerts */}
          {triggeredAlerts.length > 0 && (
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Acknowledged</h3>
              <div className="space-y-3">
                {triggeredAlerts.map((alert) => (
                  <div key={alert.id} className="bg-white rounded-lg shadow p-4 opacity-75">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-700">{alert.tracked_items?.title || 'Unknown Item'}</p>
                        <p className="text-sm text-gray-500">
                          Dropped to ${alert.actual_price.toFixed(2)} (was ${alert.previous_price?.toFixed(2)})
                        </p>
                      </div>
                      <p className="text-sm text-gray-400">
                        {alert.acknowledged_at && new Date(alert.acknowledged_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
