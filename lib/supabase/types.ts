// Supabase Database Types
// This file defines TypeScript types matching your database schema
// You can generate this automatically using: npx supabase gen types typescript --project-id YOUR_PROJECT_ID > lib/supabase/types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          alert_email: string | null
          timezone: string
          preferences: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          alert_email?: string | null
          timezone?: string
          preferences?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          alert_email?: string | null
          timezone?: string
          preferences?: Json
          updated_at?: string
        }
      }
      tracked_items: {
        Row: {
          id: number
          user_id: string
          asin: string
          isbn: string | null
          amazon_url: string
          amazon_domain: 'com' | 'co.uk' | 'de' | 'fr' | 'es' | 'it' | 'co.jp'
          title: string
          brand: string | null
          category: string | null
          image_url: string | null
          current_price: number
          currency: string
          alert_threshold: number
          alert_threshold_percent: number | null
          alert_enabled: boolean
          notes: string | null
          first_tracked_at: string
          last_checked_at: string | null
          last_price_drop_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          user_id: string
          asin: string
          isbn?: string | null
          amazon_url: string
          amazon_domain?: 'com' | 'co.uk' | 'de' | 'fr' | 'es' | 'it' | 'co.jp'
          title: string
          brand?: string | null
          category?: string | null
          image_url?: string | null
          current_price?: number
          currency?: string
          alert_threshold: number
          alert_threshold_percent?: number | null
          alert_enabled?: boolean
          notes?: string | null
          first_tracked_at?: string
          last_checked_at?: string | null
          last_price_drop_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          user_id?: string
          asin?: string
          isbn?: string | null
          amazon_url?: string
          amazon_domain?: 'com' | 'co.uk' | 'de' | 'fr' | 'es' | 'it' | 'co.jp'
          title?: string
          brand?: string | null
          category?: string | null
          image_url?: string | null
          current_price?: number
          currency?: string
          alert_threshold?: number
          alert_threshold_percent?: number | null
          alert_enabled?: boolean
          notes?: string | null
          last_checked_at?: string | null
          last_price_drop_at?: string | null
          updated_at?: string
        }
      }
      price_history: {
        Row: {
          id: number
          item_id: number
          price: number
          currency: string
          in_stock: boolean
          scrape_status: 'pending' | 'success' | 'failed' | 'rate_limited'
          error_message: string | null
          scraped_at: string
        }
        Insert: {
          id?: number
          item_id: number
          price: number
          currency?: string
          in_stock?: boolean
          scrape_status?: 'pending' | 'success' | 'failed' | 'rate_limited'
          error_message?: string | null
          scraped_at?: string
        }
        Update: {
          price?: number
          currency?: string
          in_stock?: boolean
          scrape_status?: 'pending' | 'success' | 'failed' | 'rate_limited'
          error_message?: string | null
        }
      }
      price_alerts: {
        Row: {
          id: number
          user_id: string
          item_id: number
          threshold_price: number
          actual_price: number
          price_drop_percent: number | null
          previous_price: number | null
          status: 'active' | 'triggered' | 'disabled'
          email_sent_at: string | null
          email_sent_to: string | null
          email_status: string | null
          triggered_at: string
          acknowledged_at: string | null
          created_at: string
        }
        Insert: {
          id?: number
          user_id: string
          item_id: number
          threshold_price: number
          actual_price: number
          price_drop_percent?: number | null
          previous_price?: number | null
          status?: 'active' | 'triggered' | 'disabled'
          email_sent_at?: string | null
          email_sent_to?: string | null
          email_status?: string | null
          triggered_at?: string
          acknowledged_at?: string | null
          created_at?: string
        }
        Update: {
          status?: 'active' | 'triggered' | 'disabled'
          email_sent_at?: string | null
          email_sent_to?: string | null
          email_status?: string | null
          acknowledged_at?: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      amazon_domain: 'com' | 'co.uk' | 'de' | 'fr' | 'es' | 'it' | 'co.jp'
      alert_status: 'active' | 'triggered' | 'disabled'
      scrape_status: 'pending' | 'success' | 'failed' | 'rate_limited'
    }
  }
}
