// Amazon URL and Product Parser

import type { AmazonDomain, ScrapedProduct } from '../types';

export class AmazonParser {
  /**
   * Extract ASIN from various Amazon URL formats
   */
  static extractASIN(url: string): string | null {
    const patterns = [
      /\/dp\/([A-Z0-9]{10})/i,
      /\/gp\/product\/([A-Z0-9]{10})/i,
      /\/ASIN\/([A-Z0-9]{10})/i,
      /\/([A-Z0-9]{10})(?:\/|$)/i
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1].toUpperCase();
      }
    }

    // If input is just an ASIN
    if (/^[A-Z0-9]{10}$/i.test(url.trim())) {
      return url.trim().toUpperCase();
    }

    return null;
  }

  /**
   * Extract Amazon domain from URL
   */
  static extractDomain(url: string): AmazonDomain {
    const match = url.match(/amazon\.([a-z\.]+)/i);
    if (match) {
      const domain = match[1].replace('.', '') as AmazonDomain;
      if (['com', 'co.uk', 'de', 'fr', 'es', 'it', 'co.jp'].includes(domain)) {
        return domain;
      }
    }
    return 'com';
  }

  /**
   * Validate Amazon URL
   */
  static isValidAmazonUrl(url: string): boolean {
    return /^https?:\/\/(www\.)?amazon\.[a-z]{2,3}(\/[a-z]{2})?\/.*\/dp\/[A-Z0-9]{10}/.test(url);
  }

  /**
   * Validate ISBN (10 or 13 digit)
   */
  static isValidISBN(isbn: string): boolean {
    const cleaned = isbn.replace(/[-\s]/g, '');
    return /^(\d{10}|\d{13})$/.test(cleaned);
  }

  /**
   * Construct Amazon URL from ASIN and domain
   */
  static buildAmazonURL(asin: string, domain: AmazonDomain = 'com'): string {
    return `https://www.amazon.${domain}/dp/${asin}`;
  }

  /**
   * Parse user input (URL, ASIN, or ISBN) and extract product identifier
   */
  static parseInput(input: string): { type: 'url' | 'asin' | 'isbn'; value: string; domain: AmazonDomain } | null {
    const trimmed = input.trim();

    // Check if it's a URL
    if (trimmed.startsWith('http')) {
      const asin = this.extractASIN(trimmed);
      if (asin) {
        return {
          type: 'url',
          value: trimmed,
          domain: this.extractDomain(trimmed)
        };
      }
    }

    // Check if it's an ASIN
    if (/^[A-Z0-9]{10}$/i.test(trimmed)) {
      return {
        type: 'asin',
        value: trimmed.toUpperCase(),
        domain: 'com'
      };
    }

    // Check if it's an ISBN
    if (this.isValidISBN(trimmed)) {
      return {
        type: 'isbn',
        value: trimmed.replace(/[-\s]/g, ''),
        domain: 'com'
      };
    }

    return null;
  }

  /**
   * Create ScrapedProduct object from raw scraped data
   */
  static createScrapedProduct(data: {
    asin: string;
    title: string;
    price: number;
    currency?: string;
    image_url?: string;
    brand?: string;
    category?: string;
    in_stock?: boolean;
    url?: string;
    domain?: AmazonDomain;
  }): ScrapedProduct {
    return {
      asin: data.asin,
      title: data.title,
      price: data.price,
      currency: data.currency || 'USD',
      image_url: data.image_url,
      brand: data.brand,
      category: data.category,
      in_stock: data.in_stock ?? true,
      url: data.url || this.buildAmazonURL(data.asin, data.domain),
      domain: data.domain || 'com'
    };
  }
}
