// Cron Job Endpoint for Retrying "Loading..." Items
// Runs periodically to retry scraping items that failed initial scrape

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

// Decode HTML entities
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
  const title = titleMatch ? decodeEntities(titleMatch[1].replace(/<[^>]+>/g, '').trim()) : null

  // Currency detection
  let currency = 'USD'
  const currencyMatch = html.match(/<input[^>]+name=["']sessionCurrency["'][^>]+value=["']([A-Z]{3})["']/)
  if (currencyMatch) {
    currency = currencyMatch[1]
  } else if (domain === 'ca' || html.includes('amazon.ca')) {
    currency = 'CAD'
  }

  // Price extraction
  let price = 0
  const extractOffscreenPrice = (section: string): number => {
    const match = section.match(/<span[^>]*class=["'][^"']*a-offscreen[^"']*["'][^>]*>\$?([\d,]+\.?\d*)<\/span>/)
    return match ? parseFloat(match[1].replace(/,/g, '')) : 0
  }

  // Primary: buying option accordion rows
  const buyingOptionPattern = /data-csa-c-buying-option-type=["'](PRIME_SAVINGS_UPSELL|NEW)["']/g
  let optionMatch
  let primePrice = 0
  let newPrice = 0

  while ((optionMatch = buyingOptionPattern.exec(html)) !== null) {
    const optionType = optionMatch[1]
    const section = html.substring(optionMatch.index, optionMatch.index + 20000)
    const optionPrice = extractOffscreenPrice(section)
    if (optionPrice > 0) {
      if (optionType === 'PRIME_SAVINGS_UPSELL' && primePrice === 0) primePrice = optionPrice
      else if (optionType === 'NEW' && newPrice === 0) newPrice = optionPrice
    }
  }

  if (primePrice > 0) price = primePrice
  else if (newPrice > 0) price = newPrice

  // Fallback: corePrice_feature_div
  if (price === 0) {
    const corePriceMatch = html.match(/id=["']corePrice_feature_div["'][^>]*>([\s\S]{1,5000})/)
    if (corePriceMatch) price = extractOffscreenPrice(corePriceMatch[1])
  }

  // Fallback: twister-plus-price-data-price
  if (price === 0) {
    const twisterPriceMatch = html.match(/id=["']twister-plus-price-data-price["'][^>]*value=["']([\d,]+\.?\d*)["']/)
    if (twisterPriceMatch) price = parseFloat(twisterPriceMatch[1].replace(/,/g, ''))
  }

  // Image
  let image: string | null = null
  const dynamicImageMatch = html.match(/id="landingImage"[^>]*data-a-dynamic-image="[^"]*?(https:\/\/m\.media-amazon\.com\/images\/[^&"]+)/)
  if (dynamicImageMatch) {
    image = dynamicImageMatch[1].replace(/&amp;/g, '&').replace(/^http:/, 'https:')
  } else {
    const srcImageMatch = html.match(/<img[^>]*id="landingImage"[^>]*src="([^"]+)"/)
    image = srcImageMatch ? srcImageMatch[1].replace(/^http:/, 'https:') : null
  }

  // Brand / Author
  let brand: string | null = null
  const bylineSection = html.match(/id="bylineInfo"[^>]*>([\s\S]{1,5000}?)<\/div>/)
  if (bylineSection) {
    const authorLinks = [...bylineSection[1].matchAll(/<span[^>]*class="author[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/g)]
    if (authorLinks.length > 0) {
      brand = decodeEntities(authorLinks.map(m => m[1].trim()).join(', '))
    }
  }
  if (!brand) {
    const brandMatch = html.match(/<a id="bylineInfo"[^>]*>(.+?)<\/a>/s)
    brand = brandMatch ? decodeEntities(brandMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()) : null
  }

  // Availability
  const availabilityMatch = html.match(/<span id="availability"[^>]*>(.+?)<\/span>/s)
  const availabilityText = availabilityMatch ? availabilityMatch[1].replace(/<[^>]+>/g, '').trim().toLowerCase() : ''
  const inStock = !availabilityText.includes('unavailable')

  return { title, price, currency, image_url: image, brand, inStock }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Config from env
  const batchSize = parseInt(process.env.RETRY_BATCH_SIZE || '5', 10)
  const maxRetries = parseInt(process.env.RETRY_MAX_ATTEMPTS || '10', 10)
  const delayMs = parseInt(process.env.RETRY_DELAY_MS || '15000', 10)

  try {
    const loadingItems = await ItemsService.getLoadingItems(batchSize)

    if (loadingItems.length === 0) {
      return NextResponse.json({ success: true, message: 'No loading items to retry', processed: 0 })
    }

    console.log(`[RETRY-LOADING] Processing ${loadingItems.length} loading items`)

    let successCount = 0
    let failCount = 0
    let deletedCount = 0
    const results: { asin: string; status: string; retries?: number }[] = []

    for (const item of loadingItems) {
      const retryCount = (item.scrape_retry_count ?? 0) + 1

      // Check if max retries exceeded - delete the item
      if (retryCount > maxRetries) {
        console.log(`[RETRY-LOADING] ${item.asin}: Max retries (${maxRetries}) exceeded, deleting`)
        await ItemsService.deleteItemById(item.id)
        deletedCount++
        results.push({ asin: item.asin, status: 'deleted', retries: retryCount - 1 })
        continue
      }

      try {
        const domain = item.amazon_domain || 'ca'
        const amazonUrl = `https://www.amazon.${domain}/dp/${item.asin}`

        const response = await fetch(amazonUrl, {
          headers: FETCH_HEADERS,
          redirect: 'follow',
          signal: AbortSignal.timeout(15000),
        })

        const html = await response.text()

        // Check for CAPTCHA
        if (html.includes('validateCaptcha') || html.includes('opfcaptcha')) {
          console.log(`[RETRY-LOADING] ${item.asin}: CAPTCHA (retry ${retryCount}/${maxRetries})`)
          await ItemsService.incrementRetryCount(item.id)
          failCount++
          results.push({ asin: item.asin, status: 'captcha', retries: retryCount })
          await new Promise(r => setTimeout(r, delayMs * 2))
          continue
        }

        if (!response.ok) {
          console.log(`[RETRY-LOADING] ${item.asin}: HTTP ${response.status} (retry ${retryCount}/${maxRetries})`)
          await ItemsService.incrementRetryCount(item.id)
          failCount++
          results.push({ asin: item.asin, status: `http_${response.status}`, retries: retryCount })
          await new Promise(r => setTimeout(r, delayMs))
          continue
        }

        const product = extractProductData(html, item.asin, domain)

        // Check if we got valid data
        if (!product.title || product.title === 'Unknown Product') {
          console.log(`[RETRY-LOADING] ${item.asin}: No title found (retry ${retryCount}/${maxRetries})`)
          await ItemsService.incrementRetryCount(item.id)
          failCount++
          results.push({ asin: item.asin, status: 'no_title', retries: retryCount })
          await new Promise(r => setTimeout(r, delayMs))
          continue
        }

        // Success! Update the item
        const updateData: Record<string, any> = {
          title: product.title,
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
        await ItemsService.resetRetryCount(item.id)

        // Add price history if we got a price
        if (product.price > 0) {
          await PriceHistoryService.addPriceEntry({
            item_id: item.id,
            price: product.price,
            in_stock: product.inStock,
            scrape_status: 'success',
          })
        }

        console.log(`[RETRY-LOADING] ${item.asin}: SUCCESS - "${product.title.substring(0, 50)}..." @ $${product.price}`)
        successCount++
        results.push({ asin: item.asin, status: 'success', retries: retryCount })

        // Delay between successful requests
        await new Promise(r => setTimeout(r, delayMs))
      } catch (error: any) {
        console.error(`[RETRY-LOADING] ${item.asin}: Error - ${error.message}`)
        await ItemsService.incrementRetryCount(item.id)
        failCount++
        results.push({ asin: item.asin, status: `error: ${error.message}`, retries: retryCount })
        await new Promise(r => setTimeout(r, delayMs))
      }
    }

    // Get remaining loading count
    const remainingLoading = await ItemsService.getLoadingItems(1000)

    console.log(`[RETRY-LOADING] Done: ${successCount} success, ${failCount} failed, ${deletedCount} deleted, ${remainingLoading.length} remaining`)

    return NextResponse.json({
      success: true,
      batch: {
        processed: loadingItems.length,
        success: successCount,
        failed: failCount,
        deleted: deletedCount,
      },
      remaining: remainingLoading.length,
      results,
    })
  } catch (error) {
    console.error('[RETRY-LOADING] Error:', error)
    return NextResponse.json(
      { error: 'Failed to retry loading items', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
