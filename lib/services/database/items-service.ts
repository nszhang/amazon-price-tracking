// Items Service - Database operations for tracked items

import { createClient } from '@/lib/supabase/server'
import type { TrackedItem, AddItemInput, UpdateItemInput } from '@/lib/types'

export class ItemsService {
  /**
   * Get all items for a user
   */
  static async getUserItems(userId: string): Promise<TrackedItem[]> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('tracked_items')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data || []) as TrackedItem[]
  }

  /**
   * Get a single item by ID
   */
  static async getItemById(itemId: number, userId: string): Promise<TrackedItem | null> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('tracked_items')
      .select('*')
      .eq('id', itemId)
      .eq('user_id', userId)
      .single()

    if (error) throw error
    return data as TrackedItem
  }

  /**
   * Create a new tracked item
   */
  static async createItem(userId: string, input: AddItemInput & {
    asin: string
    amazon_url: string
    amazon_domain: string
    title: string
    current_price?: number
    image_url?: string
  }): Promise<TrackedItem> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('tracked_items')
      .insert({
        user_id: userId,
        asin: input.asin,
        amazon_url: input.amazon_url,
        amazon_domain: input.amazon_domain as any,
        title: input.title,
        current_price: input.current_price || 0,
        image_url: input.image_url,
        alert_threshold: input.alert_threshold || 0,
        alert_threshold_percent: input.alert_threshold_percent,
        notes: input.notes,
      })
      .select()
      .single()

    if (error) throw error
    return data as TrackedItem
  }

  /**
   * Update an existing item
   */
  static async updateItem(itemId: number, userId: string, input: UpdateItemInput): Promise<TrackedItem> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('tracked_items')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) throw error
    return data as TrackedItem
  }

  /**
   * Delete an item
   */
  static async deleteItem(itemId: number, userId: string): Promise<void> {
    const supabase = createClient()
    const { error } = await supabase
      .from('tracked_items')
      .delete()
      .eq('id', itemId)
      .eq('user_id', userId)

    if (error) throw error
  }

  /**
   * Refresh item price (trigger scrape)
   */
  static async refreshItemPrice(itemId: number, userId: string): Promise<TrackedItem> {
    const supabase = createClient()

    // For now, just update the last_checked_at timestamp
    // In production, this would trigger a background scrape job
    const { data, error } = await supabase
      .from('tracked_items')
      .update({
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) throw error
    return data as TrackedItem
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
    const supabase = createClient()
    const { error } = await supabase
      .from('price_history')
      .insert({
        item_id: itemId,
        price: data.price,
        in_stock: data.in_stock,
        scrape_status: data.scrape_status || 'success',
        error_message: data.error_message,
      })

    if (error) throw error
  }
}
