const https = require('https');
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
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'DNT': '1',
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function debugPrices() {
  try {
    console.log(`Fetching ${URL}...`);
    const html = await fetchPage(URL);
    console.log(`Fetched ${html.length} bytes of HTML\n`);

    // Save HTML for inspection
    fs.writeFileSync('/tmp/amazon_page.html', html);
    console.log('Saved HTML to /tmp/amazon_page.html\n');

    // Check for CAPTCHA
    if (html.includes('validateCaptcha') || html.includes('opfcaptcha')) {
      console.log('❌ CAPTCHA detected - cannot proceed');
      return;
    }

    // Look for "price" in various contexts
    console.log('=== Searching for price-related patterns ===\n');

    // Search for data-atr-currency-price pattern
    const atrPriceMatches = html.match(/data-atr-currency-price=["']([^"']+)["']/g);
    if (atrPriceMatches) {
      console.log('Found data-atr-currency-price patterns:');
      atrPriceMatches.slice(0, 10).forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
    }

    // Search for price in JSON data
    console.log('\n=== Looking for "price" in JSON data ===');
    const jsonPriceMatch = html.match(/"price[^"]*"\s*:\s*["']?([\d,]+\.?\d*)/g);
    if (jsonPriceMatch) {
      console.log('Found JSON price patterns:');
      jsonPriceMatch.slice(0, 15).forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
    }

    // Search for 'priceString' pattern
    const priceStringMatch = html.match(/"priceString"\s*:\s*"([^"]+)"/g);
    if (priceStringMatch) {
      console.log('\nFound priceString patterns:');
      priceStringMatch.slice(0, 10).forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
    }

    // Search for $ followed by digits in common contexts
    console.log('\n=== Looking for $XX.XX patterns ===');
    const dollarMatches = html.match(/\$(\d+\.\d{2})/g);
    if (dollarMatches) {
      const uniquePrices = [...new Set(dollarMatches)].sort();
      console.log('Unique dollar amounts found:');
      uniquePrices.slice(0, 20).forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
    }

    // Look for productTitle
    const titleMatch = html.match(/<span id="productTitle"[^>]*>(.+?)<\/span>/s);
    if (titleMatch) {
      const title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
      console.log(`\nProduct Title: ${title.substring(0, 100)}`);
    }

    // Look for common price-related class names
    console.log('\n=== Searching for common price classes ===');
    const priceClasses = [
      'a-price',
      'a-price-whole',
      'a-price-fraction',
      'priceToPay',
      'priceBlockBuyingPriceString'
    ];

    priceClasses.forEach(cls => {
      const matches = html.match(new RegExp(`class=["'][^"']*\\b${cls}\\b[^"']*["']`, 'g'));
      if (matches) {
        console.log(`  ${cls}: ${matches.length} occurrences`);
      }
    });

    // Look for newer Amazon patterns
    console.log('\n=== Looking for newer Amazon patterns ===');
    const newerPatterns = [
      /\["priceAmount",\s*\d+\]/g,
      /"displayPrice"\s*:\s*"([^"]+)"/g,
      /"currentPrice"\s*:\s*"([^"]+)"/g,
      /"amount"\s*:\s*([\d,]+\.?\d*)/g
    ];

    newerPatterns.forEach((pattern, i) => {
      const matches = html.match(pattern);
      if (matches) {
        console.log(`  Pattern ${i + 1}:`, matches.slice(0, 5));
      }
    });

  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugPrices();
