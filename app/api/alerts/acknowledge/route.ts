// API Route for Acknowledging Alerts
// POST /api/alerts/acknowledge - Acknowledge an alert

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { AlertsService } from '@/lib/services/database/alerts-service'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { alertId } = body

    if (!alertId) {
      return NextResponse.json(
        { error: 'alertId is required' },
        { status: 400 }
      )
    }

    const alert = await AlertsService.acknowledgeAlert(alertId, session.user.id)

    return NextResponse.json({ data: alert })
  } catch (error: any) {
    console.error('Error acknowledging alert:', error)

    if (error.message === 'Alert not found') {
      return NextResponse.json(
        { error: 'Alert not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to acknowledge alert' },
      { status: 500 }
    )
  }
}
