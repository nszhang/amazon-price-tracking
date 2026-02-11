'use client'

// Items Management Page - Add and manage tracked items

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'

interface TrackedItem {
  id: number
  asin: string
  isbn?: string
  title: string
  brand?: string
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
type SortOption = 'newest' | 'oldest' | 'price-low' | 'price-high' | 'name-asc' | 'name-desc'

interface BulkImportResult {
  identifier: string
  asin?: string
  status: 'added' | 'skipped' | 'invalid'
  message?: string
  itemId?: number
}

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
  const [sortBy, setSortBy] = useState<SortOption>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('itemsSortBy') as SortOption) || 'newest'
    }
    return 'newest'
  })
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())

  // Bulk import state
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importDomain, setImportDomain] = useState('ca')
  const [importResults, setImportResults] = useState<BulkImportResult[] | null>(null)
  const [importProgress, setImportProgress] = useState<string>('') // Progress message
  const [hasItems, setHasItems] = useState(false) // Track if user has any items

  // Selection state for bulk operations
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [deleteMode, setDeleteMode] = useState(false)
  const [refreshingSelected, setRefreshingSelected] = useState(false)
  const [refreshProgress, setRefreshProgress] = useState('')
  const [assigningCategory, setAssigningCategory] = useState(false)
  const [categoryProgress, setCategoryProgress] = useState('')

  // Bulk alert price state
  const [showAlertModal, setShowAlertModal] = useState(false)
  const [alertMode, setAlertMode] = useState<'fixed' | 'percent'>('percent')
  const [alertValue, setAlertValue] = useState('')
  const [settingAlert, setSettingAlert] = useState(false)
  const [alertProgress, setAlertProgress] = useState('')

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
        const fetchedItems = json.data || []
        setItems(fetchedItems)
        // Set hasItems based on initial fetch (without search)
        if (!searchQuery && fetchedItems.length > 0) {
          setHasItems(true)
        }
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
      case 'oldest':
        filtered.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        break
      case 'price-low':
        filtered.sort((a, b) => a.current_price - b.current_price)
        break
      case 'price-high':
        filtered.sort((a, b) => b.current_price - a.current_price)
        break
      case 'name-asc':
        filtered.sort((a, b) => a.title.localeCompare(b.title))
        break
      case 'name-desc':
        filtered.sort((a, b) => b.title.localeCompare(a.title))
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

  // Persist sort option
  useEffect(() => {
    localStorage.setItem('itemsSortBy', sortBy)
  }, [sortBy])

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
      // For ISBN-13 (978-prefix), convert to ISBN-10 for the ASIN field
      // For ASIN or ISBN-10, use as-is for ASIN field
      let asinValue: string
      let isbnValue: string | undefined

      if (isValidAsin || isValidIsbn10) {
        asinValue = identifier
        isbnValue = isValidIsbn10 ? identifier : undefined
      } else {
        // ISBN-13: convert to ISBN-10 for ASIN
        isbnValue = identifier
        if (identifier.startsWith('978')) {
          // Convert ISBN-13 to ISBN-10
          const body = identifier.substring(3, 12)
          let sum = 0
          for (let i = 0; i < 9; i++) {
            sum += (10 - i) * parseInt(body[i])
          }
          const remainder = (11 - (sum % 11)) % 11
          const checkChar = remainder === 10 ? 'X' : remainder.toString()
          asinValue = body + checkChar
        } else {
          // 979-prefix or other: use full ISBN-13
          asinValue = identifier
        }
      }

      // Create item via API
      const response = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asin: asinValue,
          isbn: isbnValue,
          amazon_url: amazonUrl,
          amazon_domain: domain,
          title: 'Loading...',
          alert_threshold: 0,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add item')
      }

      setHasItems(true)
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

  // Toggle selection for an item
  const toggleSelection = (id: number) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  // Select all items in a category (auto-enters delete mode)
  const selectCategory = (category: string) => {
    if (!deleteMode) setDeleteMode(true)
    const categoryItems = groupedItems[category] || []
    const categoryIds = new Set(categoryItems.map(i => i.id))
    setSelectedIds(prev => new Set([...prev, ...categoryIds]))
  }

  // Deselect all items in a category
  const deselectCategory = (category: string) => {
    const categoryItems = groupedItems[category] || []
    const categoryIds = new Set(categoryItems.map(i => i.id))
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      categoryIds.forEach(id => newSet.delete(id))
      return newSet
    })
  }

  // Delete selected items
  const deleteSelected = async () => {
    if (selectedIds.size === 0) return

    const count = selectedIds.size
    if (!confirm(`Are you sure you want to delete ${count} item${count > 1 ? 's' : ''}?`)) return

    try {
      // Delete all selected items in parallel
      await Promise.all(
        Array.from(selectedIds).map(id =>
          fetch(`/api/items/${id}`, { method: 'DELETE' })
        )
      )

      setItems(items.filter(i => !selectedIds.has(i.id)))
      setSelectedIds(new Set())
      setDeleteMode(false)
      setSuccess(`Deleted ${count} item${count > 1 ? 's' : ''}`)
    } catch (error) {
      setError('Failed to delete some items')
    }
  }

  // Refresh selected items (for retrying "Loading..." items)
  const refreshSelected = async () => {
    if (selectedIds.size === 0) return

    setRefreshingSelected(true)
    setError('')

    const selectedItems = items.filter(i => selectedIds.has(i.id))
    let successCount = 0
    let failCount = 0

    for (let i = 0; i < selectedItems.length; i++) {
      const item = selectedItems[i]
      setRefreshProgress(`Refreshing ${i + 1}/${selectedItems.length}: ${item.asin}`)

      try {
        const response = await fetch('/api/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: item.amazon_url,
            asin: item.asin,
            domain: item.amazon_url.match(/amazon\.([a-z.]+)\//)?.[1] || 'ca',
          }),
        })

        if (response.ok) {
          successCount++
        } else {
          failCount++
        }
      } catch (err) {
        console.error('[REFRESH] Error refreshing', item.asin, err)
        failCount++
      }
    }

    setRefreshProgress('')
    setRefreshingSelected(false)
    setSelectedIds(new Set())
    setDeleteMode(false)

    if (successCount > 0) {
      setSuccess(`Refreshed ${successCount} item${successCount > 1 ? 's' : ''}${failCount > 0 ? `, ${failCount} failed` : ''}`)
    } else if (failCount > 0) {
      setError(`Failed to refresh ${failCount} item${failCount > 1 ? 's' : ''}`)
    }

    // Refresh the items list
    fetchItems(search)
  }

  // Set category for selected items
  const setCategoryForSelected = async (category: 'Book' | 'Non-Book') => {
    if (selectedIds.size === 0) return

    setAssigningCategory(true)
    setError('')

    const selectedItemIds = Array.from(selectedIds)
    let successCount = 0
    let failCount = 0

    for (let i = 0; i < selectedItemIds.length; i++) {
      const itemId = selectedItemIds[i]
      setCategoryProgress(`Setting category ${i + 1}/${selectedItemIds.length}`)

      try {
        const response = await fetch(`/api/items/${itemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category }),
        })

        if (response.ok) {
          successCount++
        } else {
          failCount++
        }
      } catch (err) {
        console.error('[SET CATEGORY] Error for item', itemId, err)
        failCount++
      }
    }

    setCategoryProgress('')
    setAssigningCategory(false)
    setSelectedIds(new Set())
    setDeleteMode(false)

    if (successCount > 0) {
      setSuccess(`Set ${successCount} item${successCount > 1 ? 's' : ''} to ${category}${failCount > 0 ? `, ${failCount} failed` : ''}`)
    } else if (failCount > 0) {
      setError(`Failed to set category for ${failCount} item${failCount > 1 ? 's' : ''}`)
    }

    // Refresh the items list
    fetchItems(search)
  }

  // Set alert price for selected items
  const setAlertForSelected = async () => {
    if (selectedIds.size === 0) return

    const numValue = parseFloat(alertValue)
    if (isNaN(numValue) || numValue < 0) {
      setError('Please enter a valid number')
      return
    }

    if (alertMode === 'percent' && numValue > 100) {
      setError('Percentage cannot exceed 100%')
      return
    }

    setSettingAlert(true)
    setError('')

    const selectedItemIds = Array.from(selectedIds)
    let successCount = 0
    let failCount = 0

    for (let i = 0; i < selectedItemIds.length; i++) {
      const itemId = selectedItemIds[i]
      setAlertProgress(`Setting alert ${i + 1}/${selectedItemIds.length}`)

      try {
        let threshold: number
        if (alertMode === 'fixed') {
          threshold = numValue
        } else {
          // Percentage below current price
          const item = items.find(it => it.id === itemId)
          if (item && item.current_price > 0) {
            threshold = Math.round(item.current_price * (1 - numValue / 100) * 100) / 100
          } else {
            threshold = 0
          }
        }

        const response = await fetch(`/api/items/${itemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alert_threshold: threshold }),
        })

        if (response.ok) {
          successCount++
        } else {
          failCount++
        }
      } catch (err) {
        console.error('[SET ALERT] Error for item', itemId, err)
        failCount++
      }
    }

    setAlertProgress('')
    setSettingAlert(false)
    setShowAlertModal(false)
    setAlertValue('')
    setSelectedIds(new Set())
    setDeleteMode(false)

    if (successCount > 0) {
      setSuccess(`Set alert price for ${successCount} item${successCount > 1 ? 's' : ''}${failCount > 0 ? `, ${failCount} failed` : ''}`)
    } else if (failCount > 0) {
      setError(`Failed to set alert price for ${failCount} item${failCount > 1 ? 's' : ''}`)
    }

    // Refresh the items list
    fetchItems(search)
  }

  // Toggle delete mode
  const toggleDeleteMode = () => {
    if (deleteMode) {
      setSelectedIds(new Set())
    }
    setDeleteMode(!deleteMode)
  }

  // Bulk import items
  const handleBulkImport = async () => {
    if (!importFile) {
      setError('Please select a file')
      return
    }

    setImporting(true)
    setError('')
    setSuccess('')
    setImportResults(null)
    setImportProgress('Reading file...')

    try {
      const formData = new FormData()
      formData.append('file', importFile)
      formData.append('amazon_domain', importDomain)

      setImportProgress('Importing items to database...')
      const response = await fetch('/api/items/bulk', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to import items')
      }

      // Show results immediately
      setImportResults(data.results)
      setSuccess(`Imported ${data.summary.added} items. ${data.summary.skipped} skipped, ${data.summary.invalid} invalid.`)

      if (data.summary.added > 0) {
        setHasItems(true)

        // Scrape added items sequentially with progress updates
        const addedItems = data.results.filter((r: BulkImportResult) => r.status === 'added')
        for (let i = 0; i < addedItems.length; i++) {
          const item = addedItems[i]
          setImportProgress(`Fetching prices: ${i + 1}/${addedItems.length} (${item.asin || item.identifier})`)
          try {
            await fetch('/api/scrape', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                url: `https://www.amazon.${importDomain}/dp/${item.asin || item.identifier}`,
                asin: item.asin || item.identifier,
                domain: importDomain,
              }),
            })
          } catch (err) {
            console.warn('[BULK IMPORT] Scrape failed for', item.identifier, err)
          }
        }
        setImportProgress('')
      }

      // Clear the file input
      setImportFile(null)

      // Refresh items list
      fetchItems(search)
    } catch (err: any) {
      setError(err.message || 'Failed to import items')
    } finally {
      setImporting(false)
      setImportProgress('')
    }
  }

  // Fetch items on mount
  useEffect(() => {
    fetchItems()
  }, [])

  // Restore scroll position when returning from item details
  useEffect(() => {
    if (!loading && items.length > 0) {
      const savedPosition = sessionStorage.getItem('itemsScrollPosition')
      if (savedPosition) {
        const scrollY = parseInt(savedPosition)
        sessionStorage.removeItem('itemsScrollPosition')

        // Use requestAnimationFrame to ensure DOM is painted, then scroll
        // Multiple attempts to handle image loading affecting layout
        const scrollToPosition = () => {
          window.scrollTo({ top: scrollY, behavior: 'instant' })
        }

        // Immediate attempt
        requestAnimationFrame(() => {
          scrollToPosition()
          // Second attempt after short delay for images
          setTimeout(scrollToPosition, 200)
          // Third attempt for slow-loading content
          setTimeout(scrollToPosition, 500)
        })
      }
    }
  }, [loading, items])

  // Render item card
  const renderItemCard = (item: TrackedItem) => {
    const isSelected = selectedIds.has(item.id)

    return (
      <div
        key={item.id}
        className={`bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition-shadow duration-200 relative ${
          deleteMode ? 'cursor-pointer' : ''
        } ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
        onClick={() => {
          if (deleteMode) {
            toggleSelection(item.id)
          } else {
            // Save scroll position before navigating
            sessionStorage.setItem('itemsScrollPosition', window.scrollY.toString())
            router.push(`/items/${item.id}`)
          }
        }}
      >
        {/* Checkbox overlay in delete mode */}
        {deleteMode && (
          <div className="absolute top-3 left-3 z-10">
            <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center ${
              isSelected ? 'bg-blue-500 border-blue-500' : 'bg-white border-gray-300'
            }`}>
              {isSelected && (
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          </div>
        )}

        {item.image_url && (
          <img src={item.image_url.replace(/^http:/, 'https:')} alt={item.title} className="w-full h-48 object-cover" />
        )}
        <div className="p-4">
          <h4 className="font-medium text-gray-900 line-clamp-2">{item.title}</h4>
          {item.brand && <p className="text-sm text-gray-600 mt-1">by {item.brand}</p>}
          <p className="text-xs text-gray-400 mt-1">{item.asin}</p>
          <div className="mt-4 flex justify-between items-baseline">
            <div>
              <p className="text-2xl font-bold text-gray-900">${item.current_price.toFixed(2)}</p>
              <p className="text-sm text-gray-500">Alert: ${item.alert_threshold.toFixed(2)}</p>
            </div>
            {!deleteMode && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  deleteItem(item.id)
                }}
                className="text-red-600 hover:text-red-700 text-sm"
              >
                Remove
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Last checked: {item.last_checked_at ? new Date(item.last_checked_at).toLocaleDateString() : 'Never'}
          </p>
        </div>
      </div>
    )
  }

  // Render collapsible category section
  const renderCategorySection = (category: string, categoryItems: TrackedItem[]) => {
    if (categoryItems.length === 0) return null

    const isCollapsed = collapsedSections.has(category)
    const categoryEmoji = category === 'Book' ? '📚' : category === 'Non-Book' ? '📦' : '📋'
    const allSelected = categoryItems.every(i => selectedIds.has(i.id))
    const someSelected = categoryItems.some(i => selectedIds.has(i.id))

    return (
      <div key={category} className="mb-6">
        {/* Category header with expand/collapse and select all */}
        <div className="bg-white rounded-t-lg shadow p-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => toggleSection(category)}
              className="flex items-center gap-2 hover:bg-gray-50 -ml-2 px-2 py-1 rounded transition-colors"
            >
              <svg
                className={`w-5 h-5 text-gray-500 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              <span className="text-xl">{categoryEmoji}</span>
              <h3 className="text-lg font-semibold text-gray-900">{category}s</h3>
              <span className="text-sm text-gray-500">({categoryItems.length})</span>
            </button>

            {/* Select All / Deselect All - always visible */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => allSelected && deleteMode ? deselectCategory(category) : selectCategory(category)}
                className="text-sm px-3 py-1 rounded-md border border-gray-300 hover:bg-gray-50 text-gray-700"
              >
                {allSelected && deleteMode ? 'Deselect All' : 'Select All'}
              </button>
              {deleteMode && someSelected && (
                <span className="text-sm text-gray-500">
                  {categoryItems.filter(i => selectedIds.has(i.id)).length} / {categoryItems.length}
                </span>
              )}
            </div>
          </div>
        </div>
        {!isCollapsed && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-2">
            {categoryItems.map(item => renderItemCard(item))}
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

      {/* Bulk Import */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Bulk Import</h3>
          <button
            type="button"
            onClick={() => setShowBulkImport(!showBulkImport)}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            {showBulkImport ? 'Hide' : 'Show'}
          </button>
        </div>

        {showBulkImport && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Upload a text file containing ASINs or ISBNs (one per line, or comma-separated). Max 100 items per batch.
            </p>

            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select File
                </label>
                <input
                  type="file"
                  accept=".txt,.csv"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm file:mr-4 file:py-1 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  disabled={importing}
                />
                {importFile && (
                  <p className="mt-1 text-sm text-gray-500">Selected: {importFile.name}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amazon Domain
                </label>
                <select
                  value={importDomain}
                  onChange={(e) => setImportDomain(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                  disabled={importing}
                >
                  {AMAZON_DOMAINS.map(d => (
                    <option key={d.value} value={d.value}>
                      {d.flag} {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleBulkImport}
                disabled={importing || !importFile}
                className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 whitespace-nowrap self-end"
              >
                {importing ? 'Importing...' : 'Import Items'}
              </button>
            </div>

            {/* Progress indicator */}
            {importProgress && (
              <div className="flex items-center gap-2 text-sm text-blue-600">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span>{importProgress}</span>
              </div>
            )}

            {/* Import Results */}
            {importResults && importResults.length > 0 && (
              <div className="mt-4 border rounded-md overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b">
                  <p className="text-sm font-medium text-gray-700">
                    Import Results ({importResults.length} items)
                  </p>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Identifier</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Message</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {importResults.map((result, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-2 text-sm text-gray-900 font-mono">{result.identifier}</td>
                          <td className="px-4 py-2 text-sm">
                            {result.status === 'added' && (
                              <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">Added</span>
                            )}
                            {result.status === 'skipped' && (
                              <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">Skipped</span>
                            )}
                            {result.status === 'invalid' && (
                              <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">Invalid</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-500">{result.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Search, Filter, and Sort */}
      {(hasItems || items.length > 0) && (
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
                <option value="newest">Date: Newest First</option>
                <option value="oldest">Date: Oldest First</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
                <option value="name-asc">Name: A to Z</option>
                <option value="name-desc">Name: Z to A</option>
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
          {/* Selection action bar - prominent when items are selected */}
          {deleteMode && selectedIds.size > 0 && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-300 rounded-lg">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-blue-700">
                    {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''} selected
                  </span>
                  {(refreshingSelected && refreshProgress) && (
                    <span className="text-sm text-blue-600 flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      {refreshProgress}
                    </span>
                  )}
                  {(assigningCategory && categoryProgress) && (
                    <span className="text-sm text-green-600 flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
                      {categoryProgress}
                    </span>
                  )}
                  {(settingAlert && alertProgress) && (
                    <span className="text-sm text-orange-600 flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-600"></div>
                      {alertProgress}
                    </span>
                  )}
                </div>
                <button
                  onClick={toggleDeleteMode}
                  disabled={refreshingSelected || assigningCategory || settingAlert}
                  className="text-sm px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
              <div className="flex flex-wrap gap-3 mt-3">
                {/* Category assignment buttons */}
                <div className="flex items-center gap-2 border-r border-blue-200 pr-3">
                  <span className="text-sm text-gray-600">Set category:</span>
                  <button
                    onClick={() => setCategoryForSelected('Book')}
                    disabled={refreshingSelected || assigningCategory || settingAlert}
                    className="text-sm px-3 py-1.5 bg-amber-100 text-amber-800 border border-amber-300 rounded-md hover:bg-amber-200 disabled:opacity-50"
                  >
                    📚 Book
                  </button>
                  <button
                    onClick={() => setCategoryForSelected('Non-Book')}
                    disabled={refreshingSelected || assigningCategory || settingAlert}
                    className="text-sm px-3 py-1.5 bg-purple-100 text-purple-800 border border-purple-300 rounded-md hover:bg-purple-200 disabled:opacity-50"
                  >
                    📦 Non-Book
                  </button>
                </div>
                {/* Set Alert Price button */}
                <button
                  onClick={() => setShowAlertModal(true)}
                  disabled={refreshingSelected || assigningCategory || settingAlert}
                  className="text-sm px-4 py-1.5 bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:opacity-50"
                >
                  Set Alert Price
                </button>
                {/* Refresh button */}
                <button
                  onClick={refreshSelected}
                  disabled={refreshingSelected || assigningCategory || settingAlert}
                  className="text-sm px-4 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {refreshingSelected ? 'Refreshing...' : 'Refresh Prices'}
                </button>
                {/* Delete button */}
                <button
                  onClick={deleteSelected}
                  disabled={refreshingSelected || assigningCategory || settingAlert}
                  className="text-sm px-4 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  Delete Selected
                </button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="mb-4 flex justify-between items-center">
            {deleteMode ? (
              <button
                onClick={toggleDeleteMode}
                className="text-sm px-4 py-2 rounded-md border bg-red-50 border-red-300 text-red-700 hover:bg-red-100 transition-colors"
              >
                Cancel Selection
              </button>
            ) : (
              <div></div>
            )}
            <button
              onClick={toggleAllSections}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              {collapsedSections.size === Object.keys(groupedItems).filter(c => groupedItems[c].length > 0).length
                ? 'Expand All'
                : 'Collapse All'}
            </button>
          </div>

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

      {/* Bulk Set Alert Price Modal */}
      {showAlertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => !settingAlert && setShowAlertModal(false)} />
          <div className="relative bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Set Alert Price</h3>
            <p className="text-sm text-gray-500 mb-4">
              Apply to {selectedIds.size} selected item{selectedIds.size > 1 ? 's' : ''}
            </p>

            {/* Mode toggle */}
            <div className="flex rounded-md border border-gray-300 mb-4 overflow-hidden">
              <button
                onClick={() => setAlertMode('percent')}
                className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                  alertMode === 'percent'
                    ? 'bg-orange-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                % Below Current
              </button>
              <button
                onClick={() => setAlertMode('fixed')}
                className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                  alertMode === 'fixed'
                    ? 'bg-orange-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Fixed Price ($)
              </button>
            </div>

            {/* Value input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {alertMode === 'percent' ? 'Percentage below current price' : 'Alert price ($)'}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                  {alertMode === 'percent' ? '%' : '$'}
                </span>
                <input
                  type="number"
                  min="0"
                  max={alertMode === 'percent' ? '100' : undefined}
                  step={alertMode === 'percent' ? '1' : '0.01'}
                  value={alertValue}
                  onChange={(e) => setAlertValue(e.target.value)}
                  placeholder={alertMode === 'percent' ? 'e.g. 10' : 'e.g. 29.99'}
                  className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500 text-gray-900"
                  autoFocus
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {alertMode === 'percent'
                  ? 'Each item\'s alert will be set to this % below its current price'
                  : 'All selected items will have the same fixed alert price'}
              </p>
            </div>

            {/* Progress */}
            {settingAlert && alertProgress && (
              <div className="mb-4 flex items-center gap-2 text-sm text-orange-600">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-600"></div>
                <span>{alertProgress}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowAlertModal(false); setAlertValue('') }}
                disabled={settingAlert}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={setAlertForSelected}
                disabled={settingAlert || !alertValue}
                className="px-4 py-2 text-sm bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:opacity-50"
              >
                {settingAlert ? 'Applying...' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
