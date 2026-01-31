// Price History Service - Database operations for price history
// Replaces Supabase with raw PostgreSQL queries

import { query } from '@/lib/db/config'
import type { PriceHistory } from '@/lib/types'

export class PriceHistoryService {
  /**
   * Get price history for an item
   */
  static async getItemHistory(
    itemId: number,
    days: number = 30
  ): Promise<PriceHistory[]> {
    const since = new Date()
    since.setDate(since.getDate() - days)

    const result = await query(
      `SELECT id, item_id, price, currency, in_stock, scrape_status, error_message, scraped_at
       FROM price_history
       WHERE item_id = $1 AND scraped_at >= $2
       ORDER BY scraped_at DESC`,
      [itemId, since.toISOString()]
    )

    return result.rows.map(row => this.mapRowToHistory(row))
  }

  /**
   * Get all price history for an item (no time limit)
   */
  static async getItemHistoryAll(itemId: number): Promise<PriceHistory[]> {
    const result = await query(
      `SELECT id, item_id, price, currency, in_stock, scrape_status, error_message, scraped_at
       FROM price_history
       WHERE item_id = $1
       ORDER BY scraped_at DESC`,
      [itemId]
    )

    return result.rows.map(row => this.mapRowToHistory(row))
  }

  /**
   * Get latest price for an item
   */
  static async getLatestPrice(itemId: number): Promise<PriceHistory | null> {
    const result = await query(
      `SELECT id, item_id, price, currency, in_stock, scrape_status, error_message, scraped_at
       FROM price_history
       WHERE item_id = $1 AND scrape_status = 'success'
       ORDER BY scraped_at DESC
       LIMIT 1`,
      [itemId]
    )

    if (result.rows.length === 0) {
      return null
    }

    return this.mapRowToHistory(result.rows[0])
  }

  /**
   * Get price range for an item (min and max prices)
   */
  static async getPriceRange(
    itemId: number,
    days: number = 30
  ): Promise<{ min: number; max: number; avg: number } | null> {
    const since = new Date()
    since.setDate(since.getDate() - days)

    const result = await query(
      `SELECT 
        MIN(price) as min_price,
        MAX(price) as max_price,
        AVG(price) as avg_price
       FROM price_history
       WHERE item_id = $1 AND scraped_at >= $2 AND price > 0`,
      [itemId, since.toISOString()]
    )

    if (result.rows.length === 0 || result.rows[0].min_price === null) {
      return null
    }

    return {
      min: parseFloat(result.rows[0].min_price),
      max: parseFloat(result.rows[0].max_price),
      avg: parseFloat(result.rows[0].avg_price),
    }
  }

  /**
   * Add a price history entry
   */
  static async addPriceEntry(data: {
    item_id: number
    price: number
    currency?: string
    in_stock?: boolean
    scrape_status?: 'pending' | 'success' | 'failed' | 'rate_limited'
    error_message?: string
  }): Promise<PriceHistory> {
    const result = await query(
      `INSERT INTO price_history (item_id, price, currency, in_stock, scrape_status, error_message)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        data.item_id,
        data.price,
        data.currency || 'USD',
        data.in_stock ?? true,
        data.scrape_status || 'success',
        data.error_message || null
      ]
    )

    return this.mapRowToHistory(result.rows[0])
  }

  /**
   * Get failed scrape attempts
   */
  static async getFailedScrapes(itemId: number, limit: number = 10): Promise<PriceHistory[]> {
    const result = await query(
      `SELECT id, item_id, price, currency, in_stock, scrape_status, error_message, scraped_at
       FROM price_history
       WHERE item_id = $1 AND scrape_status != 'success'
       ORDER BY scraped_at DESC
       LIMIT $2`,
      [itemId, limit]
    )

    return result.rows.map(row => this.mapRowToHistory(row))
  }

  /**
   * Clean up old price history (for maintenance)
   */
  static async cleanupOldHistory(daysToKeep: number = 365): Promise<number> {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - daysToKeep)

    const result = await query(
      `DELETE FROM price_history 
       WHERE scraped_at < $1
       RETURNING id`,
      [cutoff.toISOString()]
    )

    return result.rows.length
  }

  private static mapRowToHistory(row: any): PriceHistory {
    return {
      id: row.id,
      item_id: row.item_id,
      price: parseFloat(row.price),
      currency: row.currency,
      in_stock: row.in_stock,
      scrape_status: row.scrape_status,
      error_message: row.error_message,
      scraped_at: row.scraped_at?.toISOString(),
    }
  }
}
