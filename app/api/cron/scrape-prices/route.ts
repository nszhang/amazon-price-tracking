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

// Decode HTML entities (e.g. &amp; &#39; &eacute;)
function decodeEntities(str: string): string {
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

function extractProductData(html: string, asin: string, domain: string) {
  // Title
  const titleMatch = html.match(/<span id="productTitle"[^>]*>(.+?)<\/span>/s)
  const title = titleMatch ? decodeEntities(titleMatch[1].replace(/<[^>]+>/g, '').trim()) : 'Unknown Product'

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

  // Image - try data-a-dynamic-image first (lazy-loaded), then src
  let image: string | null = null
  const dynamicImageMatch = html.match(/id="landingImage"[^>]*data-a-dynamic-image="[^"]*?(https:\/\/m\.media-amazon\.com\/images\/[^&"]+)/)
  if (dynamicImageMatch) {
    image = dynamicImageMatch[1].replace(/&amp;/g, '&').replace(/^http:/, 'https:')
  } else {
    const srcImageMatch = html.match(/<img[^>]*id="landingImage"[^>]*src="([^"]+)"/)
    image = srcImageMatch ? srcImageMatch[1].replace(/^http:/, 'https:') : null
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

  return { title: title.substring(0, 500), price, currency, image_url: image, brand, inStock, priceSource }
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Read config from env vars
  const batchSize = parseInt(process.env.SCRAPE_BATCH_SIZE || '5', 10)
  const delayMinMs = parseInt(process.env.SCRAPE_DELAY_MIN_MS || '12000', 10)
  const delayMaxMs = parseInt(process.env.SCRAPE_DELAY_MAX_MS || '20000', 10)
  const captchaBackoffMs = parseInt(process.env.SCRAPE_CAPTCHA_BACKOFF_MS || '45000', 10)
  const maxConsecutiveCaptchas = parseInt(process.env.SCRAPE_MAX_CONSECUTIVE_CAPTCHAS || '2', 10)

  try {
    const items = await ItemsService.getNextBatch(batchSize)

    if (items.length === 0) {
      const cycleStatus = await ItemsService.getCycleStatus()
      return NextResponse.json({ success: true, message: 'No items to scrape', scraped: 0, cycleStatus })
    }

    console.log(`[CRON] Batch scrape: ${items.length} items (batch size ${batchSize})`)

    let successCount = 0
    let failCount = 0
    let captchaCount = 0
    let consecutiveCaptchasInRun = 0
    let aborted = false
    const results: { asin: string, status: string, price?: number, source?: string }[] = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]

      try {
        const domain = item.amazon_domain || 'ca'
        const amazonUrl = `https://www.amazon.${domain}/dp/${item.asin}`

        const response = await fetch(amazonUrl, {
          headers: FETCH_HEADERS,
          redirect: 'follow',
          signal: AbortSignal.timeout(15000),
        })

        const html = await response.text()

        // Handle CAPTCHA
        if (html.includes('validateCaptcha') || html.includes('opfcaptcha')) {
          console.warn(`[CRON] CAPTCHA for ${item.asin} (consecutive in DB: ${(item.consecutive_captchas ?? 0) + 1})`)
          captchaCount++
          consecutiveCaptchasInRun++

          // Mark checked with CAPTCHA flag (advances round-robin pointer)
          await ItemsService.markChecked(item.id, true)

          // Record rate_limited in price_history
          await PriceHistoryService.addPriceEntry({
            item_id: item.id,
            price: item.current_price || 0,
            in_stock: true,
            scrape_status: 'rate_limited',
            error_message: 'CAPTCHA detected',
          })

          results.push({ asin: item.asin, status: 'captcha' })

          // Abort batch if too many consecutive CAPTCHAs in this run
          if (consecutiveCaptchasInRun >= maxConsecutiveCaptchas) {
            console.warn(`[CRON] ${consecutiveCaptchasInRun} consecutive CAPTCHAs in run, aborting batch`)
            aborted = true
            break
          }

          // Back off after CAPTCHA
          await new Promise(r => setTimeout(r, captchaBackoffMs))
          continue
        }

        // Reset consecutive CAPTCHA counter on non-CAPTCHA response
        consecutiveCaptchasInRun = 0

        if (!response.ok) {
          console.warn(`[CRON] HTTP ${response.status} for ${item.asin}`)
          failCount++
          await ItemsService.markChecked(item.id, false)
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

        // markChecked resets consecutive_captchas and advances last_checked_at
        await ItemsService.markChecked(item.id, false)

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

        // Delay between requests (configurable)
        if (i < items.length - 1) {
          await new Promise(r => setTimeout(r, delayMinMs + Math.random() * (delayMaxMs - delayMinMs)))
        }
      } catch (error: any) {
        failCount++
        const msg = error.name === 'AbortError' ? 'timeout' : error.message
        await ItemsService.markChecked(item.id, false)
        results.push({ asin: item.asin, status: `error: ${msg}` })
        console.error(`[CRON] Error scraping ${item.asin}:`, msg)
        await new Promise(r => setTimeout(r, delayMinMs))
      }
    }

    const cycleStatus = await ItemsService.getCycleStatus()

    console.log(`[CRON] Batch done: ${successCount} success, ${failCount} failed, ${captchaCount} captcha${aborted ? ' (ABORTED)' : ''}`)
    console.log(`[CRON] Cycle: ${cycleStatus.total} total, ${cycleStatus.neverChecked} never checked, ${cycleStatus.captchaBlocked} captcha-blocked`)

    return NextResponse.json({
      success: true,
      batch: {
        size: batchSize,
        processed: results.length,
        success: successCount,
        failed: failCount,
        captcha: captchaCount,
        aborted,
      },
      cycleStatus,
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
