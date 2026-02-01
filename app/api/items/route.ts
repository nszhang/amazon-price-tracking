// API Route for Items List
// GET /api/items - Get all items for current user
// POST /api/items - Create a new tracked item

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { ItemsService } from '@/lib/services/database/items-service'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get search query parameter
    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search') || undefined

    const items = await ItemsService.getUserItems(session.user.id, search)

    return NextResponse.json({ data: items })
  } catch (error) {
    console.error('Error fetching items:', error)
    return NextResponse.json(
      { error: 'Failed to fetch items' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { asin, isbn, amazon_url, amazon_domain } = body

    console.log('[CREATE ITEM] ASIN:', asin, '(length:', asin?.length, ')')
    console.log('[CREATE ITEM] ISBN:', isbn, '(length:', isbn?.length, ')')
    console.log('[CREATE ITEM] Amazon Domain:', amazon_domain)
    console.log('[CREATE ITEM] Full body:', JSON.stringify(body))

    if (!asin || !amazon_url || !amazon_domain) {
      return NextResponse.json(
        { error: 'Missing required fields: asin, amazon_url, amazon_domain' },
        { status: 400 }
      )
    }

    if (asin.length > 10) {
      return NextResponse.json(
        { error: `ASIN too long: ${asin.length} characters (max 10). Value: "${asin}"` },
        { status: 400 }
      )
    }

    // Check if item already exists (by ASIN or ISBN)
    const existing = await ItemsService.getItemByAsin(asin, session.user.id)
    if (existing) {
      return NextResponse.json(
        { error: 'Item is already being tracked' },
        { status: 409 }
      )
    }

    // Create the item
    const item = await ItemsService.createItem(session.user.id, {
      asin,
      isbn,
      amazon_url,
      amazon_domain,
      title: body.title || 'Loading...',
      current_price: 0,
      alert_threshold: body.alert_threshold || 0,
      alert_enabled: true,
    } as any)

    return NextResponse.json({ data: item }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating item:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create item' },
      { status: 500 }
    )
  }
}
