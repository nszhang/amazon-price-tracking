// Items Service - Database operations for tracked items
// Replaces Supabase with raw PostgreSQL queries

import { query } from '@/lib/db/config'
import type { TrackedItem, AddItemInput, UpdateItemInput } from '@/lib/types'

export class ItemsService {
  /**
   * Get all items for a user
   */
  static async getUserItems(userId: string, search?: string): Promise<TrackedItem[]> {
    let queryText = `SELECT
        id, user_id, asin, isbn, amazon_url, amazon_domain, title, brand, category,
        image_url, current_price, currency, alert_threshold, alert_threshold_percent,
        alert_enabled, notes, first_tracked_at, last_checked_at, last_price_drop_at,
        created_at, updated_at
       FROM tracked_items
       WHERE user_id = $1`
    const params: any[] = [userId]

    if (search) {
      queryText += ` AND (title ILIKE $2 OR asin ILIKE $2 OR isbn ILIKE $2)`
      params.push(`%${search}%`)
    }

    queryText += ` ORDER BY created_at DESC`

    const result = await query(queryText, params)

    return result.rows.map(row => this.mapRowToItem(row))
  }

  /**
   * Get all tracked items across all users (for cron scraping)
   */
  static async getAllItems(): Promise<TrackedItem[]> {
    const result = await query(
      `SELECT
        id, user_id, asin, isbn, amazon_url, amazon_domain, title, brand, category,
        image_url, current_price, currency, alert_threshold, alert_threshold_percent,
        alert_enabled, notes, first_tracked_at, last_checked_at, last_price_drop_at,
        created_at, updated_at
       FROM tracked_items
       ORDER BY last_checked_at ASC NULLS FIRST`
    )

    return result.rows.map(row => this.mapRowToItem(row))
  }

  /**
   * Update item fields without requiring userId (for cron jobs)
   */
  static async updateItemById(itemId: number, input: UpdateItemInput): Promise<void> {
    const setClause: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (input.title !== undefined) {
      setClause.push(`title = $${paramIndex++}`)
      values.push(input.title)
    }
    if (input.image_url !== undefined) {
      setClause.push(`image_url = $${paramIndex++}`)
      values.push(input.image_url)
    }
    if (input.brand !== undefined) {
      setClause.push(`brand = $${paramIndex++}`)
      values.push(input.brand)
    }
    if (input.current_price !== undefined) {
      setClause.push(`current_price = $${paramIndex++}`)
      values.push(input.current_price)
    }
    if (input.currency !== undefined) {
      setClause.push(`currency = $${paramIndex++}`)
      values.push(input.currency)
    }

    if (setClause.length === 0) return

    setClause.push(`last_checked_at = NOW()`)
    setClause.push(`updated_at = NOW()`)
    values.push(itemId)

    await query(
      `UPDATE tracked_items SET ${setClause.join(', ')} WHERE id = $${paramIndex}`,
      values
    )
  }

  /**
   * Get a single item by ID
   */
  static async getItemById(itemId: number, userId: string): Promise<TrackedItem | null> {
    const result = await query(
      `SELECT
        id, user_id, asin, isbn, amazon_url, amazon_domain, title, brand, category,
        image_url, current_price, currency, alert_threshold, alert_threshold_percent,
        alert_enabled, notes, first_tracked_at, last_checked_at, last_price_drop_at,
        created_at, updated_at
       FROM tracked_items
       WHERE id = $1 AND user_id = $2`,
      [itemId, userId]
    )

    if (result.rows.length === 0) {
      return null
    }

    return this.mapRowToItem(result.rows[0])
  }

  /**
   * Get a single item by ASIN
   */
  static async getItemByAsin(asin: string, userId: string): Promise<TrackedItem | null> {
    const result = await query(
      `SELECT
        id, user_id, asin, isbn, amazon_url, amazon_domain, title, brand, category,
        image_url, current_price, currency, alert_threshold, alert_threshold_percent,
        alert_enabled, notes, first_tracked_at, last_checked_at, last_price_drop_at,
        created_at, updated_at
       FROM tracked_items
       WHERE asin = $1 AND user_id = $2`,
      [asin, userId]
    )

    if (result.rows.length === 0) {
      return null
    }

    return this.mapRowToItem(result.rows[0])
  }

