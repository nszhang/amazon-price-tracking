const https = require('https');
const zlib = require('zlib');
const fs = require('fs');

// Test with Amazon.ca
const ASIN = 'B0BMF7PJ4X';
const URL = `https://www.amazon.ca/dp/${ASIN}`;

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-CA,en-GB;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'DNT': '1',
      }
    }, (res) => {
      let data = [];
      res.on('data', (chunk) => { data.push(chunk); });
      res.on('end', () => {
        const buffer = Buffer.concat(data);
        if (res.headers['content-encoding'] === 'gzip') {
          zlib.gunzip(buffer, (err, decompressed) => {
            if (err) return reject(err);
            resolve(decompressed.toString('utf-8'));
          });
        } else {
          resolve(buffer.toString('utf-8'));
        }
      });
    }).on('error', reject);
  });
}

async function debugPrices() {
  try {
    console.log(`Fetching ${URL}...`);
    const html = await fetchPage(URL);
    console.log(`Fetched ${html.length} bytes of HTML\n`);

    // Check for CAPTCHA
    if (html.includes('validateCaptcha') || html.includes('opfcaptcha')) {
      console.log('❌ CAPTCHA detected\n');
      return;
    }

    // Look for productTitle
    const titleMatch = html.match(/<span id="productTitle"[^>]*>(.+?)<\/span>/s);
    if (titleMatch) {
      const title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
      console.log(`Product Title: ${title.substring(0, 100)}\n`);
    }

    // Look for the buybox section specifically
    console.log('=== Looking for BuyBox section ===');
    const buyBoxMatch = html.match(/<div[^>]*id=["']buybox[^>]*>[\s\S]{1,10000}<\/div>/i);
    if (buyBoxMatch) {
      const buyBoxHTML = buyBoxMatch[0];
      fs.writeFileSync('/tmp/buybox_section.html', buyBoxHTML);
      console.log('Saved BuyBox HTML to /tmp/buybox_section.html');

      // Find prices in buybox
      const buyBoxPrices = buyBoxHTML.match(/<span[^>]*class=["'][^"']*a-offscreen[^"']*["'][^>]*>(\$?[\d,]+\.?\d*)<\/span>/g);
      if (buyBoxPrices) {
        console.log('\nPrices in BuyBox:');
        buyBoxPrices.forEach((p, i) => {
          const price = p.replace(/<[^>]+>/g, '').replace(/^\$/, '');
          console.log(`  ${i + 1}. ${price}`);
        });
      }

      // Look for "Sold by" in buybox
      const soldByMatch = buyBoxHTML.match(/(Sold by|Sold by\s*&amp;\s*Ships from|Ships from)\s*:?\s*[^<]{0,100}<[^>]*>([^<]+)/i);
      if (soldByMatch) {
        console.log(`\nSeller: ${soldByMatch[2].trim()}`);
      }
    } else {
      console.log('BuyBox section not found');
    }

    // Look for newer #centerCol price display
    console.log('\n=== Looking for centerCol price section ===');
    const centerColMatch = html.match(/<div[^>]*id=["']centerCol[^>]*>[\s\S]{1,50000}/);
    if (centerColMatch) {
      const centerCol = centerColMatch[0];

      // Look for aok-offscreen in centerCol
      const aokOffscreen = centerCol.match(/<span[^>]*class=["'][^"']*aok-offscreen[^"']*["'][^>]*>\$?([\d,]+\.?\d*)/g);
      if (aokOffscreen) {
        console.log('Found aok-offscreen prices in centerCol:');
        aokOffscreen.slice(0, 10).forEach((p, i) => {
          const price = p.match(/>(\$?[\d,]+\.?\d*)/)[1];
          console.log(`  ${i + 1}. ${price}`);
        });
      }
    }

    // Look for new style "priceToPay" section
    console.log('\n=== Looking for priceToPay section ===');
    const priceToPaySectionMatch = html.match(/<span[^>]*id=["']priceToPay["'][^>]*>[\s\S]{1,5000}<\/span>/);
    if (priceToPaySectionMatch) {
      console.log('Found priceToPay section:');
      const section = priceToPaySectionMatch[0];
      // Look for a-price-whole and a-price-fraction
      const wholeMatch = section.match(/<span[^>]*class=["'][^"']*a-price-whole[^"']*["'][^>]*>([^<]+)<\/span>/);
      const fractionMatch = section.match(/<span[^>]*class=["'][^"']*a-price-fraction[^"']*["'][^>]*>([^<]+)<\/span>/);
      if (wholeMatch && fractionMatch) {
        console.log(`  Price: ${wholeMatch[1].trim()}.${fractionMatch[1].trim()}`);
      }
    } else {
      console.log('priceToPay section not found');
    }

    // Look for all twister prices more carefully
    console.log('\n=== Twister prices ===');
    const twisterMatch = html.match(/id=["']twister[^"']*["'][^>]*>([\s\S]{1,10000})/s);
    if (twisterMatch) {
      const twister = twisterMatch[1];
      const twisterPrices = twister.match(/<span[^>]*class=["'][^"']*a-offscreen[^"']*["'][^>]*>\$?([\d,]+\.?\d*)<\/span>/g);
      if (twisterPrices) {
        console.log(`Found ${twisterPrices.length} twister prices`);
        twisterPrices.forEach((p, i) => {
          const price = p.replace(/<[^>]+>/g, '').replace(/^\$/, '');
          console.log(`  ${i + 1}. ${price}`);
        });
      }
    }

    // Look for the main price display that Amazon shows
    console.log('\n=== Looking for main price display ===');
    // Try to find the price shown in the "Add to Cart" section or similar prominent display
    const addToCartMatch = html.match(/<input[^>]*id=["']add-to-cart-button[^>]*>/);
    if (addToCartMatch) {
      // Look for price before the add to cart button
      const beforeAddToCart = html.substring(0, html.indexOf(addToCartMatch[0]));
      const lastPrice = beforeAddToCart.lastIndexOf('<span');
      if (lastPrice > 0) {
        const snippet = beforeAddToCart.substring(Math.max(0, lastPrice - 500));
        const priceSnippet = snippet.match(/class=["'][^"']*a-price[^"']*["'][^>]*>[\s\S]{1,500}/);
        if (priceSnippet) {
          console.log('Price near Add to Cart button:');
          const priceMatch = priceSnippet[0].match(/<span[^>]*class=["'][^"']*a-offscreen[^"']*["'][^>]*>(\$?[\d,]+\.?\d*)/);
          if (priceMatch) {
            console.log(`  ${priceMatch[1]}`);
          }
        }
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugPrices();
