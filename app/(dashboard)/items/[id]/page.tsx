'use client'

// Item Details Page - Shows detailed info and price history for a single item

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PriceChart } from '@/components/charts/PriceChart'
import type { TrackedItem, PriceHistory } from '@/lib/types'
import { formatPrice, formatDistanceToNow } from '@/lib/utils/formatters'

export default function ItemDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()

  const [item, setItem] = useState<TrackedItem | null>(null)
  const [history, setHistory] = useState<PriceHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetchItemDetails()
    fetchPriceHistory()
  }, [params.id])

  const fetchItemDetails = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('tracked_items')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (data) {
      setItem(data as TrackedItem)
    }
    setLoading(false)
  }

  const fetchPriceHistory = async () => {
    const { data, error } = await supabase
      .from('price_history')
      .select('*')
      .eq('item_id', params.id)
      .order('scraped_at', { ascending: false })
      .limit(100)

    if (data) {
      setHistory(data as PriceHistory[])
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

    const { error } = await supabase
      .from('tracked_items')
      .delete()
      .eq('id', params.id)

    if (!error) {
      router.push('/dashboard/items')
    }
  }

  const updateAlertThreshold = async (newThreshold: number) => {
    const { error } = await supabase
      .from('tracked_items')
      .update({ alert_threshold: newThreshold })
      .eq('id', params.id)

    if (!error) {
      fetchItemDetails()
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
        onClick={() => router.push('/dashboard/items')}
        className="text-blue-600 hover:text-blue-700"
      >
        ← Back to Items
      </button>

      {/* Item Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex gap-6">
          {item.image_url && (
            <img
              src={item.image_url}
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
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              >
                View on Amazon
              </a>
              <button
                onClick={deleteItem}
                className="px-4 py-2 border border-red-300 text-red-700 rounded-md hover:bg-red-50"
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
          onChange={(e) => supabase.from('tracked_items').update({ notes: e.target.value }).eq('id', item.id)}
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
