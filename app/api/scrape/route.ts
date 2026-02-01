// API Route for Amazon Scraping
// This endpoint performs server-side scraping of Amazon products

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { ItemsService } from '@/lib/services/database/items-service'
import { PriceHistoryService } from '@/lib/services/database/price-history-service'

export async function POST(request: NextRequest) {
  try {
    const { url, asin, domain } = await request.json()

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

    // Build the Amazon URL
    const amazonUrl = `https://www.amazon.${domain}/dp/${asin}`

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

    // Check if we got a CAPTCHA page
    const responseText = await response.text()
    if (responseText.includes('validateCaptcha') || responseText.includes('opfcaptcha')) {
      console.error('Amazon CAPTCHA detected - scraping is being blocked')
      return NextResponse.json(
        { error: 'Amazon is blocking automated requests (CAPTCHA). Consider using PA-API or a paid scraping service.' },
        { status: 429 }
      )
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch page: ${response.status}` },
        { status: 500 }
      )
    }

    const html = responseText

    // Parse the HTML to extract product data
    // Note: Amazon's HTML structure changes frequently, so selectors may break
    const extractProductData = (html: string) => {
      // Title
      const titleMatch = html.match(/<span id="productTitle"[^>]*>(.+?)<\/span>/s)
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : 'Unknown Product'

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

      // === Primary: Extract from buying option accordion rows ===
      // Amazon wraps prices in accordion rows with data-csa-c-buying-option-type
      // PRIME_SAVINGS_UPSELL = Prime-exclusive price (preferred)
      // NEW = regular buy price for all customers
      // For each match, look forward up to 20000 chars for the first a-offscreen price
      const buyingOptionPattern = /data-csa-c-buying-option-type=["'](PRIME_SAVINGS_UPSELL|NEW)["']/g
      let optionMatch
      let primePrice = 0
      let newPrice = 0

      while ((optionMatch = buyingOptionPattern.exec(html)) !== null) {
        const optionType = optionMatch[1]
        const section = html.substring(optionMatch.index, optionMatch.index + 20000)
        const optionPrice = extractOffscreenPrice(section)

        if (optionPrice > 0) {
          if (optionType === 'PRIME_SAVINGS_UPSELL' && primePrice === 0) {
            primePrice = optionPrice
            console.log(`[SCRAPING] ${asin}: Prime price (PRIME_SAVINGS_UPSELL) = ${primePrice}`)
          } else if (optionType === 'NEW' && newPrice === 0) {
            newPrice = optionPrice
            console.log(`[SCRAPING] ${asin}: Regular price (NEW) = ${newPrice}`)
          }
        }
      }

      // Use Prime price if available, otherwise regular price
      if (primePrice > 0) {
        price = primePrice
        priceSource = 'PrimeAccordion'
      } else if (newPrice > 0) {
        price = newPrice
        priceSource = 'NewAccordion'
      }

      // === Fallback 1: corePrice_feature_div (when no accordion structure) ===
      if (price === 0) {
        const corePriceMatch = html.match(/id=["']corePrice_feature_div["'][^>]*>([\s\S]{1,5000})/)
        if (corePriceMatch) {
          const corePriceSection = corePriceMatch[1]
          const corePrice = extractOffscreenPrice(corePriceSection)
          if (corePrice > 0) {
            price = corePrice
            priceSource = 'CorePrice'
            console.log(`[SCRAPING] ${asin}: Fallback 1 (corePrice_feature_div) = ${price}`)
          }
        }
      }

      // === Fallback 2: twister-plus-price-data-price (variant products) ===
      if (price === 0) {
        const twisterPriceMatch = html.match(/id=["']twister-plus-price-data-price["'][^>]*value=["']([\d,]+\.?\d*)["']/)
        if (twisterPriceMatch) {
          const twisterPrice = parseFloat(twisterPriceMatch[1].replace(/,/g, ''))
          if (twisterPrice > 0) {
            price = twisterPrice
            priceSource = 'TwisterPriceData'
            console.log(`[SCRAPING] ${asin}: Fallback 2 (twister-plus-price-data-price) = ${price}`)
          }
        }
      }

      // === Fallback 2.5: slot-price with aria-label (format variant display) ===
      // Look for the price in the aria-checked="true" slot (current selection)
      if (price === 0) {
        const checkedIdx = html.indexOf('aria-checked="true"')
        if (checkedIdx >= 0) {
          // Look for aria-label price in the next 1000 characters
          const section = html.substring(checkedIdx, checkedIdx + 1000)
          const ariaLabelPrice = section.match(/aria-label=["']\$?([\d,]+\.?\d*)["']/)
          if (ariaLabelPrice) {
            const slotPrice = parseFloat(ariaLabelPrice[1].replace(/,/g, ''))
            if (slotPrice > 0 && slotPrice < 1000) {
              price = slotPrice
              priceSource = 'SlotPriceChecked'
              console.log(`[SCRAPING] ${asin}: Fallback 2.5 (aria-checked slot) = ${price}`)
            }
          }
        }
      }

      // === Fallback 3: Twister section a-offscreen (size/color variant display) ===
      if (price === 0) {
        const twisterSectionMatch = html.match(/id=["']twister[^"']*["'][^>]*>(.{10,5000})/s)
        if (twisterSectionMatch) {
          const twisterPrice = extractOffscreenPrice(twisterSectionMatch[1])
          if (twisterPrice > 0) {
            price = twisterPrice
            priceSource = 'TwisterSection'
            console.log(`[SCRAPING] ${asin}: Fallback 3 (TwisterSection) = ${price}`)
          }
        }
      }

      // === Fallback 4: priceblock_dealprice (deal/promo) ===
      if (price === 0) {
        const dealPriceMatch = html.match(/id=["']priceblock_dealprice["'][^>]*>.*?<span[^>]*class=["']a-offscreen["'][^>]*>\$?([\d,]+\.?\d*)/s)
        if (dealPriceMatch) {
          price = parseFloat(dealPriceMatch[1].replace(/,/g, ''))
          priceSource = 'DealPrice'
        }
      }

      // === Fallback 5: priceblock_ourprice (regular price, no deal) ===
      if (price === 0) {
        const ourPriceMatch = html.match(/id=["']priceblock_ourprice["'][^>]*>.*?<span[^>]*class=["']a-offscreen["'][^>]*>\$?([\d,]+\.?\d*)/s)
        if (ourPriceMatch) {
          price = parseFloat(ourPriceMatch[1].replace(/,/g, ''))
          priceSource = 'OurPrice'
        }
      }

      // === Fallback 6: apex-price-to-pay ===
      if (price === 0) {
        const apexPriceMatch = html.match(/class=["']apex-price-to-pay[^"']*["'][^>]*>.*?<span[^>]*class=["']a-offscreen["'][^>]*>\$?([\d,]+\.?\d*)/s)
        if (apexPriceMatch) {
          price = parseFloat(apexPriceMatch[1].replace(/,/g, ''))
          priceSource = 'ApexPrice'
        }
      }

      // === Fallback 7: priceblock_saleprice (sale items) ===
      if (price === 0) {
        const salePriceMatch = html.match(/id=["']priceblock_saleprice["'][^>]*>.*?<span[^>]*class=["']a-offscreen["'][^>]*>\$?([\d,]+\.?\d*)/s)
        if (salePriceMatch) {
          price = parseFloat(salePriceMatch[1].replace(/,/g, ''))
          priceSource = 'SalePrice'
        }
      }

      // === Fallback 8: Buybox a-price-whole + a-price-fraction ===
      if (price === 0) {
        const priceSectionMatch = html.match(/<div[^>]*id=["']buybox[^>]*>.*?<span[^>]*class=["']a-price-whole["'][^>]*>(\d+[\d,]*)<\/span><span[^>]*class=["']a-price-fraction["'][^>]*>(\d+)<\/span>/s)
        if (priceSectionMatch) {
          const wholePart = parseFloat(priceSectionMatch[1].replace(/,/g, ''))
          const fractionPart = parseFloat(`0.${priceSectionMatch[2]}`)
          price = wholePart + fractionPart
          priceSource = 'BuyboxWholeFraction'
        }
      }

      // === Fallback 9: Last resort - first a-offscreen with sanity check (excluding list prices) ===
      if (price === 0) {
        // Find all a-offscreen prices and skip ones that are clearly list prices
        const allOffscreenMatches = html.matchAll(/<span[^>]*class=["'][^"']*a-offscreen[^"']*["'][^>]*>\$?([\d,]+\.?\d*)<\/span>/g)
        for (const match of allOffscreenMatches) {
          const extractedPrice = parseFloat(match[1].replace(/,/g, ''))
          // Check 300 characters before for "List Price:" or "basisPrice"
          const contextBefore = html.substring(Math.max(0, match.index - 300), match.index)
          // Skip if this is clearly a list price
          if (/List Price:?/i.test(contextBefore) || /basisPrice/i.test(contextBefore) || /aok-offscreen.*List Price/i.test(contextBefore)) {
            console.log(`[SCRAPING] ${asin}: Skipping list price: $${extractedPrice}`)
            continue
          }
          if (extractedPrice >= 1 && extractedPrice < 10000) {
            price = extractedPrice
            priceSource = 'FallbackOffscreen'
            console.log(`[SCRAPING] ${asin}: Fallback 9 (last resort a-offscreen) = ${price}`)
            break
          }
        }
      }

      console.log(`[SCRAPING] ${asin}: Final price = ${price} (${currency}), source = ${priceSource}, Seller: ${seller || 'Unknown'}`)
      if (primePrice > 0 && newPrice > 0) {
        console.log(`[SCRAPING] ${asin}: Prime=$${primePrice}, Regular=$${newPrice} (using ${priceSource})`)
      }

      // Image
      const imageMatch = html.match(/<img id="landingImage"[^>]*src="([^"]+)"/)
      const image = imageMatch ? imageMatch[1] : null

      // Brand
      const brandMatch = html.match(/<a id="bylineInfo"[^>]*>(.+?)<\/a>/s)
      const brand = brandMatch ? brandMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : null

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

    // Convert Amazon HTTP URLs to HTTPS to avoid mixed content
    const secureProduct = {
      ...product,
      image_url: product.image_url ? product.image_url.replace(/^http:/, 'https:') : undefined,
    }

    // Get the item first to find its ID
    const item = await ItemsService.getItemByAsin(asin, session.user.id)
    if (!item) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      )
    }

    // Only update price if we successfully extracted it (not 0)
    const updateData: any = {
      title: secureProduct.title,
      image_url: secureProduct.image_url,
      brand: secureProduct.brand,
      currency: secureProduct.currency,
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
