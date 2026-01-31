// API Route for Alerts
// GET /api/alerts - Get user's alerts
// POST /api/alerts/acknowledge - Acknowledge an alert

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { AlertsService } from '@/lib/services/database/alerts-service'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') as 'active' | 'triggered' | 'disabled' | null

    const alerts = await AlertsService.getUserAlerts(
      session.user.id,
      status || undefined
    )

    return NextResponse.json({ data: alerts })
  } catch (error) {
    console.error('Error fetching alerts:', error)
    return NextResponse.json(
      { error: 'Failed to fetch alerts' },
      { status: 500 }
    )
  }
}
