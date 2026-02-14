// API Route for Amazon Scraping
// This endpoint performs server-side scraping of Amazon products

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { ItemsService } from '@/lib/services/database/items-service'
import { PriceHistoryService } from '@/lib/services/database/price-history-service'

export async function POST(request: NextRequest) {
  console.log('[SCRAPE] POST /api/scrape called')
  try {
    const { url, asin, domain } = await request.json()
    console.log(`[SCRAPE] Input: asin=${asin}, domain=${domain}`)

    if (!url || !asin) {
      return NextResponse.json(
        { error: 'URL and ASIN are required' },
        { status: 400 }
      )
    }

    // Check authentication
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Build the Amazon URL using ASIN (ISBN-10 for books)
    const amazonUrl = `https://www.amazon.${domain}/dp/${asin}`
    console.log(`[SCRAPE] Fetching: ${amazonUrl} for ASIN: ${asin}`)

    // Simple request without cookies to avoid session-based pricing differences
    const response = await fetch(amazonUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-CA,en-GB;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        'DNT': '1',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    })

    console.log(`[SCRAPE] Response status: ${response.status}`)

    // Check if we got a CAPTCHA page
    const responseText = await response.text()
    console.log(`[SCRAPE] Response length: ${responseText.length} chars`)
    if (responseText.includes('validateCaptcha') || responseText.includes('opfcaptcha')) {
      console.error('[SCRAPE] Amazon CAPTCHA detected')
      return NextResponse.json(
        { error: 'Amazon is blocking automated requests (CAPTCHA). Consider using PA-API or a paid scraping service.' },
        { status: 429 }
      )
    }

    if (!response.ok) {
      console.error(`[SCRAPE] HTTP error: ${response.status}`)
      return NextResponse.json(
        { error: `Failed to fetch page: ${response.status}` },
        { status: 500 }
      )
    }

    const html = responseText

    // Decode HTML entities (e.g. &amp; &#39; &eacute;)
    const decodeEntities = (str: string): string => {
      const entities: Record<string, string> = {
        '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'",
        '&eacute;': 'é', '&egrave;': 'è', '&ecirc;': 'ê', '&euml;': 'ë',
        '&agrave;': 'à', '&aacute;': 'á', '&acirc;': 'â', '&auml;': 'ä',
        '&ograve;': 'ò', '&oacute;': 'ó', '&ocirc;': 'ô', '&ouml;': 'ö',
        '&ugrave;': 'ù', '&uacute;': 'ú', '&ucirc;': 'û', '&uuml;': 'ü',
        '&ccedil;': 'ç', '&ntilde;': 'ñ', '&nbsp;': ' ', '&ndash;': '–', '&mdash;': '—',
      }
      return str
        .replace(/&[a-z]+;/gi, m => entities[m.toLowerCase()] || m)
        .replace(/&#(\d+);?/g, (_, n) => String.fromCharCode(parseInt(n)))
        .replace(/&#x([0-9a-f]+);?/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    }

    // Parse the HTML to extract product data
    // Note: Amazon's HTML structure changes frequently, so selectors may break
    const extractProductData = (html: string) => {
      // Title
      const titleMatch = html.match(/<span id="productTitle"[^>]*>(.+?)<\/span>/s)
      const title = titleMatch ? decodeEntities(titleMatch[1].replace(/<[^>]+>/g, '').trim()) : 'Unknown Product'

      // Currency detection
      let currency = 'USD'
      const currencyMatch = html.match(/<input[^>]+name=["']sessionCurrency["'][^>]+value=["']([A-Z]{3})["']/)
      if (currencyMatch) {
        currency = currencyMatch[1]
        console.log(`[SCRAPING] ${asin}: Detected currency: ${currency}`)
      } else {
        // Check for CAD in amazon.ca
        if (html.includes('amazon.ca') || html.includes('"physicalMarketPlaceId": "2MYYE51S11X4HQ"')) {
          currency = 'CAD'
        }
        console.log(`[SCRAPING] ${asin}: Default currency set to: ${currency}`)
      }

      // Seller detection
      let seller = null
      let buyBoxSeller = null

      // Check for Amazon as seller
      const amazonSellerMatch = html.match(/<span[^>]*>(?:Dispatched from|Ships from|Sold by)\s+(?:<[^>]*>)?Amazon(?:\.ca|\.com)?(?:<\/[^>]*>)/i)
      if (amazonSellerMatch) {
        seller = 'Amazon'
      }

      // Check buy box section for seller info
      const buyBoxMatch = html.match(/<div[^>]*buybox[^>]*>([\s\S]{1,10000})<\/div>/i)
      if (buyBoxMatch) {
        const soldByMatch = buyBoxMatch[1].match(/(Sold by|Seller):\s*<[^>]*>([^<]+)/i)
        if (soldByMatch) {
          buyBoxSeller = soldByMatch[2].trim()
          if (buyBoxSeller.toLowerCase().includes('amazon')) {
            seller = 'Amazon'
          } else {
            seller = buyBoxSeller
          }
        }
      }

      console.log(`[SCRAPING] ${asin}: Seller detected: ${seller || 'Unknown'}`)

      // Price extraction strategy:
      // Amazon pages use an accordion with multiple buying options (Prime, regular, etc.)
      // We prioritize: Prime price > regular "NEW" price > fallback patterns
      let price = 0
      let priceSource = 'none'

      // Helper to extract first a-offscreen price from an HTML section
      const extractOffscreenPrice = (section: string): number => {
        const match = section.match(/<span[^>]*class=["'][^"']*a-offscreen[^"']*["'][^>]*>\$?([\d,]+\.?\d*)<\/span>/)
        return match ? parseFloat(match[1].replace(/,/g, '')) : 0
      }

      // === Primary: Extract Prime price from buying option accordion ===
      // Only capture PRIME prices - skip third-party seller prices
      // PRIME_SAVINGS_UPSELL = Prime-exclusive deal price
      // NEW with Prime badge = Regular Amazon Prime price
      const buyingOptionPattern = /data-csa-c-buying-option-type=["'](PRIME_SAVINGS_UPSELL|NEW)["']/g
      let optionMatch
      let primePrice = 0
      let newPrimePrice = 0

      while ((optionMatch = buyingOptionPattern.exec(html)) !== null) {
        const optionType = optionMatch[1]
        const section = html.substring(optionMatch.index, optionMatch.index + 20000)
        const optionPrice = extractOffscreenPrice(section)

        if (optionPrice > 0) {
          if (optionType === 'PRIME_SAVINGS_UPSELL' && primePrice === 0) {
            primePrice = optionPrice
            console.log(`[SCRAPING] ${asin}: Prime deal price (PRIME_SAVINGS_UPSELL) = ${primePrice}`)
          } else if (optionType === 'NEW' && newPrimePrice === 0) {
            // Check if this NEW option has Prime badge (within the section)
            const hasPrime = /class=["'][^"']*a-icon-prime[^"']*["']|i-prime|prime-logo|>prime<|vprime/i.test(section)
            if (hasPrime) {
              newPrimePrice = optionPrice
              console.log(`[SCRAPING] ${asin}: Prime price (NEW with Prime badge) = ${newPrimePrice}`)
            } else {
              console.log(`[SCRAPING] ${asin}: Skipping non-Prime NEW price = ${optionPrice}`)
            }
          }
        }
      }

      // Only use Prime prices
      if (primePrice > 0) {
        price = primePrice
        priceSource = 'PrimeAccordion'
      } else if (newPrimePrice > 0) {
        price = newPrimePrice
        priceSource = 'NewPrimeAccordion'
      }

      // === Fallback 0.5: aria-checked="true" slot with Prime badge ===
      // Format variant (Paperback/Hardcover) - only if it has Prime
      if (price === 0) {
        const checkedIdx = html.indexOf('aria-checked="true"')
        if (checkedIdx >= 0) {
          const section = html.substring(checkedIdx, checkedIdx + 2000)
          // Check for Prime badge in the selected format
          const hasPrime = /class=["'][^"']*a-icon-prime[^"']*["']|i-prime|prime-logo|>prime<|vprime/i.test(section)
          if (hasPrime) {
            const ariaLabelPrice = section.match(/aria-label=["']\$?([\d,]+\.?\d*)["']/)
            if (ariaLabelPrice) {
              const slotPrice = parseFloat(ariaLabelPrice[1].replace(/,/g, ''))
              if (slotPrice > 0 && slotPrice < 1000) {
                price = slotPrice
                priceSource = 'SlotPriceCheckedPrime'
                console.log(`[SCRAPING] ${asin}: Fallback 0.5 (aria-checked slot with Prime) = ${price}`)
              }
            }
          }
        }
      }

      // === Fallback 1: corePrice_feature_div (only if Prime is present nearby) ===
      if (price === 0) {
        const corePriceMatch = html.match(/id=["']corePrice_feature_div["'][^>]*>([\s\S]{1,8000})/)
        if (corePriceMatch) {
          const corePriceSection = corePriceMatch[1]
          // Only use if Prime badge is present in the section
          const hasPrime = /class=["'][^"']*a-icon-prime[^"']*["']|i-prime|prime-logo|>prime<|vprime/i.test(corePriceSection)
          if (hasPrime) {
            const corePrice = extractOffscreenPrice(corePriceSection)
            if (corePrice > 0) {
              price = corePrice
              priceSource = 'CorePricePrime'
              console.log(`[SCRAPING] ${asin}: Fallback 1 (corePrice with Prime) = ${price}`)
            }
          }
        }
      }

      // === Fallback 2: apex-price-to-pay (only if Prime is present) ===
      if (price === 0) {
        // Look for apex price section with Prime badge
        const apexSectionMatch = html.match(/class=["']apex[^"']*price[^"']*["'][^>]*>([\s\S]{1,5000})/i)
        if (apexSectionMatch) {
          const hasPrime = /class=["'][^"']*a-icon-prime[^"']*["']|i-prime|prime-logo|>prime<|vprime/i.test(apexSectionMatch[1])
          if (hasPrime) {
            const apexPrice = extractOffscreenPrice(apexSectionMatch[1])
            if (apexPrice > 0) {
              price = apexPrice
              priceSource = 'ApexPricePrime'
              console.log(`[SCRAPING] ${asin}: Fallback 2 (apex price with Prime) = ${price}`)
            }
          }
        }
      }

      // No more fallbacks - we only want Prime prices
      // If no Prime price found, price stays 0 and existing price will be kept

      if (price > 0) {
        console.log(`[SCRAPING] ${asin}: Prime price = ${price} (${currency}), source = ${priceSource}`)
      } else {
        console.log(`[SCRAPING] ${asin}: No Prime price found - keeping existing price`)
      }

      // Image - try data-a-dynamic-image first (lazy-loaded), then src
      let image: string | null = null
      const dynamicImageMatch = html.match(/id="landingImage"[^>]*data-a-dynamic-image="[^"]*?(https:\/\/m\.media-amazon\.com\/images\/[^&"]+)/)
      if (dynamicImageMatch) {
        image = dynamicImageMatch[1].replace(/&amp;/g, '&')
      } else {
        const srcImageMatch = html.match(/<img[^>]*id="landingImage"[^>]*src="([^"]+)"/)
        image = srcImageMatch ? srcImageMatch[1] : null
      }

      // Brand / Author - try bylineInfo section with author spans first
      let brand: string | null = null
      const bylineSection = html.match(/id="bylineInfo"[^>]*>([\s\S]{1,5000}?)<\/div>/)
      if (bylineSection) {
        const authorLinks = [...bylineSection[1].matchAll(/<span[^>]*class="author[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/g)]
        if (authorLinks.length > 0) {
          brand = decodeEntities(authorLinks.map(m => m[1].trim()).join(', '))
        }
      }
      // Fallback: <a id="bylineInfo"> (non-book products)
      if (!brand) {
        const brandMatch = html.match(/<a id="bylineInfo"[^>]*>(.+?)<\/a>/s)
        brand = brandMatch ? decodeEntities(brandMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()) : null
      }

      // Availability
      const availabilityMatch = html.match(/<span id="availability"[^>]*>(.+?)<\/span>/s)
      const availabilityText = availabilityMatch ? availabilityMatch[1].replace(/<[^>]+>/g, '').trim().toLowerCase() : ''
      const inStock = !availabilityText.includes('unavailable') && !availabilityText.includes('currently unavailable')

      return {
        asin,
        title: title.substring(0, 500), // Limit length
        price,
        currency, // Detected from hidden input fields or domain
        image_url: image,
        brand,
        category: null,
        inStock,
      }
    }

    const product = extractProductData(html)
    console.log(`[SCRAPE] Extracted: title="${product.title}", price=${product.price}, brand="${product.brand}", image=${product.image_url ? 'yes' : 'no'}`)

    // Convert Amazon HTTP URLs to HTTPS to avoid mixed content
    const secureProduct = {
      ...product,
      image_url: product.image_url ? product.image_url.replace(/^http:/, 'https:') : undefined,
    }

    // Get the item to find its ID
    const item = await ItemsService.getItemByAsin(asin, session.user.id)
    console.log(`[SCRAPE] Item lookup: ${item ? `found id=${item.id}` : 'NOT FOUND'}`)
    if (!item) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      )
    }

    // Auto-detect category based on ISBN presence
    // If item has an ISBN, it's a Book; otherwise it's a Non-Book
    const detectedCategory = item.isbn ? 'Book' : 'Non-Book'

    // Only update price if we successfully extracted it (not 0)
    const updateData: any = {
      title: secureProduct.title,
      image_url: secureProduct.image_url,
      brand: secureProduct.brand,
      currency: secureProduct.currency,
    }

    // Set category if not already set
    if (!item.category) {
      updateData.category = detectedCategory
    }

    if (secureProduct.price > 0) {
      updateData.current_price = secureProduct.price
    }

    // Update the item in the database
    await ItemsService.updateItem(item.id, session.user.id, updateData)

    // Only add price history entry if we got a valid price
    if (secureProduct.price > 0) {
      await PriceHistoryService.addPriceEntry({
        item_id: item.id,
        price: secureProduct.price,
        in_stock: secureProduct.inStock,
        scrape_status: 'success',
      })
    } else {
      // Log that we couldn't extract the price
      console.warn(`Could not extract price for ASIN ${asin}, keeping existing price`)
    }

    return NextResponse.json({ product: secureProduct })
  } catch (error: any) {
    console.error('Scraping error:', error)

    // Check if it's a timeout
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return NextResponse.json(
        { error: 'Request timeout - Amazon took too long to respond' },
        { status: 504 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to scrape product: ' + (error.message || 'Unknown error') },
      { status: 500 }
    )
  }
}
