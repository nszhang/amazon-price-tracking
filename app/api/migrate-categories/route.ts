// Migration API Route - Set category for existing items
// One-time migration: if ISBN exists → "Book", else → "Non-Book"

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { query } from '@/lib/db/config'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Update all items: set category based on ISBN presence
    const result = await query(
      `UPDATE tracked_items
       SET category = CASE
         WHEN isbn IS NOT NULL AND isbn != '' THEN 'Book'
         ELSE 'Non-Book'
       END
       WHERE user_id = $1
       RETURNING id, asin, isbn, category`,
      [session.user.id]
    )

    return NextResponse.json({
      success: true,
      migrated: result.rowCount,
      items: result.rows
    })
  } catch (error) {
    console.error('Migration error:', error)
    return NextResponse.json(
      { error: 'Migration failed: ' + (error as any).message },
      { status: 500 }
    )
  }
}

// GET to check how many items need migration
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Count items without category
    const result = await query(
      `SELECT
         COUNT(*) FILTER (WHERE category IS NULL) as needs_migration,
         COUNT(*) FILTER (WHERE category = 'Book') as books,
         COUNT(*) FILTER (WHERE category = 'Non-Book') as non_books,
         COUNT(*) as total
       FROM tracked_items
       WHERE user_id = $1`,
      [session.user.id]
    )

    return NextResponse.json({ data: result.rows[0] })
  } catch (error) {
    console.error('Error checking migration status:', error)
    return NextResponse.json(
      { error: 'Failed to check migration status' },
      { status: 500 }
    )
  }
}
