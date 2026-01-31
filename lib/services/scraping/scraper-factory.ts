// Scraper Factory
// Allows easy switching between web scraping and API

import { BaseScraper } from './base-scraper'
import { AmazonScraper } from './amazon-scraper'
import { RainforestAPIService } from './rainforest-api-service'

export enum ScraperType {
  WEB_SCRAPER = 'web_scraper',
  API = 'api', // Future: When using third-party API
}

export class ScraperFactory {
  private static instance: BaseScraper | null = null
  private static currentType: ScraperType = ScraperType.WEB_SCRAPER

  /**
   * Get a scraper instance (singleton pattern)
   */
  static getScraper(type?: ScraperType): BaseScraper {
    const scraperType = type || this.currentType

    // Return cached instance if type matches
    if (this.instance && this.currentType === scraperType) {
      return this.instance
    }

    // Create new instance based on type
    switch (scraperType) {
      case ScraperType.API:
        // Use Rainforest API when API key is available
        const apiKey = process.env.RAINFOREST_API_KEY
        if (apiKey) {
          this.instance = new RainforestAPIService(apiKey)
          this.currentType = ScraperType.API
          console.log('Using Rainforest API for product data')
          break
        }
        // Fall back to web scraper if no API key
        console.warn('RAINFOREST_API_KEY not found, falling back to web scraper')
        this.instance = new AmazonScraper()
        this.currentType = ScraperType.WEB_SCRAPER
        break

      case ScraperType.WEB_SCRAPER:
      default:
        this.instance = new AmazonScraper()
        this.currentType = ScraperType.WEB_SCRAPER
        break
    }

    return this.instance
  }

  /**
   * Switch to a different scraper type
   */
  static switchScraper(type: ScraperType): void {
    this.currentType = type
    this.instance = null // Clear cache so next getScraper() creates new instance
  }

  /**
   * Get current scraper type
   */
  static getCurrentType(): ScraperType {
    return this.currentType
  }
}

// Export a convenience function
export function getScraper(type?: ScraperType): BaseScraper {
  return ScraperFactory.getScraper(type)
}
