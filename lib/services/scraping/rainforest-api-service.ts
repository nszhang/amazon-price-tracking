// Rainforest API Service
// Uses Rainforest API to fetch Amazon product data
// https://www.rainforestapi.com

import type { AmazonDomain } from '@/lib/types'
import { BaseScraper, ScrapingResult, ScrapedProduct } from './base-scraper'

interface RainforestProductResponse {
  request_info: {
    success: boolean
    credits_used: number
    credits_remaining: number
  }
  product?: {
    asin: string
    title: string
    brand?: string
    main_image?: {
      link: string
    }
    buybox_winner?: {
      price?: {
        value: number
        currency: string
        raw: string
      }
      availability?: string
    }
    link: string
    category?: string
  }
}

export class RainforestAPIService extends BaseScraper {
  private readonly apiKey: string
  private readonly baseUrl = 'https://api.rainforestapi.com/request'

  constructor(apiKey: string) {
    super()
    this.apiKey = apiKey
  }

  async scrapeProduct(asin: string, domain: AmazonDomain = 'com'): Promise<ScrapingResult> {
    try {
      const amazonDomain = this.mapToRainforestDomain(domain)
      
      const params = new URLSearchParams({
        api_key: this.apiKey,
        type: 'product',
        asin: asin.toUpperCase(),
        amazon_domain: amazonDomain,
      })

      const response = await fetch(`${this.baseUrl}?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return {
          success: false,
          error: errorData.message || `API request failed: ${response.status}`,
          rateLimited: response.status === 429,
        }
      }

      const data: RainforestProductResponse = await response.json()

      if (!data.request_info.success || !data.product) {
        return {
          success: false,
          error: 'Product not found or API request unsuccessful',
        }
      }

      const product = this.mapToScrapedProduct(data.product, domain)
      
      return {
        success: true,
        product,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }
    }
  }

  async scrapeFromUrl(url: string): Promise<ScrapingResult> {
    const asin = this.extractASIN(url)
    const domain = this.extractDomain(url)

    if (!asin) {
      return {
        success: false,
        error: 'Could not extract ASIN from URL',
      }
    }

    return this.scrapeProduct(asin, domain)
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

  private mapToRainforestDomain(domain: AmazonDomain): string {
    // Rainforest API uses 'amazon.com', 'amazon.co.uk', etc.
    if (domain === 'co.uk') return 'amazon.co.uk'
    if (domain === 'co.jp') return 'amazon.co.jp'
    return `amazon.${domain}`
  }

  private mapToScrapedProduct(
    apiProduct: RainforestProductResponse['product'],
    domain: AmazonDomain
  ): ScrapedProduct {
    if (!apiProduct) {
      throw new Error('Product data is undefined')
    }

    const buyboxWinner = apiProduct.buybox_winner
    const price = buyboxWinner?.price?.value ?? 0
    const currency = buyboxWinner?.price?.currency ?? 'USD'
    
    // Parse availability to determine stock status
    const availability = buyboxWinner?.availability?.toLowerCase() ?? ''
    const inStock = availability.includes('in stock') || 
                    availability.includes('available') ||
                    !availability.includes('out of stock')

    return {
      asin: apiProduct.asin,
      title: apiProduct.title,
      price,
      currency,
      image_url: apiProduct.main_image?.link,
      brand: apiProduct.brand,
      category: apiProduct.category,
      in_stock: inStock,
      url: apiProduct.link,
      domain,
    }
  }
}
