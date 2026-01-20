// Price History Service - Database operations for price history

import { createClient } from '@/lib/supabase/server'
import type { PriceHistory } from '@/lib/types'

export class PriceHistoryService {
  /**
   * Get price history for an item
   */
  static async getItemHistory(
    itemId: number,
    days: number = 30
  ): Promise<PriceHistory[]> {
    const supabase = createClient()
    const since = new Date()
    since.setDate(since.getDate() - days)

    const { data, error } = await supabase
      .from('price_history')
      .select('*')
      .eq('item_id', itemId)
      .gte('scraped_at', since.toISOString())
      .order('scraped_at', { ascending: false })

    if (error) throw error
    return (data || []) as PriceHistory[]
  }

  /**
   * Get all price history for an item (no time limit)
   */
  static async getItemHistoryAll(itemId: number): Promise<PriceHistory[]> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('price_history')
      .select('*')
      .eq('item_id', itemId)
      .order('scraped_at', { ascending: false })

    if (error) throw error
    return (data || []) as PriceHistory[]
  }

  /**
   * Get latest price for an item
   */
  static async getLatestPrice(itemId: number): Promise<PriceHistory | null> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('price_history')
      .select('*')
      .eq('item_id', itemId)
      .eq('scrape_status', 'success')
      .order('scraped_at', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }

    return data as PriceHistory
  }

  /**
   * Get price range for an item (min and max prices)
   */
  static async getPriceRange(
    itemId: number,
    days: number = 30
  ): Promise<{ min: number; max: number; avg: number } | null> {
    const history = await this.getItemHistory(itemId, days)

    if (history.length === 0) return null

    const prices = history.map(h => h.price).filter(p => p > 0)

    if (prices.length === 0) return null

    return {
      min: Math.min(...prices),
      max: Math.max(...prices),
      avg: prices.reduce((a, b) => a + b, 0) / prices.length,
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
    const supabase = createClient()
    const { entryData, error } = await supabase
      .from('price_history')
      .insert(data)
      .select()
      .single()

    if (error) throw error
    return entryData as PriceHistory
  }

  /**
   * Get failed scrape attempts
   */
  static async getFailedScrapes(itemId: number, limit: number = 10): Promise<PriceHistory[]> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('price_history')
      .select('*')
      .eq('item_id', itemId)
      .not('scrape_status', 'eq', 'success')
      .order('scraped_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return (data || []) as PriceHistory[]
  }

  /**
   * Clean up old price history (for maintenance)
   */
  static async cleanupOldHistory(daysToKeep: number = 365): Promise<number> {
    const supabase = createClient()
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - daysToKeep)

    const { data, error } = await supabase
      .from('price_history')
      .delete()
      .lt('scraped_at', cutoff.toISOString())
      .select()

    if (error) throw error
    return (data || []).length
  }
}
