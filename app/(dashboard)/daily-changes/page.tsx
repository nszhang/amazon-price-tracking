'use client'

// Daily Price Changes Page - Shows price changes in the last 24 hours
// Split into increases and decreases, ordered by percentage change

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface PriceChange {
  item_id: number
  asin: string
  title: string
  brand?: string
  category?: string
  image_url?: string
  current_price: number
  currency: string
  amazon_url: string
  start_price: number
  end_price: number
  change_percent: number
}

export default function DailyChangesPage() {
  const router = useRouter()
  const [changes, setChanges] = useState<PriceChange[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchChanges()
  }, [])

  const fetchChanges = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/items/price-movers?days=1&limit=100')
      if (res.ok) {
        const json = await res.json()
        setChanges(json.data || [])
      }
    } catch (error) {
      console.error('Error fetching daily changes:', error)
    }
    setLoading(false)
  }

  // Split and sort by absolute percentage (highest first)
  const decreases = changes
    .filter(c => c.change_percent < 0)
    .sort((a, b) => a.change_percent - b.change_percent) // Most negative first

  const increases = changes
    .filter(c => c.change_percent > 0)
    .sort((a, b) => b.change_percent - a.change_percent) // Most positive first

  const getCurrencySymbol = (currency: string) => {
    return currency === 'USD' ? '$' : currency === 'CAD' ? 'C$' : currency + ' '
  }

  const PriceChangeCard = ({ item, isDecrease }: { item: PriceChange; isDecrease: boolean }) => {
    const symbol = getCurrencySymbol(item.currency)
    return (
      <div
        onClick={() => router.push(`/items/${item.item_id}`)}
        className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow duration-200 cursor-pointer overflow-hidden"
      >
        <div className="flex items-center p-4 gap-4">
          {/* Image */}
          {item.image_url ? (
            <img
              src={item.image_url.replace(/^http:/, 'https:')}
              alt={item.title}
              className="w-14 h-14 object-cover rounded-md flex-shrink-0"
            />
          ) : (
            <div className="w-14 h-14 bg-gray-100 dark:bg-gray-700 rounded-md flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-gray-900 dark:text-gray-100 truncate text-sm">{item.title}</h4>
            <div className="flex items-center gap-2 mt-1">
              {item.brand && <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[120px]">{item.brand}</span>}
              <span className="text-xs text-gray-400 dark:text-gray-500">{item.asin}</span>
            </div>
          </div>

          {/* Price change */}
          <div className="flex-shrink-0 text-right">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400 dark:text-gray-500 line-through">
                {symbol}{item.start_price.toFixed(2)}
              </span>
              <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
              <span className="text-base font-bold text-gray-900 dark:text-gray-100">
                {symbol}{item.end_price.toFixed(2)}
              </span>
            </div>
            <div className={`mt-1 inline-flex items-center gap-1 text-sm font-semibold px-2 py-0.5 rounded-full ${
              isDecrease
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
            }`}>
              <svg className={`w-3 h-3 ${isDecrease ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
              {Math.abs(item.change_percent).toFixed(1)}%
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Daily Price Changes</h2>
          <p className="mt-1 text-gray-600 dark:text-gray-400">Price movements in the last 24 hours</p>
        </div>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading price changes...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Daily Price Changes</h2>
          <p className="mt-1 text-gray-600 dark:text-gray-400">Price movements in the last 24 hours</p>
        </div>
        <button
          onClick={fetchChanges}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          Refresh
        </button>
      </div>

      {changes.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <h3 className="mt-2 text-lg font-medium text-gray-900 dark:text-gray-100">No price changes</h3>
          <p className="mt-1 text-gray-500 dark:text-gray-400">
            No items had price changes in the last 24 hours.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Price Drops */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Price Drops
                <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">({decreases.length})</span>
              </h3>
            </div>

            {decreases.length === 0 ? (
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-6 text-center border border-gray-200 dark:border-gray-700">
                <p className="text-gray-500 dark:text-gray-400 text-sm">No price drops in the last 24 hours</p>
              </div>
            ) : (
              <div className="space-y-3">
                {decreases.map((item) => (
                  <PriceChangeCard key={item.item_id} item={item} isDecrease={true} />
                ))}
              </div>
            )}
          </div>

          {/* Price Increases */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Price Increases
                <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">({increases.length})</span>
              </h3>
            </div>

            {increases.length === 0 ? (
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-6 text-center border border-gray-200 dark:border-gray-700">
                <p className="text-gray-500 dark:text-gray-400 text-sm">No price increases in the last 24 hours</p>
              </div>
            ) : (
              <div className="space-y-3">
                {increases.map((item) => (
                  <PriceChangeCard key={item.item_id} item={item} isDecrease={false} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
