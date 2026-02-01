const https = require('https');

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

    // Check for CAPTCHA
    if (html.includes('validateCaptcha') || html.includes('opfcaptcha')) {
      console.log('❌ CAPTCHA detected - cannot proceed');
      return;
    }

    // Find ALL twister-plus-price-data-price values
    console.log('=== Pattern 1: twister-plus-price-data-price ===');
    const allTwisterPrices = html.match(/id=["']twister-plus-price-data-price["'][^>]*value=["']([\d,]+\.?\d*)["']/g);
    if (allTwisterPrices) {
      allTwisterPrices.forEach((p, index) => {
        const match = p.match(/value=["']([\d,]+\.?\d*)["']/);
        console.log(`  Variant ${index}: ${match[1]}`);
      });
    } else {
      console.log('  Not found');
    }

    // Find twister section a-offscreen prices
    console.log('\n=== Pattern 2: Twister section a-offscreen ===');
    const twisterSectionMatch = html.match(/id=["']twister[^"']*["'][^>]*>(.{10,5000})/s);
    if (twisterSectionMatch) {
      const twisterPriceMatch = twisterSectionMatch[1].match(/<span[^>]*class=["']a-offscreen["'][^>]*>\$?([\d,]+\.?\d*)/s);
      if (twisterPriceMatch) {
        console.log(`  Found: ${twisterPriceMatch[1]}`);
      } else {
        console.log('  Not found in twister section');
      }
    } else {
      console.log('  Twister section not found');
    }

    // Find deal price
    console.log('\n=== Pattern 3: priceblock_dealprice ===');
    const dealPriceMatch = html.match(/id=["']priceblock_dealprice["'][^>]*>.*?<span[^>]*class=["']a-offscreen["'][^>]*>\$?([\d,]+\.?\d*)/s);
    if (dealPriceMatch) {
      console.log(`  Found: ${dealPriceMatch[1]}`);
    } else {
      console.log('  Not found');
    }

    // Find our price
    console.log('\n=== Pattern 4: priceblock_ourprice ===');
    const ourPriceMatch = html.match(/id=["']priceblock_ourprice["'][^>]*>.*?<span[^>]*class=["']a-offscreen["'][^>]*>\$?([\d,]+\.?\d*)/s);
    if (ourPriceMatch) {
      console.log(`  Found: ${ourPriceMatch[1]}`);
    } else {
      console.log('  Not found');
    }

    // Find android price
    console.log('\n=== Pattern 5: android-buybox-price ===');
    const androidPriceMatch = html.match(/id=["']android-buybox-price["'][^>]*>.*?<span[^>]*class=["']a-offscreen["'][^>]*>\$?([\d,]+\.?\d*)/s);
    if (androidPriceMatch) {
      console.log(`  Found: ${androidPriceMatch[1]}`);
    } else {
      console.log('  Not found');
    }

    // Find sale price
    console.log('\n=== Pattern 6: priceblock_saleprice ===');
    const salePriceMatch = html.match(/id=["']priceblock_saleprice["'][^>]*>.*?<span[^>]*class=["']a-offscreen["'][^>]*>\$?([\d,]+\.?\d*)/s);
    if (salePriceMatch) {
      console.log(`  Found: ${salePriceMatch[1]}`);
    } else {
      console.log('  Not found');
    }

    // Find apex price
    console.log('\n=== Pattern 7: apex-price-to-pay ===');
    const apexPriceMatch = html.match(/class=["']apex-price-to-pay[^"']*["'][^>]*>.*?<span[^>]*class=["']a-offscreen["'][^>]*>\$?([\d,]+\.?\d*)/s);
    if (apexPriceMatch) {
      console.log(`  Found: ${apexPriceMatch[1]}`);
    } else {
      console.log('  Not found');
    }

    // Find buybox price (a-price-whole + a-price-fraction)
    console.log('\n=== Pattern 8: Buybox a-price-whole/fraction ===');
    const priceSectionMatch = html.match(/<div[^>]*id=["']buybox[^>]*>.*?<span[^>]*class=["']a-price-whole["'][^>]*>(\d+[\d,]*)<\/span><span[^>]*class=["']a-price-fraction["'][^>]*>(\d+)<\/span>/s);
    if (priceSectionMatch) {
      const wholePart = priceSectionMatch[1];
      const fractionPart = priceSectionMatch[2];
      console.log(`  Found: ${wholePart}.${fractionPart}`);
    } else {
      console.log('  Not found');
    }

    // Find all a-offscreen prices
    console.log('\n=== ALL a-offscreen prices (first 20) ===');
    const allOffscreenPrices = html.match(/<span[^>]*class=["'][^"']*a-offscreen[^"']*["'][^>]*>(\$?[\d,]+\.?\d*)<\/span>/g);
    if (allOffscreenPrices) {
      const prices = allOffscreenPrices.map(p => p.replace(/<[^>]+>/g, '').replace(/^\$/, ''));
      prices.slice(0, 20).forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
    } else {
      console.log('  None found');
    }

    // Check currency
    console.log('\n=== Currency Detection ===');
    const currencyMatch = html.match(/<input[^>]+name=["']sessionCurrency["'][^>]+value=["']([A-Z]{3})["']/);
    if (currencyMatch) {
      console.log(`  sessionCurrency: ${currencyMatch[1]}`);
    } else {
      console.log('  sessionCurrency not found, assuming CAD from amazon.ca');
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugPrices();
