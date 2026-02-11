'use client'

// Price Movers Page - Shows items with the biggest % price change in a given period

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface PriceMover {
  item_id: number
  asin: string
  title: string
  brand?: string
  category?: string
  image_url?: string
  current_price: number
  currency: string
  amazon_url: string
  amazon_domain: string
  start_price: number
  end_price: number
  change_percent: number
}

type PeriodOption = '1' | '3' | '7' | '14' | '30' | '90'

const PERIODS: { value: PeriodOption; label: string }[] = [
  { value: '1', label: '24 Hours' },
  { value: '3', label: '3 Days' },
  { value: '7', label: '7 Days' },
  { value: '14', label: '14 Days' },
  { value: '30', label: '30 Days' },
  { value: '90', label: '90 Days' },
]

export default function PriceMoversPage() {
  const router = useRouter()
  const [movers, setMovers] = useState<PriceMover[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<PeriodOption>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('priceMoversperiod') as PeriodOption) || '7'
    }
    return '7'
  })
  const [filter, setFilter] = useState<'all' | 'drops' | 'increases'>('all')

  useEffect(() => {
    localStorage.setItem('priceMoversperiod', period)
    fetchMovers()
  }, [period])

  const fetchMovers = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/items/price-movers?days=${period}`)
      if (res.ok) {
        const json = await res.json()
        setMovers(json.data || [])
      }
    } catch (error) {
      console.error('Error fetching price movers:', error)
    }
    setLoading(false)
  }

  const filtered = movers.filter(m => {
    if (filter === 'drops') return m.change_percent < 0
    if (filter === 'increases') return m.change_percent > 0
    return true
  })

  const drops = movers.filter(m => m.change_percent < 0)
  const increases = movers.filter(m => m.change_percent > 0)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Price Movers</h2>
        <p className="mt-1 text-gray-600">Items with the biggest price changes over a selected period</p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Period selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Time Period</label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as PeriodOption)}
              className="px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
            >
              {PERIODS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Show</label>
            <div className="flex rounded-md border border-gray-300 overflow-hidden">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  filter === 'all'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                All ({movers.length})
              </button>
              <button
                onClick={() => setFilter('drops')}
                className={`px-4 py-2 text-sm font-medium transition-colors border-l border-gray-300 ${
                  filter === 'drops'
                    ? 'bg-green-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Drops ({drops.length})
              </button>
              <button
                onClick={() => setFilter('increases')}
                className={`px-4 py-2 text-sm font-medium transition-colors border-l border-gray-300 ${
                  filter === 'increases'
                    ? 'bg-red-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Increases ({increases.length})
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading price movers...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          <h3 className="mt-2 text-lg font-medium text-gray-900">No price changes</h3>
          <p className="mt-1 text-gray-500">
            No items had price changes in the last {PERIODS.find(p => p.value === period)?.label.toLowerCase() || period + ' days'}.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((mover) => {
            const isDropped = mover.change_percent < 0
            return (
              <div
                key={mover.item_id}
                onClick={() => router.push(`/items/${mover.item_id}`)}
                className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow duration-200 cursor-pointer overflow-hidden"
              >
                <div className="flex items-center p-4 gap-4">
                  {/* Image */}
                  {mover.image_url ? (
                    <img
                      src={mover.image_url.replace(/^http:/, 'https:')}
                      alt={mover.title}
                      className="w-16 h-16 object-cover rounded-md flex-shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-gray-100 rounded-md flex items-center justify-center flex-shrink-0">
                      <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-900 truncate">{mover.title}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      {mover.brand && <span className="text-sm text-gray-500">{mover.brand}</span>}
                      {mover.category && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {mover.category}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">{mover.asin}</span>
                    </div>
                  </div>

                  {/* Price change */}
                  <div className="flex-shrink-0 text-right">
                    <div className="flex items-center gap-3">
                      <div className="text-sm text-gray-500">
                        <span className="line-through">${mover.start_price.toFixed(2)}</span>
                      </div>
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                      <div className="text-lg font-bold text-gray-900">
                        ${mover.end_price.toFixed(2)}
                      </div>
                    </div>
                    <div className={`mt-1 inline-flex items-center gap-1 text-sm font-semibold px-2 py-0.5 rounded-full ${
                      isDropped
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      <svg className={`w-3 h-3 ${isDropped ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                      {Math.abs(mover.change_percent).toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
