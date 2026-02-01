// Alerts Service - Database operations for price alerts
// Replaces Supabase with raw PostgreSQL queries

import { query } from '@/lib/db/config'
import type { PriceAlert } from '@/lib/types'

export class AlertsService {
  /**
   * Get all alerts for a user, optionally filtered by status
   */
  static async getUserAlerts(userId: string, status?: 'active' | 'triggered' | 'disabled'): Promise<PriceAlert[]> {
    let sql = `
      SELECT 
        pa.id, pa.user_id, pa.item_id, pa.threshold_price, pa.actual_price,
        pa.price_drop_percent, pa.previous_price, pa.status, pa.email_sent_at,
        pa.email_sent_to, pa.email_status, pa.triggered_at, pa.acknowledged_at,
        pa.created_at,
        ti.title as item_title, ti.asin as item_asin, ti.amazon_url as item_url
      FROM price_alerts pa
      JOIN tracked_items ti ON pa.item_id = ti.id
      WHERE pa.user_id = $1
    `
    const params: any[] = [userId]

    if (status) {
      sql += ` AND pa.status = $2`
      params.push(status)
    }

    sql += ` ORDER BY pa.triggered_at DESC`

    const result = await query(sql, params)
    return result.rows.map(row => this.mapRowToAlert(row))
  }

  /**
   * Get alerts for a specific item
   */
  static async getItemAlerts(itemId: number, userId: string): Promise<PriceAlert[]> {
    const result = await query(
      `SELECT 
        pa.id, pa.user_id, pa.item_id, pa.threshold_price, pa.actual_price,
        pa.price_drop_percent, pa.previous_price, pa.status, pa.email_sent_at,
        pa.email_sent_to, pa.email_status, pa.triggered_at, pa.acknowledged_at,
        pa.created_at
       FROM price_alerts pa
       WHERE pa.item_id = $1 AND pa.user_id = $2
       ORDER BY pa.triggered_at DESC`,
      [itemId, userId]
    )

    return result.rows.map(row => this.mapRowToAlert(row))
  }

  /**
   * Get a single alert by ID
   */
  static async getAlertById(alertId: number, userId: string): Promise<PriceAlert | null> {
    const result = await query(
      `SELECT 
        pa.id, pa.user_id, pa.item_id, pa.threshold_price, pa.actual_price,
        pa.price_drop_percent, pa.previous_price, pa.status, pa.email_sent_at,
        pa.email_sent_to, pa.email_status, pa.triggered_at, pa.acknowledged_at,
        pa.created_at,
        ti.title as item_title, ti.asin as item_asin
       FROM price_alerts pa
       JOIN tracked_items ti ON pa.item_id = ti.id
       WHERE pa.id = $1 AND pa.user_id = $2`,
      [alertId, userId]
    )

    if (result.rows.length === 0) {
      return null
    }

    return this.mapRowToAlert(result.rows[0])
  }

  /**
   * Create a new alert (usually triggered by database trigger, but can be manual)
   */
  static async createAlert(userId: string, itemId: number, data: {
    threshold_price: number
    actual_price: number
    price_drop_percent?: number
    previous_price?: number
  }): Promise<PriceAlert> {
    const result = await query(
      `INSERT INTO price_alerts (
        user_id, item_id, threshold_price, actual_price, price_drop_percent, 
        previous_price, status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'active')
      RETURNING *`,
      [
        userId,
        itemId,
        data.threshold_price,
        data.actual_price,
        data.price_drop_percent || null,
        data.previous_price || null
      ]
    )

    return this.mapRowToAlert(result.rows[0])
  }

  /**
   * Acknowledge an alert (mark as triggered)
   */
  static async acknowledgeAlert(alertId: number, userId: string): Promise<PriceAlert> {
    const result = await query(
      `UPDATE price_alerts 
       SET status = 'triggered', acknowledged_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [alertId, userId]
    )

    if (result.rows.length === 0) {
      throw new Error('Alert not found')
    }

    return this.mapRowToAlert(result.rows[0])
  }

  /**
   * Disable an alert
   */
  static async disableAlert(alertId: number, userId: string): Promise<PriceAlert> {
    const result = await query(
      `UPDATE price_alerts 
       SET status = 'disabled'
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [alertId, userId]
    )

    if (result.rows.length === 0) {
      throw new Error('Alert not found')
    }

    return this.mapRowToAlert(result.rows[0])
  }

  /**
   * Delete an alert
   */
  static async deleteAlert(alertId: number, userId: string): Promise<void> {
    const result = await query(
      'DELETE FROM price_alerts WHERE id = $1 AND user_id = $2 RETURNING id',
      [alertId, userId]
    )

    if (result.rows.length === 0) {
      throw new Error('Alert not found')
    }
  }

  /**
   * Mark email as sent for an alert
   */
  static async markEmailSent(alertId: number, emailTo: string, emailStatus: 'sent' | 'failed'): Promise<void> {
    await query(
      `UPDATE price_alerts 
       SET email_sent_at = NOW(), email_sent_to = $2, email_status = $3
       WHERE id = $1`,
      [alertId, emailTo, emailStatus]
    )
  }

  /**
   * Get unprocessed alerts (for cron job)
   */
  static async getUnprocessedAlerts(limit: number = 50): Promise<PriceAlert[]> {
    const result = await query(
      `SELECT 
        pa.id, pa.user_id, pa.item_id, pa.threshold_price, pa.actual_price,
        pa.price_drop_percent, pa.previous_price, pa.status, pa.email_sent_at,
        pa.email_sent_to, pa.email_status, pa.triggered_at, pa.acknowledged_at,
        pa.created_at,
        ti.title as item_title, ti.asin as item_asin, ti.amazon_url as item_url
       FROM price_alerts pa
       JOIN tracked_items ti ON pa.item_id = ti.id
       WHERE pa.status = 'active' AND pa.email_sent_at IS NULL
       ORDER BY pa.triggered_at ASC
       LIMIT $1`,
      [limit]
    )

    return result.rows.map(row => this.mapRowToAlert(row))
  }

  /**
   * Get alert count by status
   */
  static async getAlertCounts(userId: string): Promise<{
    active: number
    triggered: number
    disabled: number
  }> {
    const result = await query(
      `SELECT 
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_count,
        COUNT(CASE WHEN status = 'triggered' THEN 1 END) as triggered_count,
        COUNT(CASE WHEN status = 'disabled' THEN 1 END) as disabled_count
       FROM price_alerts
       WHERE user_id = $1`,
      [userId]
    )

    const row = result.rows[0]
    return {
      active: parseInt(row.active_count),
      triggered: parseInt(row.triggered_count),
      disabled: parseInt(row.disabled_count),
    }
  }

  private static mapRowToAlert(row: any): PriceAlert {
    return {
      id: row.id,
      user_id: row.user_id,
      item_id: row.item_id,
      threshold_price: parseFloat(row.threshold_price),
      actual_price: parseFloat(row.actual_price),
      price_drop_percent: row.price_drop_percent ? parseFloat(row.price_drop_percent) : undefined,
      previous_price: row.previous_price ? parseFloat(row.previous_price) : undefined,
      status: row.status,
      email_sent_at: row.email_sent_at?.toISOString(),
      email_sent_to: row.email_sent_to,
      email_status: row.email_status,
      triggered_at: row.triggered_at?.toISOString(),
      acknowledged_at: row.acknowledged_at?.toISOString(),
      created_at: row.created_at?.toISOString(),
      // Include item details for email service
      tracked_items: {
        title: row.item_title,
        asin: row.item_asin,
        amazon_url: row.item_url,
      } as any,
    }
  }
}
