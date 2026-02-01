// Profiles Service - Database operations for user profiles
// Replaces Supabase with raw PostgreSQL queries

import { query } from '@/lib/db/config'
import type { UserProfile, UpdateProfileInput } from '@/lib/types'

export class ProfilesService {
  /**
   * Get user profile by ID
   */
  static async getProfile(userId: string): Promise<UserProfile | null> {
    const result = await query(
      `SELECT
        id, email, full_name, avatar_url, alert_email, timezone, theme,
        currency, default_alert_threshold_percent, default_amazon_domain, created_at, updated_at
       FROM users
       WHERE id = $1`,
      [userId]
    )

    if (result.rows.length === 0) {
      return null
    }

    return this.mapRowToProfile(result.rows[0])
  }

  /**
   * Get user profile by email
   */
  static async getProfileByEmail(email: string): Promise<UserProfile | null> {
    const result = await query(
      `SELECT
        id, email, full_name, avatar_url, alert_email, timezone, theme,
        currency, default_alert_threshold_percent, default_amazon_domain, created_at, updated_at
       FROM users
       WHERE email = $1`,
      [email.toLowerCase()]
    )

    if (result.rows.length === 0) {
      return null
    }

    return this.mapRowToProfile(result.rows[0])
  }

  /**
   * Create a new user (registration)
   */
  static async createUser(data: {
    email: string
    password_hash: string
    full_name?: string
    avatar_url?: string
  }): Promise<UserProfile> {
    const result = await query(
      `INSERT INTO users (email, password_hash, full_name, avatar_url)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        data.email.toLowerCase(),
        data.password_hash,
        data.full_name || null,
        data.avatar_url || null
      ]
    )

    return this.mapRowToProfile(result.rows[0])
  }

  /**
   * Update user profile
   */
  static async updateProfile(userId: string, input: UpdateProfileInput): Promise<UserProfile> {
    const setClause: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (input.full_name !== undefined) {
      setClause.push(`full_name = $${paramIndex++}`)
      values.push(input.full_name)
    }
    if (input.avatar_url !== undefined) {
      setClause.push(`avatar_url = $${paramIndex++}`)
      values.push(input.avatar_url)
    }
    if (input.alert_email !== undefined) {
      setClause.push(`alert_email = $${paramIndex++}`)
      values.push(input.alert_email)
    }
    if (input.timezone !== undefined) {
      setClause.push(`timezone = $${paramIndex++}`)
      values.push(input.timezone)
    }
    if (input.theme !== undefined) {
      setClause.push(`theme = $${paramIndex++}`)
      values.push(input.theme)
    }
    if (input.preferences?.currency !== undefined) {
      setClause.push(`currency = $${paramIndex++}`)
      values.push(input.preferences.currency)
    }
    if (input.preferences?.default_alert_threshold_percent !== undefined) {
      setClause.push(`default_alert_threshold_percent = $${paramIndex++}`)
      values.push(input.preferences.default_alert_threshold_percent)
    }
    if (input.preferences?.default_amazon_domain !== undefined) {
      setClause.push(`default_amazon_domain = $${paramIndex++}`)
      values.push(input.preferences.default_amazon_domain)
    }

    if (setClause.length === 0) {
      const profile = await this.getProfile(userId)
      if (!profile) throw new Error('Profile not found')
      return profile
    }

    values.push(userId)

    const result = await query(
      `UPDATE users 
       SET ${setClause.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex++}
       RETURNING *`,
      values
    )

    if (result.rows.length === 0) {
      throw new Error('Profile not found')
    }

    return this.mapRowToProfile(result.rows[0])
  }

  /**
   * Delete user profile
   */
  static async deleteProfile(userId: string): Promise<void> {
    const result = await query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [userId]
    )

    if (result.rows.length === 0) {
      throw new Error('Profile not found')
    }
  }

  /**
   * Get user's email for alerts
   */
  static async getAlertEmail(userId: string): Promise<string> {
    const profile = await this.getProfile(userId)
    if (!profile) throw new Error('Profile not found')
    return profile.alert_email || profile.email
  }

  private static mapRowToProfile(row: any): UserProfile {
    return {
      id: row.id,
      email: row.email,
      full_name: row.full_name,
      avatar_url: row.avatar_url,
      alert_email: row.alert_email,
      timezone: row.timezone,
      theme: row.theme || 'system',
      preferences: {
        currency: row.currency,
        default_alert_threshold_percent: row.default_alert_threshold_percent,
        default_amazon_domain: row.default_amazon_domain,
      },
      created_at: row.created_at?.toISOString(),
      updated_at: row.updated_at?.toISOString(),
    }
  }
}
