'use client'

// Items Management Page - Add and manage tracked items

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'

interface TrackedItem {
  id: number
  asin: string
  isbn?: string
  title: string
  current_price: number
  alert_threshold: number
  amazon_url: string
  image_url?: string
  category?: string
  last_checked_at?: string
  created_at: string
}

const AMAZON_DOMAINS = [
  { value: 'ca', name: 'Canada', flag: '🇨🇦' },
  { value: 'com', name: 'United States', flag: '🇺🇸' },
  { value: 'co.uk', name: 'United Kingdom', flag: '🇬🇧' },
  { value: 'de', name: 'Germany', flag: '🇩🇪' },
  { value: 'fr', name: 'France', flag: '🇫🇷' },
  { value: 'es', name: 'Spain', flag: '🇪🇸' },
  { value: 'it', name: 'Italy', flag: '🇮🇹' },
  { value: 'co.jp', name: 'Japan', flag: '🇯🇵' },
] as const

type CategoryFilter = 'all' | 'Book' | 'Non-Book'
type SortOption = 'newest' | 'price-low' | 'price-high' | 'name'

export default function ItemsPage() {
  const router = useRouter()
  const [items, setItems] = useState<TrackedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [url, setUrl] = useState('')
  const [domain, setDomain] = useState('ca') // Default to Canada
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Search and filter state
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [sortBy, setSortBy] = useState<SortOption>('newest')
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())

  // Fetch items on mount
  const fetchItems = async (searchQuery?: string) => {
    setLoading(true)
    try {
      const url = searchQuery
        ? `/api/items?search=${encodeURIComponent(searchQuery)}`
        : '/api/items'
      const res = await fetch(url)
      if (res.ok) {
        const json = await res.json()
        setItems(json.data || [])
      }
    } catch (error) {
      console.error('Error fetching items:', error)
    }
    setLoading(false)
  }

  // Filter and sort items
  const filteredAndSortedItems = useMemo(() => {
    let filtered = [...items]

    // Apply category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(item => item.category === categoryFilter)
    }

    // Apply search filter (client-side for additional filtering)
    if (search) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter(item =>
        item.title.toLowerCase().includes(searchLower) ||
        item.asin.toLowerCase().includes(searchLower) ||
        item.isbn?.toLowerCase().includes(searchLower)
      )
    }

    // Apply sorting
    switch (sortBy) {
      case 'newest':
        filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        break
      case 'price-low':
        filtered.sort((a, b) => a.current_price - b.current_price)
        break
      case 'price-high':
        filtered.sort((a, b) => b.current_price - a.current_price)
        break
      case 'name':
        filtered.sort((a, b) => a.title.localeCompare(b.title))
        break
    }

    return filtered
  }, [items, categoryFilter, search, sortBy])

  // Group items by category
  const groupedItems = useMemo(() => {
    const groups: Record<string, TrackedItem[]> = {
      'Book': [],
      'Non-Book': [],
      'Uncategorized': []
    }

    filteredAndSortedItems.forEach(item => {
      const category = item.category || 'Uncategorized'
      if (!groups[category]) {
        groups[category] = []
      }
      groups[category].push(item)
    })

    return groups
  }, [filteredAndSortedItems])

  // Toggle collapsed state for a category
  const toggleSection = (category: string) => {
    setCollapsedSections(prev => {
      const newSet = new Set(prev)
      if (newSet.has(category)) {
        newSet.delete(category)
      } else {
        newSet.add(category)
      }
      return newSet
    })
  }

  // Toggle all sections
  const toggleAllSections = () => {
    const categories = Object.keys(groupedItems).filter(c => groupedItems[c].length > 0)
    if (collapsedSections.size === categories.length) {
      setCollapsedSections(new Set())
    } else {
      setCollapsedSections(new Set(categories))
    }
  }

  // Debounced search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchItems(search)
    }, 300)
    return () => clearTimeout(timeoutId)
  }, [search])

  // Add new item
  const addItem = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdding(true)
    setError('')
    setSuccess('')

    try {
      // Clean input: remove dashes and spaces
      const cleanedInput = url.trim().replace(/-/g, '').replace(/\s/g, '')

      // Parse input to get ASIN or ISBN from URL
      const asinMatch = url.match(/\/([A-Z0-9]{10})(?:\/|[?]|$)/)
      const isbnMatch = url.match(/\/([0-9]{10,13})(?:\/|[?]|$)/)
      const identifier = asinMatch ? asinMatch[1] : cleanedInput

      // Accept ASIN (10 alphanumeric chars) or ISBN-10/ISBN-13 (10-13 digits)
      const isValidAsin = /^[A-Z0-9]{10}$/i.test(identifier)
      const isValidIsbn10 = /^[0-9]{9}[0-9X]$/i.test(identifier)
      const isValidIsbn13 = /^[0-9]{13}$/.test(identifier)

      if (!identifier || (!isValidAsin && !isValidIsbn10 && !isValidIsbn13)) {
        throw new Error('Invalid format. Enter an Amazon product URL, ASIN (10 chars like B08N5KWB9H), or ISBN (10-13 digits, dashes allowed)')
      }

      // Build Amazon URL (use selected domain)
      const amazonUrl = url.startsWith('http') ? url : `https://www.amazon.${domain}/dp/${identifier}`

      // Determine ASIN and ISBN values
      // For ISBN-13, use first 10 chars as ASIN, store full value as ISBN
      // For ASIN or ISBN-10, use as-is for ASIN field
      let asinValue: string
      let isbnValue: string | undefined

      if (isValidAsin || isValidIsbn10) {
        asinValue = identifier
        isbnValue = isValidIsbn10 ? identifier : undefined
      } else {
        // ISBN-13: use first 10 chars as ASIN, store full as ISBN
        asinValue = identifier.substring(0, 10)
        isbnValue = identifier
      }

      // Create item via API
      const response = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asin: asinValue,
          isbn: isbnValue,
          amazon_url: amazonUrl,
          amazon_domain: `www.amazon.${domain}`,
          title: 'Loading...',
          alert_threshold: 0,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add item')
      }

      setSuccess('Item added! Fetching product details from Amazon...')

      // Immediately scrape product info
      try {
        console.log('[ADD ITEM] Triggering scrape for:', asinValue, 'on domain:', domain)
        const scrapeResponse = await fetch('/api/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: amazonUrl,
            asin: asinValue,
            domain: domain,
          }),
        })

        if (scrapeResponse.ok) {
          console.log('[ADD ITEM] Scrape successful')
          setSuccess('Item added! Product details fetched.')
        } else {
          console.warn('[ADD ITEM] Scrape failed:', await scrapeResponse.text())
          setSuccess('Item added! Could not fetch details (will retry later).')
        }
      } catch (scrapeError) {
        console.error('[ADD ITEM] Scrape error:', scrapeError)
        setSuccess('Item added! Could not fetch details (will retry later).')
      }

      setUrl('')
      // Wait a moment for the scrape to complete before refreshing
      setTimeout(() => fetchItems(search), 2000)
    } catch (err: any) {
      setError(err.message || 'Failed to add item')
    } finally {
      setAdding(false)
    }
  }

  // Delete item
  const deleteItem = async (id: number) => {
    if (!confirm('Are you sure you want to stop tracking this item?')) return

    try {
      const res = await fetch(`/api/items/${id}`, {
        method: 'DELETE'
      })

      if (res.ok) {
        setItems(items.filter(i => i.id !== id))
      } else {
        setError('Failed to delete item')
      }
    } catch (error) {
      setError('Failed to delete item')
    }
  }

  // Fetch items on mount
  useEffect(() => {
    fetchItems()
  }, [])

  // Render item card
  const renderItemCard = (item: TrackedItem) => (
    <div
      key={item.id}
      className="bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition-shadow duration-200 cursor-pointer"
      onClick={() => router.push(`/items/${item.id}`)}
    >
      {item.image_url && (
        <img src={item.image_url.replace(/^http:/, 'https:')} alt={item.title} className="w-full h-48 object-cover" />
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
  )

  // Render collapsible category section
  const renderCategorySection = (category: string, categoryItems: TrackedItem[]) => {
    if (categoryItems.length === 0) return null

    const isCollapsed = collapsedSections.has(category)
    const categoryEmoji = category === 'Book' ? '📚' : category === 'Non-Book' ? '📦' : '📋'

    return (
      <div key={category} className="mb-6">
        <button
          onClick={() => toggleSection(category)}
          className="w-full flex items-center justify-between bg-white rounded-t-lg shadow p-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-xl">{categoryEmoji}</span>
            <h3 className="text-lg font-semibold text-gray-900">{category}s</h3>
            <span className="text-sm text-gray-500">({categoryItems.length})</span>
          </div>
          <svg
            className={`w-5 h-5 text-gray-500 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {!isCollapsed && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-2">
            {categoryItems.map(renderItemCard)}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Tracked Items</h2>
        <p className="mt-1 text-gray-600">Add Amazon items to track their prices</p>
      </div>

      {/* Add Item Form */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Add New Item</h3>
        <form onSubmit={addItem} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Amazon Product URL or Identifier
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.amazon.ca/dp/B08N5KWB9H or ASIN/ISBN"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400"
                disabled={adding}
                required
              />
              <select
                value={domain}
                onChange={(e) => setDomain(e.target.value as any)}
                className="px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                disabled={adding}
              >
                {AMAZON_DOMAINS.map(d => (
                  <option key={d.value} value={d.value}>
                    {d.flag} {d.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={adding}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
              >
                {adding ? 'Adding...' : 'Add Item'}
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-500">
              Enter an Amazon product URL, ASIN (10 characters like B08N5KWB9H), or ISBN-13 (13 digits, dashes allowed)
            </p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-green-600">{success}</p>}
        </form>
      </div>

      {/* Search, Filter, and Sort */}
      {items.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by title, ASIN, or ISBN..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
              </div>
            </div>

            {/* Filter */}
            <div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
                className="px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
              >
                <option value="all">All Categories</option>
                <option value="Book">Books</option>
                <option value="Non-Book">Non-Books</option>
              </select>
            </div>

            {/* Sort */}
            <div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
              >
                <option value="newest">Sort: Newest</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
                <option value="name">Name: A to Z</option>
              </select>
            </div>
          </div>
        </div>
      )}

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
        <div>
          {/* Collapse All / Expand All button */}
          {filteredAndSortedItems.length > 0 && (
            <div className="mb-4 flex justify-end">
              <button
                onClick={toggleAllSections}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                {collapsedSections.size === Object.keys(groupedItems).filter(c => groupedItems[c].length > 0).length
                  ? 'Expand All'
                  : 'Collapse All'}
              </button>
            </div>
          )}

          {/* Category sections */}
          {Object.entries(groupedItems)
            .filter(([_, items]) => items.length > 0)
            .sort(([a], [b]) => {
              // Sort categories: Book first, then Non-Book, then others
              if (a === 'Book') return -1
              if (b === 'Book') return 1
              if (a === 'Non-Book') return -1
              if (b === 'Non-Book') return 1
              return a.localeCompare(b)
            })
            .map(([category, categoryItems]) =>
              renderCategorySection(category, categoryItems)
            )}

          {/* No results message */}
          {filteredAndSortedItems.length === 0 && (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <p className="text-gray-500">No items match your search or filter criteria.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
