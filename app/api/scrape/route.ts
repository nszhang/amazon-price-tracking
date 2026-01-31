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

    // Generate realistic browser headers to avoid detection
    const getRealisticHeaders = () => {
      const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
      ]
      const selectedUA = userAgents[Math.floor(Math.random() * userAgents.length)]

      return {
        'User-Agent': selectedUA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
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
        'Referer': `https://www.amazon.${domain}/`,
      }
    }

    // First, visit the Amazon home page to establish a session and get cookies
    let cookieHeader = ''
    try {
      const homePageResponse = await fetch(`https://www.amazon.${domain}/`, {
        headers: getRealisticHeaders(),
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      })

      // Extract cookies from the response
      const setCookieHeaders = homePageResponse.headers.getSetCookie()
      if (setCookieHeaders.length > 0) {
        cookieHeader = setCookieHeaders.map(c => c.split(';')[0]).join('; ')
      }

      // Add a small delay to mimic human behavior
      await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000))
    } catch (error) {
      console.warn('Failed to fetch home page for cookies, continuing without:', error)
    }

    // Add cookies to headers for the product page request
    const productHeaders = getRealisticHeaders()
    if (cookieHeader) {
      productHeaders['Cookie'] = cookieHeader
    }

    // Fetch the product page
    const response = await fetch(amazonUrl, {
      headers: productHeaders,
      redirect: 'follow',
      // Add a timeout to prevent hanging
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

      // Price extraction - prioritize buy box price over other prices
      // Amazon pages have multiple prices (original, other sellers, etc.), so we need specific patterns
      let price = 0

      // Pattern 1: Price inside buy box (most reliable for current price)
      // This looks for the price within the #centerCol or #buybox section
      const buyBoxPriceMatch = html.match(/<span[^>]*id=["']priceblock_dealprice["'][^>]*>.*?<span[^>]*class=["']a-offscreen["'][^>]*>\$?([\d,]+\.?\d*)/s)
      if (buyBoxPriceMatch) {
        price = parseFloat(buyBoxPriceMatch[1].replace(/,/g, ''))
      }

      // Pattern 2: Price from #priceblock_ourprice (regular price, no deal)
      if (price === 0) {
        const ourPriceMatch = html.match(/<span[^>]*id=["']priceblock_ourprice["'][^>]*>.*?<span[^>]*class=["']a-offscreen["'][^>]*>\$?([\d,]+\.?\d*)/s)
        if (ourPriceMatch) {
          price = parseFloat(ourPriceMatch[1].replace(/,/g, ''))
        }
      }

      // Pattern 3: Twister price (for products with size/color options)
      if (price === 0) {
        const twisterPriceMatch = html.match(/<span[^>]*id=["']twister[^>]*class=["']a-price-whole["'][^>]*>(\d+[\d,]*)<\/span>/s)
        if (twisterPriceMatch) {
          price = parseFloat(twisterPriceMatch[1].replace(/,/g, ''))
        }
      }

      // Pattern 4: Android price block (used on mobile)
      if (price === 0) {
        const androidPriceMatch = html.match(/<span[^>]*id=["']android-buybox-price[^>]*>.*?class=["']a-offscreen["'][^>]*>\$?([\d,]+\.?\d*)/s)
        if (androidPriceMatch) {
          price = parseFloat(androidPriceMatch[1].replace(/,/g, ''))
        }
      }

      // Pattern 5: Inside #priceblock_saleprice (for sale items)
      if (price === 0) {
        const salePriceMatch = html.match(/<span[^>]*id=["']priceblock_saleprice[^>]*>.*?class=["']a-offscreen["'][^>]*>\$?([\d,]+\.?\d*)/s)
        if (salePriceMatch) {
          price = parseFloat(salePriceMatch[1].replace(/,/g, ''))
        }
      }

      // Pattern 6: Price from #apexOfferDisplay (for Amazon Prime exclusive pricing)
      if (price === 0) {
        const apexPriceMatch = html.match(/<span[^>]*id=["']apexOfferDisplay[^>]*>.*?class=["']a-offscreen["'][^>]*>\$?([\d,]+\.?\d*)/s)
        if (apexPriceMatch) {
          price = parseFloat(apexPriceMatch[1].replace(/,/g, ''))
        }
      }

      // Pattern 7: Fallback - look for a-price-whole followed by a-price-fraction within buybox section
      if (price === 0) {
        const priceSectionMatch = html.match(/<div[^>]*id=["']buybox[^>]*>.*?<span[^>]*class=["']a-price-whole["'][^>]*>(\d+[\d,]*)<\/span><span[^>]*class=["']a-price-fraction["'][^>]*>(\d+)<\/span>/s)
        if (priceSectionMatch) {
          const wholePart = parseFloat(priceSectionMatch[1].replace(/,/g, ''))
          const fractionPart = parseFloat(`0.${priceSectionMatch[2]}`)
          price = wholePart + fractionPart
        }
      }

      // Pattern 8: Last resort - any a-offscreen price (least reliable)
      if (price === 0) {
        const offscreenMatch = html.match(/<span[^>]*class=["']a-offscreen["'][^>]*aria-hidden=["']true["'][^>]*>\$?([\d,]+\.?\d*)<\/span>/s)
        if (offscreenMatch) {
          const extractedPrice = parseFloat(offscreenMatch[1].replace(/,/g, ''))
          // Sanity check: reject obviously wrong prices (like 1 cent or over $10,000)
          if (extractedPrice > 0.01 && extractedPrice < 10000) {
            price = extractedPrice
          }
        }
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
        currency: 'USD', // Default to USD, could be enhanced to detect
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
