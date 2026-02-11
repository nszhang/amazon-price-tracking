// API Route for Price Movers
// GET /api/items/price-movers?days=7 - Get items with biggest % price change in a period

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { query } from '@/lib/db/config'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '7', 10)
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    const since = new Date()
    since.setDate(since.getDate() - days)

    // For each user item, get the earliest and latest successful price within the period,
    // then compute the percentage change.
    const result = await query(
      `WITH period_prices AS (
        SELECT
          ph.item_id,
          FIRST_VALUE(ph.price) OVER (PARTITION BY ph.item_id ORDER BY ph.scraped_at ASC) AS start_price,
          FIRST_VALUE(ph.price) OVER (PARTITION BY ph.item_id ORDER BY ph.scraped_at DESC) AS end_price,
          ROW_NUMBER() OVER (PARTITION BY ph.item_id ORDER BY ph.scraped_at DESC) AS rn
        FROM price_history ph
        JOIN tracked_items ti ON ti.id = ph.item_id
        WHERE ti.user_id = $1
          AND ph.scraped_at >= $2
          AND ph.scrape_status = 'success'
          AND ph.price > 0
      )
      SELECT
        pp.item_id,
        pp.start_price,
        pp.end_price,
        CASE WHEN pp.start_price > 0
          THEN ROUND(((pp.end_price - pp.start_price) / pp.start_price) * 100, 2)
          ELSE 0
        END AS change_percent,
        ti.asin,
        ti.title,
        ti.brand,
        ti.category,
        ti.image_url,
        ti.current_price,
        ti.currency,
        ti.amazon_url,
        ti.amazon_domain
      FROM period_prices pp
      JOIN tracked_items ti ON ti.id = pp.item_id
      WHERE pp.rn = 1
        AND pp.start_price > 0
        AND pp.start_price != pp.end_price
      ORDER BY ABS(((pp.end_price - pp.start_price) / pp.start_price) * 100) DESC
      LIMIT $3`,
      [session.user.id, since.toISOString(), limit]
    )

    const movers = result.rows.map(row => ({
      item_id: row.item_id,
      asin: row.asin,
      title: row.title,
      brand: row.brand,
      category: row.category,
      image_url: row.image_url,
      current_price: parseFloat(row.current_price),
      currency: row.currency,
      amazon_url: row.amazon_url,
      amazon_domain: row.amazon_domain,
      start_price: parseFloat(row.start_price),
      end_price: parseFloat(row.end_price),
      change_percent: parseFloat(row.change_percent),
    }))

    return NextResponse.json({ data: movers, period_days: days })
  } catch (error) {
    console.error('Error fetching price movers:', error)
    return NextResponse.json(
      { error: 'Failed to fetch price movers' },
      { status: 500 }
    )
  }
}
