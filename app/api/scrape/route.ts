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

      // Price extraction - prioritize the actual buy box price (what the customer sees)
      // Amazon pages have multiple prices (variants, other sellers, etc.), so we target the buy box specifically
      let price = 0
      const allPricesFound: { price: number, type: string }[] = []

      // Pattern 1: corePrice_feature_div - the actual displayed buy box price
      // This is the most reliable source as it's what Amazon renders as the main price
      if (price === 0) {
        const corePriceMatch = html.match(/id=["']corePrice_feature_div["'][^>]*>([\s\S]{1,5000})/)
        if (corePriceMatch) {
          const corePriceSection = corePriceMatch[1]
          const coreOffscreen = corePriceSection.match(/<span[^>]*class=["'][^"']*a-offscreen[^"']*["'][^>]*>\$?([\d,]+\.?\d*)<\/span>/)
          if (coreOffscreen) {
            price = parseFloat(coreOffscreen[1].replace(/,/g, ''))
            allPricesFound.push({ price, type: 'CorePrice' })
            console.log(`[SCRAPING] ${asin}: Pattern 1 (corePrice_feature_div) = ${price}`)
          }
        }
      }

      // Pattern 2: Twister plus price data - use the FIRST value (default variant buy box price)
      // Do NOT pick the lowest; the first value corresponds to the currently selected/default variant
      if (price === 0) {
        const twisterPriceMatch = html.match(/id=["']twister-plus-price-data-price["'][^>]*value=["']([\d,]+\.?\d*)["']/)
        if (twisterPriceMatch) {
          const twisterPrice = parseFloat(twisterPriceMatch[1].replace(/,/g, ''))
          if (twisterPrice > 0) {
            price = twisterPrice
            allPricesFound.push({ price, type: 'TwisterPriceData' })
            console.log(`[SCRAPING] ${asin}: Pattern 2 (twister-plus-price-data-price) = ${price}`)
          }
        }
        // Log all twister prices for debugging
        const allTwisterPrices = html.match(/id=["']twister-plus-price-data-price["'][^>]*value=["']([\d,]+\.?\d*)["']/g)
        if (allTwisterPrices && allTwisterPrices.length > 1) {
          const values = allTwisterPrices.map(p => {
            const m = p.match(/value=["']([\d,]+\.?\d*)["']/)
            return m ? m[1] : 'N/A'
          })
          console.log(`[SCRAPING] ${asin}: All twister-plus-price-data-price values: ${values.join(', ')} (using first)`)
        }
      }

      // Pattern 3: Twister section a-offscreen price (for products with size/color options)
      if (price === 0) {
        const twisterSectionMatch = html.match(/id=["']twister[^"']*["'][^>]*>(.{10,5000})/s)
        if (twisterSectionMatch) {
          const twisterPriceMatch = twisterSectionMatch[1].match(/<span[^>]*class=["']a-offscreen["'][^>]*>\$?([\d,]+\.?\d*)/s)
          if (twisterPriceMatch) {
            price = parseFloat(twisterPriceMatch[1].replace(/,/g, ''))
            allPricesFound.push({ price, type: 'TwisterSection' })
            console.log(`[SCRAPING] ${asin}: Pattern 3 (TwisterSection) = ${price}`)
          }
        }
      }

      // Pattern 4: Price from #priceblock_dealprice (deal/promo price)
      if (price === 0) {
        const dealPriceMatch = html.match(/id=["']priceblock_dealprice["'][^>]*>.*?<span[^>]*class=["']a-offscreen["'][^>]*>\$?([\d,]+\.?\d*)/s)
        if (dealPriceMatch) {
          price = parseFloat(dealPriceMatch[1].replace(/,/g, ''))
          allPricesFound.push({ price, type: 'DealPrice' })
        }
      }

      // Pattern 5: Price from #priceblock_ourprice (regular price, no deal)
      if (price === 0) {
        const ourPriceMatch = html.match(/id=["']priceblock_ourprice["'][^>]*>.*?<span[^>]*class=["']a-offscreen["'][^>]*>\$?([\d,]+\.?\d*)/s)
        if (ourPriceMatch) {
          price = parseFloat(ourPriceMatch[1].replace(/,/g, ''))
          allPricesFound.push({ price, type: 'OurPrice' })
        }
      }

      // Pattern 6: apex-price-to-pay (alternative price display)
      if (price === 0) {
        const apexPriceMatch = html.match(/class=["']apex-price-to-pay[^"']*["'][^>]*>.*?<span[^>]*class=["']a-offscreen["'][^>]*>\$?([\d,]+\.?\d*)/s)
        if (apexPriceMatch) {
          price = parseFloat(apexPriceMatch[1].replace(/,/g, ''))
          allPricesFound.push({ price, type: 'ApexPrice' })
        }
      }

      // Pattern 7: Android price block (used on mobile)
      if (price === 0) {
        const androidPriceMatch = html.match(/id=["']android-buybox-price["'][^>]*>.*?<span[^>]*class=["']a-offscreen["'][^>]*>\$?([\d,]+\.?\d*)/s)
        if (androidPriceMatch) {
          price = parseFloat(androidPriceMatch[1].replace(/,/g, ''))
          allPricesFound.push({ price, type: 'AndroidPrice' })
        }
      }

      // Pattern 8: Inside #priceblock_saleprice (for sale items)
      if (price === 0) {
        const salePriceMatch = html.match(/id=["']priceblock_saleprice["'][^>]*>.*?<span[^>]*class=["']a-offscreen["'][^>]*>\$?([\d,]+\.?\d*)/s)
        if (salePriceMatch) {
          price = parseFloat(salePriceMatch[1].replace(/,/g, ''))
          allPricesFound.push({ price, type: 'SalePrice' })
        }
      }

      // Pattern 9: Buybox section a-price-whole + a-price-fraction
      if (price === 0) {
        const priceSectionMatch = html.match(/<div[^>]*id=["']buybox[^>]*>.*?<span[^>]*class=["']a-price-whole["'][^>]*>(\d+[\d,]*)<\/span><span[^>]*class=["']a-price-fraction["'][^>]*>(\d+)<\/span>/s)
        if (priceSectionMatch) {
          const wholePart = parseFloat(priceSectionMatch[1].replace(/,/g, ''))
          const fractionPart = parseFloat(`0.${priceSectionMatch[2]}`)
          price = wholePart + fractionPart
          allPricesFound.push({ price, type: 'BuyboxWholeFraction' })
        }
      }

      // Pattern 10: Last resort - first a-offscreen price with sanity check
      if (price === 0) {
        const offscreenMatch = html.match(/<span[^>]*class=["'][^"']*a-offscreen[^"']*["'][^>]*>\$?([\d,]+\.?\d*)<\/span>/s)
        if (offscreenMatch) {
          const extractedPrice = parseFloat(offscreenMatch[1].replace(/,/g, ''))
          // Sanity check: reject obviously wrong prices (under $1 or over $10,000)
          if (extractedPrice >= 1 && extractedPrice < 10000) {
            price = extractedPrice
            allPricesFound.push({ price, type: 'FallbackOffscreen' })
            console.log(`[SCRAPING] ${asin}: Pattern 10 (fallback a-offscreen) = ${price}`)
          }
        }
      }

      console.log(`[SCRAPING] ${asin}: Final extracted price = ${price} (${currency}), Seller: ${seller || 'Unknown'}`)
      if (allPricesFound.length > 0) {
        console.log(`[SCRAPING] ${asin}: Price matched by: ${allPricesFound[0].type}, all found: ${allPricesFound.map(p => `${p.price} (${p.type})`).join(', ')}`)
      }

      // Log all a-offscreen prices for debugging
      const allOffscreenPrices = html.match(/<span[^>]*class=["'][^"']*a-offscreen[^"']*["'][^>]*>(\$?[\d,]+\.?\d*)<\/span>/g)
      if (allOffscreenPrices) {
        const prices = allOffscreenPrices.map(p => p.replace(/<[^>]+>/g, '').replace(/^\$/, ''))
        console.log(`[SCRAPING] ${asin}: ALL a-offscreen prices:`, prices.slice(0, 15))
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
