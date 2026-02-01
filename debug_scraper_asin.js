const https = require('https');
const zlib = require('zlib');

const ASIN = '0140422072';
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
      console.log('CAPTCHA detected');
      return;
    }

    // Look for any price-like patterns
    console.log('=== Looking for dollar amounts ===');
    const dollarPattern = /\$\d+\.\d{2}/g;
    const dollarMatches = html.match(dollarPattern);
    if (dollarMatches) {
      const unique = [...new Set(dollarMatches)];
      console.log('All dollar amounts found (first 30):', unique.slice(0, 30).join(', '));
    }

    // Look for a-price-whole + a-price-fraction pattern
    console.log('\n=== a-price-whole ===');
    const wholePattern = /<span[^>]*class=["'][^"']*a-price-whole[^"']*["'][^>]*>([^<]+)<\/span>/g;
    const wholeMatches = html.match(wholePattern);
    if (wholeMatches) {
      const wholeValues = wholeMatches.map(m => m.match(/>\s*([^<]+)\s*<\//)[1]);
      console.log('Whole parts:', wholeValues.slice(0, 15).join(', '));
    }

    console.log('\n=== a-price-fraction ===');
    const fractionPattern = /<span[^>]*class=["'][^"']*a-price-fraction[^"']*["'][^>]*>([^<]+)<\/span>/g;
    const fractionMatches = html.match(fractionPattern);
    if (fractionMatches) {
      const fractionValues = fractionMatches.map(m => m.match(/>\s*([^<]+)\s*<\//)[1]);
      console.log('Fraction parts:', fractionValues.slice(0, 15).join(', '));
    }

    // Look for twister prices
    console.log('\n=== twister price ===');
    const twisterMatch = html.match(/id=["']twister["'][^>]*>([\s\S]{1,10000})/s);
    if (twisterMatch) {
      const twisterPrices = twisterMatch[1].match(/\$\d+\.\d{2}/g);
      if (twisterPrices) {
        console.log('Twister prices:', [...new Set(twisterPrices)].join(', '));
      }
    }

    // Look for any 25.23
    console.log('\n=== Searching for 25.23 ===');
    if (html.includes('25.23')) {
      const idx = html.indexOf('25.23');
      const snippet = html.substring(Math.max(0, idx - 300), idx + 300);
      console.log('Context around 25.23:');
      console.log(snippet);
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugPrices();
