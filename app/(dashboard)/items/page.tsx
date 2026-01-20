'use client'

// Items Management Page - Add and manage tracked items

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AmazonParser } from '@/lib/utils/amazon-parser'
import { useRouter } from 'next/navigation'

interface TrackedItem {
  id: number
  asin: string
  title: string
  current_price: number
  alert_threshold: number
  amazon_url: string
  image_url?: string
  last_checked_at?: string
  created_at: string
}

export default function ItemsPage() {
  const router = useRouter()
  const [items, setItems] = useState<TrackedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const supabase = createClient()

  // Fetch items on mount
  const fetchItems = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('tracked_items')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (data) {
      setItems(data)
    }
    setLoading(false)
  }

  // Add new item
  const addItem = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdding(true)
    setError('')
    setSuccess('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Parse input
      const parsed = AmazonParser.parseInput(url)
      if (!parsed) {
        throw new Error('Invalid Amazon URL, ASIN, or ISBN')
      }

      // Build URL if needed
      const amazonUrl = parsed.type === 'url'
        ? parsed.value
        : AmazonParser.buildAmazonURL(parsed.value, parsed.domain)

      // Check if item already exists
      const { data: existing } = await supabase
        .from('tracked_items')
        .select('id')
        .eq('asin', parsed.value)
        .single()

      if (existing) {
        throw new Error('Item is already being tracked')
      }

      // For now, create a placeholder entry
      // In production, you'd scrape the product details first
      const { error: insertError } = await supabase
        .from('tracked_items')
        .insert({
          user_id: user.id,
          asin: parsed.value,
          amazon_url: amazonUrl,
          amazon_domain: parsed.domain,
          title: 'Loading...', // Will be updated by scraper
          current_price: 0,
          alert_threshold: 0, // User can set this later
          alert_enabled: true,
        })

      if (insertError) throw insertError

      setSuccess('Item added successfully! Refresh to see updates.')
      setUrl('')
      fetchItems()
    } catch (err: any) {
      setError(err.message || 'Failed to add item')
    } finally {
      setAdding(false)
    }
  }

  // Delete item
  const deleteItem = async (id: number) => {
    if (!confirm('Are you sure you want to stop tracking this item?')) return

    const { error } = await supabase
      .from('tracked_items')
      .delete()
      .eq('id', id)

    if (error) {
      setError('Failed to delete item')
    } else {
      setItems(items.filter(i => i.id !== id))
    }
  }

  // Fetch items on mount
  useEffect(() => {
    fetchItems()
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Tracked Items</h2>
        <p className="mt-1 text-gray-600">Add Amazon items to track their prices</p>
      </div>

      {/* Add Item Form */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Add New Item</h3>
        <form onSubmit={addItem} className="flex gap-3">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste Amazon URL, ASIN, or ISBN..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            disabled={adding}
            required
          />
          <button
            type="submit"
            disabled={adding}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {adding ? 'Adding...' : 'Add Item'}
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {success && <p className="mt-2 text-sm text-green-600">{success}</p>}
      </div>

      {/* Items List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading items...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          <h3 className="mt-2 text-lg font-medium text-gray-900">No items tracked</h3>
          <p className="mt-1 text-gray-500">Get started by adding an Amazon product to track.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item, index) => (
            <div
              key={item.id}
              className="bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition-shadow duration-200 cursor-pointer"
              onClick={() => router.push(`/dashboard/items/${item.id}`)}
            >
              {item.image_url && (
                <img src={item.image_url} alt={item.title} className="w-full h-48 object-cover" />
              )}
              <div className="p-4">
                <h4 className="font-medium text-gray-900 line-clamp-2">{item.title}</h4>
                <p className="text-sm text-gray-500 mt-1">{item.asin}</p>
                <div className="mt-4 flex justify-between items-baseline">
                  <div>
                    <p className="text-2xl font-bold text-gray-900">${item.current_price.toFixed(2)}</p>
                    <p className="text-sm text-gray-500">Alert: ${item.alert_threshold.toFixed(2)}</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteItem(item.id)
                    }}
                    className="text-red-600 hover:text-red-700 text-sm"
                  >
                    Remove
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Last checked: {item.last_checked_at ? new Date(item.last_checked_at).toLocaleDateString() : 'Never'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
