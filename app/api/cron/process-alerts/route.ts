// Cron Job Endpoint for Processing Alerts
// This should be called periodically (e.g., every 6 hours) to send pending alerts

import { NextRequest, NextResponse } from 'next/server'
import { EmailService } from '@/lib/services/email/email-service'
import { AlertsService } from '@/lib/services/database/alerts-service'

export async function GET(request: NextRequest) {
  return handleProcessAlerts(request)
}

export async function POST(request: NextRequest) {
  return handleProcessAlerts(request)
}

async function handleProcessAlerts(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    // Get all unprocessed alerts
    const alerts = await AlertsService.getUnprocessedAlerts(50)

    if (alerts.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No alerts to process',
        processed: 0,
        successful: 0,
        failed: 0,
      })
    }

    console.log(`Processing ${alerts.length} alerts...`)

    let successCount = 0
    let failCount = 0

    // Process each alert with rate limiting (Resend allows 2 req/sec)
    for (const alert of alerts) {
      try {
        // Get user's email for recording
        const profile = await import('@/lib/services/database/profiles-service').then(m => m.ProfilesService.getProfile(alert.user_id))
        const recipientEmail = profile?.alert_email || profile?.email || 'unknown'

        const success = await EmailService.sendPriceAlert(alert as any)
        if (success) {
          await AlertsService.markEmailSent(alert.id, recipientEmail, 'sent')
          successCount++
        } else {
          // Don't mark failed emails so they can be retried
          failCount++
        }

        // Rate limit: wait 600ms between emails to stay under 2/sec
        await new Promise(resolve => setTimeout(resolve, 600))
      } catch (error) {
        console.error(`Failed to process alert ${alert.id}:`, error)
        failCount++
      }
    }

    return NextResponse.json({
      success: true,
      processed: alerts.length,
      successful: successCount,
      failed: failCount,
    })
  } catch (error) {
    console.error('Alert processing error:', error)
    return NextResponse.json(
      {
        error: 'Failed to process alerts',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
