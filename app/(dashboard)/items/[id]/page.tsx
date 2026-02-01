'use client'

// Item Details Page - Shows detailed info and price history for a single item

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PriceChart } from '@/components/charts/PriceChart'
import type { TrackedItem, PriceHistory } from '@/lib/types'
import { formatPrice, formatDistanceToNow } from '@/lib/utils/formatters'

export default function ItemDetailsPage() {
  const params = useParams()
  const router = useRouter()

  const [item, setItem] = useState<TrackedItem | null>(null)
  const [history, setHistory] = useState<PriceHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetchItemDetails()
    fetchPriceHistory()
  }, [params.id])

  const fetchItemDetails = async () => {
    try {
      const res = await fetch(`/api/items/${params.id}`)
      if (res.ok) {
        const json = await res.json()
        setItem(json.data)
      }
    } catch (error) {
      console.error('Error fetching item:', error)
    }
    setLoading(false)
  }

  const fetchPriceHistory = async () => {
    try {
      const res = await fetch(`/api/items/${params.id}/history`)
      if (res.ok) {
        const json = await res.json()
        setHistory(json.data || [])
      }
    } catch (error) {
      console.error('Error fetching price history:', error)
    }
  }

  const refreshPrice = async () => {
    setRefreshing(true)
    try {
      // Trigger a scrape
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: item?.amazon_url,
          asin: item?.asin,
          domain: item?.amazon_domain,
        }),
      })

      if (response.ok) {
        await fetchItemDetails()
        await fetchPriceHistory()
      }
    } catch (error) {
      console.error('Failed to refresh:', error)
    } finally {
      setRefreshing(false)
    }
  }

  const deleteItem = async () => {
    if (!confirm('Are you sure you want to stop tracking this item?')) return

    try {
      const res = await fetch(`/api/items/${params.id}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        router.push('/items')
      }
    } catch (error) {
      console.error('Failed to delete item:', error)
    }
  }

  const updateAlertThreshold = async (newThreshold: number) => {
    try {
      const res = await fetch(`/api/items/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_threshold: newThreshold })
      })
      if (res.ok) {
        fetchItemDetails()
      }
    } catch (error) {
      console.error('Failed to update threshold:', error)
    }
  }

  const updateNotes = async (notes: string) => {
    try {
      await fetch(`/api/items/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes })
      })
    } catch (error) {
      console.error('Failed to update notes:', error)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
      </div>
    )
  }

  if (!item) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Item not found</p>
      </div>
    )
  }

  const priceChange = item.alert_threshold - item.current_price
  const isBelowThreshold = item.current_price <= item.alert_threshold

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => router.push('/items')}
        className="text-blue-600 hover:text-blue-700"
      >
        ← Back to Items
      </button>

      {/* Item Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex gap-6">
          {item.image_url && (
            <img
              src={item.image_url.replace(/^http:/, 'https:')}
              alt={item.title}
              className="w-48 h-48 object-cover rounded-lg"
            />
          )}
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{item.title}</h1>
            <p className="text-sm text-gray-500 mb-4">ASIN: {item.asin}</p>
            {item.brand && <p className="text-gray-600 mb-4">Brand: {item.brand}</p>}

            <div className="flex items-baseline gap-4 mb-4">
              <span className="text-4xl font-bold text-gray-900">
                {formatPrice(item.current_price, item.currency)}
              </span>
              {isBelowThreshold ? (
                <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                  Below Alert Price!
                </span>
              ) : (
                <span className="text-gray-500">
                  Alert: {formatPrice(item.alert_threshold, item.currency)}
                </span>
              )}
            </div>

            <div className="flex gap-4 text-sm text-gray-500">
              <span>
                Last checked: {item.last_checked_at ? formatDistanceToNow(new Date(item.last_checked_at)) : 'Never'}
              </span>
              <span>•</span>
              <span>
                First tracked: {new Date(item.first_tracked_at).toLocaleDateString()}
              </span>
            </div>

            <div className="mt-4 flex gap-3">
              <button
                onClick={refreshPrice}
                disabled={refreshing}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {refreshing ? 'Refreshing...' : 'Refresh Price'}
              </button>
              <a
                href={item.amazon_url}
                target="_blank"
                rel="noopener noreferrer"
                className="amazon-button"
                style={{
                  '--dark-hover-bg': '#3d4144',
                  '--dark-hover-color': '#ffffff',
                } as React.CSSProperties}
              >
                View on Amazon
              </a>
              <button
                onClick={deleteItem}
                className="remove-button"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Alert Settings */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Alert Settings</h2>
        <div className="flex items-center gap-4">
          <label className="text-sm text-gray-700">Alert me when price drops below:</label>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">$</span>
            <input
              type="number"
              step="0.01"
              value={item.alert_threshold}
              onChange={(e) => updateAlertThreshold(parseFloat(e.target.value) || 0)}
              className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          Current price is {priceChange >= 0 ? '$' + priceChange.toFixed(2) + ' above' : '$' + Math.abs(priceChange).toFixed(2) + ' below'} your alert threshold
        </p>
      </div>

      {/* Notes */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Notes</h2>
        <textarea
          value={item.notes || ''}
          onChange={(e) => updateNotes(e.target.value)}
          placeholder="Add notes about this item..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          rows={3}
        />
      </div>

      {/* Price History */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Price History</h2>
        <PriceChart history={history} currency={item.currency} />
      </div>
    </div>
  )
}
