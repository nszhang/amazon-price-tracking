// Email Service for Price Alerts
// Uses Resend for email delivery

import { ProfilesService } from '@/lib/services/database/profiles-service'
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
      const profile = await ProfilesService.getProfile(alert.user_id)

      if (!profile) {
        throw new Error('User profile not found')
      }

      const recipientEmail = profile.alert_email || profile.email
      const recipientName = profile.full_name || 'there'

      // Generate HTML email
      const html = this.generateAlertEmail({
        recipientName,
        itemTitle: alert.tracked_items.title,
        itemUrl: alert.tracked_items.amazon_url.replace(/^http:/, 'https:'),
        itemImage: alert.tracked_items.image_url?.replace(/^http:/, 'https:'),
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
          subject: `Price Drop Alert: ${alert.tracked_items.title}`,
          html,
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Resend API error: ${error}`)
      }

      console.log(`Price alert email sent to ${recipientEmail}`)
      return true
    } catch (error) {
      console.error('Failed to send price alert email:', error)
      return false
    }
  }

  /**
   * Generate HTML email content for price alert
   */
  private static generateAlertEmail(data: {
    recipientName: string
    itemTitle: string
    itemUrl: string
    itemImage?: string
    previousPrice: number
    currentPrice: number
    priceDrop?: number
    currency: string
  }): string {
    const { recipientName, itemTitle, itemUrl, itemImage, previousPrice, currentPrice, priceDrop, currency } = data
    const symbol = currency === 'USD' ? '$' : currency + ' '
    const savings = previousPrice - currentPrice
    const dropPercent = priceDrop ? priceDrop.toFixed(1) : ((savings / previousPrice) * 100).toFixed(1)

    return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #10b981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .price-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center; }
    .old-price { text-decoration: line-through; color: #9ca3af; font-size: 18px; }
    .new-price { color: #10b981; font-size: 32px; font-weight: bold; }
    .savings { color: #059669; font-size: 18px; font-weight: bold; margin-top: 10px; }
    .button { display: inline-block; background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Price Drop Alert!</h1>
    </div>
    <div class="content">
      <h2>Hi ${recipientName},</h2>
      <p>Great news! An item you're tracking has dropped in price:</p>

      ${itemImage ? `<img src="${itemImage}" alt="${itemTitle}" style="max-width: 100%; border-radius: 8px; margin: 20px 0;">` : ''}

      <h3>${itemTitle}</h3>

      <div class="price-box">
        <div class="old-price">${symbol}${previousPrice.toFixed(2)}</div>
        <div class="new-price">${symbol}${currentPrice.toFixed(2)}</div>
        <div class="savings">You save ${symbol}${savings.toFixed(2)} (${dropPercent}%)</div>
      </div>

      <center>
        <a href="${itemUrl}" class="button">View on Amazon</a>
      </center>

      <p style="margin-top: 20px; font-size: 14px; color: #666;">
        This link will take you directly to the product page on Amazon where you can complete your purchase.
      </p>
    </div>
    <div class="footer">
      <p>You're receiving this email because you subscribed to price alerts for this item.</p>
      <p>Amazon Price Tracker</p>
    </div>
  </div>
</body>
</html>
    `
  }
}
