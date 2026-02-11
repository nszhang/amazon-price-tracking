// API Route for Bulk Import Items
// POST /api/items/bulk - Import multiple items from a file

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { ItemsService } from '@/lib/services/database/items-service'
import { isbn13ToIsbn10 } from '@/lib/utils/isbn'

interface BulkImportResult {
  identifier: string
  asin?: string
  status: 'added' | 'skipped' | 'invalid'
  message?: string
  itemId?: number
}

export async function POST(request: NextRequest) {
  console.log('[BULK IMPORT] POST /api/items/bulk called')
  try {
    const session = await getServerSession(authOptions)
    console.log('[BULK IMPORT] Session:', session?.user?.id ? `user ${session.user.id}` : 'null')

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    console.log('[BULK IMPORT] FormData parsed')
    const file = formData.get('file') as File
    const amazonDomain = (formData.get('amazon_domain') as string) || 'ca'

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Read file content
    const text = await file.text()

    // Parse the file: extract ASINs and ISBNs
    // Supports: one per line, comma-separated, or whitespace-separated
    const identifiers = text
      .split(/[,\n\r\s]+/)
      .map(id => id.trim())
      .filter(id => id.length > 0)

    if (identifiers.length === 0) {
      return NextResponse.json(
        { error: 'No valid identifiers found in file' },
        { status: 400 }
      )
    }

    console.log(`[BULK IMPORT] Found ${identifiers.length} identifiers, domain=${amazonDomain}`)

    if (identifiers.length > 100) {
      return NextResponse.json(
        { error: 'Maximum 100 items per batch' },
        { status: 400 }
      )
    }

    // Process each identifier
    const results: BulkImportResult[] = []

    for (const identifier of identifiers) {
      // Clean input: remove dashes
      const cleaned = identifier.replace(/-/g, '').replace(/\s/g, '')

      // Validate format
      const isValidAsin = /^[A-Z0-9]{10}$/i.test(cleaned)
      const isValidIsbn10 = /^[0-9]{9}[0-9X]$/i.test(cleaned)
      const isValidIsbn13 = /^[0-9]{13}$/.test(cleaned)

      if (!isValidAsin && !isValidIsbn10 && !isValidIsbn13) {
        results.push({
          identifier,
          status: 'invalid',
          message: 'Invalid format (not ASIN or ISBN)'
        })
        continue
      }

      // Determine ASIN and ISBN values
      let asinValue: string
      let isbnValue: string | undefined

      if (isValidAsin || isValidIsbn10) {
        asinValue = cleaned
        isbnValue = isValidIsbn10 ? cleaned : undefined
      } else {
        // ISBN-13: convert to ISBN-10 for the ASIN field
        isbnValue = cleaned
        const isbn10 = isbn13ToIsbn10(cleaned)
        if (isbn10) {
          asinValue = isbn10
        } else {
          // 979-prefix or invalid: use full ISBN-13
          asinValue = cleaned
        }
      }

      // Build Amazon URL
      const amazonUrl = `https://www.amazon.${amazonDomain}/dp/${asinValue}`

      // Check if item already exists
      const existing = await ItemsService.getItemByAsin(asinValue, session.user.id)
      if (existing) {
        results.push({
          identifier,
          status: 'skipped',
          message: 'Already being tracked',
          itemId: existing.id
        })
        continue
      }

      // Create the item
      try {
        const item = await ItemsService.createItem(session.user.id, {
          url: amazonUrl,
          asin: asinValue,
          isbn: isbnValue,
          amazon_url: amazonUrl,
          amazon_domain: amazonDomain,
          title: 'Loading...',
          current_price: 0,
          alert_threshold: 0,
        })

        results.push({
          identifier,
          asin: asinValue,
          status: 'added',
          message: 'Added successfully',
          itemId: item.id
        })
      } catch (error: any) {
        results.push({
          identifier,
          status: 'invalid',
          message: error.message || 'Failed to add'
        })
      }
    }

    const added = results.filter(r => r.status === 'added')
    const skipped = results.filter(r => r.status === 'skipped')
    const invalid = results.filter(r => r.status === 'invalid')

    console.log(`[BULK IMPORT] Done: ${added.length} added, ${skipped.length} skipped, ${invalid.length} invalid`)

    return NextResponse.json({
      success: true,
      summary: {
        total: identifiers.length,
        added: added.length,
        skipped: skipped.length,
        invalid: invalid.length
      },
      results
    })
  } catch (error: any) {
    console.error('Bulk import error:', error)
    return NextResponse.json(
      { error: 'Failed to import items: ' + (error.message || 'Unknown error') },
      { status: 500 }
    )
  }
}
