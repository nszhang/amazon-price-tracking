// Database and Application Type Definitions

export type AmazonDomain = 'ca' | 'com' | 'co.uk' | 'de' | 'fr' | 'es' | 'it' | 'co.jp';

export interface AmazonDomainInfo {
  value: AmazonDomain;
  name: string;
  flag: string;
}
export type AlertStatus = 'active' | 'triggered' | 'disabled';
export type ScrapeStatus = 'pending' | 'success' | 'failed' | 'rate_limited';

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  alert_email?: string;
  timezone: string;
  theme: Theme;
  preferences: UserPreferences;
  created_at: string;
  updated_at: string;
}

export interface UserPreferences {
  currency: string;
  default_alert_threshold_percent: number;
  default_amazon_domain?: AmazonDomain;
}

export type Theme = 'light' | 'dark' | 'system';

export interface TrackedItem {
  id: number;
  user_id: string;
  asin: string;
  isbn?: string;
  amazon_url: string;
  amazon_domain: AmazonDomain;
  title: string;
  brand?: string;
  category?: string;
  image_url?: string;
  current_price: number;
  currency: string;
  alert_threshold: number;
  alert_threshold_percent?: number;
  alert_enabled: boolean;
  notes?: string;
  first_tracked_at: string;
  last_checked_at?: string;
  last_price_drop_at?: string;
  consecutive_captchas?: number;
  scrape_retry_count?: number;
  created_at: string;
  updated_at: string;
}

export interface PriceHistory {
  id: number;
  item_id: number;
  price: number;
  currency: string;
  in_stock: boolean;
  scrape_status: ScrapeStatus;
  error_message?: string;
  scraped_at: string;
}

export interface PriceAlert {
  id: number;
  user_id: string;
  item_id: number;
  threshold_price: number;
  actual_price: number;
  price_drop_percent?: number;
  previous_price?: number;
  status: AlertStatus;
  email_sent_at?: string;
  email_sent_to?: string;
  email_status?: string;
  triggered_at: string;
  acknowledged_at?: string;
  created_at: string;
  tracked_items?: {
    title: string
    asin: string
    amazon_url: string
  };
}

// Scraping Types
export interface ScrapedProduct {
  asin: string;
  title: string;
  price: number;
  currency: string;
  image_url?: string;
  brand?: string;
  category?: string;
  in_stock: boolean;
  url: string;
  domain: AmazonDomain;
}

export interface ScrapingResult {
  success: boolean;
  product?: ScrapedProduct;
  error?: string;
  rateLimited?: boolean;
}

// Form Types
export interface AddItemInput {
  url: string;
  alert_threshold?: number;
  alert_threshold_percent?: number;
  notes?: string;
}

export interface UpdateItemInput {
  title?: string;
  image_url?: string;
  brand?: string;
  category?: string;
  current_price?: number;
  currency?: string;
  alert_threshold?: number;
  alert_threshold_percent?: number;
  alert_enabled?: boolean;
  notes?: string;
}

export interface UpdateProfileInput {
  full_name?: string;
  avatar_url?: string;
  alert_email?: string;
  timezone?: string;
  theme?: Theme;
  preferences?: Partial<UserPreferences>;
}