  /**
   * Create a new tracked item
   */
  static async createItem(userId: string, input: AddItemInput & {
    asin: string
    isbn?: string
    amazon_url: string
    amazon_domain: string
    title: string
    current_price?: number
    currency?: string
    image_url?: string
    brand?: string
    category?: string
  }): Promise<TrackedItem> {
    console.log('[ItemsService.createItem] Input:', {
      asin: input.asin,
      asinLength: input.asin.length,
      isbn: input.isbn,
      isbnLength: input.isbn?.length,
      amazon_domain: input.amazon_domain,
      amazon_domain_length: input.amazon_domain?.length
    })

    // The domain should already be in the correct format (ca, com, co.uk, etc.)
    // Just ensure it fits within VARCHAR(10)
    let domain = input.amazon_domain || 'com'
    if (domain.length > 10) {
      // Extract just the TLD if too long
      const parts = domain.split('.')
      domain = parts[parts.length - 1]
    }

    const result = await query(
      `INSERT INTO tracked_items (
        user_id, asin, isbn, amazon_url, amazon_domain, title, brand, category,
        image_url, current_price, currency, alert_threshold, alert_threshold_percent,
        alert_enabled, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        userId,
        input.asin,
        input.isbn || null,
        input.amazon_url,
        domain,
        input.title,
        input.brand || null,
        input.category || null,
        input.image_url || null,
        input.current_price || 0,
        input.currency || 'USD',
        input.alert_threshold || (input.current_price || 0) * 0.9,
        input.alert_threshold_percent || 10,
        true,
        input.notes || null
      ]
    )

    return this.mapRowToItem(result.rows[0])
  }

  /**
   * Update an existing item
   */
  static async updateItem(itemId: number, userId: string, input: UpdateItemInput): Promise<TrackedItem> {
    const setClause: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (input.title !== undefined) {
      setClause.push(`title = $${paramIndex++}`)
      values.push(input.title)
    }
    if (input.image_url !== undefined) {
      setClause.push(`image_url = $${paramIndex++}`)
      values.push(input.image_url)
    }
    if (input.brand !== undefined) {
      setClause.push(`brand = $${paramIndex++}`)
      values.push(input.brand)
    }
    if (input.category !== undefined) {
      setClause.push(`category = $${paramIndex++}`)
      values.push(input.category)
    }
    if (input.current_price !== undefined) {
      setClause.push(`current_price = $${paramIndex++}`)
      values.push(input.current_price)
    }
    if (input.alert_threshold !== undefined) {
      setClause.push(`alert_threshold = $${paramIndex++}`)
      values.push(input.alert_threshold)
    }
    if (input.alert_threshold_percent !== undefined) {
      setClause.push(`alert_threshold_percent = $${paramIndex++}`)
      values.push(input.alert_threshold_percent)
    }
    if (input.alert_enabled !== undefined) {
      setClause.push(`alert_enabled = $${paramIndex++}`)
      values.push(input.alert_enabled)
    }
    if (input.notes !== undefined) {
      setClause.push(`notes = $${paramIndex++}`)
      values.push(input.notes)
    }

    if (setClause.length === 0) {
      const item = await this.getItemById(itemId, userId)
      if (!item) throw new Error('Item not found')
      return item
    }

    values.push(itemId, userId)

    const result = await query(
      `UPDATE tracked_items
       SET ${setClause.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex++} AND user_id = $${paramIndex++}
       RETURNING *`,
      values
    )

    if (result.rows.length === 0) {
      throw new Error('Item not found')
    }

    return this.mapRowToItem(result.rows[0])
  }

  /**
   * Delete an item
   */
  static async deleteItem(itemId: number, userId: string): Promise<void> {
    const result = await query(
      'DELETE FROM tracked_items WHERE id = $1 AND user_id = $2 RETURNING id',
      [itemId, userId]
    )
    
    if (result.rows.length === 0) {
      throw new Error('Item not found')
    }
  }

  /**
   * Refresh item price (trigger scrape)
   */
  static async refreshItemPrice(itemId: number, userId: string): Promise<TrackedItem> {
    const result = await query(
      `UPDATE tracked_items 
       SET last_checked_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [itemId, userId]
    )

    if (result.rows.length === 0) {
      throw new Error('Item not found')
    }
    
    return this.mapRowToItem(result.rows[0])
  }

