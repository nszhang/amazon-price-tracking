// Cron Job Endpoint for Scraping Prices
// Runs every 30 minutes to update prices for all tracked items

import { NextRequest, NextResponse } from 'next/server'
import { ItemsService } from '@/lib/services/database/items-service'
import { PriceHistoryService } from '@/lib/services/database/price-history-service'

const FETCH_HEADERS = {
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
}

function extractProductData(html: string, asin: string, domain: string) {
  // Title
  const titleMatch = html.match(/<span id="productTitle"[^>]*>(.+?)<\/span>/s)
  const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : 'Unknown Product'

  // Currency detection
  let currency = 'USD'
  const currencyMatch = html.match(/<input[^>]+name=["']sessionCurrency["'][^>]+value=["']([A-Z]{3})["']/)
  if (currencyMatch) {
    currency = currencyMatch[1]
  } else if (domain === 'ca' || html.includes('amazon.ca') || html.includes('"physicalMarketPlaceId": "2MYYE51S11X4HQ"')) {
    currency = 'CAD'
  }

  // Price extraction - same logic as /api/scrape
  let price = 0
  let priceSource = 'none'

  const extractOffscreenPrice = (section: string): number => {
    const match = section.match(/<span[^>]*class=["'][^"']*a-offscreen[^"']*["'][^>]*>\$?([\d,]+\.?\d*)<\/span>/)
    return match ? parseFloat(match[1].replace(/,/g, '')) : 0
  }

  // Primary: buying option accordion rows (Prime > regular)
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
      } else if (optionType === 'NEW' && newPrice === 0) {
        newPrice = optionPrice
      }
    }
  }

  if (primePrice > 0) {
    price = primePrice
    priceSource = 'PrimeAccordion'
  } else if (newPrice > 0) {
    price = newPrice
    priceSource = 'NewAccordion'
  }

  // Fallback 1: corePrice_feature_div
  if (price === 0) {
    const corePriceMatch = html.match(/id=["']corePrice_feature_div["'][^>]*>([\s\S]{1,5000})/)
    if (corePriceMatch) {
      const corePrice = extractOffscreenPrice(corePriceMatch[1])
      if (corePrice > 0) {
        price = corePrice
        priceSource = 'CorePrice'
      }
    }
  }

  // Fallback 2: twister-plus-price-data-price
  if (price === 0) {
    const twisterPriceMatch = html.match(/id=["']twister-plus-price-data-price["'][^>]*value=["']([\d,]+\.?\d*)["']/)
    if (twisterPriceMatch) {
      const twisterPrice = parseFloat(twisterPriceMatch[1].replace(/,/g, ''))
      if (twisterPrice > 0) {
        price = twisterPrice
        priceSource = 'TwisterPriceData'
      }
    }
  }

  // Fallback 3: Twister section a-offscreen
  if (price === 0) {
    const twisterSectionMatch = html.match(/id=["']twister[^"']*["'][^>]*>(.{10,5000})/s)
    if (twisterSectionMatch) {
      const twisterPrice = extractOffscreenPrice(twisterSectionMatch[1])
      if (twisterPrice > 0) {
        price = twisterPrice
        priceSource = 'TwisterSection'
      }
    }
  }

  // Fallback 4-7: Legacy price blocks
  if (price === 0) {
    const patterns = [
      { regex: /id=["']priceblock_dealprice["'][^>]*>.*?<span[^>]*class=["']a-offscreen["'][^>]*>\$?([\d,]+\.?\d*)/s, name: 'DealPrice' },
      { regex: /id=["']priceblock_ourprice["'][^>]*>.*?<span[^>]*class=["']a-offscreen["'][^>]*>\$?([\d,]+\.?\d*)/s, name: 'OurPrice' },
      { regex: /class=["']apex-price-to-pay[^"']*["'][^>]*>.*?<span[^>]*class=["']a-offscreen["'][^>]*>\$?([\d,]+\.?\d*)/s, name: 'ApexPrice' },
      { regex: /id=["']priceblock_saleprice["'][^>]*>.*?<span[^>]*class=["']a-offscreen["'][^>]*>\$?([\d,]+\.?\d*)/s, name: 'SalePrice' },
    ]
    for (const p of patterns) {
      const m = html.match(p.regex)
      if (m) {
        price = parseFloat(m[1].replace(/,/g, ''))
        priceSource = p.name
        break
      }
    }
  }

  // Fallback 8: Buybox whole + fraction
  if (price === 0) {
    const m = html.match(/<div[^>]*id=["']buybox[^>]*>.*?<span[^>]*class=["']a-price-whole["'][^>]*>(\d+[\d,]*)<\/span><span[^>]*class=["']a-price-fraction["'][^>]*>(\d+)<\/span>/s)
    if (m) {
      price = parseFloat(m[1].replace(/,/g, '')) + parseFloat(`0.${m[2]}`)
      priceSource = 'BuyboxWholeFraction'
    }
  }

  // Fallback 9: Last resort a-offscreen
  if (price === 0) {
    const m = html.match(/<span[^>]*class=["'][^"']*a-offscreen[^"']*["'][^>]*>\$?([\d,]+\.?\d*)<\/span>/s)
    if (m) {
      const p = parseFloat(m[1].replace(/,/g, ''))
      if (p >= 1 && p < 10000) {
        price = p
        priceSource = 'FallbackOffscreen'
      }
    }
  }

  // Image
  const imageMatch = html.match(/<img id="landingImage"[^>]*src="([^"]+)"/)
  const image = imageMatch ? imageMatch[1].replace(/^http:/, 'https:') : null

  // Brand
  const brandMatch = html.match(/<a id="bylineInfo"[^>]*>(.+?)<\/a>/s)
  const brand = brandMatch ? brandMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : null

  // Availability
  const availabilityMatch = html.match(/<span id="availability"[^>]*>(.+?)<\/span>/s)
  const availabilityText = availabilityMatch ? availabilityMatch[1].replace(/<[^>]+>/g, '').trim().toLowerCase() : ''
  const inStock = !availabilityText.includes('unavailable') && !availabilityText.includes('currently unavailable')

  return { title: title.substring(0, 500), price, currency, image_url: image, brand, inStock, priceSource }
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const items = await ItemsService.getAllItems()

    if (items.length === 0) {
      return NextResponse.json({ success: true, message: 'No items to scrape', scraped: 0 })
    }

    console.log(`[CRON] Starting price scrape for ${items.length} items`)

    let successCount = 0
    let failCount = 0
    let skipCount = 0
    const results: { asin: string, status: string, price?: number, source?: string }[] = []

    for (const item of items) {
      try {
        const domain = item.amazon_domain || 'ca'
        const amazonUrl = `https://www.amazon.${domain}/dp/${item.asin}`

        const response = await fetch(amazonUrl, {
          headers: FETCH_HEADERS,
          redirect: 'follow',
          signal: AbortSignal.timeout(15000),
        })

        const html = await response.text()

        // Skip CAPTCHAs
        if (html.includes('validateCaptcha') || html.includes('opfcaptcha')) {
          console.warn(`[CRON] CAPTCHA for ${item.asin}, skipping`)
          skipCount++
          results.push({ asin: item.asin, status: 'captcha' })
          // Delay longer after captcha to back off
          await new Promise(r => setTimeout(r, 5000))
          continue
        }

        if (!response.ok) {
          console.warn(`[CRON] HTTP ${response.status} for ${item.asin}`)
          failCount++
          results.push({ asin: item.asin, status: `http_${response.status}` })
          await new Promise(r => setTimeout(r, 2000))
          continue
        }

        const product = extractProductData(html, item.asin, domain)

        // Update item in database
        const updateData: Record<string, any> = {
          title: product.title !== 'Unknown Product' ? product.title : undefined,
          image_url: product.image_url || undefined,
          brand: product.brand || undefined,
          currency: product.currency,
        }

        if (product.price > 0) {
          updateData.current_price = product.price
        }

        // Remove undefined values
        Object.keys(updateData).forEach(k => updateData[k] === undefined && delete updateData[k])

        await ItemsService.updateItemById(item.id, updateData)

        // Add price history
        if (product.price > 0) {
          await PriceHistoryService.addPriceEntry({
            item_id: item.id,
            price: product.price,
            in_stock: product.inStock,
            scrape_status: 'success',
          })
          successCount++
          results.push({ asin: item.asin, status: 'success', price: product.price, source: product.priceSource })
          console.log(`[CRON] ${item.asin}: $${product.price} (${product.priceSource})`)
        } else {
          failCount++
          results.push({ asin: item.asin, status: 'no_price' })
          console.warn(`[CRON] ${item.asin}: could not extract price`)
        }

        // Delay between requests to avoid being blocked
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000))
      } catch (error: any) {
        failCount++
        const msg = error.name === 'AbortError' ? 'timeout' : error.message
        results.push({ asin: item.asin, status: `error: ${msg}` })
        console.error(`[CRON] Error scraping ${item.asin}:`, msg)
        await new Promise(r => setTimeout(r, 2000))
      }
    }

    console.log(`[CRON] Done: ${successCount} success, ${failCount} failed, ${skipCount} skipped`)

    return NextResponse.json({
      success: true,
      total: items.length,
      scraped: successCount,
      failed: failCount,
      skipped: skipCount,
      results,
    })
  } catch (error) {
    console.error('[CRON] Scrape error:', error)
    return NextResponse.json(
      { error: 'Failed to scrape prices', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
