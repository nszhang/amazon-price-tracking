// Email Service for Price Alerts
// Uses Resend for email delivery

import { createClient } from '@/lib/supabase/server'
import type { PriceAlert, TrackedItem } from '@/lib/types'

export class EmailService {
  private static resendApiKey = process.env.RESEND_API_KEY
  private static fromEmail = 'Amazon Price Tracker <alerts@your-domain.com>'

  /**
   * Send a price alert email
   */
  static async sendPriceAlert(alert: PriceAlert & { tracked_items: TrackedItem }): Promise<boolean> {
    if (!this.resendApiKey) {
      console.warn('RESEND_API_KEY not configured, skipping email')
      return false
    }

    try {
      // Get user's alert email preference
      const supabase = createClient()
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, alert_email, full_name')
        .eq('id', alert.user_id)
        .single()

      if (!profile) {
        throw new Error('User profile not found')
      }

      const recipientEmail = profile.alert_email || profile.email
      const recipientName = profile.full_name || 'there'

      // Generate HTML email
      const html = this.generateAlertEmail({
        recipientName,
        itemTitle: alert.tracked_items.title,
        itemUrl: alert.tracked_items.amazon_url,
        itemImage: alert.tracked_items.image_url,
        previousPrice: alert.previous_price || alert.threshold_price,
        currentPrice: alert.actual_price,
        priceDrop: alert.price_drop_percent,
        currency: alert.tracked_items.currency,
      })

      // Send email via Resend
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.fromEmail,
          to: recipientEmail,
          subject: `🔔 Price Drop: ${alert.tracked_items.title}`,
          html,
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Resend API error: ${error}`)
      }

      // Mark email as sent in database
      await supabase
        .from('price_alerts')
        .update({
          email_sent_at: new Date().toISOString(),
          email_sent_to: recipientEmail,
          email_status: 'sent',
        })
        .eq('id', alert.id)

      console.log(`Email sent to ${recipientEmail} for alert ${alert.id}`)
      return true
    } catch (error) {
      console.error('Failed to send email:', error)

      // Mark email as failed
      try {
        const supabase = createClient()
        await supabase
          .from('price_alerts')
          .update({ email_status: 'failed' })
          .eq('id', alert.id)
      } catch (updateError) {
        console.error('Failed to update email status:', updateError)
      }

      return false
    }
  }

  /**
   * Generate HTML email for price alert
   */
  private static generateAlertEmail(data: {
    recipientName: string
    itemTitle: string
    itemUrl: string
    itemImage?: string | null
    previousPrice: number
    currentPrice: number
    priceDrop?: number | null
    currency: string
  }): string {
    const priceDropHtml = data.priceDrop
      ? `<div style="color: #10b981; font-size: 18px; margin: 10px 0;">
          🎉 Price dropped by ${data.priceDrop.toFixed(1)}%!
         </div>`
      : ''

    const savings = data.previousPrice - data.currentPrice
    const savingsHtml = savings > 0
      ? `<div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 12px; margin: 16px 0;">
          <strong>You save:</strong> ${data.currency}${savings.toFixed(2)}
         </div>`
      : ''

    return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .price-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .old-price { text-decoration: line-through; color: #999; font-size: 18px; }
    .new-price { color: #10b981; font-size: 32px; font-weight: bold; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-size: 16px; margin-top: 20px; }
    .product-image { max-width: 200px; height: auto; border-radius: 8px; display: block; margin: 0 auto 20px; }
    .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">🔔 Price Drop Alert!</h1>
    </div>
    <div class="content">
      <p style="font-size: 16px;">Hi ${data.recipientName},</p>
      <p style="font-size: 16px;">Great news! An item you're tracking has dropped in price.</p>

      ${data.itemImage ? `<img src="${data.itemImage}" class="product-image" alt="${data.itemTitle}"/>` : ''}

      <h2 style="font-size: 20px; margin-bottom: 10px;">${data.itemTitle}</h2>

      ${priceDropHtml}

      <div class="price-box">
        <div>
          <span class="old-price">${data.currency}${data.previousPrice.toFixed(2)}</span>
        </div>
        <div class="new-price">${data.currency}${data.currentPrice.toFixed(2)}</div>
      </div>

      ${savingsHtml}

      <div style="text-align: center;">
        <a href="${data.itemUrl}" class="button">View on Amazon</a>
      </div>

      <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
        This link will take you directly to the product page on Amazon.
      </p>
    </div>

    <div class="footer">
      <p>You received this email because you subscribed to Amazon Price Tracker alerts.</p>
      <p>To stop receiving alerts, <a href="#" style="color: #667eea;">adjust your settings</a>.</p>
    </div>
  </div>
</body>
</html>`
  }

  /**
   * Send a test email (for verification)
   */
  static async sendTestEmail(email: string): Promise<boolean> {
    if (!this.resendApiKey) {
      console.warn('RESEND_API_KEY not configured')
      return false
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.fromEmail,
          to: email,
          subject: 'Amazon Price Tracker - Test Email',
          html: `<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h1 style="color: #667eea;">✅ Email Service Working!</h1>
    <p>This is a test email from your Amazon Price Tracker.</p>
    <p>You'll receive alerts like this when your tracked items drop in price.</p>
  </div>
</body>
</html>`,
        }),
      })

      return response.ok
    } catch (error) {
      console.error('Test email failed:', error)
      return false
    }
  }

  /**
   * Send welcome email
   */
  static async sendWelcomeEmail(email: string, name?: string): Promise<boolean> {
    if (!this.resendApiKey) {
      return false
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.fromEmail,
          to: email,
          subject: 'Welcome to Amazon Price Tracker!',
          html: `<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h1 style="color: #667eea;">Welcome${name ? `, ${name}` : ''}! 👋</h1>
    <p>Thanks for signing up for Amazon Price Tracker!</p>
    <p>Here's what you can do:</p>
    <ul>
      <li>Track Amazon products by URL, ASIN, or ISBN</li>
      <li>Set price alerts and get notified when prices drop</li>
      <li>View price history with charts</li>
    </ul>
    <p style="margin-top: 20px;">
      <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard"
         style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">
        Go to Dashboard
      </a>
    </p>
  </div>
</body>
</html>`,
        }),
      })

      return response.ok
    } catch (error) {
      console.error('Welcome email failed:', error)
      return false
    }
  }
}
