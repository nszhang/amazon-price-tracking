const { request } = require('https');
const { parse, stringify } = require('querystring');

// Test configuration
const ASIN = 'B0BMF7PJ4X';
const DOMAIN = 'ca';
const URL = `https://www.amazon.ca/dp/${ASIN}`;
const USER_EMAIL = 'nszhang@gmail.com';
const USER_PASSWORD = 'password123';
const BASE_URL = 'http://192.168.89.55:3000';

// Function to make HTTP request
async function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const protocol = options.protocol === 'https:' ? require('https') : require('http');
    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data: data }));
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function testScraper() {
  try {
    console.log('=== Amazon Price Tracker Test ===');
    console.log(`Testing ASIN: ${ASIN}`);
    console.log(`Full URL: ${URL}`);

    // Direct test - try to access the scrape endpoint
    console.log('\nTesting scrape endpoint directly...');

    // First, we need to login
    console.log('\n1. Attempting to login...');

    const postData = JSON.stringify({
      "email": USER_EMAIL,
      "password": USER_PASSWORD
    });

    const loginOptions = {
      hostname: '192.168.89.55',
      port: 3000,
      path: '/api/auth/callback/credentials?',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const loginResponse = await makeRequest(loginOptions, postData);
    console.log(`Login status: ${loginResponse.status}`);

    // Parse any cookies from login response
    const cookies = [];
    if (loginResponse.headers['set-cookie']) {
      loginResponse.headers['set-cookie'].forEach(cookie => {
        const cookieParts = cookie.split(';')[0];
        cookies.push(cookieParts);
      });
    }

    console.log(`Cookies received: ${cookies.length}`);

    // If login successful or session exists, try scraping
    console.log('\n2. Testing scraper endpoint...');

    const scrapeData = JSON.stringify({
      url: URL,
      asin: ASIN,
      domain: DOMAIN
    });

    const scrapeOptions = {
      hostname: '192.168.89.55',
      port: 3000,
      path: '/api/scrape',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(scrapeData),
        'Cookie': cookies.join('; ')
      }
    };

    const scrapeResponse = await makeRequest(scrapeOptions, scrapeData);
    console.log(`\nScraper response status: ${scrapeResponse.status}`);

    if (scrapeResponse.status === 200) {
      try {
        const product = JSON.parse(scrapeResponse.data).product;
        console.log('\n=== SCRAPING RESULTS ===');
        console.log(`Price: ${product.price}`);
        console.log(`Currency: ${product.currency}`);
        console.log(`In Stock: ${product.inStock}`);
        console.log(`Title: ${product.title}`);
        console.log(`ASIN: ${product.asin}`);

        if (product.price === 19.99 && product.currency === 'CAD') {
          console.log('\n✅ SUCCESS: Price extraction working correctly! Found CAD $19.99');
        } else if (product.price === 19.99) {
          console.log('\n✅ Price is correct, but currency might be wrong');
        } else {
          console.log(`\n❌ FAILED: Expected CAD $19.99, got ${product.currency} $${product.price}`);
        }
      } catch (e) {
        console.log('Error parsing response:', e.message);
        console.log('Raw response:', scrapeResponse.data);
      }
    } else if (scrapeResponse.status === 401) {
      console.log('❌ Authentication failed. Check credentials.');
    } else {
      console.log('❌ Server error:', scrapeResponse.data);
    }

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

// Run the test
testScraper();