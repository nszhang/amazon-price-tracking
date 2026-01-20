// Alerts Service - Database operations for price alerts

import { createClient } from '@/lib/supabase/server'
import type { PriceAlert } from '@/lib/types'

export class AlertsService {
  /**
   * Get all alerts for a user, optionally filtered by status
   */
  static async getUserAlerts(userId: string, status?: 'active' | 'triggered' | 'disabled'): Promise<PriceAlert[]> {
    const supabase = createClient()
    let query = supabase
      .from('price_alerts')
      .select('*, tracked_items(*)')
      .eq('user_id', userId)

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query.order('triggered_at', { ascending: false })

    if (error) throw error
    return (data || []) as PriceAlert[]
  }

  /**
   * Get alerts for a specific item
   */
  static async getItemAlerts(itemId: number, userId: string): Promise<PriceAlert[]> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('price_alerts')
      .select('*')
      .eq('item_id', itemId)
      .eq('user_id', userId)
      .order('triggered_at', { ascending: false })

    if (error) throw error
    return (data || []) as PriceAlert[]
  }

  /**
   * Get a single alert by ID
   */
  static async getAlertById(alertId: number, userId: string): Promise<PriceAlert | null> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('price_alerts')
      .select('*, tracked_items(*)')
      .eq('id', alertId)
      .eq('user_id', userId)
      .single()

    if (error) throw error
    return data as PriceAlert
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
    const supabase = createClient()
    const { alert: alertData, error } = await supabase
      .from('price_alerts')
      .insert({
        user_id: userId,
        item_id: itemId,
        threshold_price: data.threshold_price,
        actual_price: data.actual_price,
        price_drop_percent: data.price_drop_percent,
        previous_price: data.previous_price,
        status: 'active',
      })
      .select()
      .single()

    if (error) throw error
    return alertData as PriceAlert
  }

  /**
   * Acknowledge an alert (mark as triggered)
   */
  static async acknowledgeAlert(alertId: number, userId: string): Promise<PriceAlert> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('price_alerts')
      .update({
        status: 'triggered',
        acknowledged_at: new Date().toISOString(),
      })
      .eq('id', alertId)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) throw error
    return data as PriceAlert
  }

  /**
   * Disable an alert
   */
  static async disableAlert(alertId: number, userId: string): Promise<PriceAlert> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('price_alerts')
      .update({ status: 'disabled' })
      .eq('id', alertId)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) throw error
    return data as PriceAlert
  }

  /**
   * Delete an alert
   */
  static async deleteAlert(alertId: number, userId: string): Promise<void> {
    const supabase = createClient()
    const { error } = await supabase
      .from('price_alerts')
      .delete()
      .eq('id', alertId)
      .eq('user_id', userId)

    if (error) throw error
  }

  /**
   * Mark email as sent for an alert
   */
  static async markEmailSent(alertId: number, emailTo: string, emailStatus: 'sent' | 'failed'): Promise<void> {
    const supabase = createClient()
    const { error } = await supabase
      .from('price_alerts')
      .update({
        email_sent_at: new Date().toISOString(),
        email_sent_to: emailTo,
        email_status: emailStatus,
      })
      .eq('id', alertId)

    if (error) throw error
  }

  /**
   * Get unprocessed alerts (for cron job)
   */
  static async getUnprocessedAlerts(limit: number = 50): Promise<PriceAlert[]> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('price_alerts')
      .select('*, tracked_items(*)')
      .eq('status', 'active')
      .is('email_sent_at', null)
      .order('triggered_at', { ascending: true })
      .limit(limit)

    if (error) throw error
    return (data || []) as PriceAlert[]
  }

  /**
   * Get alert count by status
   */
  static async getAlertCounts(userId: string): Promise<{
    active: number
    triggered: number
    disabled: number
  }> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('price_alerts')
      .select('status')
      .eq('user_id', userId)

    if (error) throw error

    const counts = { active: 0, triggered: 0, disabled: 0 }
    for (const alert of data || []) {
      if (alert.status === 'active') counts.active++
      else if (alert.status === 'triggered') counts.triggered++
      else if (alert.status === 'disabled') counts.disabled++
    }

    return counts
  }
}
