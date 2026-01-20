// Amazon Web Scraper
// Scrapes Amazon product pages (for now - can be swapped with API later)

import type { AmazonDomain } from '@/lib/types'
import { BaseScraper, ScrapingResult, ScrapedProduct } from './base-scraper'

export class AmazonScraper extends BaseScraper {
  private readonly userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

  async scrapeProduct(asin: string, domain: AmazonDomain = 'com'): Promise<ScrapingResult> {
    const url = `https://www.amazon.${domain}/dp/${asin}`
    return this.scrapeFromUrl(url)
  }

  async scrapeFromUrl(url: string): Promise<ScrapingResult> {
    try {
      // Extract ASIN and domain from URL
      const asin = this.extractASIN(url)
      const domain = this.extractDomain(url)

      if (!asin) {
        return {
          success: false,
          error: 'Could not extract ASIN from URL',
        }
      }

      // Call our internal API route that does the actual scraping
      // This is necessary because browser-based scraping doesn't work well
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, asin, domain }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        return {
          success: false,
          error: errorData.error || 'Scraping failed',
          rateLimited: response.status === 429,
        }
      }

      const data = await response.json()

      return {
        success: true,
        product: {
          asin: data.asin,
          title: data.title,
          price: data.price,
          currency: data.currency || 'USD',
          image_url: data.image_url,
          brand: data.brand,
          category: data.category,
          in_stock: data.in_stock ?? true,
          url,
          domain,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  validateUrl(url: string): boolean {
    return /^https?:\/\/(www\.)?amazon\.[a-z]{2,3}(\/[a-z]{2})?\/.*\/dp\/[A-Z0-9]{10}/.test(url)
  }

  extractASIN(url: string): string | null {
    const patterns = [
      /\/dp\/([A-Z0-9]{10})/i,
      /\/gp\/product\/([A-Z0-9]{10})/i,
      /ASIN\/([A-Z0-9]{10})/i,
    ]

    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match && match[1]) {
        return match[1].toUpperCase()
      }
    }

    return null
  }

  extractDomain(url: string): AmazonDomain {
    const match = url.match(/amazon\.([a-z\.]+)/i)
    if (match) {
      const domain = match[1].replace('.', '') as AmazonDomain
      if (['com', 'co.uk', 'de', 'fr', 'es', 'it', 'co.jp'].includes(domain)) {
        return domain
      }
    }
    return 'com'
  }
}
