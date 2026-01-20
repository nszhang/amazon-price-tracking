// Base Scraper Interface
// All scrapers must implement this interface for easy swapping

import type { AmazonDomain } from '@/lib/types'

export interface ScrapedProduct {
  asin: string
  title: string
  price: number
  currency: string
  image_url?: string
  brand?: string
  category?: string
  in_stock: boolean
  url: string
  domain: AmazonDomain
}

export interface ScrapingResult {
  success: boolean
  product?: ScrapedProduct
  error?: string
  rateLimited?: boolean
}

export abstract class BaseScraper {
  /**
   * Scrape a product by ASIN and domain
   */
  abstract scrapeProduct(asin: string, domain: AmazonDomain): Promise<ScrapingResult>

  /**
   * Scrape a product from its URL
   */
  abstract scrapeFromUrl(url: string): Promise<ScrapingResult>

  /**
   * Validate if a URL is for this scraper
   */
  abstract validateUrl(url: string): boolean

  /**
   * Extract ASIN from URL
   */
  abstract extractASIN(url: string): string | null

  /**
   * Extract domain from URL
   */
  abstract extractDomain(url: string): AmazonDomain
}
