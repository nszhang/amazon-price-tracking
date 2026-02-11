'use client'

// Price History Chart Component
// Displays price trends over time with configurable time range
// X-axis is always date-based: spans the full selected period so gaps are visible

import { useState, useMemo } from 'react'
import type { PriceHistory } from '@/lib/types'
import { formatPrice, formatDate } from '@/lib/utils/formatters'

interface PriceChartProps {
  history: PriceHistory[]
  currency?: string
}

type TimeRange = '1m' | '3m' | 'ytd' | '1y' | '5y' | 'all'

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: 'ytd', label: 'YTD' },
  { value: '1y', label: '1Y' },
  { value: '5y', label: '5Y' },
  { value: 'all', label: 'All' },
]

function getRangeCutoff(range: TimeRange): Date | null {
  if (range === 'all') return null
  const now = new Date()
  if (range === 'ytd') return new Date(now.getFullYear(), 0, 1)
  const months = { '1m': 1, '3m': 3, '1y': 12, '5y': 60 }[range]
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  return cutoff
}

function formatAxisDate(date: Date, range: TimeRange): string {
  const month = date.toLocaleString('en-US', { month: 'short' })
  const year = date.getFullYear()
  if (range === '1m') return `${month} ${date.getDate()}`
  if (range === '3m' || range === 'ytd') return `${month} ${year}`
  return `${month} ${year}`
}

const SVG_WIDTH = 1000

export function PriceChart({ history, currency = 'USD' }: PriceChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('all')

  // All successful history entries, oldest first
  const allData = useMemo(() => {
    return history
      .filter(h => h.scrape_status === 'success')
      .map(h => ({
        date: formatDate(new Date(h.scraped_at)),
        ts: new Date(h.scraped_at).getTime(),
        price: h.price,
        inStock: h.in_stock,
      }))
      .reverse()
  }, [history])

  // Time window: [rangeStart, rangeEnd] in ms
  const { rangeStart, rangeEnd } = useMemo(() => {
    const end = Date.now()
    const cutoff = getRangeCutoff(timeRange)
    if (cutoff) return { rangeStart: cutoff.getTime(), rangeEnd: end }
    // "all": span from first data point to now
    if (allData.length > 0) return { rangeStart: allData[0].ts, rangeEnd: end }
    return { rangeStart: end - 30 * 86400000, rangeEnd: end }
  }, [timeRange, allData])

  // Filtered by selected time range
  const chartData = useMemo(() => {
    return allData.filter(d => d.ts >= rangeStart && d.ts <= rangeEnd)
  }, [allData, rangeStart, rangeEnd])

  // Calculate stats from the visible range
  const stats = useMemo(() => {
    if (chartData.length === 0) return null

    const prices = chartData.map(d => d.price)
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length
    const current = prices[prices.length - 1]
    const yMax = Math.ceil(max * 1.1)

    return { min, max, avg, current, yMax }
  }, [chartData])

  // Map a timestamp to an SVG x coordinate
  const timeSpan = rangeEnd - rangeStart || 1
  const toX = (ts: number) => ((ts - rangeStart) / timeSpan) * SVG_WIDTH

  // X-axis tick labels
  const xTicks = useMemo(() => {
    const ticks: { x: number; label: string }[] = []
    const startDate = new Date(rangeStart)
    const endDate = new Date(rangeEnd)

    ticks.push({ x: 0, label: formatAxisDate(startDate, timeRange) })

    // Add ~3 evenly-spaced intermediate ticks
    for (let i = 1; i <= 3; i++) {
      const t = rangeStart + (timeSpan * i) / 4
      ticks.push({ x: toX(t), label: formatAxisDate(new Date(t), timeRange) })
    }

    ticks.push({ x: SVG_WIDTH, label: formatAxisDate(endDate, timeRange) })
    return ticks
  }, [rangeStart, rangeEnd, timeSpan, timeRange])

  if (allData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
        <p className="text-gray-500">No price history available</p>
      </div>
    )
  }

  // Use stats from visible data for y-axis, or fall back to all-data stats
  const yMax = stats?.yMax ?? Math.ceil(Math.max(...allData.map(d => d.price)) * 1.1)

  return (
    <div className="space-y-4">
      {/* Time Range Selector */}
      <div className="flex items-center gap-1">
        {TIME_RANGES.map(r => (
          <button
            key={r.value}
            onClick={() => setTimeRange(r.value)}
            className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
              timeRange === r.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

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

      {/* Chart */}
      <div className="bg-white border rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Price History</h3>

        <div className="relative h-64">
          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 bottom-0 w-16 flex flex-col justify-between text-xs text-gray-500">
            <span>{formatPrice(yMax, currency)}</span>
            <span>{formatPrice(yMax / 2, currency)}</span>
            <span>{formatPrice(0, currency)}</span>
          </div>

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
              viewBox={`0 0 ${SVG_WIDTH} 100`}
              preserveAspectRatio="none"
            >
              {/* Line */}
              {chartData.length > 1 && (
                <polyline
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                  points={chartData.map(d => {
                    const x = toX(d.ts)
                    const y = 100 - (d.price / yMax) * 100
                    return `${x},${y}`
                  }).join(' ')}
                />
              )}

              {/* Data points */}
              {chartData.map((d, i) => {
                const x = toX(d.ts)
                const y = 100 - (d.price / yMax) * 100
                return (
                  <circle
                    key={i}
                    cx={x}
                    cy={y}
                    r="3"
                    fill="#3b82f6"
                    vectorEffect="non-scaling-stroke"
                    className="cursor-pointer"
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
        <div className="ml-20 mt-2 relative h-4">
          {xTicks.map((tick, i) => (
            <span
              key={i}
              className="absolute text-xs text-gray-500 -translate-x-1/2"
              style={{ left: `${(tick.x / SVG_WIDTH) * 100}%` }}
            >
              {tick.label}
            </span>
          ))}
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
