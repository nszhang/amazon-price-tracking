'use client'

// Price History Chart Component
// Displays price trends over time using Recharts

import { useMemo } from 'react'
import type { PriceHistory } from '@/lib/types'
import { formatPrice, formatDate } from '@/lib/utils/formatters'

interface PriceChartProps {
  history: PriceHistory[]
  currency?: string
}

export function PriceChart({ history, currency = 'USD' }: PriceChartProps) {
  // Transform history data for the chart
  const chartData = useMemo(() => {
    return history
      .filter(h => h.scrape_status === 'success')
      .map(h => ({
        date: formatDate(new Date(h.scraped_at)),
        price: h.price,
        inStock: h.in_stock,
      }))
      .reverse() // Show oldest to newest
  }, [history])

  // Calculate stats
  const stats = useMemo(() => {
    if (chartData.length === 0) return null

    const prices = chartData.map(d => d.price)
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length
    const current = prices[prices.length - 1]

    return { min, max, avg, current }
  }, [chartData])

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
        <p className="text-gray-500">No price history available</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500">Current</p>
            <p className="text-lg font-semibold text-gray-900">{formatPrice(stats.current, currency)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500">Average</p>
            <p className="text-lg font-semibold text-gray-900">{formatPrice(stats.avg, currency)}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <p className="text-xs text-green-600">Lowest</p>
            <p className="text-lg font-semibold text-green-700">{formatPrice(stats.min, currency)}</p>
          </div>
          <div className="bg-red-50 rounded-lg p-3">
            <p className="text-xs text-red-600">Highest</p>
            <p className="text-lg font-semibold text-red-700">{formatPrice(stats.max, currency)}</p>
          </div>
        </div>
      )}

      {/* Simple CSS Chart (fallback if Recharts not available) */}
      <div className="bg-white border rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Price History</h3>
        <div className="relative h-64">
          {/* Y-axis labels */}
          {stats && (
            <div className="absolute left-0 top-0 bottom-0 w-16 flex flex-col justify-between text-xs text-gray-500">
              <span>{formatPrice(stats.max, currency)}</span>
              <span>{formatPrice(stats.min, currency)}</span>
            </div>
          )}

          {/* Chart area */}
          <div className="ml-20 h-full relative">
            {/* Grid lines */}
            <div className="absolute inset-0 flex flex-col justify-between">
              <div className="border-b border-gray-200"></div>
              <div className="border-b border-gray-200"></div>
              <div className="border-b border-gray-200"></div>
              <div className="border-b border-gray-200"></div>
            </div>

            {/* SVG Line Chart */}
            <svg
              className="absolute inset-0 w-full h-full"
              viewBox={`0 0 ${chartData.length * 50} 100`}
              preserveAspectRatio="none"
            >
              {/* Line */}
              <polyline
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2"
                points={chartData.map((d, i) => {
                  if (!stats) return ''
                  const x = (i / (chartData.length - 1)) * (chartData.length * 50)
                  const y = 100 - ((d.price - stats.min) / (stats.max - stats.min || 1)) * 100
                  return `${x},${y}`
                }).join(' ')}
              />

              {/* Data points */}
              {chartData.map((d, i) => {
                if (!stats) return null
                const x = (i / (chartData.length - 1)) * (chartData.length * 50)
                const y = 100 - ((d.price - stats.min) / (stats.max - stats.min || 1)) * 100
                return (
                  <circle
                    key={i}
                    cx={x}
                    cy={y}
                    r="3"
                    fill="#3b82f6"
                    className="hover:r-5 transition-all cursor-pointer"
                  >
                    <title>
                      {d.date}: {formatPrice(d.price, currency)}
                    </title>
                  </circle>
                )
              })}
            </svg>
          </div>
        </div>

        {/* X-axis labels */}
        <div className="ml-20 mt-2 flex justify-between text-xs text-gray-500">
          <span>{chartData[0]?.date}</span>
          <span>{chartData[Math.floor(chartData.length / 2)]?.date}</span>
          <span>{chartData[chartData.length - 1]?.date}</span>
        </div>
      </div>

      {/* Data table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Price</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {chartData.slice(-10).reverse().map((d, i) => (
              <tr key={i}>
                <td className="px-4 py-2 text-sm text-gray-900">{d.date}</td>
                <td className="px-4 py-2 text-sm text-right font-medium text-gray-900">
                  {formatPrice(d.price, currency)}
                </td>
                <td className="px-4 py-2 text-center">
                  {d.inStock ? (
                    <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                      In Stock
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                      Out of Stock
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
