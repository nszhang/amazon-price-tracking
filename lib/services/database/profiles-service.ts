// Profiles Service - Database operations for user profiles

import { createClient } from '@/lib/supabase/server'
import type { UserProfile, UpdateProfileInput } from '@/lib/types'

export class ProfilesService {
  /**
   * Get user profile by ID
   */
  static async getProfile(userId: string): Promise<UserProfile | null> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      // Profile might not exist yet
      if (error.code === 'PGRST116') return null
      throw error
    }

    return data as UserProfile
  }

  /**
   * Get user profile by email
   */
  static async getProfileByEmail(email: string): Promise<UserProfile | null> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }

    return data as UserProfile
  }

  /**
   * Create or update user profile
   */
  static async upsertProfile(userId: string, data: {
    email: string
    full_name?: string
    avatar_url?: string
  }): Promise<UserProfile> {
    const supabase = createClient()
    const { profileData, error } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        email: data.email,
        full_name: data.full_name,
        avatar_url: data.avatar_url,
      })
      .select()
      .single()

    if (error) throw error
    return profileData as UserProfile
  }

  /**
   * Update user profile
   */
  static async updateProfile(userId: string, input: UpdateProfileInput): Promise<UserProfile> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('profiles')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select()
      .single()

    if (error) throw error
    return data as UserProfile
  }

  /**
   * Delete user profile
   */
  static async deleteProfile(userId: string): Promise<void> {
    const supabase = createClient()
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId)

    if (error) throw error
  }

  /**
   * Get user's email for alerts
   */
  static async getAlertEmail(userId: string): Promise<string> {
    const profile = await this.getProfile(userId)
    if (!profile) throw new Error('Profile not found')
    return profile.alert_email || profile.email
  }
}