  /**
   * Add price history entry
   */
  static async addPriceHistory(itemId: number, data: {
    price: number
    in_stock: boolean
    scrape_status?: 'pending' | 'success' | 'failed' | 'rate_limited'
    error_message?: string
  }): Promise<void> {
    await query(
      `INSERT INTO price_history (item_id, price, in_stock, scrape_status, error_message)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        itemId,
        data.price,
        data.in_stock,
        data.scrape_status || 'success',
        data.error_message || null
      ]
    )
  }

  /**
   * Get next batch of items to scrape, ordered by priority
   */
  static async getNextBatch(batchSize: number): Promise<TrackedItem[]> {
    const result = await query(
      `SELECT
        id, user_id, asin, isbn, amazon_url, amazon_domain, title, brand, category,
        image_url, current_price, currency, alert_threshold, alert_threshold_percent,
        alert_enabled, notes, first_tracked_at, last_checked_at, last_price_drop_at,
        consecutive_captchas, created_at, updated_at
       FROM tracked_items
       ORDER BY
        last_checked_at IS NULL DESC,
        CASE WHEN title = 'Loading...' OR current_price = 0 THEN 0 ELSE 1 END,
        CASE WHEN consecutive_captchas < 3 THEN 0 ELSE 1 END,
        last_checked_at ASC
       LIMIT $1`,
      [batchSize]
    )

    return result.rows.map(row => this.mapRowToItem(row))
  }

  /**
   * Mark an item as checked, advancing the round-robin pointer.
   * If CAPTCHA, increment consecutive_captchas; otherwise reset to 0.
   */
  static async markChecked(itemId: number, wasCaptcha: boolean): Promise<void> {
    if (wasCaptcha) {
      await query(
        `UPDATE tracked_items
         SET last_checked_at = NOW(),
             consecutive_captchas = COALESCE(consecutive_captchas, 0) + 1,
             updated_at = NOW()
         WHERE id = $1`,
        [itemId]
      )
    } else {
      await query(
        `UPDATE tracked_items
         SET last_checked_at = NOW(),
             consecutive_captchas = 0,
             updated_at = NOW()
         WHERE id = $1`,
        [itemId]
      )
    }
  }

  /**
   * Get cycle status: aggregate stats for reporting
   */
  static async getCycleStatus(): Promise<{
    total: number
    neverChecked: number
    captchaBlocked: number
    oldestCheckedAt: string | null
    newestCheckedAt: string | null
  }> {
    const result = await query(
      `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE last_checked_at IS NULL)::int AS never_checked,
        COUNT(*) FILTER (WHERE consecutive_captchas >= 3)::int AS captcha_blocked,
        MIN(last_checked_at) AS oldest_checked_at,
        MAX(last_checked_at) AS newest_checked_at
       FROM tracked_items`
    )

    const row = result.rows[0]
    return {
      total: row.total,
      neverChecked: row.never_checked,
      captchaBlocked: row.captcha_blocked,
      oldestCheckedAt: row.oldest_checked_at?.toISOString() ?? null,
      newestCheckedAt: row.newest_checked_at?.toISOString() ?? null,
    }
  }

  private static mapRowToItem(row: any): TrackedItem {
    return {
      id: row.id,
      user_id: row.user_id,
      asin: row.asin,
      isbn: row.isbn,
      amazon_url: row.amazon_url,
      amazon_domain: row.amazon_domain,
      title: row.title,
      brand: row.brand,
      category: row.category,
      image_url: row.image_url,
      current_price: parseFloat(row.current_price),
      currency: row.currency,
      alert_threshold: parseFloat(row.alert_threshold),
      alert_threshold_percent: row.alert_threshold_percent,
      alert_enabled: row.alert_enabled,
      notes: row.notes,
      first_tracked_at: row.first_tracked_at?.toISOString(),
      last_checked_at: row.last_checked_at?.toISOString(),
      last_price_drop_at: row.last_price_drop_at?.toISOString(),
      consecutive_captchas: row.consecutive_captchas ?? 0,
      scrape_retry_count: row.scrape_retry_count ?? 0,
      created_at: row.created_at?.toISOString(),
      updated_at: row.updated_at?.toISOString(),
    }
  }

  /**
   * Get items stuck in "Loading..." state for retry
   */
  static async getLoadingItems(limit: number = 10): Promise<TrackedItem[]> {
    const result = await query(
      `SELECT
        id, user_id, asin, isbn, amazon_url, amazon_domain, title, brand, category,
        image_url, current_price, currency, alert_threshold, alert_threshold_percent,
        alert_enabled, notes, first_tracked_at, last_checked_at, last_price_drop_at,
        consecutive_captchas, scrape_retry_count, created_at, updated_at
       FROM tracked_items
       WHERE title = 'Loading...'
       ORDER BY scrape_retry_count ASC, created_at ASC
       LIMIT $1`,
      [limit]
    )

    return result.rows.map(row => this.mapRowToItem(row))
  }

  /**
   * Increment retry count for a loading item
   */
  static async incrementRetryCount(itemId: number): Promise<void> {
    await query(
      `UPDATE tracked_items
       SET scrape_retry_count = COALESCE(scrape_retry_count, 0) + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [itemId]
    )
  }

  /**
   * Reset retry count when item successfully loads
   */
  static async resetRetryCount(itemId: number): Promise<void> {
    await query(
      `UPDATE tracked_items
       SET scrape_retry_count = 0,
           updated_at = NOW()
       WHERE id = $1`,
      [itemId]
    )
  }

  /**
   * Delete item by ID (for cleanup of failed items)
   */
  static async deleteItemById(itemId: number): Promise<void> {
    await query('DELETE FROM tracked_items WHERE id = $1', [itemId])
  }
}
