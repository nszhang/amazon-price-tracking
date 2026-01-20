// API Route for Amazon Scraping
// This endpoint performs server-side scraping of Amazon products

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Build the Amazon URL
    const amazonUrl = `https://www.amazon.${domain || 'com'}/dp/${asin}`

    // Fetch the product page
    // Note: In production, you'd want to use a proxy service to avoid IP blocking
    const response = await fetch(amazonUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
      },
      // Add a timeout to prevent hanging
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch page: ${response.status}` },
        { status: 500 }
      )
    }

    const html = await response.text()

    // Parse the HTML to extract product data
    // Note: Amazon's HTML structure changes frequently, so selectors may break
    const extractProductData = (html: string) => {
      // Title
      const titleMatch = html.match(/<span id="productTitle"[^>]*>(.+?)<\/span>/s)
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : 'Unknown Product'

      // Price - try multiple selectors
      const pricePatterns = [
        /<span class="a-price-whole">(\d+[\d,]*)<\/span><span class="a-price-fraction">(\d+)<\/span>/,
        /<span id="priceblock_ourprice"[^>]*>\$?([\d,]+\.?\d*)/s,
        /<span id="priceblock_dealprice"[^>]*>\$?([\d,]+\.?\d*)/s,
        /<span class="a-offscreen">\$?([\d,]+\.?\d*)<\/span>/,
      ]

      let price = 0
      for (const pattern of pricePatterns) {
        const match = html.match(pattern)
        if (match) {
          price = parseFloat(match[1].replace(/,/g, ''))
          if (match[2]) {
            price += parseFloat(`0.${match[2]}`)
          }
          break
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
      const availabilityText = availabilityMatch ? availability[1].replace(/<[^>]+>/g, '').trim().toLowerCase() : ''
      const inStock = !availabilityText.includes('unavailable') && !availabilityText.includes('currently unavailable')

      return {
        asin,
        title: title.substring(0, 500), // Limit length
        price,
        currency: 'USD', // Default to USD, could be enhanced to detect
        image_url: image,
        brand,
        category: null,
        in_stock,
      }
    }

    const product = extractProductData(html)

    // Update the item in the database
    const { error: updateError } = await supabase
      .from('tracked_items')
      .update({
        title: product.title,
        current_price: product.price,
        image_url: product.image_url,
        brand: product.brand,
        in_stock: product.in_stock,
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('asin', asin)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Error updating item:', updateError)
    }

    // Add to price history
    await supabase
      .from('price_history')
      .insert({
        item_id: asin, // This should be the actual item_id
        price: product.price,
        in_stock: product.in_stock,
        scrape_status: 'success',
      })

    return NextResponse.json({ product })
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
